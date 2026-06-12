export type Language = "zh" | "en";

export type AssetType = "domain" | "vps" | "cloud" | "ai" | "membership" | "custom";
export type AssetStatus = "healthy" | "warning" | "critical" | "expired";
export type ViewMode = "table" | "card";
export type NotifyType =
  | "Email"
  | "Telegram"
  | "Discord"
  | "Slack"
  | "Webhook"
  | "DingTalk"
  | "WeCom"
  | "Feishu"
  | "Bark"
  | "ServerChan"
  | "PushPlus"
  | "ntfy"
  | "Gotify"
  | "Pushover"
  | "Microsoft Teams"
  | "Google Chat"
  | "Matrix"
  | "Mattermost"
  | "Rocket.Chat"
  | "Signal"
  | "LINE"
  | "Pushbullet"
  | "AWS SNS"
  | "Twilio"
  | "Custom";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  provider: string;
  account: string;
  renewalDate: string;
  price: number;
  currency: string;
  cycle: "monthly" | "yearly" | "custom";
  status: AssetStatus;
  url?: string;
  tags: string[];
  notes?: string;
}

export interface DomainRecord extends Asset {
  type: "domain";
  registrar: string;
  createdAt: string;
  expiresAt: string;
  dns: string[];
  whoisStatus: string[];
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: NotifyType;
  enabled: boolean;
  target: string;
  lastTest?: string;
  secretMasked?: string;
}

export interface AiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
}

export interface BackupTarget {
  id: string;
  name: string;
  type: "WebDAV" | "S3" | "GitJson";
  target: string;
  enabled: boolean;
  notes?: string;
}

export interface AppSettings {
  language: Language;
  timezone: string;
  reminderDays: number[];
  defaultChannel: string;
  currency: string;
  theme: "dark-fire" | "abyss-purple" | "ink-gold";
  moduleOrder: string[];
  backupTargets: BackupTarget[];
}

export interface CalendarItem {
  id: string;
  title: string;
  date: string;
  kind: "renewal" | "solarTerm" | "note";
  assetId?: string;
}
