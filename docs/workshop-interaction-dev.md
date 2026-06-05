# 成员端与主持人端交互优化开发文档

## 最新开发补充：AI 提炼权限、成果提醒与 WebSocket 稳定性

本节记录当前最新开发内容，覆盖成员端 AI 提炼权限、主持人端各组成果完成提醒、WebSocket 保活与主持人成果可见性优化。

### 1. 成员端 AI 提炼权限

- “AI 提炼”按钮仅队长可点击；普通成员按钮禁用，并显示提示“仅队长可发起 AI 提炼”。
- 普通成员仍可正常使用右侧内嵌 AI 问答窗口，AI 问答不受队长权限限制。
- 前端触发 AI 提炼时会携带 `participant_id` 和 `session_token`，由后端校验成员身份与队长权限。
- 后端 `POST /api/groups/{group_id}/ai-generate?workshop_id={id}` 接口新增权限校验：
  - 参与者必须属于当前 workshop。
  - 参与者必须属于当前 group。
  - `session_token` 必须匹配。
  - 参与者必须是当前小组队长。
  - 普通成员绕过前端直接调用时返回 `403`。
- 历史轮次查看模式下禁止重新触发 AI 提炼。

### 2. AI 提炼状态广播

- 后端新增 AI 提炼状态 WebSocket 广播事件 `ai_result_status`。
- 广播范围：当前小组成员端与主持人端。
- 事件数据包含：

```json
{
  "type": "ai_result_status",
  "data": {
    "group_id": 1,
    "round_number": 1,
    "status": "processing | ready | validation_failed | edited",
    "validation_error": "失败原因或 null",
    "updated_at": "ISO 时间字符串或 null"
  }
}
```

- AI 提炼开始时广播 `processing`。
- AI 提炼成功后广播 `ready`。
- 无回答、AI 校验失败或生成失败时广播 `validation_failed`，并返回中文失败原因。
- 编辑 AI 提炼结果后仍沿用结果刷新广播，主持人端可看到最新状态。

### 3. 主持人端各组成果完成提醒

- 主持人端监听 `ai_result_status` 后会静默刷新当前研讨会数据，不需要手动刷新页面。
- AI 提炼开始时提示：“第 X 组 AI 提炼已开始”。
- AI 提炼完成时提示：“第 X 组 AI 提炼已完成”。
- AI 提炼失败时提示：“第 X 组 AI 提炼失败：{reason}”。
- 提示会自动消失，不要求主持人手动关闭。
- 普通回答提交和 AI 问答不会触发主持人端提示，避免刷屏。
- 同一组同一轮次在 12 秒内重复收到相同状态事件时，只刷新数据，不重复弹出相同提示。

### 4. 主持人端成果页可见性

- “各组成果”页签在收到新 AI 提炼状态时显示红点提醒。
- 如果主持人当前已经在“各组成果”页签，红点会自动清除。
- 刚发生 AI 提炼状态变化的小组卡片会高亮约 5 秒。
- 小组卡片展示当前状态：
  - 未提炼
  - 提炼中
  - 已完成
  - 提炼失败
  - 已编辑
- 小组卡片展示最近更新时间；失败时额外展示失败原因。

### 5. WebSocket 稳定性

- 前端 WebSocket 增加 heartbeat：连接打开后定时发送 `ping`。
- 后端收到 `ping` 后返回或忽略 `pong`，避免连接因长时间无消息被关闭。
- 前端避免在同一 workshop/channel 已处于 `OPEN` 或 `CONNECTING` 时重复创建连接。
- 关闭、错误、组件卸载时清理 heartbeat 和重连 timer，避免多个重连任务叠加。
- WebSocket 地址基于 API base 或环境变量生成，不再写死 `localhost:8000`。

### 6. 验证记录

- 前端执行 `npm run build` 通过。
- 后端改动文件执行 AST 解析检查通过。
- 当前环境中的 `backend/venv/Scripts/python.exe` 指向不存在的本机 Python310 路径，pytest 未能启动；使用系统 Python 进行语法级检查作为替代。
- `.env` 文件未纳入本次变更范围。


本文档记录本轮对领导力共创研讨会项目新增和调整的后端接口、数据模型、前端状态流与验证方式。适用于后续维护成员端、主持人端、计时、AI 提炼、AI 问答和综合提炼相关功能。

## 1. 功能范围

### 成员端

