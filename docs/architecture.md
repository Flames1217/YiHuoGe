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

默认使用结构化数据库表存储；未配置连接串时落到 `data/yihuoge.sqlite`。支持 SQLite、Postgres、MySQL/MariaDB/TiDB 与 Cloudflare D1。

## 数据库表结构

统一由 `api/_state.ts` 自动建表；MySQL/MariaDB/TiDB/Postgres/SQLite/D1 使用同一套逻辑结构：

- `yh_assets`：资产主表，保存类型、服务商、托管商、账号/标识、续期日、价格、管理地址、标签与备注。
- `yh_domains`：域名 WHOIS/RDAP 扩展表，保存注册商、创建日、到期日、DNS 与状态。
- `yh_channels`：通知渠道表，保存渠道类型、目标、密钥掩码、配置 JSON 与模板。
- `yh_ai_config`：AI 炼化配置表，单行 `main` 保存 provider、baseUrl、models、defaultModel 与 apiKey。
- `yh_settings`：应用设置表，单行 `main` 保存时区、货币、模块顺序、备份目标等设置 JSON。

连接选择：

- `MYSQL_URL=mysql://...` 或 `mariadb://...`：MySQL / MariaDB / TiDB。
- `MYSQL_URL=postgres://...` 或 `postgresql://...`：PostgreSQL。
- `MYSQL_URL=sqlite://data/yihuoge.sqlite` 或未配置：SQLite。
- Cloudflare Pages/Workers 绑定 `YIHUOGE_D1`、`DB` 或 `D1`：Cloudflare D1。

## 可扩展适配器

- 部署：Cloudflare Workers/Pages、Vercel、Netlify、Deno Deploy、Docker、手动 VPS
- 存储：Cloudflare D1、Postgres、MySQL/MariaDB/TiDB、SQLite、自定义 SQL 适配器
- 备份：WebDAV、S3 兼容存储、自定义外部存储
- 通知：Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、ServerChan、PushPlus、自定义

## 本地运行

```bash
npm run dev:full
```

前端默认 `http://localhost:5173`，API 默认 `http://localhost:8787`。
