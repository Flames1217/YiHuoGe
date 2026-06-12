import type { AiConfig, AppSettings, Asset, DomainRecord, NotificationChannel } from "../types";

export const assetsSeed: Asset[] = [];

export const domainsSeed: DomainRecord[] = [];

export const channelsSeed: NotificationChannel[] = [];

export const aiConfigSeed: AiConfig = {
  provider: "开放接口兼容",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini", "deepseek-chat"],
  defaultModel: "gpt-4.1-mini",
};

export const settingsSeed: AppSettings = {
  language: "zh",
  timezone: "Asia/Shanghai",
  reminderDays: [30, 14, 7, 3, 1],
  defaultChannel: "",
  currency: "CNY",
  theme: "dark-fire",
  moduleOrder: ["overview", "assets", "notifications", "ai", "settings"],
  backupTargets: [],
};

export const providerPresets = [
  "火网云",
  "静态托管",
  "代码仓库",
  "开放智能",
  "智谱",
  "甲骨文云",
  "阿里云",
  "腾讯云",
  "华为云",
  "雨云",
  "搬瓦工",
  "旧域名仓",
  "自定义",
];
