export type Language = "zh" | "en";

export type AssetType = "domain" | "vps" | "hosting" | "cloud" | "ai" | "membership" | "custom";
export type AssetStatus = "healthy" | "warning" | "critical" | "expired";
export type AssetCycle = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | "biennial" | "triennial" | "decennial" | "lifetime" | "custom";
export interface CustomCycle {
  years?: number;
  months?: number;
  days?: number;
}
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
  providerUrl?: string;
  hostProvider?: string;
  hostUrl?: string;
  account: string;
  accountType?: string;
  renewalDate: string;
  price: number;
  currency: string;
  cycle: AssetCycle;
  customCycle?: CustomCycle;
  status: AssetStatus;
  autoRenew: boolean;
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
  config?: Record<string, string>;
  template?: string;
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
  type: "WebDAV" | "S3";
  target: string;
  username?: string;
  password?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
  pathStyle?: boolean;
  scheduleEnabled?: boolean;
  scheduleIntervalHours?: number;
  lastBackupAt?: string;
  nextBackupAt?: string;
  retentionCount?: number;
  enabled: boolean;
  lastTestAt?: string;
  lastStatus?: "success" | "failed";
  lastMessage?: string;
  notes?: string;
}

export interface AppSettings {
  language: Language;
  timezone: string;
  reminderDays: number[];
  defaultChannel: string;
  currency: string;
  theme: "dark-fire" | "qing-lian" | "fallen-heart" | "bone-cold" | "sanqian-flame" | "sea-heart" | "pure-lotus";
  moduleOrder: string[];
  backupTargets: BackupTarget[];
  accountTypePresets?: string[];
  accountValuePresets?: Record<string, string[]>;
  providerPresets?: Partial<Record<AssetType, string[]>>;
  hostProviderPresets?: string[];
}

export interface CalendarItem {
  id: string;
  title: string;
  date: string;
  kind: "renewal" | "solarTerm" | "note";
  assetId?: string;
}
