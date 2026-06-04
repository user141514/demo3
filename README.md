# 领导力共创研讨会 AI 智能体

主持人控流 · 四组隔离 · AI 提炼 · 知识库 RAG · 完整导出

基于 DeepSeek API 的 Web 系统，支撑 20 人、4 组领导力模型共创研讨会全流程数字化。

## 使用流程

### 1. 主持人创建研讨会

打开系统 → 选择「主持人入口」→ 输入姓名 → 创建研讨会

系统生成三个码：
- **成员邀请码**（6位）：发给参会成员
- **主持人码**（8位）：主持人后台入口
- **知识库管理码**（8位）：上传知识库资料

### 2. 成员加入 & 随机分组

成员选择「成员入口」→ 输入姓名 + 6位邀请码 → 系统随机均匀分配到 1-4 组

每组首位成员自动成为**组长**，代表小组统一填写。

### 3. 四轮讨论流程

| 轮次 | 默认讨论 | 默认填写 | AI 产出 |
|------|---------|---------|---------|
| 讨论一：维度构建 | 15 min | 5 min | 每组 5-8 个领导力维度 + AI 综合四组维度 |
| 讨论二：层级定义 | 30 min | 5 min | 每组维度×管理层级差异表 + AI 综合表 |
| 讨论三：行为动作 | 30 min | 5 min | 每组可观察行为动作 + AI 综合行为标准 |
| 讨论四：应用场景 | 20 min | 5 min | 收集各组落地建议（不需 AI） |

主持人可在每轮开启前修改讨论和填写时间。

### 4. 主持人控流

```
主持人后台 → 轮次管理 → 设置讨论/填写时间 → 解锁本轮
```

每轮流程：
1. 主持人**解锁**本轮 → 成员端显示问题
2. 各组讨论后组长**填写答案** → 提交
3. 组长点击 **AI 生成** → 系统调用 DeepSeek 生成组结果
4. 主持人点击 **AI 综合** → 系统综合四组为统一结果
5. 主持人在线下投票后**录入共识结果** → 开启下一轮

### 5. 轮次间 AI 问答

成员可在讨论一到二、二到三、三到四之间向 AI 提问。AI 基于知识库 + 本组历史上下文回答，**不泄露其他组内容**。

### 6. 知识库管理

通过知识库管理码进入 → 上传 `docx`/`xlsx`/`pptx`/`md`/`txt` 文件 → 系统自动分块 + 向量化

管理界面展示：文件名、大小、分块数、embedding 模型、上传时间。支持删除。

### 7. 导出

主持人后台 → 导出 Tab → 一键生成 Markdown 总记录

包含：每组原始回答、AI 原始结果、编辑后结果、AI 综合结果、主持人输入、知识库文件清单。

### 完整流程图

```
主持人创建研讨会
  ├─ 生成邀请码 → 成员扫码加入 → 随机分4组
  ├─ 讨论一：组讨论 → 组长填写 → AI 生成维度 → AI 综合 → 线下投票 → 主持人录入框架
  ├─ 讨论二：组讨论 → 组长填写 → AI 生成层级表 → AI 综合 → 主持人录入共识
  ├─ 讨论三：组讨论 → 组长填写 → AI 生成行为 → AI 综合 → 主持人录入共识
  ├─ 讨论四：组讨论 → 组长填写 → 收集答案
  └─ 导出 Markdown 总记录
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui |
| 后端 | FastAPI (Python) + SQLAlchemy + SQLite + WebSocket |
| AI | DeepSeek API (deepseek-chat / deepseek-reasoner) |
| 知识库 | 本地分块 + embedding API 向量化 + 余弦相似度检索 |

## 项目结构

```
demo3/
├── start.bat              # 一键启动（后端 + 前端）
├── backend/
│   ├── main.py            # FastAPI 入口
│   ├── models.py          # 数据模型（10 张表）
│   ├── schemas.py         # Pydantic schema
│   ├── routes/            # API 路由
│   │   ├── workshops.py   # 研讨会 CRUD + 主持人控制
│   │   ├── rounds.py      # 组级问答 + AI 生成 + 综合
│   │   ├── knowledge.py   # 知识库管理
│   │   └── ai_qa.py       # AI 问答
│   ├── services/
│   │   ├── ai_service.py           # DeepSeek API 封装
│   │   ├── knowledge_base_service.py  # 知识库解析+分块+检索
│   │   └── export_service.py       # Markdown 导出
│   └── seed.py            # 种子数据（4轮问题）
└── frontend/
    └── src/
        ├── pages/
        │   ├── HomePage.tsx         # 主持人/成员双入口
        │   ├── HostDashboard.tsx    # 7 Tab 主持人后台
        │   ├── WorkshopPage.tsx     # 组级成员视图
        │   └── KnowledgeBasePage.tsx # 知识库管理
        ├── hooks/                   # 自定义 hooks（6 个）
        ├── services/api.ts          # API 客户端
        └── types/index.ts           # 类型定义
```

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- DeepSeek API Key（[获取](https://platform.deepseek.com)）

### 1. 配置

```bash
cd backend
cp .env.example .env  # 编辑 .env，填写 DEEPSEEK_API_KEY
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
source venv/Scripts/activate  # Windows
pip install -r requirements.txt
python seed.py    # 初始化数据库
python main.py    # 启动 (localhost:8000)
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev        # 启动 (localhost:5173)
```

或直接运行根目录 `start.bat` 一键启动。

## API 端点

### 研讨会
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/workshops | 创建研讨会 |
| POST | /api/workshops/validate-host | 验证主持人码 |
| POST | /api/workshops/validate-invite | 验证邀请码 |
| GET | /api/workshops/{id} | 成员视图 |
| GET | /api/workshops/{id}/host?code= | 主持人视图 |
| POST | /api/workshops/{id}/join | 加入研讨会 |
| POST | /api/workshops/{id}/unlock-round | 解锁轮次 |
| POST | /api/workshops/{id}/host-input | 录入共识 |
| GET | /api/workshops/{id}/export | 导出 Markdown |

### 组操作
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/groups/{id}/questions | 获取当前轮问题 |
| POST | /api/groups/{id}/answers | 提交答案 |
| POST | /api/groups/{id}/ai-generate | 触发 AI 生成 |
| POST | /api/rounds/{id}/synthesize | 触发综合 |

### 知识库 & AI 问答
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/knowledge/upload | 上传文件 |
| GET | /api/knowledge/documents | 文件列表 |
| POST | /api/workshops/{id}/ai-ask | AI 问答 |

### WebSocket
```
ws://localhost:8000/ws/{workshop_id}?channel={group_id|host}
```

## 数据隔离

- 成员 WebSocket 按 `group_id` 分频道，只收本组消息
- API 查询强制按 `group_id` 过滤
- AI 问答上下文仅含本组历史和知识库
- 主持人频道可见全部数据

## License

MIT