- 顶部导航中的“领导力共创研讨会”放置在全局顶部最左侧，点击返回首页。
- 成员页顶部展示居中研讨标题和横向轮次进程。
- 四个轮次名称固定为：
  - 第一轮：关键领导力维度
  - 第二轮：领导力维度分层
  - 第三轮：领导力行为描述
  - 第四轮：领导力应用场景
- 问题区和右侧信息区支持拖拽调宽，比例保存在 `sessionStorage`。
- 右侧栏包含小组成员、AI 提炼结果、AI 问答。
- AI 提炼结果完整展示，不再截断。
- 组长可以编辑本组 AI 提炼结果，普通成员只读。
- AI 问答改为右侧内嵌聊天窗口。
- 进入下一轮后清空当前页 AI 提炼结果和 AI 问答历史。
- AI 问答后端按当前轮次保存和读取，刷新后不会显示上一轮问答。
- 倒计时未由主持人启动前，成员端只显示等待开始，不自动倒计时。
- 倒计时结束后成员端禁用提交，后端也拒绝继续提交答案。

### 主持人端

- 顶部标题点击返回首页。
- 轮次管理只保留一个“本轮时长（分钟）”，兼容写入旧字段 `discussion_time` 和 `input_time`。
- 主持人可启动本轮计时。
- 主持人可在轮次管理中进入下一轮；第四轮按钮显示为“结束研讨”。
- 各组成果支持选择轮次和小组。
- 各组成果可以查看：
  - 当前轮当前组每个问题的成员回答
  - 原始 AI 提炼结果
  - 编辑后的 AI 提炼结果
  - AI 生成失败原因
- 每轮 AI 提炼结果支持复制。
- 主持人输入页展示当前轮输入框，并展示每一轮已保存的主持人输入内容。
- 综合汇总页支持选择轮次。
- 综合汇总页展示该轮四组最终提交的 AI 提炼结果和综合提炼结果。
- “综合四组”按钮改名为“综合提炼”。
- 综合提炼失败时展示后端返回的具体失败原因。
- 前端报错提示自动消失，不需要手动关闭。

## 2. 数据模型变更

### `Round`

文件：`backend/models.py`

新增计时字段：

```py
timer_started_at = Column(DateTime, nullable=True)
timer_phase = Column(String(20), nullable=True)
```

说明：

- `timer_started_at` 表示主持人点击“开始计时”的 UTC 时间。
- `timer_phase` 保存启动计时时的轮次状态，当前主要用于广播和兼容显示。
- 倒计时剩余秒数不入库，由后端根据 `discussion_time` 和 `timer_started_at` 动态计算。

### `SynthesisResult`

文件：`backend/models.py`

新增：

```py
validation_error = Column(Text, nullable=True)
```

说明：

- 保存综合提炼失败原因或 AI 校验失败信息。
- 前端综合汇总页读取后展示“失败原因”。

### `AIQuestionLog`

文件：`backend/models.py`

新增：

```py
round_id = Column(Integer, ForeignKey("rounds.id"), nullable=True)
```

说明：

- AI 问答按轮次隔离。
- 成员端切换轮次或刷新页面时，只拉取当前轮的问答记录。

### 兼容旧 SQLite 表结构

文件：`backend/database.py`

`init_db()` 会在 `create_all` 后补齐旧表缺失字段：

- `rounds.timer_started_at`
- `rounds.timer_phase`
- `synthesis_results.validation_error`
- `ai_question_logs.round_id`

这避免旧数据库启动时报缺列错误。

## 3. Schema 变更

文件：`backend/schemas.py`

### 通用时间序列化

新增 `APIModel`，统一将 `datetime` 输出为 UTC ISO 字符串，避免前端解析时出现创建时间偏移。

### `RoundOut` / `RoundInfo`

新增：

```py
timer_started_at: Optional[datetime] = None
timer_phase: Optional[str] = None
timer_remaining_seconds: Optional[int] = None
```

`RoundInfo` 额外新增：

```py
answers: List[AnswerOut] = []
```

用于主持人端查看每轮每组每个问题的成员回答。

### `GroupResultMemberEdit`

新增成员端组长编辑 AI 提炼结果请求体：

```py
class GroupResultMemberEdit(APIModel):
    participant_id: int
    session_token: str
    edited_content: str = Field(..., min_length=1)
```

### `SynthesisResultOut`

新增：

```py
validation_error: Optional[str] = None
```

### `AIQuestionOut`

新增：

```py
round_id: Optional[int] = None
```

## 4. 后端接口变更

### 启动本轮计时

文件：`backend/routes/workshops.py`

