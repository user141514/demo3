"""Unit tests for DeepSeekService — init and response parsing."""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from services.ai_service import DeepSeekService


class TestDeepSeekServiceInit:
    def test_creates_with_api_key(self):
        svc = DeepSeekService(api_key="sk-test-123")
        assert svc._api_key == "sk-test-123"

    def test_uses_default_settings(self):
        svc = DeepSeekService()
        assert svc._chat_model is not None
        assert svc._base_url is not None

    def test_raises_without_api_key(self, monkeypatch):
        # Override env fallback
        monkeypatch.setattr("services.ai_service.settings.DEEPSEEK_API_KEY", "")
        svc = DeepSeekService(api_key="")
        with pytest.raises(ValueError, match="DEEPSEEK_API_KEY"):
            import asyncio
            asyncio.run(svc._call_api("sys", "user"))


class TestCallApi:
    def test_calls_deepseek_api(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"choices": [{"message": {"content": "AI response"}}]}
        mock_client = MagicMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
        monkeypatch.setattr("services.ai_service.httpx.AsyncClient", lambda **kw: mock_client)

        import asyncio
        result = asyncio.run(svc._call_api("system prompt", "user prompt"))
        assert result == "AI response"

    def test_api_error_raises(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        mock_client = MagicMock()
        mock_client.__aenter__.return_value.post = AsyncMock(return_value=mock_resp)
        monkeypatch.setattr("services.ai_service.httpx.AsyncClient", lambda **kw: mock_client)

        import asyncio
        with pytest.raises(RuntimeError, match="DeepSeek API error"):
            asyncio.run(svc._call_api("sys", "user"))


class TestGenerateWithValidation:
    def test_retries_on_validation_failure(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")
        call_count = [0]

        async def fake_call(system_prompt, user_prompt, model=None, json_mode=False):
            call_count[0] += 1
            return f"attempt {call_count[0]}"

        monkeypatch.setattr(svc, "_call_api", fake_call)

        def validator(content):
            if "3" in content:
                return True, ""
            return False, "not attempt 3"

        import asyncio
        content, attempts, error = asyncio.run(
            svc._generate_with_validation("sys", "user", validator)
        )
        assert attempts == 3
        assert call_count[0] == 3

    def test_returns_on_first_success(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")
        call_count = [0]

        async def fake_call(system_prompt, user_prompt, model=None, json_mode=False):
            call_count[0] += 1
            return "valid content"

        monkeypatch.setattr(svc, "_call_api", fake_call)

        def validator(content):
            return True, ""

        import asyncio
        content, attempts, error = asyncio.run(
            svc._generate_with_validation("sys", "user", validator)
        )
        assert attempts == 1
        assert call_count[0] == 1
        assert content == "valid content"


class TestValidation:
    def test_validate_dimensions_valid(self):
        svc = DeepSeekService(api_key="sk-test")
        content = """
关键领导力维度
▌维度清单（共5个）
| 序号 | 维度名称 | 一句话释义 | 发言来源关键词 | 来源类型 |
| 1 | 战略力 | 战略能力 | 战略 | 本组发言 |
"""
        ok, err = svc.validate_dimensions(content)
        assert ok is True
        assert err == ""

    def test_validate_dimensions_missing_title(self):
        svc = DeepSeekService(api_key="sk-test")
        ok, err = svc.validate_dimensions("no title here")
        assert ok is False

    def test_validate_layer_table_valid(self):
        svc = DeepSeekService(api_key="sk-test")
        content = """
分层管理要求
高层 中层 基层 核心定位 核心差异
▌本轮做减法说明
"""
        ok, err = svc.validate_layer_table(content)
        assert ok is True

    def test_validate_behaviors_valid(self):
        svc = DeepSeekService(api_key="sk-test")
        content = """
关键行为准则
【高层】 1. test
【中层】 1. test
【基层】 1. test
▌维度一
"""
        ok, err = svc.validate_behaviors(content)
        assert ok is True

    def test_validate_applications_valid(self):
        svc = DeepSeekService(api_key="sk-test")
        content = """
落地应用场景
人事管理场景 业务管理场景 分阶段落地路径 与驴迹现有体系整合建议
"""
        ok, err = svc.validate_applications(content)
        assert ok is True


class TestExtractJson:
    def test_extracts_json_from_markdown(self):
        result = DeepSeekService._extract_json('prefix {"key": "value"} suffix')
        assert result == {"key": "value"}

    def test_extracts_plain_json(self):
        result = DeepSeekService._extract_json('{"key": "value"}')
        assert result == {"key": "value"}


class TestMemberQA:
    def test_answer_member_question(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")

        async def fake_call(system_prompt, user_prompt, model=None, json_mode=False):
            assert "知识库参考" in user_prompt
            assert "test question" in user_prompt
            return "AI answer"

        monkeypatch.setattr(svc, "_call_api", fake_call)
        import asyncio
        result = asyncio.run(
            svc.answer_member_question(
                "test question", "group context", ["kb chunk 1", "kb chunk 2"]
            )
        )
        assert result == "AI answer"

    def test_answer_with_empty_kb(self, monkeypatch):
        svc = DeepSeekService(api_key="sk-test")

        async def fake_call(system_prompt, user_prompt, model=None, json_mode=False):
            return "answer without kb"
        monkeypatch.setattr(svc, "_call_api", fake_call)

        import asyncio
        result = asyncio.run(
            svc.answer_member_question("q", "ctx", [])
        )
        assert result == "answer without kb"
