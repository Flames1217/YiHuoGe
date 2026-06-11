# YiHuoGe / 异火阁 架构说明

## 前端

- React + TypeScript + Vite
- Ant Design 自定义暗黑异火主题
- Zustand 管理资产、通知渠道、AI 配置、设置
- i18next / react-i18next 支持中文与英文
- dayjs + lunar-javascript 常显公历与农历

## 后端 API 骨架

`server/index.ts` 提供 Express 示例接口：

- `GET /api/bootstrap`
- `GET/POST/PUT/DELETE /api/assets`
- `GET /api/domains`
- `GET /api/whois/:domain`
- `GET/POST /api/channels`
- `POST /api/channels/:id/test`
- `GET /api/ai/models`
- `POST /api/ai/import`
- `GET/PUT /api/settings`

默认使用 `data/yihuoge.json` 作为 JSON 仓库存储，便于迁移到 SQLite、Postgres、MySQL、MongoDB、Cloudflare D1/KV 或 Git JSON。

## 可扩展适配器

- 部署：Cloudflare Workers/Pages、Vercel、Netlify、Deno Deploy、Docker、手动 VPS
- 存储：Cloudflare D1/KV、Postgres、MySQL/MariaDB、MongoDB、SQLite、Git JSON、自定义适配器
- 备份：WebDAV、S3 兼容存储、自定义外部存储
- 通知：Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、ServerChan、PushPlus、自定义

## 本地运行

```bash
npm run dev:full
```

前端默认 `http://localhost:5173`，API 默认 `http://localhost:8787`。
