# 🔥 YiHuoGe / 异火阁

> 收诸般异火，掌万般续期。

异火阁是一个现代化、自托管资产仪表盘，用于管理域名、云主机、云服务、AI 订阅、会员订阅、通知渠道、续期提醒、AI 炼化导入与备份配置。

![YiHuoGe](./docs/preview.png)

## ✨ 功能

- 🧾 资产管理：列表/卡片、搜索、筛选、排序、分页、批量导入
- 🌐 域名资产：新增域名时自动调用 WHOIS/RDAP 适配器并填入续期日
- 🔔 通知渠道：Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、ServerChan、PushPlus、自定义
- 🤖 AI 炼化：从文本/CSV/表格内容解析生成资产
- 🧠 模型管理：手动添加、删除、默认模型选择、从 OpenAI-compatible `/models` 获取列表
- 🕰️ 时间偏好：时区选择生效，顶部时间精确到秒，农历常显
- 💾 MySQL/TiDB 存储：使用一个状态表保存资产、设置、通知、AI 与备份配置
- 🛡️ 管理密钥：写操作与模型获取接口受 `YIHUOGE_ADMIN_KEY` 保护
- 📦 备份方式：WebDAV、S3、Git 仓库 JSON；备份配置会随导出数据一起导出

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


## 🔐 环境变量

`.env.local` 示例：

```env
YIHUOGE_ADMIN_KEY=change-me-to-a-long-random-secret
MYSQL_URL=mysql://USER:PASSWORD@HOST:4000/yihuoge
```

> 不要把 `.env.local` 提交到仓库。

## 🗄️ MySQL / TiDB 存储

异火阁会自动创建表：

```sql
CREATE TABLE IF NOT EXISTS yihuoge_state (
  id VARCHAR(64) PRIMARY KEY,
  data LONGTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

当前应用状态存储在 `id = 'main'` 这一行中，适合先保持轻量；后续可拆分为资产表、通知表、设置表等结构化存储。

## ☁️ 部署

### ▲ Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Flames1217/YiHuoGe&env=YIHUOGE_ADMIN_KEY,MYSQL_URL&envDescription=YiHuoGe%20requires%20an%20admin%20key%20and%20a%20MySQL%2FTiDB%20connection%20URL.)

1. 推送到 GitHub。
2. 点击按钮导入项目。
3. 设置环境变量：
   - `YIHUOGE_ADMIN_KEY`
   - `MYSQL_URL`
4. Framework 选择 `Vite`，Output Directory 为 `dist`。
5. 部署完成后访问生产域名。

### 🟦 Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Flames1217/YiHuoGe)

> 前端可直接部署；服务端能力需要改成 Netlify Functions 或单独部署。

- Build command: `npm run build`
- Publish directory: `dist`
- 必填环境变量：`YIHUOGE_ADMIN_KEY`、`MYSQL_URL`

### 🟧 Cloudflare Pages

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Flames1217/YiHuoGe)

> 前端可部署到 Pages；服务端能力建议迁移到 Hono/Workers Routes，并继续使用 TiDB/MySQL HTTP 或 Serverless 连接方案。

- Build command: `npm run build`
- Output directory: `dist`
- 必填环境变量：`YIHUOGE_ADMIN_KEY`、`MYSQL_URL`

### 🦕 Deno Deploy

[![Deploy on Deno](https://deno.com/button)](https://dash.deno.com/new?url=https://github.com/Flames1217/YiHuoGe)

> 前端可作为静态站点部署；服务端能力建议迁移为 Deno/Hono 入口后再接入 MySQL/TiDB。

- Build command: `npm run build`
- Static directory: `dist`
- 必填环境变量：`YIHUOGE_ADMIN_KEY`、`MYSQL_URL`

### 🐳 Docker / 手动服务器

```bash
npm install
npm run build
npm run dev:full
```

静态文件在 `dist/`，可由 Nginx/Caddy 托管；服务端入口为 `server/index.ts`。

## 📁 项目结构

```text
YiHuoGe/
|-- api/                    # Vercel Functions
|   |-- [...path].ts          # Express-compatible server entry
|   |-- ai/models/fetch.ts    # Model list function
|   `-- whois/[domain].ts     # Domain WHOIS demo adapter
|-- docs/                   # Docs and preview image
|-- public/                 # Fonts and static assets
|-- server/                 # Local Express server
|-- src/                    # React frontend source
|   |-- data/                # Seed data
|   |-- utils/               # Date, lunar, status helpers
|   |-- App.tsx              # Main UI and modules
|   |-- store.ts             # Zustand store
|   |-- style.css            # YiHuoGe theme styles
|   `-- types.ts             # Type definitions
|-- .env.example            # Environment variable example
|-- vercel.json             # Vercel config
`-- package.json            # Scripts and dependencies
```

## 🧩 技术栈

- React + TypeScript + Vite
- Ant Design + Zustand + i18next
- Express / Vercel Functions
- MySQL / TiDB Cloud
- Lunar.js / dayjs

## 📄 License

MIT