```http
POST /api/workshops/{workshop_id}/timer/start?code={host_code}
```

行为：

- 校验主持人码。
- 只允许当前轮状态为 `active` 或 `input` 时启动。
- 写入 `timer_started_at` 和 `timer_phase`。
- 广播 `timer` 和 `round_changed` 给成员端。
- 返回最新 `WorkshopHostView`。

### 更新本轮时长

文件：`backend/routes/workshops.py`

```http
POST /api/workshops/{workshop_id}/round-settings?code={host_code}
```

请求仍使用旧字段：

```json
{
  "discussion_time": 15,
  "input_time": 15
}
```

兼容逻辑：

- 前端只展示“本轮时长”。
- 后端收到任一字段后同步写入 `discussion_time` 和 `input_time`。
- 实际倒计时计算以 `discussion_time` 为准。

### 进入下一轮 / 结束研讨

文件：`backend/routes/workshops.py`

```http
POST /api/workshops/{workshop_id}/unlock-round?code={host_code}
```

行为：

- 当前轮 1-3：将当前轮置为 `completed`，下一轮置为 `active`，并清空下一轮计时状态。
- 当前轮 4：将研讨会状态置为 `completed`。
- 广播 `round_changed`。

### 提交成员回答

文件：`backend/routes/rounds.py`

```http
POST /api/groups/{group_id}/answers
```

新增后端校验：

- 参与者必须属于该组。
- 问题必须存在。
- 当前轮状态必须允许回答。
- 如果主持人已启动计时且剩余时间为 0，则返回 `400`。

### 成员端组长编辑 AI 提炼结果

文件：`backend/routes/rounds.py`

```http
PUT /api/groups/{group_id}/ai-result?workshop_id={workshop_id}
```

请求体：

```json
{
  "participant_id": 1,
  "session_token": "token",
  "edited_content": "编辑后的内容"
}
```

权限：

- 参与者必须属于该研讨会。
- 参与者必须属于该小组。
- `session_token` 必须匹配。
- 参与者必须是组长。

保存后：

- 更新 `GroupRoundResult.edited_content`。
- 状态置为 `edited`。
- 广播 `result_ready` 给同组成员和主持人端。

### 获取当前轮问题/答案

文件：`backend/routes/rounds.py`

相关接口：

```http
GET /api/groups/{group_id}/questions?workshop_id={workshop_id}
GET /api/groups/{group_id}/answers?workshop_id={workshop_id}
GET /api/groups/{group_id}/ai-result?workshop_id={workshop_id}
```

注意：

- 查询当前轮时以 `Workshop.current_round` 为准。
- 不再简单取第一个 `active/input/closing` 轮次，避免进入下一轮后仍读到上一轮数据。

### 综合提炼

文件：`backend/routes/rounds.py`

```http
POST /api/rounds/{round_id}/synthesize
```

行为：

- 读取该轮各组 `ready` 或 `edited` 的 AI 提炼结果。
- 使用每组最终内容：`edited_content or original_content`。
- 少于 2 组有效结果时返回 `400`，前端展示具体原因。
- AI 或校验失败时写入 `SynthesisResult.validation_error`。
- 成功或失败后返回 `SynthesisResultOut`。

### AI 问答按轮次隔离

文件：`backend/routes/ai_qa.py`

```http
POST /api/workshops/{workshop_id}/ai-ask
GET /api/workshops/{workshop_id}/ai-questions?participant_id={participant_id}
```

行为：

- 提问时读取当前轮并写入 `AIQuestionLog.round_id`。
- 历史记录只返回当前轮当前成员的问答。
- 组内上下文也只使用当前轮同组问答历史。

## 5. 前端实现要点

### 全局顶部导航

文件：`frontend/src/components/Layout/AppLayout.tsx`

- 左侧展示“领导力共创研讨会”。
- 使用 `Link to="/"` 返回首页。

### 成员端页面

文件：`frontend/src/pages/WorkshopPage.tsx`

关键状态：

- `PANEL_RATIO_KEY = "workshop-member-panel-ratio"`：保存双栏比例。
- `ROUND_LABELS`：定义四轮中文名称。
- `expired`：倒计时结束状态。
- `editingAIResult` / `aiResultDraft`：组长编辑 AI 提炼结果。

关键行为：

