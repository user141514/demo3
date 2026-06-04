"""Unit tests for AIService — prompt construction and client interface."""

import pytest
from unittest.mock import MagicMock, patch

from services.ai_service import AIService


@pytest.fixture
def ai_service():
    """Create AIService with fake API key (no real Anthropic calls)."""
    return AIService(api_key="test-key")


class TestAIServiceInit:
    def test_creates_with_api_key(self):
        svc = AIService(api_key="sk-test-123")
        assert svc._api_key == "sk-test-123"

    def test_lazy_client_creation(self, monkeypatch):
        svc = AIService(api_key="sk-test")
        assert svc._client is None  # not created until first use

        # Mock Anthropic
        mock_client_cls = MagicMock()
        monkeypatch.setattr("services.ai_service.Anthropic", mock_client_cls)
        mock_client_cls.return_value = MagicMock()

        _ = svc.client
        assert svc._client is not None
        mock_client_cls.assert_called_once_with(api_key="sk-test")

    def test_raises_without_api_key(self):
        svc = AIService(api_key="")
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            _ = svc.client


class TestCallClaude:
    def test_calls_anthropic_api(self, monkeypatch):
        svc = AIService(api_key="sk-test")
        mock_client = MagicMock()
        mock_client.messages.create.return_value.content = [MagicMock(text="AI response")]
        monkeypatch.setattr("services.ai_service.Anthropic", lambda **kw: mock_client)

        result = svc._call_claude("system prompt", "user prompt")
        assert result == "AI response"
        mock_client.messages.create.assert_called_once()
        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert call_kwargs["system"] == "system prompt"
        assert call_kwargs["messages"][0]["content"] == "user prompt"

    def test_uses_claude_sonnet_model(self, monkeypatch):
        svc = AIService(api_key="sk-test")
        mock_client = MagicMock()
        mock_client.messages.create.return_value.content = [MagicMock(text="ok")]
        monkeypatch.setattr("services.ai_service.Anthropic", lambda **kw: mock_client)

        svc._call_claude("sys", "user")
        call_kwargs = mock_client.messages.create.call_args.kwargs
        assert "claude-sonnet" in call_kwargs["model"]
        assert call_kwargs["max_tokens"] == 4096


class TestSummarizeAnswers:
    def test_formats_questions_and_answers(self, monkeypatch):
        svc = AIService(api_key="sk-test")
        mock_client = MagicMock()
        mock_client.messages.create.return_value.content = [MagicMock(text="Summary output")]
        monkeypatch.setattr("services.ai_service.Anthropic", lambda **kw: mock_client)

        qa = [
            {
                "question": "什么是好的领导力？",
                "answers": [
                    {"participant": "张三", "role": "senior", "content": "战略眼光"},
                    {"participant": "李四", "role": "middle", "content": "团队协作"},
                ],
            }
        ]

        import asyncio
        result = asyncio.run(svc.summarize_answers("领导力认知", qa))
        assert result == "Summary output"

        # Verify prompt includes question text and answer content
        user_content = mock_client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert "什么是好的领导力？" in user_content
        assert "张三" in user_content
        assert "战略眼光" in user_content


class TestDimensionsPrompt:
    def test_prompt_includes_all_answers(self, monkeypatch):
        svc = AIService(api_key="sk-test")
        mock_client = MagicMock()
        mock_client.messages.create.return_value.content = [MagicMock(text='{"dimensions":[]}')]
        monkeypatch.setattr("services.ai_service.Anthropic", lambda **kw: mock_client)

        answers = [
            {"participant": "张总", "role": "senior", "question": "Q1", "content": "战略眼光很重要"},
            {"participant": "李总", "role": "senior", "question": "Q2", "content": "创新能力"},
        ]

        import asyncio
        asyncio.run(svc.generate_leadership_dimensions(answers))
        user_content = mock_client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert "战略眼光很重要" in user_content
        assert "创新能力" in user_content
        assert "张总" in user_content
        assert "Q1" in user_content


class TestFallbackHandling:
    def test_handles_anonymous_participant(self, monkeypatch):
        """When role/participant missing, uses fallback values."""
        svc = AIService(api_key="sk-test")
        mock_client = MagicMock()
        mock_client.messages.create.return_value.content = [MagicMock(text="ok")]
        monkeypatch.setattr("services.ai_service.Anthropic", lambda **kw: mock_client)

        answers = [{"question": "Q?", "content": "test"}]

        import asyncio
        asyncio.run(svc.generate_leadership_dimensions(answers))
        user_content = mock_client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert "未知" in user_content  # fallback for missing role
        assert "匿名" in user_content  # fallback for missing name
