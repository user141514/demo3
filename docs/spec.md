# 领导力AI工作坊 - 快速原型 Spec

## 技术栈
- 前端: React 18 + Vite + Tailwind CSS + shadcn/ui
- 后端: FastAPI + SQLAlchemy + SQLite
- AI: Anthropic API (Claude)
- 实时: WebSocket

## 数据模型

### Workshop (工作坊)
- id, title, created_at, status (active/completed)
- current_round: 1-4

### Participant (参与者)
- id, workshop_id, name, role (senior/middle/junior)

### Round (讨论轮次)
- id, workshop_id, round_number (1-4)
- title, objective

### Question (问题)
- id, round_id, content, order

### Answer (回答)
- id, question_id, participant_id, content, created_at

### Summary (AI汇总)
- id, round_id, content (AI汇总结果)

## API 端点

### Workshop
- POST /api/workshops - 创建工作坊
- GET /api/workshops/{id} - 获取工作坊详情
- POST /api/workshops/{id}/next-round - 进入下一轮

### Round
- GET /api/rounds/{id}/questions - 获取当前轮次问题
- POST /api/rounds/{id}/answers - 提交回答
- POST /api/rounds/{id}/summarize - AI汇总本轮观点
- GET /api/rounds/{id}/summary - 获取汇总结果

### WebSocket
- ws://localhost:8000/ws/{workshop_id} - 实时推送新回答和汇总

## 四轮工作坊流程

### 第一轮：领导力认知
- AI提问7道（公司需要的领导力品质、战略方向、标杆企业参考、典型表现、当前短板、跨行业借鉴、归纳维度）
- 参与者各自回答
- AI自动汇总 → 生成公司专属领导力维度

### 第二轮：层级定义
- 确定维度后，AI提问4道（高层定位、中层差异、基层要求、各层级差异化门槛）
- 自动汇总 → 生成 维度×层级 矩阵

### 第三轮：行为分布
- AI提问5道（高层具体行为、中层日常行为、基层可观察行为、通用行为vs层级特有行为、合/不合格标准）
- 自动汇总 → 生成可考核的行为标准

### 第四轮：模型应用
- AI提问5道（应用场景、人才盘点对接、晋升培训体系、日常行为数据化、跨部门协同场景）
- 最终汇总 → 完整的领导力模型应用方案

## 前端页面

### / (首页)
- 创建新工作坊 / 加入已有工作坊

### /workshop/{id} (工作坊主界面)
- 左侧：当前轮次说明 + 问题列表
- 中间：对话流（问题 + 所有参与者的回答）
- 右侧：参与者列表 + 轮次进度

### /workshop/{id}/admin (管理视角)
- 查看所有回答
- 触发AI汇总
- 查看/编辑汇总结果
- "进入下一轮"按钮

## 前端组件

- WorkshopForm: 创建工作坊表单
- RoundPanel: 当前轮次面板
- QuestionCard: 问题卡片（含AI图标）
- AnswerInput: 回答输入框
- AnswerList: 回答列表
- SummaryCard: AI汇总卡片
- ParticipantList: 参与者列表
- RoundProgress: 四轮进度条
- NextRoundButton: 进入下一轮按钮
