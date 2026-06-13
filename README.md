<p align="center">
  <img src="./public/logo.png" alt="异火阁 Logo" width="92" />
</p>

<h1 align="center">🔥 异火阁 / YiHuoGe</h1>

<p align="center"><strong>收诸般异火，掌万般续期。</strong></p>

异火阁是一个自托管资产续期管理面板，用来管理域名、VPS、虚拟主机、AI 订阅、会员订阅和自定义资产；支持通知渠道、续期提醒、AI 炼化导入、批量操作和结构化数据库存储。

## ✨ 功能概览

- **资产管理**：列表/卡片视图、搜索、筛选、排序、分页、批量删除、克隆资产。
- **资产类型**：域名、VPS、虚拟主机、AI订阅、会员订阅、自定义。
- **服务商后台**：不同资产类型使用各自服务商列表；点击管理可进入服务商后台。域名额外支持托管商/DNS 后台。
- **域名 WHOIS/RDAP**：可尝试占验域名到期日；未配置真实适配器时不会用假结果覆盖数据。
- **通知渠道**：Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、ServerChan、PushPlus、ntfy、Gotify、Pushover、Teams、Google Chat、Matrix、Mattermost、Rocket.Chat、Signal、LINE、AWS SNS、Twilio、自定义等。
- **AI 炼化**：把 CSV、JSON、表格文本或资产清单炼化成资产数据；内置提示词会按项目字段解析类型、服务商、托管商、续期日、价格等。
- **模型管理**：支持 OpenAI Compatible 接口，手动添加模型、获取 `/models` 列表、测试默认模型。
- **主题界面**：暗色异火风格，统一顶部按钮、表格、筛选、下拉、悬停、弹窗等配色。
- **数据库存储**：结构化表存储，支持 MySQL/TiDB/MariaDB、PostgreSQL、SQLite、Cloudflare D1。

## 🚀 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev:full
```

访问：

```text
http://localhost:5173
```

本地 API 默认：

```text
http://localhost:8787
```

## 🔐 环境变量

`.env.local` 示例：

```env
YIHUOGE_ADMIN_KEY=change-me-to-a-long-random-secret
MYSQL_URL=mysql://USER:PASSWORD@HOST:4000/yihuoge
```

说明：

- `YIHUOGE_ADMIN_KEY`：管理密钥。写操作、模型列表获取、AI 炼化等接口会校验该密钥。
- `MYSQL_URL`：统一数据库连接变量。虽然名字叫 MySQL，但 MySQL/MariaDB/Postgres/SQLite 都走这个变量。
- 未配置 `MYSQL_URL` 时，默认使用 SQLite：`data/yihuoge.sqlite`。
- 不要提交 `.env.local`。

## 🗄️ 数据库存储

### 支持的数据库

| 数据库 | 连接方式 | 说明 |
| --- | --- | --- |
| MySQL / TiDB | `MYSQL_URL=mysql://USER:PASSWORD@HOST:PORT/DATABASE` | 推荐生产使用；现有 TiDB Cloud 也走这个格式。 |
| MariaDB | `MYSQL_URL=mariadb://USER:PASSWORD@HOST:PORT/DATABASE` | 使用 MySQL 协议兼容连接。 |
| PostgreSQL | `MYSQL_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE` | 也支持 `postgresql://...`。 |
| SQLite | `MYSQL_URL=sqlite://data/yihuoge.sqlite` | 单机/本地/轻量部署；未配置时默认启用。 |
| Cloudflare D1 | 绑定 `YIHUOGE_D1`、`DB` 或 `D1` | 适合 Cloudflare Workers/Pages Functions 环境。 |

### 自动建表

第一次启动或第一次访问 API 时会自动创建表。你可以先格式化数据库，再打开应用添加资产测试。

当前表结构：

| 表名 | 用途 |
| --- | --- |
| `yh_assets` | 资产主表：名称、类型、服务商、服务商后台、托管商、续期日、价格、标签、备注等。 |
| `yh_asset_domain_details` | 域名扩展详情表：只保存域名额外 WHOIS/RDAP 信息，通过 `asset_id` 关联 `yh_assets.id`。 |
| `yh_channels` | 通知渠道表：渠道类型、目标、密钥掩码、配置 JSON、模板、测试时间等。 |
| `yh_ai_config` | AI 配置表：provider、apiKey、baseUrl、models、defaultModel。 |
| `yh_settings` | 应用设置表：语言、时区、货币、提醒天数、模块顺序、备份目标等。 |

### 旧数据迁移

如果旧数据库里存在早期的单行状态数据，MySQL/TiDB 首次读取时会尝试迁移到新结构化表。

## 💾 备份与导入

- 支持本地导出 JSON，用于离线备份或迁移。
- 备份目标只保留 WebDAV、S3/R2/MinIO 和自定义外部存储，避免和主数据库结构冲突。

## 🧪 AI 炼化说明

AI 炼化会把用户提供的 CSV、JSON、表格文本或资产清单转成资产数据。

内置提示词要求模型输出以下核心字段：

```text
name,type,provider,providerUrl,hostProvider,hostUrl,account,
renewalDate,price,currency,cycle,url,tags,notes
```

类型只能是：

```text
domain / vps / hosting / ai / membership / custom
```

注意：

