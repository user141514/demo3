import json
import logging
import re
from typing import Any, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


class DeepSeekService:
    """AI service using DeepSeek API (OpenAI-compatible)."""

    MAX_RETRIES = 3

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or settings.DEEPSEEK_API_KEY
        self._base_url = settings.DEEPSEEK_BASE_URL.rstrip("/")
        self._chat_model = settings.DEEPSEEK_CHAT_MODEL
        self._reasoner_model = settings.DEEPSEEK_REASONER_MODEL

    async def _call_api(self, system_prompt: str, user_prompt: str, model: Optional[str] = None, json_mode: bool = False) -> str:
        if not self._api_key:
            raise ValueError("DEEPSEEK_API_KEY is not set")

        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        body: dict[str, Any] = {
            "model": model or self._chat_model,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{self._base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json=body,
            )
            if resp.status_code != 200:
                logger.error(f"DeepSeek API error {resp.status_code}: {resp.text[:500]}")
                raise RuntimeError(f"DeepSeek API error {resp.status_code}: {resp.text[:200]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def _generate_with_validation(self, system_prompt: str, user_prompt: str, validator, model: Optional[str] = None, json_mode: bool = False) -> tuple[str, int, Optional[str]]:
        content = ""
        last_error = None
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                content = await self._call_api(system_prompt, user_prompt, model=model, json_mode=json_mode)
                is_valid, err_msg = validator(content)
                if is_valid:
                    return content, attempt, None
                last_error = err_msg
                user_prompt = f"{user_prompt}\n\n[上一轮输出校验失败，错误信息：{err_msg}。请严格按要求重新输出。]"
            except Exception as e:
                last_error = str(e)
                logger.warning(f"DeepSeek attempt {attempt} failed: {e}")
        return content, self.MAX_RETRIES, last_error

    # ── Round-specific generation ───────────────────────────────────────

    async def generate_group_dimensions(self, group_answers: str) -> tuple[str, int, Optional[str]]:
        return await self._generate_with_validation(
            self._d1_group_system_prompt(),
            self._answers_user_prompt("讨论一：领导力维度构建", group_answers),
            self.validate_dimensions,
            model=self._chat_model,
            json_mode=True,
        )

    async def generate_group_layer_table(self, group_answers: str, framework: str) -> tuple[str, int, Optional[str]]:
        user = f"统一领导力维度框架：\n{framework}\n\n{self._answers_user_prompt('讨论二：层级差异化定义', group_answers)}"
        return await self._generate_with_validation(
            self._d2_group_system_prompt(),
            user,
            self.validate_layer_table,
            model=self._chat_model,
            json_mode=True,
        )

    async def generate_group_behaviors(self, group_answers: str, consensus: str) -> tuple[str, int, Optional[str]]:
        user = f"讨论二共识结果：\n{consensus}\n\n{self._answers_user_prompt('讨论三：可观察行为动作', group_answers)}"
        return await self._generate_with_validation(
            self._d3_group_system_prompt(),
            user,
            self.validate_behaviors,
            model=self._chat_model,
            json_mode=True,
        )

    # ── Cross-group synthesis ───────────────────────────────────────────

    async def synthesize_dimensions(self, all_groups: list[dict]) -> tuple[str, int, Optional[str]]:
        parts = [f"## 第{g['group_id']}组维度\n{g['content']}" for g in all_groups]
        user = "以下是四个小组各自提炼的领导力维度。请综合归纳。\n\n" + "\n\n---\n\n".join(parts)
        return await self._generate_with_validation(
            self._synthesis_d1_prompt(),
            user,
            self.validate_dimensions,
            model=self._reasoner_model,
            json_mode=True,
        )

    async def synthesize_layer_table(self, all_groups: list[dict]) -> tuple[str, int, Optional[str]]:
        parts = [f"## 第{g['group_id']}组层级表\n{g['content']}" for g in all_groups]
        user = "以下是四个小组各自的层级差异化定义。请综合归纳。\n\n" + "\n\n---\n\n".join(parts)
        return await self._generate_with_validation(
            self._synthesis_d2_prompt(),
            user,
            self.validate_layer_table,
            model=self._reasoner_model,
            json_mode=True,
        )

    async def synthesize_behaviors(self, all_groups: list[dict]) -> tuple[str, int, Optional[str]]:
        parts = [f"## 第{g['group_id']}组行为动作\n{g['content']}" for g in all_groups]
        user = "以下是四个小组各自的行为动作描述。请综合归纳。\n\n" + "\n\n---\n\n".join(parts)
        return await self._generate_with_validation(
            self._synthesis_d3_prompt(),
            user,
            self.validate_behaviors,
            model=self._reasoner_model,
            json_mode=True,
        )

    # ── AI QA ───────────────────────────────────────────────────────────

    async def answer_member_question(self, question: str, group_context: str, kb_chunks: list[str]) -> str:
        kb_text = "\n\n---\n\n".join(kb_chunks) if kb_chunks else "（知识库暂无相关内容）"
        system = "你是领导力发展领域的专家助手。请基于提供的知识库内容和本组讨论上下文，回答成员的问题。只回答与本组研讨相关的内容，不泄露其他组信息。用中文回答。"
        user = f"## 知识库参考\n{kb_text}\n\n## 本组讨论上下文\n{group_context}\n\n## 成员问题\n{question}"
        return await self._call_api(system, user, model=self._chat_model)

    # ── Validation ──────────────────────────────────────────────────────

    def validate_dimensions(self, content: str) -> tuple[bool, str]:
        try:
            data = self._extract_json(content)
            dims = data.get("dimensions", [])
            if not isinstance(dims, list) or len(dims) < 5:
                return False, f"维度数量不足：需要5-8个，当前{len(dims)}个"
            if len(dims) > 8:
                return False, f"维度数量过多：需要5-8个，当前{len(dims)}个"
            for i, d in enumerate(dims):
                if "name" not in d:
                    return False, f"第{i+1}个维度缺少 name 字段"
                if "definition" not in d:
                    return False, f"维度'{d.get('name', '未知')}'缺少 definition 字段"
            return True, ""
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            return False, f"JSON解析失败：{e}"

    def validate_layer_table(self, content: str) -> tuple[bool, str]:
        try:
            data = self._extract_json(content)
            matrix = data.get("layer_matrix", data.get("dimensions", []))
            if isinstance(matrix, dict):
                matrix = [{"name": k, **v} for k, v in matrix.items()]
            if not isinstance(matrix, list) or len(matrix) == 0:
                return False, "layer_matrix 为空或格式错误"
            for dim in matrix:
                levels = dim.get("levels", dim.get("senior", {}))
                if isinstance(levels, list):
                    pass
                elif isinstance(levels, dict):
                    found = any(l in dim for l in ["高层", "中层", "基层", "senior", "middle", "junior"])
                    if not found:
                        return False, f"维度'{dim.get('name', '未知')}'缺少管理层级"
            return True, ""
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            return False, f"JSON解析失败：{e}"

    def validate_behaviors(self, content: str) -> tuple[bool, str]:
        try:
            data = self._extract_json(content)
            behaviors = data.get("behaviors", data.get("dimensions", []))
            if isinstance(behaviors, dict):
                behaviors = [{"name": k, **v} for k, v in behaviors.items()]
            if not isinstance(behaviors, list) or len(behaviors) == 0:
                return False, "behaviors 为空或格式错误"
            for dim in behaviors:
                for level_key in ["高层", "中层", "基层"]:
                    level = dim.get(level_key, {})
                    if level:
                        actions = level.get("behaviors", level.get("actions", []))
                        if isinstance(actions, list) and len(actions) < 3:
                            return False, f"维度'{dim.get('name')}'的{level_key}行为数量不足（需要3-5个，当前{len(actions)}个）"
            return True, ""
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            return False, f"JSON解析失败：{e}"

    @staticmethod
    def _extract_json(content: str) -> dict:
        content = content.strip()
        m = re.search(r'\{[\s\S]*\}', content)
        if m:
            return json.loads(m.group(0))
        return json.loads(content)

    @staticmethod
    def _answers_user_prompt(round_name: str, answers_text: str) -> str:
        return f"## {round_name} - 本组讨论回答\n{answers_text}\n\n请根据以上讨论内容生成结构化结果。"

    # ── System prompts ──────────────────────────────────────────────────

    @staticmethod
    def _d1_group_system_prompt() -> str:
        return """你是一位领导力模型构建专家。请根据小组讨论内容，提炼出5-8个核心领导力维度。

必须严格遵守：
1. 只能依据成员提交的回答内容进行归纳、合并和命名。
2. 不得凭空捏造成员未提到的事实、案例、业务背景、能力要求或管理场景。
3. 如果回答信息不足，只能基于已有内容做保守总结，并在summary中说明“成员提交内容有限”。
4. 可以提炼表达，但不得改变原意，不得加入外部知识扩写。

输出JSON格式：
{
  "dimensions": [
    {
      "name": "维度名称",
      "definition": "详细定义，说明该维度涵盖的具体领导力能力",
      "importance": "为什么对公司至关重要"
    }
  ],
  "summary": "本轮讨论总体总结"
}

要求：维度具有区分度和覆盖性，语言精炼准确，用中文输出。"""

    @staticmethod
    def _d2_group_system_prompt() -> str:
        return """你是一位领导力层级定义专家。请根据小组讨论和统一维度框架，构建维度×管理层级的差异化定位表。

必须严格遵守：
1. 层级定位和标准差异必须来自成员提交的回答，或来自主持人提供的统一维度框架。
2. 不得凭空补充成员未提到的岗位职责、管理场景、行为标准或业务案例。
3. 如果某个维度或层级的回答不足，只能写出已有内容能支持的结论，并在summary中说明信息不足。
4. 可以合并相近观点，但不得改变成员回答原意。

输出JSON格式：
{
  "layer_matrix": {
    "维度名称": {
      "高层": {"定位": "...", "标准差异": "..."},
      "中层": {"定位": "...", "标准差异": "..."},
      "基层": {"定位": "...", "标准差异": "..."}
    }
  },
  "summary": "层级差异化总结"
}

三个管理层级：高层管理者、中层管理者、基层管理者。每个层级在同一维度下既有延续性又有明显区分度。用中文输出。"""

    @staticmethod
    def _d3_group_system_prompt() -> str:
        return """你是一位领导力行为设计与评估专家。请将领导力维度和层级转化为具体、可观察、可考核的行为动作。

必须严格遵守：
1. 行为动作必须基于成员提交的回答，以及已提供的上一轮共识结果。
2. 不得凭空创造成员未提到的行为、指标、场景、制度或考核方式。
3. 如果成员回答不足以支撑3-5个行为动作，只输出已有内容能支撑的行为，并在summary中说明信息不足。
4. 可以把成员的表述整理得更清晰，但不得扩展出新的含义。

输出JSON格式：
{
  "behaviors": {
    "维度名称": {
      "高层": {"behaviors": ["行为1", "行为2", "行为3"]},
      "中层": {"behaviors": ["行为1", "行为2", "行为3"]},
      "基层": {"behaviors": ["行为1", "行为2", "行为3"]}
    }
  },
  "summary": "行为标准总结"
}

每个维度×层级尽量包含3-5个具体行为动作，用中文输出。行为描述要具体可观察，避免模糊表述；信息不足时不得为了凑数量而编造。"""

    @staticmethod
    def _synthesis_d1_prompt() -> str:
        return """你是一位领导力模型整合专家。请综合四个小组的领导力维度提炼结果，生成统一的5-8个核心领导力维度。

必须严格遵守：
1. 只能依据各小组已生成的提炼结果进行综合。
2. 不得凭空加入各小组结果中没有出现的新维度、新定义、新重要性说明或业务背景。
3. 可以合并重复观点、统一命名、压缩表达，但不得改变原意。
4. 如果各组内容不足，只做保守整合，并在summary中说明依据有限。

输出JSON格式：{"dimensions": [{"name": "...", "definition": "...", "importance": "..."}], "summary": "..."}

要求：综合四组共识，消除重复，保留独特视角，维度数量严格控制在5-8个。用中文输出。"""

    @staticmethod
    def _synthesis_d2_prompt() -> str:
        return """你是一位领导力层级定义整合专家。请综合四个小组的层级差异化定义，生成统一的维度×层级定位与标准差异表。

必须严格遵守：
1. 只能依据各小组提交的层级差异化定义进行整合。
2. 不得凭空补充各组结果中没有出现的职责、标准、场景或案例。
3. 可以合并相近表述、统一结构，但不得改变原意。
4. 信息不足时，应在summary中说明依据有限，不要为了完整性编造内容。

输出JSON格式：{"layer_matrix": {"维度名": {"高层": {"定位":"...","标准差异":"..."}, "中层":..., "基层":...}}, "summary":"..."}
用中文输出。"""

    @staticmethod
    def _synthesis_d3_prompt() -> str:
        return """你是一位领导力行为标准整合专家。请综合四个小组的行为动作描述，生成统一的可观察行为动作标准。

必须严格遵守：
1. 只能依据各小组已经提交的行为动作描述进行整合。
2. 不得凭空创造各组结果中没有出现的行为、指标、场景、制度或考核方式。
3. 可以合并重复行为、优化措辞，但不得改变原意。
4. 信息不足时，不要为了凑够数量而编造，并在summary中说明依据有限。

输出JSON格式：{"behaviors": {"维度名": {"高层": {"behaviors":["..."]}, "中层":..., "基层":...}}, "summary":"..."}
每个维度×层级尽量3-5个行为动作。用中文输出。"""


_deepseek_service: Optional[DeepSeekService] = None


def get_deepseek_service() -> DeepSeekService:
    global _deepseek_service
    if _deepseek_service is None:
        _deepseek_service = DeepSeekService()
    return _deepseek_service
