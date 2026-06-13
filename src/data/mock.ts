import type { AiConfig, AppSettings, Asset, DomainRecord, NotificationChannel } from "../types";

export const assetsSeed: Asset[] = [];

export const domainsSeed: DomainRecord[] = [];

export const channelsSeed: NotificationChannel[] = [];

export const aiConfigSeed: AiConfig = {
  provider: "OpenAI Compatible",
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
  "???",
  "???",
  "???",
  "Cloudflare",
  "Namecheap",
  "Vultr",
  "DigitalOcean",
  "OpenAI",
  "Anthropic Claude",
  "GitHub",
  "???",
];