- `useGroup(workshopId, groupId, currentRound?.id)`：当前轮变化时清空问题、答案、AI 结果并重新拉取。
- `useAIAssistant(workshopId, participant?.id, currentRound?.id)`：当前轮变化时清空并重新拉取当前轮 AI 问答。
- WebSocket 收到 `round_changed` 时调用 `clearRoundState()`、`clearHistory()`、`fetchWorkshop()`。
- WebSocket 收到 `timer` 时刷新倒计时。
- `answerDisabled = !isCurrentActive || expired` 控制输入禁用。

### 成员端数据 Hook

文件：`frontend/src/hooks/useGroup.ts`

新增：

```ts
clearRoundState()
```

用途：

- 清空 `questions`
- 清空 `answers`
- 清空 `aiResult`
- 清空错误状态

依赖中加入 `roundId`，确保切轮后重新拉取当前轮数据。

### AI 问答 Hook

文件：`frontend/src/hooks/useAIAssistant.ts`

新增：

```ts
clearHistory()
```

依赖中加入 `roundId`，确保切轮后重新拉取当前轮问答。

### 主持人端页面

文件：`frontend/src/pages/HostDashboard.tsx`

关键状态：

- `selectedResultRound`：各组成果页选择的轮次。
- `selectedGroup`：各组成果页选择的小组。
- `selectedSynthesisRound`：综合汇总页选择的轮次。
- `copiedKey`：复制按钮临时状态。
- `localError`：自动消失的错误提示。

关键行为：

- 各组成果页从 `RoundInfo.answers` 中按 `question_id` 和 `group_id` 展示成员回答。
- 各组成果页分别展示 `original_content` 和 `edited_content`。
- 综合汇总页展示四组最终提交内容：`edited_content ?? original_content`。
- 综合提炼按钮直接调用 `groupApi.synthesize(round.id)`，捕获 API 错误并展示 `detail`。
- `localError` 通过 `setTimeout` 5 秒后自动清除。
- 复制使用 `navigator.clipboard.writeText`。

### API 客户端错误解析

文件：`frontend/src/services/api.ts`

`request()` 在 HTTP 非 2xx 时解析 FastAPI 返回的 JSON：

- `{"detail": "message"}`：展示 `message`。
- `{"detail": [...]}`：拼接校验错误消息。
- 非 JSON 响应保留原始文本。

这用于综合提炼失败时展示具体原因。

## 6. WebSocket 消息

成员端和主持人端主要处理：

| 消息类型 | 触发场景 | 前端行为 |
| --- | --- | --- |
| `new_answer` | 成员提交回答 | 成员端追加回答，主持人端刷新 |
| `result_ready` | AI 提炼生成或编辑完成 | 成员端重新拉取 AI 结果，主持人端刷新 |
| `synthesis_ready` | 综合提炼完成 | 主持人端刷新 |
| `round_changed` | 主持人进入下一轮或结束研讨 | 成员端清空当前轮状态并刷新，主持人端刷新 |
| `timer` | 主持人启动计时 | 成员端启动或更新倒计时 |

## 7. 验证方式

### 前端

```bash
cd frontend
npm run build
```

当前已验证通过。

### 后端语法与导入

```bash
python - <<'PY'
import ast
from pathlib import Path
for file in [
    Path("backend/models.py"),
    Path("backend/database.py"),
    Path("backend/schemas.py"),
    Path("backend/routes/ai_qa.py"),
    Path("backend/routes/rounds.py"),
    Path("backend/routes/workshops.py"),
]:
    ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
    print(f"OK {file}")
PY
```

```bash
set PYTHONPATH=backend
python -c "import schemas; import routes.ai_qa; import routes.rounds; import routes.workshops; print('backend imports OK')"
```

### 后端 pytest

```bash
python -m pytest backend/tests -q
```

当前环境缺少 `pytest_asyncio` 时会失败：

```text
ModuleNotFoundError: No module named 'pytest_asyncio'
```

需要安装测试依赖后再运行完整后端测试。

## 8. 维护注意事项

- 不要把 `.env` 或包含密钥的文件提交到 Git。
- 旧数据库需要通过 `init_db()` 自动补列；如果部署环境跳过 `init_db()`，需要手动执行等价迁移。
- `discussion_time` 和 `input_time` 仍保留用于兼容旧表和旧接口，但前端只展示一个“本轮时长”。
- 当前成员端 AI 问答历史按 `participant_id + current_round` 查询；如果未来需要组内共享问答，需要调整查询条件和权限设计。
- 主持人端 `RoundInfo.answers` 会返回每轮所有小组答案；数据量变大时可以考虑拆成按轮/组分页接口。
- 复制按钮依赖浏览器 Clipboard API；部分非安全上下文可能不可用。