- 不会默认添加“AI炼化”标签。
- 密码、Token、API Key、Secret 不会明文写入资产备注。
- AI 炼化上传 CSV/TSV/TXT 时会保留整份原文交给模型，不在前端预切分或摘要。
- `cycle` 支持：`daily`、`weekly`、`monthly`、`quarterly`、`semiannual`、`yearly`、`biennial`、`triennial`、`lifetime`、`custom`。
- 资产列表表头列宽支持拖拽调整，并保存在当前浏览器 `localStorage`。
- AI 炼化成功后会写入数据库，并跳转回异火库查看结果。

## 🚢 部署

> 通用要求：所有线上部署至少配置 `YIHUOGE_ADMIN_KEY`；结构化数据库统一使用 `MYSQL_URL`。Cloudflare 场景可改用 D1 绑定 `YIHUOGE_D1`、`DB` 或 `D1`。

### ▲ Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Flames1217/YiHuoGe&env=YIHUOGE_ADMIN_KEY,MYSQL_URL&envDescription=YiHuoGe%20requires%20an%20admin%20key%20and%20a%20database%20connection%20URL.)

1. Fork 或导入仓库。
2. 设置环境变量：
   - `YIHUOGE_ADMIN_KEY`
   - `MYSQL_URL`
3. Framework 选择 `Vite`。
4. Build Command：`npm run build`
5. Output Directory：`dist`

Vercel 推荐使用 MySQL/TiDB/MariaDB/PostgreSQL 连接。SQLite 不适合 Vercel 无状态文件系统长期保存。

### 🟦 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Flames1217/YiHuoGe)

1. 从 GitHub 导入仓库。
2. Build Command：`npm run build`
3. Publish Directory：`dist`
4. 配置环境变量：
   - `YIHUOGE_ADMIN_KEY`
   - `MYSQL_URL`

Netlify 更适合托管前端静态产物；如果要让 API 也跑在 Netlify，需要自行接入 Netlify Functions，或把 API 部署到独立 Node 服务后由前端访问。

### 🟧 Cloudflare Pages / Workers

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://dash.cloudflare.com/?to=/:account/pages/new/provider/github)

推荐使用 Cloudflare D1：

1. Cloudflare Pages 连接 GitHub 仓库。
2. Build Command：`npm run build`
3. Output Directory：`dist`
4. 创建 D1 数据库，并绑定为 `YIHUOGE_D1`、`DB` 或 `D1`。
5. 设置 `YIHUOGE_ADMIN_KEY`。

D1 绑定存在时会优先使用 D1；如果不用 D1，也可以继续使用外部 MySQL/TiDB/MariaDB/PostgreSQL 的 `MYSQL_URL`。

### 🦕 Deno Deploy

[![Deploy on Deno Deploy](https://img.shields.io/badge/Deploy%20on-Deno%20Deploy-000000?logo=deno&logoColor=white)](https://dash.deno.com/new)

1. 先执行 `npm run build` 生成 `dist/`。
2. 将静态产物接入 Deno Deploy 项目。
3. API 部分需要按 Deno Deploy 的入口方式接入，或单独部署为 Node API 服务。
4. 数据库建议使用外部 MySQL/TiDB/MariaDB/PostgreSQL，继续通过 `MYSQL_URL` 配置。

### 🐳 Docker

[![Run with Docker](https://img.shields.io/badge/Run%20with-Docker-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/get-started/)

```bash
docker build -t yihuoge .
docker run --name yihuoge --env-file .env.local -p 8787:8787 yihuoge
```

启动后访问：

```text
http://localhost:8787
```

Docker 镜像会先构建前端 `dist/`，再用本地 API 服务托管前端静态文件和 `/api/*`。

### 🏠 私有部署 / VPS / 本地服务器

[![Self Host](https://img.shields.io/badge/Self--host-Nginx%20%2F%20Caddy%20%2F%20PM2-111827?logo=linux&logoColor=white)](#-私有部署--vps--本地服务器)

```bash
npm install
npm run build
npm run start:api
```

访问：

```text
http://localhost:8787
```

也可以用 PM2 / systemd 守护 `npm run start:api`，再用 Nginx 或 Caddy 反代到 `127.0.0.1:8787`。

## 📁 项目结构

```text
YiHuoGe/
|-- api/                       # Vercel Functions / serverless API
|   |-- _state.ts               # 数据库存储适配器与自动建表逻辑
|   |-- [...path].ts            # Express-compatible API 入口
|   |-- ai/                     # AI 配置、模型测试、AI 炼化
|   `-- whois/[domain].ts       # WHOIS/RDAP 示例适配器
|-- data/                      # 本地 SQLite/种子数据目录
|-- docs/                      # 架构说明
|-- public/                    # 字体、Logo、静态资源
|-- server/                    # 本地 Express API
|-- src/                       # React 前端
|   |-- data/                   # 前端默认配置
|   |-- utils/                  # 日期、农历、状态工具
|   |-- App.tsx                 # 主界面和模块
|   |-- store.ts                # Zustand 状态管理
|   |-- style.css               # 异火阁主题样式
|   `-- types.ts                # 类型定义
|-- .env.example               # 环境变量示例
|-- vercel.json                # Vercel 配置
`-- package.json               # 脚本与依赖
```

## 🧱 技术栈

- React 19 + TypeScript + Vite
- Ant Design + Zustand + i18next
- Express / Vercel Functions
- MySQL2 / pg / sqlite / Cloudflare D1
- dayjs + lunar-javascript

## 🛠️ 常用命令

```bash
npm run dev        # 只启动前端
npm run api        # 只启动本地 API
npm run dev:full   # 同时启动前端和 API
npm run build      # 类型检查并构建生产包
npm run preview    # 预览 dist
```

## 📄 License

MIT
