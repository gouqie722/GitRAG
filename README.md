# GitHub RAG

基于 GitHub 多项目代码的 RAG（检索增强生成）问答系统。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Koa2 |
| 向量库 | LanceDB（本地嵌入式） |
| 前端 | React + Vite |
| Embedding / Chat | DeepSeek（对话）+ 本地 Embedding |
| 数据源 | GitHub API |

## 架构

```
GitHub Repos ──► 文件抓取 & 分块 ──► Embedding ──► LanceDB
                                                      │
用户提问 ──► Query Embedding ──► 向量检索 ──► LLM 生成回答
```

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入以下关键配置：

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | [DeepSeek API Key](https://platform.deepseek.com/) |
| `CHAT_MODEL` | 对话模型，默认 `deepseek-chat`（也可选 `deepseek-v4-flash`） |
| `GITHUB_TOKEN` | GitHub Personal Access Token（需 `repo` 读权限） |
| `GITHUB_REPOS` | 预配置仓库列表，逗号或换行分隔，如 `user/repo-a,user/repo-b` |
| `EMBEDDING_PROVIDER` | 默认 `local`（本地模型，无需额外 Key） |
| `LANCEDB_PATH` | 向量数据存储路径，默认 `./data/lancedb` |

> **说明**：DeepSeek 目前只提供对话 API，不提供 Embedding。系统默认使用本地多语言模型 `Xenova/multilingual-e5-small` 做向量检索，首次索引会自动下载模型（约 100MB）。

> LanceDB 是嵌入式向量库，数据存储在本地目录，**无需 Docker 或额外服务**。

> 配置 `GITHUB_REPOS` 后，**后端启动时会自动索引**这些仓库。已索引过的项目默认跳过（`REINDEX_ON_STARTUP=false`），第二次启动即可直接问答。

### 2. 安装依赖

```bash
npm run install:all
```

### 3. 启动服务

```bash
# 终端 1 - 后端
npm run dev:backend

# 终端 2 - 前端
npm run dev:frontend
```

打开 http://localhost:5173 即可使用。

## 使用流程

1. **配置仓库** — 在 `.env` 中设置 `GITHUB_REPOS=owner/repo-a,owner/repo-b`
2. **启动服务** — 后端会自动索引配置的仓库（首次较慢，后续跳过）
3. **直接提问** — 打开前端，索引完成后即可在右侧问答
4. **可选** — 仍可在左侧手动添加或重新索引其他项目

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/github/repos` | 列出当前用户的 GitHub 项目 |
| GET | `/api/indexed` | 已索引项目列表 |
| POST | `/api/index` | 索引项目 `{ "repo": "owner/repo" }` |
| POST | `/api/chat` | 问答 `{ "question": "...", "repo": "owner/repo" }` |

## 项目结构

```
rag/
├── backend/           # Koa2 后端
│   └── src/
│       ├── services/  # GitHub、分块、Embedding、LanceDB、RAG
│       └── routes/    # API 路由
├── frontend/          # React 前端
│   └── src/
│       └── components/
├── data/lancedb/      # LanceDB 向量数据（自动生成）
└── .env.example
```

## 注意事项

- 首次索引大型项目可能需要几分钟，取决于文件数量和 API 速率
- 单文件大小超过 500KB 会被跳过
- 自动过滤 `node_modules`、`.git`、`dist` 等目录
- 支持 `.js/.ts/.py/.go/.rs/.java/.vue/.md` 等常见代码文件
- 重新索引会先删除该项目的旧向量再写入新数据
- 向量数据保存在 `data/lancedb/`，删除该目录可清空所有索引

## Embedding 配置（三选一）

DeepSeek 不提供 Embedding，需单独配置。国内网络无法访问 HuggingFace 时，推荐**方案 A 或 B**。

### 方案 A：离线本地模型（推荐，免费）

```bash
npm run download-model   # 从 ModelScope 下载，约 100MB
npm run dev:backend
```

`.env` 保持：
```env
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=Xenova/multilingual-e5-small
```

### 方案 B：SiliconFlow API（国内友好）

在 [siliconflow.cn](https://siliconflow.cn) 注册获取 Key：

```env
EMBEDDING_PROVIDER=siliconflow
EMBEDDING_API_KEY=sk-你的SiliconFlow密钥
EMBEDDING_MODEL=BAAI/bge-m3
```

### 方案 C：其他 OpenAI 兼容 API

```env
EMBEDDING_PROVIDER=api
EMBEDDING_API_KEY=sk-xxx
EMBEDDING_BASE_URL=https://api.xxx.com/v1
EMBEDDING_MODEL=your-embedding-model
```

## DeepSeek 配置示例

```env
DEEPSEEK_API_KEY=sk-your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
CHAT_MODEL=deepseek-chat
EMBEDDING_PROVIDER=local
```

## 可选：使用第三方 Embedding API

如果你有 OpenAI 或其他兼容 Embedding 服务，见上方「Embedding 配置」章节。
