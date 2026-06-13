import {
  ApiOutlined,
  AppstoreOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  GlobalOutlined,
  ImportOutlined,
  LayoutOutlined,
  LockOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useMemo, useState } from "react";
import type { Key, MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { useYiHuoStore } from "./store";
import type { Asset, AssetStatus, AssetType, BackupTarget, Language, NotificationChannel, NotifyType, ViewMode } from "./types";
import { daysUntil, topbarDate } from "./utils/calendar";

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const ADMIN_KEY_STORAGE = "yihuoge-admin-key";
const ASSET_COLUMN_WIDTHS_STORAGE = "yihuoge-asset-column-widths";

type AssetColumnKey = "name" | "type" | "provider" | "renewalDate" | "price" | "manage" | "action";

const defaultAssetColumnWidths: Record<AssetColumnKey, number> = {
  name: 420,
  type: 130,
  provider: 170,
  renewalDate: 270,
  price: 130,
  manage: 170,
  action: 150,
};

function loadAssetColumnWidths(): Record<AssetColumnKey, number> {
  if (typeof window === "undefined") return defaultAssetColumnWidths;
  try {
    const saved = JSON.parse(window.localStorage.getItem(ASSET_COLUMN_WIDTHS_STORAGE) || "{}") as Partial<Record<AssetColumnKey, number>>;
    return { ...defaultAssetColumnWidths, ...Object.fromEntries(Object.entries(saved).filter(([, value]) => Number.isFinite(value) && Number(value) >= 80)) } as Record<AssetColumnKey, number>;
  } catch {
    return defaultAssetColumnWidths;
  }
}

function persistAssetColumnWidths(widths: Record<AssetColumnKey, number>) {
  if (typeof window !== "undefined") window.localStorage.setItem(ASSET_COLUMN_WIDTHS_STORAGE, JSON.stringify(widths));
}


type AccessState = "checking" | "locked" | "unlocked";

async function verifyAdminKey(key: string) {
  const response = await fetch("/api/auth/verify", {
    method: "POST",
    headers: key ? { "x-admin-key": key } : undefined,
  });
  return response.ok;
}

async function hydrateFromServer(key: string) {
  useYiHuoStore.setState({ hydrating: true });
  try {
    const response = await fetch("/api/bootstrap", {
      headers: key ? { "x-admin-key": key } : undefined,
    });
    if (!response.ok) return;
    const data = await response.json();
    useYiHuoStore.setState((state) => ({
      assets: Array.isArray(data.assets) ? data.assets : state.assets,
      domains: Array.isArray(data.domains) ? data.domains : state.domains,
      channels: Array.isArray(data.channels) ? data.channels : state.channels,
      aiConfig: data.ai ? { ...state.aiConfig, ...data.ai } : state.aiConfig,
      settings: data.settings ? { ...state.settings, ...data.settings } : state.settings,
    }));
  } finally {
    useYiHuoStore.setState({ hydrating: false, hydrated: true });
  }
}

const statusTone: Record<AssetStatus, string> = {
  healthy: "success",
  warning: "warning",
  critical: "error",
  expired: "default",
};

const typeTone: Record<AssetType, string> = {
  domain: "volcano",
  vps: "geekblue",
  hosting: "cyan",
  cloud: "cyan",
  ai: "purple",
  membership: "gold",
  custom: "default",
};

const assetTypeName: Record<AssetType, string> = {
  domain: "域名",
  vps: "VPS",
  hosting: "虚拟主机",
  cloud: "虚拟主机",
  ai: "AI订阅",
  membership: "会员订阅",
  custom: "自定义",
};

const assetCycles: Asset["cycle"][] = ["daily", "weekly", "monthly", "quarterly", "semiannual", "yearly", "biennial", "triennial", "lifetime", "custom"];

const cycleName: Record<Asset["cycle"], string> = {
  daily: "日付",
  weekly: "周付",
  monthly: "月付",
  quarterly: "季付",
  semiannual: "半年付",
  yearly: "年付",
  biennial: "两年付",
  triennial: "三年付",
  lifetime: "永久",
  custom: "自定",
};

const assetCycleOptions = assetCycles.map((value) => ({ value, label: cycleName[value] }));

const moduleName: Record<string, string> = {
  overview: "阁内总览",
  assets: "异火库",
  notifications: "通知功法",
  ai: "AI 炼化",
  settings: "设置",
};

const moduleKeys = ["overview", "assets", "notifications", "ai", "settings"];

const aiProviderOptions = [
  { value: "OpenAI Compatible", label: "OpenAI Compatible", baseUrl: "https://api.openai.com/v1" },
  { value: "OpenAI", label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { value: "Azure OpenAI", label: "Azure OpenAI", baseUrl: "https://{resource}.openai.azure.com/openai" },
  { value: "Google Gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "Anthropic Claude", label: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1" },
  { value: "DeepSeek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  { value: "xAI Grok", label: "xAI Grok", baseUrl: "https://api.x.ai/v1" },
  { value: "Mistral AI", label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1" },
  { value: "Cohere", label: "Cohere", baseUrl: "https://api.cohere.com/v2" },
  { value: "Groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { value: "OpenRouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { value: "Together AI", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
  { value: "Perplexity", label: "Perplexity", baseUrl: "https://api.perplexity.ai" },
  { value: "Fireworks AI", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { value: "Alibaba DashScope / Qwen", label: "Alibaba DashScope / Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { value: "Moonshot AI / Kimi", label: "Moonshot AI / Kimi", baseUrl: "https://api.moonshot.ai/v1" },
  { value: "Zhipu AI / GLM", label: "Zhipu AI / GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { value: "AWS Bedrock", label: "AWS Bedrock", baseUrl: "" },
  { value: "Ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  { value: "LM Studio", label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  { value: "Custom OpenAI Compatible", label: "Custom OpenAI Compatible", baseUrl: "" },
];

const timezoneOptions = [
  { value: "Asia/Shanghai", label: "亚洲/上海" },
  { value: "Asia/Tokyo", label: "亚洲/东京" },
  { value: "Asia/Singapore", label: "亚洲/新加坡" },
  { value: "Asia/Hong_Kong", label: "亚洲/香港" },
  { value: "Europe/London", label: "欧洲/伦敦" },
  { value: "Europe/Berlin", label: "欧洲/柏林" },
  { value: "America/New_York", label: "美洲/纽约" },
  { value: "America/Los_Angeles", label: "美洲/洛杉矶" },
  { value: "UTC", label: "协调世界时" },
];

const currencySymbols: Record<string, string> = {
  CNY: "\u00a5",
  USD: "$",
  EUR: "\u20ac",
  JPY: "\u00a5",
  HKD: "HK$",
  GBP: "\u00a3",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  CHF: "CHF",
  KRW: "\u20a9",
  TWD: "NT$",
  NZD: "NZ$",
  INR: "\u20b9",
};

const currencyOptions = Object.keys(currencySymbols).map((value) => ({
  value,
  label: `${value} ${currencySymbols[value]}`,
}));

const currencyRatesToCny: Record<string, number> = {
  CNY: 1,
  USD: 7.25,
  EUR: 7.85,
  JPY: 0.046,
  HKD: 0.93,
  GBP: 9.2,
  AUD: 4.75,
  CAD: 5.28,
  SGD: 5.38,
  CHF: 8.1,
  KRW: 0.0052,
  TWD: 0.23,
  NZD: 4.35,
  INR: 0.087,
};

type ProviderOption = { value: string; label: string; url?: string };

const providerCatalog: Record<AssetType, ProviderOption[]> = {
  domain: [
    { value: "\u963f\u91cc\u4e91", label: "\u963f\u91cc\u4e91", url: "https://dc.console.aliyun.com/" },
    { value: "\u817e\u8baf\u4e91", label: "\u817e\u8baf\u4e91", url: "https://console.cloud.tencent.com/domain" },
    { value: "\u534e\u4e3a\u4e91", label: "\u534e\u4e3a\u4e91", url: "https://console.huaweicloud.com/domain/" },
    { value: "\u897f\u90e8\u6570\u7801", label: "\u897f\u90e8\u6570\u7801", url: "https://www.west.cn/Manager/" },
    { value: "\u65b0\u7f51", label: "\u65b0\u7f51", url: "https://www.xinnet.com/user/" },
    { value: "\u6613\u540d\u4e2d\u56fd", label: "\u6613\u540d\u4e2d\u56fd", url: "https://www.ename.net/" },
    { value: "\u7231\u540d\u7f51", label: "\u7231\u540d\u7f51", url: "https://www.22.cn/" },
    { value: "\u805a\u540d\u7f51", label: "\u805a\u540d\u7f51", url: "https://www.juming.com/" },
    { value: "Gname", label: "Gname", url: "https://www.gname.com/" },
    { value: "22.cn", label: "22.cn", url: "https://www.22.cn/" },
    { value: "Spaceship", label: "Spaceship", url: "https://www.spaceship.com/application/domain-list-application/" },
    { value: "Cloudflare Registrar", label: "Cloudflare Registrar", url: "https://dash.cloudflare.com/" },
    { value: "Namecheap", label: "Namecheap", url: "https://ap.www.namecheap.com/domains/list/" },
    { value: "GoDaddy", label: "GoDaddy", url: "https://dcc.godaddy.com/domains" },
    { value: "Porkbun", label: "Porkbun", url: "https://porkbun.com/account/domains" },
    { value: "Dynadot", label: "Dynadot", url: "https://www.dynadot.com/account/domain/manage" },
    { value: "NameSilo", label: "NameSilo", url: "https://www.namesilo.com/account_domains.php" },
    { value: "Gandi", label: "Gandi", url: "https://admin.gandi.net/domain" },
    { value: "OVHcloud", label: "OVHcloud", url: "https://www.ovh.com/manager/" },
    { value: "IONOS", label: "IONOS", url: "https://my.ionos.com/domains" },
    { value: "Hostinger", label: "Hostinger", url: "https://hpanel.hostinger.com/domains" },
    { value: "Squarespace Domains", label: "Squarespace Domains", url: "https://domains.squarespace.com/" },
    { value: "Tucows / OpenSRS", label: "Tucows / OpenSRS", url: "https://manage.opensrs.com/" },
    { value: "Hover", label: "Hover", url: "https://www.hover.com/control_panel" },
    { value: "Enom", label: "Enom", url: "https://www.enom.com/apilogin.aspx" },
    { value: "MarkMonitor", label: "MarkMonitor", url: "https://www.markmonitor.com/" },
    { value: "Network Solutions", label: "Network Solutions", url: "https://www.networksolutions.com/manage-it/index.jsp" },
    { value: "Register.com", label: "Register.com", url: "https://www.register.com/my-account/login" },
    { value: "Domain.com", label: "Domain.com", url: "https://www.domain.com/controlpanel/login" },
    { value: "Bluehost Domains", label: "Bluehost Domains", url: "https://my.bluehost.com/hosting/app" },
    { value: "DreamHost Domains", label: "DreamHost Domains", url: "https://panel.dreamhost.com/" },
    { value: "Sav", label: "Sav", url: "https://www.sav.com/account/domain" },
    { value: "Hexonet / CentralNic", label: "Hexonet / CentralNic", url: "https://centralnicreseller.com/" },
    { value: "Key-Systems", label: "Key-Systems", url: "https://www.key-systems.net/" },
    { value: "101domain", label: "101domain", url: "https://www.101domain.com/account.htm" },
    { value: "EuroDNS", label: "EuroDNS", url: "https://www.eurodns.com/account" },
    { value: "Internet.bs", label: "Internet.bs", url: "https://internetbs.net/en/domain-name-registrations/" },
    { value: "WebNIC", label: "WebNIC", url: "https://www.webnic.cc/" },
    { value: "REG.RU", label: "REG.RU", url: "https://www.reg.com/" },
    { value: "RU-CENTER", label: "RU-CENTER", url: "https://www.nic.ru/" },
    { value: "GMO / Onamae", label: "GMO / Onamae", url: "https://www.onamae.com/" },
    { value: "Netim", label: "Netim", url: "https://www.netim.com/" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  vps: [
    { value: "\u963f\u91cc\u4e91 ECS", label: "\u963f\u91cc\u4e91 ECS", url: "https://ecs.console.aliyun.com/" },
    { value: "\u817e\u8baf\u4e91 CVM", label: "\u817e\u8baf\u4e91 CVM", url: "https://console.cloud.tencent.com/cvm" },
    { value: "\u534e\u4e3a\u4e91 ECS", label: "\u534e\u4e3a\u4e91 ECS", url: "https://console.huaweicloud.com/ecm/" },
    { value: "AWS EC2", label: "AWS EC2", url: "https://console.aws.amazon.com/ec2/" },
    { value: "AWS Lightsail", label: "AWS Lightsail", url: "https://lightsail.aws.amazon.com/" },
    { value: "Google Compute Engine", label: "Google Compute Engine", url: "https://console.cloud.google.com/compute/instances" },
    { value: "Azure Virtual Machines", label: "Azure Virtual Machines", url: "https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FVirtualMachines" },
    { value: "Oracle Cloud", label: "Oracle Cloud", url: "https://cloud.oracle.com/compute/instances" },
    { value: "Vultr", label: "Vultr", url: "https://my.vultr.com/" },
    { value: "DigitalOcean", label: "DigitalOcean", url: "https://cloud.digitalocean.com/droplets" },
    { value: "Linode / Akamai", label: "Linode / Akamai", url: "https://cloud.linode.com/linodes" },
    { value: "Hetzner", label: "Hetzner", url: "https://console.hetzner.cloud/projects" },
    { value: "Contabo", label: "Contabo", url: "https://my.contabo.com/" },
    { value: "OVHcloud VPS", label: "OVHcloud VPS", url: "https://www.ovh.com/manager/" },
    { value: "Scaleway", label: "Scaleway", url: "https://console.scaleway.com/" },
    { value: "UpCloud", label: "UpCloud", url: "https://hub.upcloud.com/" },
    { value: "Kamatera", label: "Kamatera", url: "https://console.kamatera.com/" },
    { value: "Leaseweb", label: "Leaseweb", url: "https://secure.leaseweb.com/" },
    { value: "Gcore", label: "Gcore", url: "https://accounts.gcore.com/" },
    { value: "Equinix Metal", label: "Equinix Metal", url: "https://console.equinix.com/" },
    { value: "IBM Cloud", label: "IBM Cloud", url: "https://cloud.ibm.com/resources" },
    { value: "RackNerd", label: "RackNerd", url: "https://my.racknerd.com/clientarea.php" },
    { value: "BandwagonHost", label: "BandwagonHost", url: "https://bwh81.net/clientarea.php" },
    { value: "DMIT", label: "DMIT", url: "https://www.dmit.io/clientarea.php" },
    { value: "GreenCloudVPS", label: "GreenCloudVPS", url: "https://greencloudvps.com/billing/clientarea.php" },
    { value: "HostHatch", label: "HostHatch", url: "https://cloud.hosthatch.com/" },
    { value: "BuyVM", label: "BuyVM", url: "https://manage.buyvm.net/" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  hosting: [
    { value: "\u963f\u91cc\u4e91\u865a\u62df\u4e3b\u673a", label: "\u963f\u91cc\u4e91\u865a\u62df\u4e3b\u673a", url: "https://wanwang.aliyun.com/hosting/" },
    { value: "\u817e\u8baf\u4e91\u8f7b\u91cf\u5e94\u7528\u670d\u52a1\u5668", label: "\u817e\u8baf\u4e91\u8f7b\u91cf\u5e94\u7528\u670d\u52a1\u5668", url: "https://console.cloud.tencent.com/lighthouse/instance" },
    { value: "\u897f\u90e8\u6570\u7801\u865a\u62df\u4e3b\u673a", label: "\u897f\u90e8\u6570\u7801\u865a\u62df\u4e3b\u673a", url: "https://www.west.cn/Manager/" },
    { value: "Vercel", label: "Vercel", url: "https://vercel.com/dashboard" },
    { value: "Netlify", label: "Netlify", url: "https://app.netlify.com/" },
    { value: "Cloudflare Pages", label: "Cloudflare Pages", url: "https://dash.cloudflare.com/" },
    { value: "GitHub Pages", label: "GitHub Pages", url: "https://github.com/" },
    { value: "Render", label: "Render", url: "https://dashboard.render.com/" },
    { value: "Railway", label: "Railway", url: "https://railway.app/dashboard" },
    { value: "Fly.io", label: "Fly.io", url: "https://fly.io/dashboard" },
    { value: "Hostinger", label: "Hostinger", url: "https://hpanel.hostinger.com/" },
    { value: "SiteGround", label: "SiteGround", url: "https://tools.siteground.com/" },
    { value: "Bluehost", label: "Bluehost", url: "https://my.bluehost.com/" },
    { value: "DreamHost", label: "DreamHost", url: "https://panel.dreamhost.com/" },
    { value: "HostGator", label: "HostGator", url: "https://portal.hostgator.com/" },
    { value: "A2 Hosting", label: "A2 Hosting", url: "https://my.a2hosting.com/" },
    { value: "InMotion Hosting", label: "InMotion Hosting", url: "https://secure1.inmotionhosting.com/" },
    { value: "Kinsta", label: "Kinsta", url: "https://my.kinsta.com/" },
    { value: "WP Engine", label: "WP Engine", url: "https://my.wpengine.com/" },
    { value: "Cloudways", label: "Cloudways", url: "https://platform.cloudways.com/" },
    { value: "cPanel", label: "cPanel" },
    { value: "Plesk", label: "Plesk" },
    { value: "DirectAdmin", label: "DirectAdmin" },
    { value: "\u5b9d\u5854\u9762\u677f", label: "\u5b9d\u5854\u9762\u677f" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  cloud: [
    { value: "\u963f\u91cc\u4e91", label: "\u963f\u91cc\u4e91", url: "https://home.console.aliyun.com/" },
    { value: "\u817e\u8baf\u4e91", label: "\u817e\u8baf\u4e91", url: "https://console.cloud.tencent.com/" },
    { value: "\u534e\u4e3a\u4e91", label: "\u534e\u4e3a\u4e91", url: "https://console.huaweicloud.com/" },
    { value: "AWS", label: "AWS", url: "https://console.aws.amazon.com/" },
    { value: "Google Cloud", label: "Google Cloud", url: "https://console.cloud.google.com/" },
    { value: "Microsoft Azure", label: "Microsoft Azure", url: "https://portal.azure.com/" },
    { value: "Oracle Cloud", label: "Oracle Cloud", url: "https://cloud.oracle.com/" },
    { value: "Cloudflare", label: "Cloudflare", url: "https://dash.cloudflare.com/" },
    { value: "Vercel", label: "Vercel", url: "https://vercel.com/dashboard" },
    { value: "Netlify", label: "Netlify", url: "https://app.netlify.com/" },
    { value: "DigitalOcean", label: "DigitalOcean", url: "https://cloud.digitalocean.com/" },
    { value: "Linode / Akamai", label: "Linode / Akamai", url: "https://cloud.linode.com/" },
    { value: "OVHcloud", label: "OVHcloud", url: "https://www.ovh.com/manager/" },
    { value: "\u706b\u5c71\u5f15\u64ce", label: "\u706b\u5c71\u5f15\u64ce", url: "https://console.volcengine.com/" },
    { value: "UCloud", label: "UCloud", url: "https://console.ucloud.cn/" },
    { value: "\u4e03\u725b\u4e91", label: "\u4e03\u725b\u4e91", url: "https://portal.qiniu.com/" },
    { value: "\u53c8\u62cd\u4e91", label: "\u53c8\u62cd\u4e91", url: "https://console.upyun.com/" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  ai: [
    { value: "OpenAI", label: "OpenAI", url: "https://platform.openai.com/" },
    { value: "Anthropic Claude", label: "Anthropic Claude", url: "https://console.anthropic.com/" },
    { value: "Google Gemini", label: "Google Gemini", url: "https://aistudio.google.com/" },
    { value: "DeepSeek", label: "DeepSeek", url: "https://platform.deepseek.com/" },
    { value: "xAI", label: "xAI", url: "https://console.x.ai/" },
    { value: "Groq", label: "Groq", url: "https://console.groq.com/" },
    { value: "Mistral AI", label: "Mistral AI", url: "https://console.mistral.ai/" },
    { value: "Cohere", label: "Cohere", url: "https://dashboard.cohere.com/" },
    { value: "Perplexity", label: "Perplexity", url: "https://www.perplexity.ai/settings/api" },
    { value: "OpenRouter", label: "OpenRouter", url: "https://openrouter.ai/settings/keys" },
    { value: "Together AI", label: "Together AI", url: "https://api.together.xyz/settings/api-keys" },
    { value: "Fireworks AI", label: "Fireworks AI", url: "https://fireworks.ai/account/api-keys" },
    { value: "Replicate", label: "Replicate", url: "https://replicate.com/account/api-tokens" },
    { value: "Hugging Face", label: "Hugging Face", url: "https://huggingface.co/settings/tokens" },
    { value: "Azure OpenAI", label: "Azure OpenAI", url: "https://portal.azure.com/" },
    { value: "AWS Bedrock", label: "AWS Bedrock", url: "https://console.aws.amazon.com/bedrock/" },
    { value: "Vertex AI", label: "Vertex AI", url: "https://console.cloud.google.com/vertex-ai" },
    { value: "\u667a\u8c31 AI", label: "\u667a\u8c31 AI", url: "https://open.bigmodel.cn/" },
    { value: "Moonshot / Kimi", label: "Moonshot / Kimi", url: "https://platform.moonshot.cn/" },
    { value: "\u901a\u4e49\u5343\u95ee / \u767e\u70bc", label: "\u901a\u4e49\u5343\u95ee / \u767e\u70bc", url: "https://bailian.console.aliyun.com/" },
    { value: "\u817e\u8baf\u6df7\u5143", label: "\u817e\u8baf\u6df7\u5143", url: "https://console.cloud.tencent.com/hunyuan" },
    { value: "\u767e\u5ea6\u5343\u5e06", label: "\u767e\u5ea6\u5343\u5e06", url: "https://console.bce.baidu.com/qianfan/" },
    { value: "\u706b\u5c71\u65b9\u821f", label: "\u706b\u5c71\u65b9\u821f", url: "https://console.volcengine.com/ark" },
    { value: "\u7845\u57fa\u6d41\u52a8", label: "\u7845\u57fa\u6d41\u52a8", url: "https://cloud.siliconflow.cn/" },
    { value: "MiniMax", label: "MiniMax", url: "https://platform.minimaxi.com/" },
    { value: "Baichuan AI", label: "Baichuan AI", url: "https://platform.baichuan-ai.com/" },
    { value: "NewAPI / SharedChat", label: "NewAPI / SharedChat" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  membership: [
    { value: "GitHub", label: "GitHub", url: "https://github.com/settings/billing" },
    { value: "Cloudflare", label: "Cloudflare", url: "https://dash.cloudflare.com/" },
    { value: "Vercel", label: "Vercel", url: "https://vercel.com/dashboard" },
    { value: "Netlify", label: "Netlify", url: "https://app.netlify.com/" },
    { value: "Notion", label: "Notion", url: "https://www.notion.so/my-settings" },
    { value: "Figma", label: "Figma", url: "https://www.figma.com/files/team" },
    { value: "JetBrains", label: "JetBrains", url: "https://account.jetbrains.com/licenses" },
    { value: "Microsoft 365", label: "Microsoft 365", url: "https://admin.microsoft.com/" },
    { value: "Google Workspace", label: "Google Workspace", url: "https://admin.google.com/" },
    { value: "Adobe", label: "Adobe", url: "https://account.adobe.com/plans" },
    { value: "Slack", label: "Slack", url: "https://slack.com/account/billing" },
    { value: "Discord Nitro", label: "Discord Nitro", url: "https://discord.com/billing" },
    { value: "Zoom", label: "Zoom", url: "https://zoom.us/billing" },
    { value: "Dropbox", label: "Dropbox", url: "https://www.dropbox.com/account/plan" },
    { value: "1Password", label: "1Password", url: "https://my.1password.com/billing" },
    { value: "Bitwarden", label: "Bitwarden", url: "https://vault.bitwarden.com/#/settings/subscription" },
    { value: "Atlassian", label: "Atlassian", url: "https://admin.atlassian.com/" },
    { value: "Linear", label: "Linear", url: "https://linear.app/settings/billing" },
    { value: "Canva", label: "Canva", url: "https://www.canva.com/settings/billing-and-plans" },
    { value: "Apple Developer", label: "Apple Developer", url: "https://developer.apple.com/account/" },
    { value: "ChatGPT", label: "ChatGPT", url: "https://chatgpt.com/#pricing" },
    { value: "Claude", label: "Claude", url: "https://claude.ai/settings/billing" },
    { value: "Cursor", label: "Cursor", url: "https://cursor.com/settings" },
    { value: "Windsurf", label: "Windsurf", url: "https://windsurf.com/account" },
    { value: "Midjourney", label: "Midjourney", url: "https://www.midjourney.com/account/" },
    { value: "X Premium", label: "X Premium", url: "https://x.com/settings/subscription" },
    { value: "YouTube Premium", label: "YouTube Premium", url: "https://www.youtube.com/paid_memberships" },
    { value: "Spotify", label: "Spotify", url: "https://www.spotify.com/account/subscription/" },
    { value: "Netflix", label: "Netflix", url: "https://www.netflix.com/account" },
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
  ],
  custom: [
    { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
    { value: "\u4ee3\u7801\u4ed3\u5e93", label: "\u4ee3\u7801\u4ed3\u5e93" },
    { value: "\u9759\u6001\u6258\u7ba1", label: "\u9759\u6001\u6258\u7ba1" },
    { value: "\u5bf9\u8c61\u5b58\u50a8", label: "\u5bf9\u8c61\u5b58\u50a8" },
    { value: "\u6570\u636e\u5e93", label: "\u6570\u636e\u5e93" },
    { value: "CDN", label: "CDN" },
    { value: "\u76d1\u63a7\u544a\u8b66", label: "\u76d1\u63a7\u544a\u8b66" },
    { value: "\u5185\u90e8\u7cfb\u7edf", label: "\u5185\u90e8\u7cfb\u7edf" },
  ],
};

const domainHostingProviders: ProviderOption[] = [
  { value: "Cloudflare DNS", label: "Cloudflare DNS", url: "https://dash.cloudflare.com/" },
  { value: "\u963f\u91cc\u4e91 DNS", label: "\u963f\u91cc\u4e91 DNS", url: "https://dns.console.aliyun.com/" },
  { value: "\u817e\u8baf\u4e91 DNSPod", label: "\u817e\u8baf\u4e91 DNSPod", url: "https://console.dnspod.cn/dns/list" },
  { value: "\u534e\u4e3a\u4e91 DNS", label: "\u534e\u4e3a\u4e91 DNS", url: "https://console.huaweicloud.com/dns/" },
  { value: "DNSPod \u56fd\u9645\u7248", label: "DNSPod \u56fd\u9645\u7248", url: "https://www.dnspod.com/" },
  { value: "AWS Route 53", label: "AWS Route 53", url: "https://console.aws.amazon.com/route53/" },
  { value: "Google Cloud DNS", label: "Google Cloud DNS", url: "https://console.cloud.google.com/net-services/dns" },
  { value: "Azure DNS", label: "Azure DNS", url: "https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Network%2Fdnszones" },
  { value: "DigitalOcean DNS", label: "DigitalOcean DNS", url: "https://cloud.digitalocean.com/networking/domains" },
  { value: "Linode / Akamai DNS", label: "Linode / Akamai DNS", url: "https://cloud.linode.com/domains" },
  { value: "Namecheap DNS", label: "Namecheap DNS", url: "https://ap.www.namecheap.com/domains/list/" },
  { value: "GoDaddy DNS", label: "GoDaddy DNS", url: "https://dcc.godaddy.com/manage/dns" },
  { value: "Porkbun DNS", label: "Porkbun DNS", url: "https://porkbun.com/account/domains" },
  { value: "NameSilo DNS", label: "NameSilo DNS", url: "https://www.namesilo.com/account_domains.php" },
  { value: "Spaceship DNS", label: "Spaceship DNS", url: "https://www.spaceship.com/application/domain-list-application/" },
  { value: "OVHcloud DNS", label: "OVHcloud DNS", url: "https://www.ovh.com/manager/" },
  { value: "Hetzner DNS", label: "Hetzner DNS", url: "https://dns.hetzner.com/" },
  { value: "ClouDNS", label: "ClouDNS", url: "https://www.cloudns.net/" },
  { value: "NS1 / IBM NS1", label: "NS1 / IBM NS1", url: "https://my.nsone.net/" },
  { value: "Hurricane Electric DNS", label: "Hurricane Electric DNS", url: "https://dns.he.net/" },
  { value: "Bunny DNS", label: "Bunny DNS", url: "https://dash.bunny.net/dns" },
  { value: "FreeDNS", label: "FreeDNS", url: "https://freedns.afraid.org/" },
  { value: "\u767e\u5ea6\u667a\u80fd\u4e91 DNS", label: "\u767e\u5ea6\u667a\u80fd\u4e91 DNS", url: "https://console.bce.baidu.com/bcd/" },
  { value: "\u706b\u5c71\u5f15\u64ce DNS", label: "\u706b\u5c71\u5f15\u64ce DNS", url: "https://console.volcengine.com/dns" },
  { value: "\u81ea\u5b9a\u4e49", label: "\u81ea\u5b9a\u4e49" },
];

function normalizeAssetType(type?: string): AssetType {
  return type === "cloud" ? "hosting" : (type as AssetType) || "custom";
}

function findProviderOption(type: AssetType | string | undefined, provider?: string) {
  const normalized = normalizeAssetType(type);
  return providerCatalog[normalized].find((item) => item.value === provider) ?? providerCatalog.custom.find((item) => item.value === provider);
}

function uniqueProviderOptions(options: ProviderOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function providerOptionsFor(type: AssetType | string | undefined, dynamicProviders: Array<string | undefined> = []) {
  const normalized = normalizeAssetType(type);
  const base = providerCatalog[normalized] ?? providerCatalog.custom;
  const dynamic = dynamicProviders
    .filter((provider): provider is string => Boolean(provider?.trim()))
    .map((provider) => findProviderOption(normalized, provider) ?? { value: provider, label: provider });
  return uniqueProviderOptions([...dynamic, ...base]);
}

function providerFromWhois(registrar?: string) {
  const raw = registrar?.trim();
  if (!raw) return undefined;
  const text = raw.toLowerCase();
  const aliases: Array<[string[], string]> = [
    [["spaceship"], "Spaceship"],
    [["cloudflare"], "Cloudflare Registrar"],
    [["namecheap"], "Namecheap"],
    [["godaddy"], "GoDaddy"],
    [["porkbun"], "Porkbun"],
    [["dynadot"], "Dynadot"],
    [["namesilo"], "NameSilo"],
    [["gandi"], "Gandi"],
    [["ovh"], "OVHcloud"],
    [["ionos", "1&1"], "IONOS"],
    [["hostinger"], "Hostinger"],
    [["squarespace", "google domains"], "Squarespace Domains"],
    [["tucows", "opensrs"], "Tucows / OpenSRS"],
    [["hover"], "Hover"],
    [["enom"], "Enom"],
    [["markmonitor"], "MarkMonitor"],
    [["network solutions"], "Network Solutions"],
    [["register.com"], "Register.com"],
    [["domain.com"], "Domain.com"],
    [["bluehost"], "Bluehost Domains"],
    [["dreamhost"], "DreamHost Domains"],
    [["sav.com", "sav "], "Sav"],
    [["centralnic", "hexonet"], "Hexonet / CentralNic"],
    [["unstoppable"], "Unstoppable Domains"],
    [["alibaba", "aliyun", "hichina"], "阿里云"],
    [["tencent"], "腾讯云"],
    [["huawei"], "华为云"],
    [["west.cn"], "西部数码"],
    [["xinnet"], "新网"],
  ];
  const matched = aliases.find(([needles]) => needles.some((needle) => text.includes(needle)));
  return matched ? findProviderOption("domain", matched[1]) ?? { value: matched[1], label: matched[1] } : { value: raw, label: raw };
}

function findDomainHostOption(provider?: string) {
  return domainHostingProviders.find((item) => item.value === provider);
}

function domainHostOptionsFor(dynamicProviders: Array<string | undefined> = []) {
  const dynamic = dynamicProviders
    .filter((provider): provider is string => Boolean(provider?.trim()))
    .map((provider) => findDomainHostOption(provider) ?? { value: provider, label: provider });
  return uniqueProviderOptions([...dynamic, ...domainHostingProviders]);
}

function inferDomainHostOption(dns: string[] = []): ProviderOption | undefined {
  const nameservers = dns.map((item) => item.toLowerCase()).join(" ");
  if (nameservers.includes("cloudflare.com")) return findDomainHostOption("Cloudflare DNS");
  if (nameservers.includes("alidns.com") || nameservers.includes("hichina.com")) return findDomainHostOption("\u963f\u91cc\u4e91 DNS");
  if (nameservers.includes("dnspod")) return findDomainHostOption("\u817e\u8baf\u4e91 DNSPod") ?? findDomainHostOption("DNSPod \u56fd\u9645\u7248");
  if (nameservers.includes("huaweicloud-dns")) return findDomainHostOption("\u534e\u4e3a\u4e91 DNS");
  if (nameservers.includes("registrar-servers.com")) return findDomainHostOption("Namecheap DNS");
  if (nameservers.includes("domaincontrol.com")) return findDomainHostOption("GoDaddy DNS");
  if (nameservers.includes("dnshe.com")) return { value: "DNSHE", label: "DNSHE" };
  const firstNs = dns.find((item) => item.includes("."));
  const match = firstNs?.toLowerCase().match(/(?:^|\.)((?:[a-z0-9-]+\.)+[a-z]{2,})$/);
  const host = match?.[1]?.replace(/^ns\d*\./, "").replace(/^dns\d*\./, "");
  const brand = host?.split(".").at(-2);
  if (brand) {
    const guessed = `${brand.charAt(0).toUpperCase()}${brand.slice(1)} DNS`;
    return { value: guessed, label: guessed };
  }
  return undefined;
}

function assetManageUrl(asset: Asset) {
  return asset.url || asset.providerUrl || findProviderOption(asset.type, asset.provider)?.url || "";
}

function assetHostManageUrl(asset: Asset) {
  return asset.hostUrl || findDomainHostOption(asset.hostProvider)?.url || "";
}

const backupTypeName: Record<BackupTarget["type"], string> = {
  WebDAV: "网盘协议",
  S3: "对象存储",
};

const themePalettes = {
  "dark-fire": {
    primary: "#f59e0b",
    primary2: "#ffb84d",
    accent: "#f97316",
    bg: "#0b0b0f",
    text: "#f7efe0",
  },
  "abyss-purple": {
    primary: "#8b5cf6",
    primary2: "#c4b5fd",
    accent: "#f59e0b",
    bg: "#090713",
    text: "#f4efff",
  },
  "ink-gold": {
    primary: "#d6a84f",
    primary2: "#ffe4a3",
    accent: "#2dd4bf",
    bg: "#070909",
    text: "#fff7df",
  },
};

const channelTypeName: Record<NotifyType, string> = {
  Email: "Email",
  Telegram: "Telegram",
  Discord: "Discord",
  Slack: "Slack",
  Webhook: "Webhook",
  DingTalk: "\u9489\u9489",
  WeCom: "\u4f01\u4e1a\u5fae\u4fe1",
  Feishu: "\u98de\u4e66",
  Bark: "Bark",
  ServerChan: "Server\u9171",
  PushPlus: "PushPlus",
  ntfy: "ntfy",
  Gotify: "Gotify",
  Pushover: "Pushover",
  "Microsoft Teams": "Microsoft Teams",
  "Google Chat": "Google Chat",
  Matrix: "Matrix",
  Mattermost: "Mattermost",
  "Rocket.Chat": "Rocket.Chat",
  Signal: "Signal",
  LINE: "LINE",
  Pushbullet: "Pushbullet",
  "AWS SNS": "AWS SNS",
  Twilio: "Twilio",
  Custom: "Custom",
};

const notifyTypes: NotifyType[] = [
  "Email",
  "Telegram",
  "Discord",
  "Slack",
  "Webhook",
  "DingTalk",
  "WeCom",
  "Feishu",
  "Bark",
  "ServerChan",
  "PushPlus",
  "ntfy",
  "Gotify",
  "Pushover",
  "Microsoft Teams",
  "Google Chat",
  "Matrix",
  "Mattermost",
  "Rocket.Chat",
  "Signal",
  "LINE",
  "Pushbullet",
  "AWS SNS",
  "Twilio",
  "Custom",
];

const DEFAULT_NOTIFY_TYPE: NotifyType = "WeCom";

type NotifyFieldName = "target" | "secretMasked" | `config.${string}`;

interface NotifyFieldPreset {
  name: NotifyFieldName;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  secret?: boolean;
  multiline?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface NotifyPreset {
  summary: string;
  fields: NotifyFieldPreset[];
}

const fieldName = (name: NotifyFieldName) => (name.startsWith("config.") ? ["config", name.slice(7)] : name);

const webhookField = (label = "Webhook URL", placeholder = "https://..."): NotifyFieldPreset => ({
  name: "target",
  label,
  placeholder,
  required: true,
});

const tokenField = (label = "Token / Secret", placeholder = "***"): NotifyFieldPreset => ({
  name: "secretMasked",
  label,
  placeholder,
  required: true,
  secret: true,
});

const notifyPresets: Record<NotifyType, NotifyPreset> = {
  Email: {
    summary: "适合个人邮箱、团队邮箱或 SMTP 服务商。",
    fields: [
      { name: "target", label: "收件邮箱", placeholder: "ops@example.com", required: true },
      { name: "config.from", label: "发件邮箱", placeholder: "YiHuoGe <noreply@example.com>" },
      { name: "config.smtpHost", label: "SMTP 主机", placeholder: "smtp.example.com", required: true },
      { name: "config.smtpPort", label: "SMTP 端口", placeholder: "465 / 587" },
      { name: "config.smtpUser", label: "SMTP 用户名", placeholder: "noreply@example.com" },
      { name: "secretMasked", label: "SMTP 密码 / App Password", placeholder: "***", secret: true },
    ],
  },
  Telegram: {
    summary: "使用 Telegram Bot Token 与 Chat ID 推送到个人、群组或频道。",
    fields: [
      { name: "target", label: "Chat ID", placeholder: "-1001234567890 / 123456789", required: true },
      { name: "secretMasked", label: "Bot Token", placeholder: "123456:ABC-DEF...", required: true, secret: true },
      { name: "config.parseMode", label: "Parse Mode", placeholder: "Markdown / HTML" },
    ],
  },
  Discord: { summary: "使用 Discord Incoming Webhook 发送到指定频道。", fields: [webhookField("Discord Webhook URL", "https://discord.com/api/webhooks/...")] },
  Slack: { summary: "使用 Slack Incoming Webhook 发送到工作区频道。", fields: [webhookField("Slack Webhook URL", "https://hooks.slack.com/services/...")] },
  Webhook: {
    summary: "通用 HTTP Webhook，适合接入自建机器人、自动化平台或网关。",
    fields: [
      webhookField("请求地址", "https://example.com/webhook"),
      { name: "config.method", label: "请求方法", placeholder: "POST", options: [{ value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }, { value: "PATCH", label: "PATCH" }] },
      { name: "config.headers", label: "额外 Headers（JSON）", placeholder: "{\"Authorization\":\"Bearer ...\"}", multiline: true },
      { name: "secretMasked", label: "签名密钥 / Bearer Token", placeholder: "可选", secret: true },
    ],
  },
  DingTalk: {
    summary: "钉钉群机器人，支持关键词或加签安全设置。",
    fields: [webhookField("钉钉机器人 Webhook", "https://oapi.dingtalk.com/robot/send?access_token=..."), { name: "config.keyword", label: "安全关键词", placeholder: "异火阁" }, tokenField("加签 Secret", "SEC...")],
  },
  WeCom: {
    summary: "企业微信群机器人，可填写完整 Webhook 或机器人 Key。",
    fields: [webhookField("企业微信机器人 Webhook / Key", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."), { name: "config.mentionedList", label: "提醒成员", placeholder: "@all / userid1,userid2" }],
  },
  Feishu: {
    summary: "飞书群机器人，支持签名校验。",
    fields: [webhookField("飞书机器人 Webhook", "https://open.feishu.cn/open-apis/bot/v2/hook/..."), tokenField("签名密钥", "可选")],
  },
  Bark: {
    summary: "iOS Bark 推送，可接入官方或自建 Bark Server。",
    fields: [webhookField("Bark Server / Device Key", "https://api.day.app/your-key"), { name: "config.group", label: "分组", placeholder: "YiHuoGe" }, { name: "config.sound", label: "提示音", placeholder: "bell" }],
  },
  ServerChan: { summary: "Server酱 SendKey 推送到微信。", fields: [{ name: "target", label: "SendKey", placeholder: "SCT...", required: true, secret: true }] },
  PushPlus: { summary: "PushPlus 微信推送，支持群组 Topic。", fields: [{ name: "target", label: "Token", placeholder: "pushplus token", required: true, secret: true }, { name: "config.topic", label: "Topic / 群组编码", placeholder: "可选" }] },
  ntfy: { summary: "ntfy 主题推送，适合自托管轻量通知。", fields: [{ name: "target", label: "Server / Topic", placeholder: "https://ntfy.sh/yihuoge 或 yihuoge", required: true }, { name: "config.priority", label: "Priority", placeholder: "default / high / urgent" }, { name: "config.tags", label: "Tags", placeholder: "fire,renewal" }, tokenField("Access Token", "可选")] },
  Gotify: { summary: "Gotify 自托管推送服务。", fields: [webhookField("Gotify Server", "https://gotify.example.com"), tokenField("Application Token", "***"), { name: "config.priority", label: "Priority", placeholder: "5" }] },
  Pushover: { summary: "Pushover 移动端推送。", fields: [{ name: "target", label: "User / Group Key", placeholder: "u...", required: true }, tokenField("Application Token", "a..."), { name: "config.priority", label: "Priority", placeholder: "0 / 1 / 2" }] },
  "Microsoft Teams": { summary: "Teams Incoming Webhook / Workflow URL。", fields: [webhookField("Teams Webhook URL", "https://...webhook.office.com/...")] },
  "Google Chat": { summary: "Google Chat Space Webhook。", fields: [webhookField("Google Chat Webhook URL", "https://chat.googleapis.com/v1/spaces/...")] },
  Matrix: { summary: "Matrix 房间通知，适合自托管 Synapse / Element。", fields: [{ name: "target", label: "Room ID", placeholder: "!room:matrix.org", required: true }, { name: "config.homeserver", label: "Homeserver", placeholder: "https://matrix.org" }, tokenField("Access Token", "***")] },
  Mattermost: { summary: "Mattermost Incoming Webhook。", fields: [webhookField("Mattermost Webhook URL", "https://mattermost.example.com/hooks/...")] },
  "Rocket.Chat": { summary: "Rocket.Chat Incoming Webhook。", fields: [webhookField("Rocket.Chat Webhook URL", "https://chat.example.com/hooks/...")] },
  Signal: { summary: "Signal 网关或 signal-cli REST API。", fields: [{ name: "config.endpoint", label: "Signal API Endpoint", placeholder: "http://signal-cli-rest-api:8080/v2/send" }, { name: "target", label: "Recipient / Group ID", placeholder: "+8613800000000 / group-id", required: true }] },
  LINE: { summary: "LINE Messaging API 推送。", fields: [{ name: "target", label: "User / Group ID", placeholder: "U... / C...", required: true }, tokenField("Channel Access Token", "***")] },
  Pushbullet: { summary: "Pushbullet 推送到设备或账号。", fields: [{ name: "target", label: "Device / Email", placeholder: "device iden / user@example.com" }, tokenField("Access Token", "***")] },
  "AWS SNS": { summary: "AWS SNS Topic 推送。", fields: [{ name: "target", label: "Topic ARN", placeholder: "arn:aws:sns:ap-east-1:123:topic", required: true }, { name: "config.region", label: "Region", placeholder: "ap-east-1" }, { name: "config.accessKeyId", label: "Access Key ID", placeholder: "AKIA..." }, tokenField("Secret Access Key", "***")] },
  Twilio: { summary: "Twilio SMS / WhatsApp 通知。", fields: [{ name: "target", label: "接收号码", placeholder: "+8613800000000", required: true }, { name: "config.from", label: "发送号码", placeholder: "+1234567890" }, { name: "config.accountSid", label: "Account SID", placeholder: "AC..." }, tokenField("Auth Token", "***")] },
  Custom: { summary: "自定义渠道，按你的网关要求填写。", fields: [webhookField("入口地址", "https://example.com/notify"), { name: "config.payload", label: "默认 Payload（JSON）", placeholder: "{\"text\":\"{{message}}\"}", multiline: true }, tokenField("密钥 / Token", "可选")] },
};

function defaultNotifyTemplate(_type: NotifyType) {
  return [
    "🔥【异火阁 · 空间通道试炼】",
    "当感知到此空间波动时，证明此空间通道稳定。",
    "阁令已达，异火未熄。",
    "收诸般异火，掌万般续期。",
  ].join("\n");
}

const assetTypes: AssetType[] = ["domain", "vps", "hosting", "ai", "membership", "custom"];

const heavenlyFlames = [
  "帝炎",
  "虚无吞炎",
  "净莲妖火",
  "金帝焚天炎",
  "生灵之焱",
  "八荒破灭焱",
  "九幽金祖火",
  "红莲业火",
  "三千焱炎火",
  "九幽风炎",
  "骨灵冷火",
  "九龙雷罡火",
  "龟灵地火",
  "陨落心炎",
  "海心焰",
  "火云水炎",
  "火山石焰",
  "风雷怒焱",
  "青莲地心火",
  "幽冥毒火",
  "阴阳双炎",
  "万兽灵火",
  "玄黄炎",
];

function statusLabel(status: AssetStatus, t: (key: string) => string) {
  return <Tag className={`flame-tag flame-${status}`} color={statusTone[status]} icon={status === "healthy" ? <CheckCircleOutlined /> : <FireOutlined />}>{t(status)}</Tag>;
}

function dayUnit(date: string, cycle?: Asset["cycle"]) {
  if (cycle === "lifetime") return "永久有效";
  return `${daysUntil(date)} 天`;
}

function renewalText(asset: Asset) {
  return asset.cycle === "lifetime" ? "永久有效" : asset.renewalDate;
}

function isWhoisUsable(whois: { registrar?: string; expiresAt?: string; whoisStatus?: string[] }) {
  const statuses = whois.whoisStatus ?? [];
  return Boolean(
    whois.expiresAt &&
      dayjs(whois.expiresAt).isValid() &&
      whois.registrar &&
      !whois.registrar.includes("适配器") &&
      !statuses.includes("lookup-adapter-not-configured"),
  );
}

function convertCurrency(amount: number, from: string, to: string) {
  const fromRate = currencyRatesToCny[from] ?? 1;
  const toRate = currencyRatesToCny[to] ?? 1;
  return (amount * fromRate) / toRate;
}

function formatPreferredAmount(amount: number, from: string, preferred: string) {
  const converted = convertCurrency(amount, from, preferred);
  const symbol = currencySymbols[preferred] ?? "";
  return `${symbol}${converted.toFixed(2)}`;
}

function splitAssetCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (char === "," || char === "\t")) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeAssetDate(value?: string) {
  const raw = String(value ?? "").trim();
  if (/^(lifetime|permanent|永久|永久有效|终身)$/i.test(raw)) return "";
  if (!raw) return dayjs().add(1, "year").format("YYYY-MM-DD");
  const parsed = dayjs(raw.replace(/[./\u5e74]/g, "-").replace(/\u6708/g, "-").replace(/\u65e5/g, ""));
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : dayjs().add(1, "year").format("YYYY-MM-DD");
}

function normalizeAssetCycle(value: unknown): Asset["cycle"] {
  const raw = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, Asset["cycle"]> = {
    day: "daily",
    daily: "daily",
    "日付": "daily",
    week: "weekly",
    weekly: "weekly",
    "周付": "weekly",
    month: "monthly",
    monthly: "monthly",
    "月付": "monthly",
    quarter: "quarterly",
    quarterly: "quarterly",
    "季付": "quarterly",
    semiannual: "semiannual",
    halfyear: "semiannual",
    "半年付": "semiannual",
    year: "yearly",
    yearly: "yearly",
    annual: "yearly",
    "年付": "yearly",
    biennial: "biennial",
    "两年付": "biennial",
    triennial: "triennial",
    "三年付": "triennial",
    lifetime: "lifetime",
    permanent: "lifetime",
    "终身": "lifetime",
    "永久": "lifetime",
    "永久有效": "lifetime",
    custom: "custom",
    "自定": "custom",
    "自定义": "custom",
  };
  if ((assetCycles as string[]).includes(raw)) return raw as Asset["cycle"];
  return aliases[raw] ?? "custom";
}

function inferAssetType(row: Record<string, string>, fallback?: string): AssetType {
  const raw = [fallback, row["\u7c7b\u578b"], row["\u7c7b\u522b"], row["\u8d44\u4ea7\u7c7b\u578b"], row["\u57df\u540d"] ? "\u57df\u540d" : ""].filter(Boolean).join(" ");
  const chineseTypeMap: Array<[RegExp, AssetType]> = [
    [/\u57df\u540d|domain/i, "domain"],
    [/vps|\u4e91\u4e3b\u673a|\u670d\u52a1\u5668|\u72ec\u7acb\u4e3b\u673a|ECS|CVM|EC2|droplet/i, "vps"],
    [/\u865a\u62df\u4e3b\u673a|\u5171\u4eab\u4e3b\u673a|web\s*hosting|hosting|cPanel|Plesk|\u8f7b\u91cf\u5e94\u7528/i, "hosting"],
    [/AI|\u667a\u80fd|\u6a21\u578b|OpenAI|Claude|Gemini|API/i, "ai"],
    [/\u4f1a\u5458|\u8ba2\u9605|membership/i, "membership"],
  ];
  return normalizeAssetType(chineseTypeMap.find(([pattern]) => pattern.test(raw))?.[1] ?? fallback ?? "custom");
}

function normalizeImportedAsset(item: Partial<Asset> & Record<string, unknown>, index: number): Asset {
  const row = item as Record<string, string>;
  const name = String(item.name ?? row["\u540d\u79f0"] ?? row["\u57df\u540d"] ?? row["\u7ba1\u7406\u540e\u53f0"] ?? `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`).trim();
  const provider = String(item.provider ?? row["\u670d\u52a1\u5546"] ?? row["\u5e73\u53f0"] ?? row["\u6ce8\u518c\u5546"] ?? row["\u5730\u533a"] ?? "\u81ea\u5b9a\u4e49").trim();
  const url = String(item.url ?? row["\u7ba1\u7406\u5730\u5740"] ?? row["\u7ba1\u7406\u540e\u53f0"] ?? row["\u540e\u53f0"] ?? row["\u63a7\u5236\u53f0"] ?? "").trim();
  const hostProvider = String(item.hostProvider ?? row["\u6258\u7ba1\u5546"] ?? row["DNS"] ?? row["DNS\u670d\u52a1\u5546"] ?? row["\u89e3\u6790\u5546"] ?? "").trim();
  const hostUrl = String(item.hostUrl ?? row["\u6258\u7ba1\u5730\u5740"] ?? row["DNS\u540e\u53f0"] ?? "").trim();
  const account = String(item.account ?? row["\u8d26\u53f7"] ?? row["\u8d26\u6237"] ?? row["IP\u5730\u5740"] ?? "\u70bc\u5316\u5bfc\u5165").trim();
  const rawRenewalDate = String(item.renewalDate ?? row["\u7eed\u671f\u65e5"] ?? row["\u7eed\u671f\u65e5\u671f"] ?? row["\u5230\u671f\u65f6\u95f4"] ?? row["\u5230\u671f\u65e5\u671f"] ?? "");
  const renewalDate = normalizeAssetDate(rawRenewalDate);
  const cycle = /^(lifetime|permanent|永久|永久有效|终身)$/i.test(rawRenewalDate.trim())
    ? "lifetime"
    : normalizeAssetCycle(item.cycle ?? row["\u5468\u671f"] ?? row["\u4ed8\u8d39\u5468\u671f"] ?? row["\u8ba1\u8d39\u5468\u671f"]);
  const price = Number(item.price ?? row["\u4ef7\u683c"] ?? row["\u8d39\u7528"] ?? row["\u91d1\u989d"] ?? 0) || 0;
  const type = inferAssetType(row, item.type as string | undefined);
  const notes = [item.notes, row["\u5907\u6ce8"], row["\u72b6\u6001"] ? `\u539f\u72b6\u6001\uff1a${row["\u72b6\u6001"]}` : "", row["\u5bc6\u7801"] ? "\u539f\u8868\u5305\u542b\u5bc6\u7801\u5217\uff0c\u5df2\u907f\u514d\u5c55\u793a\u660e\u6587\u3002" : ""].filter(Boolean).join("\n");
  return {
    id: String(item.id ?? `import-${Date.now()}-${index}`),
    name: name || `\u70bc\u5316\u8d44\u4ea7 ${index + 1}`,
    type,
    provider: provider || "\u81ea\u5b9a\u4e49",
    providerUrl: String(item.providerUrl ?? findProviderOption(type, provider)?.url ?? "").trim(),
    hostProvider: type === "domain" ? hostProvider : undefined,
    hostUrl: type === "domain" ? hostUrl || findDomainHostOption(hostProvider)?.url : undefined,
    account,
    renewalDate,
    price,
    currency: String(item.currency ?? row["\u8d27\u5e01"] ?? "CNY"),
    cycle,
    status: "healthy",
    url,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag) => tag !== "AI\u70bc\u5316") : [],
    notes: notes || "\u7531 AI \u70bc\u5316/\u6279\u91cf\u5bfc\u5165\u5411\u5bfc\u751f\u6210\uff0c\u53ef\u7ee7\u7eed\u7f16\u8f91\u3002",
  };
}

function parseImportedAssets(text: string): Asset[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = splitAssetCsvLine(lines[0]);
  const hasHeader = first.some((cell) => ["\u540d\u79f0", "\u57df\u540d", "\u7ba1\u7406\u540e\u53f0", "\u5230\u671f\u65f6\u95f4", "\u5e73\u53f0", "\u8d26\u53f7", "\u670d\u52a1\u5546", "\u7c7b\u578b"].includes(cell));
  if (hasHeader) {
    return lines.slice(1).map((line, index) => {
      const cells = splitAssetCsvLine(line);
      const row = Object.fromEntries(first.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      return normalizeImportedAsset(row, index);
    }).filter((asset) => asset.name && !asset.name.startsWith("\u70bc\u5316\u8d44\u4ea7"));
  }
  return lines.map((line, index) => {
    const parts = splitAssetCsvLine(line);
    const [name, type, provider, renewalDate, price, url] = parts;
    return normalizeImportedAsset({ name, type: type as AssetType, provider, renewalDate, price: Number(price) || 0, url }, index);
  });
}

async function lookupDomainWhois(domain: string) {
  const response = await fetch(`/api/whois?domain=${encodeURIComponent(domain)}`);
  if (!response.ok) throw new Error("WHOIS 查询失败");
  return (await response.json()) as Partial<{
    name: string;
    registrar: string;
    createdAt: string;
    expiresAt: string;
    dns: string[];
    whoisStatus: string[];
  }>;
}

function useFilteredAssets(globalSearch = "") {
  const assets = useYiHuoStore((state) => state.assets);
  const [keyword, setKeyword] = useState("");
  const [type, setType] = useState<AssetType | "all">("all");
  useEffect(() => {
    if (globalSearch) setKeyword(globalSearch);
  }, [globalSearch]);
  const filtered = useMemo(() => {
    const lower = keyword.toLowerCase();
    return assets.filter((asset) => {
      const matchesType = type === "all" || normalizeAssetType(asset.type) === type;
      const matchesText = [asset.name, asset.provider, asset.hostProvider, asset.account, asset.tags.join(" ")].join(" ").toLowerCase().includes(lower);
      return matchesType && matchesText;
    });
  }, [assets, keyword, type]);
  return { filtered, keyword, setKeyword, type, setType };
}

function AccessGate({
  initialKey,
  checking,
  onUnlock,
}: {
  initialKey: string;
  checking: boolean;
  onUnlock: (key: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState(initialKey);
  const [loading, setLoading] = useState(false);
  const [api, contextHolder] = message.useMessage();

  const submit = async () => {
    setLoading(true);
    const ok = await onUnlock(key.trim());
    setLoading(false);
    if (!ok) api.error(t("accessError"));
  };

  return (
    <main className="access-page">
      {contextHolder}
      <section className="access-card">
        <div className="access-copy">
          <div className="access-logo-ring">
            <img src="/logo.png" alt="异火阁" className="access-logo" />
          </div>
          <div className="eyebrow access-eyebrow"><LockOutlined /> {t("accessEyebrow")}</div>
          <Title level={1}>{t("accessTitle")}</Title>
          <Paragraph className="access-mantra">{t("accessSubtitle")}</Paragraph>
          <div className="access-runes" aria-label="YiHuoGe capabilities">
            <span>{t("metricAssets")}</span>
            <span>{t("metricChannels")}</span>
            <span>{t("aiImport")}</span>
          </div>
        </div>

        <div className="access-panel">
          <Title level={2}>{t("accessPanelTitle")}</Title>
          <Space.Compact className="access-input">
            <Input.Password
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onPressEnter={submit}
              placeholder={t("accessPlaceholder")}
              disabled={checking || loading}
            />
            <Button type="primary" loading={checking || loading} onClick={submit} disabled={!key.trim()}>
              {checking ? t("checking") : t("enterForge")}
            </Button>
          </Space.Compact>
          <Text className="access-hint">{t("accessHint")}</Text>
          <div className="access-seals" aria-hidden="true">
            <span>异火阁令</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function SummonLoading({ title = "异火火种" }: { title?: string }) {
  return (
    <div className="summon-loading">
      <div className="summon-sigil" aria-hidden="true"><FireOutlined /></div>
      <div>
        <Text className="muted">{title}</Text>
        <div className="summon-text">正在结印召唤异火…</div>
      </div>
    </div>
  );
}

function OverviewModule({
  setActive,
  onQuickAdd,
}: {
  setActive: (key: string) => void;
  onQuickAdd: () => void;
}) {
  const { t } = useTranslation();
  const assets = useYiHuoStore((state) => state.assets);
  const channels = useYiHuoStore((state) => state.channels);
  const settings = useYiHuoStore((state) => state.settings);
  const hydrating = useYiHuoStore((state) => state.hydrating);
  const urgent = assets.filter((asset) => asset.cycle !== "lifetime" && daysUntil(asset.renewalDate, asset.cycle) <= 14);
  const monthlyCost = assets.reduce((sum, asset) => sum + convertCurrency(asset.price, asset.currency, settings.currency), 0);
  const healthPercent = Math.round((assets.filter((asset) => asset.status === "healthy").length / Math.max(assets.length, 1)) * 100);

  return (
    <div className="module-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow"><FireOutlined /> 异火阁</div>
          <Title level={1}>{t("heroTitle")}</Title>
          <Paragraph className="hero-mantra">{t("heroMantra")}</Paragraph>
          <Text className="muted">{t("heroDesc")}</Text>
          <Space wrap className="hero-actions">
            <Button title="收录一枚域名、云主机、订阅或自定义火种" type="primary" icon={<PlusOutlined />} onClick={onQuickAdd}>{t("addAsset")}</Button>
            <Button title="进入 AI 炼化炉，将文本与表格炼成资产火种" icon={<ImportOutlined />} onClick={() => setActive("ai")}>{t("aiImport")}</Button>
          </Space>
        </div>
        <div className="hero-visual" aria-label="异火榜续期告警">
          <div className="flame-orb">
            <span />
            <strong>{urgent.length}</strong>
            <em>{t("urgentFlame")}</em>
          </div>
        </div>
      </section>

      <Row gutter={[18, 18]}>
        <Col xs={24} md={12} xl={6}><Card className="metric-card">{hydrating ? <SummonLoading title={t("metricAssets")} /> : <Statistic title={t("metricAssets")} value={assets.length} prefix={<AppstoreOutlined />} />}</Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricUrgent")} value={urgent.length} styles={{ content: { color: "#ffb84d" } }} prefix={<ThunderboltOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricBudget")} value={monthlyCost} precision={2} prefix={<DatabaseOutlined />} suffix={currencySymbols[settings.currency] ?? settings.currency} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card className="metric-card"><Statistic title={t("metricChannels")} value={channels.filter((item) => item.enabled).length} suffix={`/ ${channels.length}`} prefix={<BellOutlined />} /></Card></Col>
      </Row>

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={14}>
          <Card className="yhg-card" title="续期态势">
            <Progress percent={healthPercent} strokeColor={{ "0%": "#b91c1c", "60%": "#f59e0b", "100%": "#2dd4bf" }} />
            <div className="timeline-list">
              {assets
                .slice()
                .sort((a, b) => {
                  if (a.cycle === "lifetime" && b.cycle !== "lifetime") return 1;
                  if (a.cycle !== "lifetime" && b.cycle === "lifetime") return -1;
                  return dayjs(a.renewalDate).valueOf() - dayjs(b.renewalDate).valueOf();
                })
                .slice(0, 6)
                .map((asset) => (
                  <button className="timeline-row" key={asset.id} onClick={() => setActive("assets")}>
                    <span>{asset.name}</span>
                    <Tag color={asset.cycle === "lifetime" ? "green" : daysUntil(asset.renewalDate, asset.cycle) <= 14 ? "error" : "gold"}>{dayUnit(asset.renewalDate, asset.cycle)}</Tag>
                    <Text>{renewalText(asset)}</Text>
                  </button>
                ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="yhg-card flame-board-card" title="异火榜">
            <div className="flame-board">
              {heavenlyFlames.map((name, index) => (
                <div className="flame-board-row" key={name}>
                  <span className="flame-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="flame-name">{name}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function AssetDrawer({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing?: Asset;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<Asset>();
  const addAsset = useYiHuoStore((state) => state.addAsset);
  const updateAsset = useYiHuoStore((state) => state.updateAsset);
  const preferredCurrency = useYiHuoStore((state) => state.settings.currency);
  const [api, contextHolder] = message.useMessage();
  const [whoisLoading, setWhoisLoading] = useState(false);
  const watchedType = normalizeAssetType(Form.useWatch("type", form) ?? editing?.type ?? "domain");
  const watchedCycle = Form.useWatch("cycle", form) ?? editing?.cycle ?? "yearly";
  const watchedProvider = Form.useWatch("provider", form) ?? editing?.provider;
  const watchedHostProvider = Form.useWatch("hostProvider", form) ?? editing?.hostProvider;
  const activeProviderOptions = providerOptionsFor(watchedType, [watchedProvider, editing?.provider]);
  const activeHostProviderOptions = domainHostOptionsFor([watchedHostProvider, editing?.hostProvider]);

  const applyProviderChoice = (provider?: string) => {
    const option = findProviderOption(watchedType, provider);
    form.setFieldsValue({
      provider,
      providerUrl: option?.url,
      url: option?.url || form.getFieldValue("url"),
    });
  };

  const applyHostProviderChoice = (provider?: string) => {
    const option = findDomainHostOption(provider);
    form.setFieldsValue({
      hostProvider: provider,
      hostUrl: option?.url,
    });
  };

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        editing ?? {
          type: "domain",
          provider: "阿里云",
          providerUrl: findProviderOption("domain", "阿里云")?.url,
          account: "",
          renewalDate: dayjs().add(30, "day").format("YYYY-MM-DD"),
          price: 0,
          currency: preferredCurrency,
          cycle: "yearly",
          tags: [],
        },
      );
    }
  }, [editing, form, open, preferredCurrency]);

  const fillWhois = async () => {
    const name = form.getFieldValue("name");
    const type = normalizeAssetType(form.getFieldValue("type"));
    if (type !== "domain") {
      api.info("WHOIS 只适用于域名资产，请先把类型切换为“域名”");
      return;
    }
    if (!name?.trim()) {
      api.warning("请先填写域名名称，再进行 WHOIS 查询");
      return;
    }
    const hideLoading = api.loading("正在查询 WHOIS/RDAP，并准备同步注册商、托管商和续期日…", 0);
    setWhoisLoading(true);
    try {
      const whois = await lookupDomainWhois(name);
      if (!isWhoisUsable(whois)) {
        hideLoading();
        api.info("WHOIS/RDAP 未接入真实适配器，未改写服务商、托管商和续期日");
        return;
      }
      const whoisProvider = providerFromWhois(whois.registrar);
      const hostOption = inferDomainHostOption(whois.dns);
      const patch: Partial<Asset> = {
        renewalDate: whois.expiresAt,
        provider: whoisProvider?.value ?? whois.registrar,
        providerUrl: whoisProvider?.url,
        url: whoisProvider?.url || form.getFieldValue("url"),
      };
      if (hostOption) {
        patch.hostProvider = hostOption.value;
        patch.hostUrl = hostOption.url;
      }
      form.setFieldsValue(patch);
      if (patch.provider) form.setFieldValue("provider", patch.provider);
      if (patch.hostProvider) form.setFieldValue("hostProvider", patch.hostProvider);
      hideLoading();
      api.success(`WHOIS 完成：已同步注册商${hostOption ? "、托管商" : ""}和续期日`);
    } catch {
      hideLoading();
      api.warning("WHOIS 查询失败，请稍后重试或手动校准续期日");
    } finally {
      setWhoisLoading(false);
    }
  };

  const submit = async () => {
    let values = await form.validateFields();
    values = {
      ...values,
      type: normalizeAssetType(values.type),
      renewalDate: values.cycle === "lifetime" ? "" : values.renewalDate,
      providerUrl: values.providerUrl || findProviderOption(values.type, values.provider)?.url,
      hostUrl: normalizeAssetType(values.type) === "domain" ? values.hostUrl || findDomainHostOption(values.hostProvider)?.url : undefined,
      tags: Array.isArray(values.tags) ? values.tags.filter((tag) => tag !== "AI炼化") : [],
    };
    if (editing) {
      updateAsset({ ...editing, ...values });
      api.success("资产火种已重铸");
    } else {
      addAsset(values);
      api.success("资产火种已收入异火阁");
    }
    onClose();
  };

  return (
    <Drawer size="large" open={open} onClose={onClose} title={editing ? "编辑资产" : t("addAsset")} extra={<Button title="封存当前资产；WHOIS 仅在点击占验按钮时手动执行" type="primary" onClick={submit}>保存</Button>}>
      {contextHolder}
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="例如：yihuoge.dev / 开放智能接口额度" /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="type" label="类型"><Select options={assetTypes.map((value) => ({ value, label: assetTypeName[value] }))} onChange={(nextType: AssetType) => {
            const normalized = normalizeAssetType(nextType);
            const nextProvider = providerCatalog[normalized][0];
            form.setFieldsValue({ type: normalized, provider: nextProvider.value, providerUrl: nextProvider.url, url: nextProvider.url ?? "", hostProvider: undefined, hostUrl: undefined });
          }} /></Form.Item></Col>
          <Col span={12}><Form.Item name="provider" label={t("provider")}><AutoComplete options={activeProviderOptions} placeholder="选择或输入服务商" filterOption={(input, option) => String(option?.label ?? option?.value ?? "").toLowerCase().includes(input.toLowerCase())} onChange={applyProviderChoice} onSelect={applyProviderChoice} /></Form.Item></Col>
        </Row>
        <Form.Item name="providerUrl" hidden><Input /></Form.Item>
        {watchedType === "domain" ? (
          <Row gutter={12}>
            <Col span={12}><Form.Item name="hostProvider" label="托管商"><AutoComplete allowClear options={activeHostProviderOptions} placeholder="选择或输入 DNS/托管服务商，可不填" filterOption={(input, option) => String(option?.label ?? option?.value ?? "").toLowerCase().includes(input.toLowerCase())} onChange={applyHostProviderChoice} onSelect={applyHostProviderChoice} /></Form.Item></Col>
            <Col span={12}><Form.Item name="hostUrl" label="托管后台"><Input placeholder="https://dash.cloudflare.com/..." /></Form.Item></Col>
          </Row>
        ) : null}
        <Form.Item name="account" label="账号 / 标识（可选）" tooltip="可填登录邮箱、账号、实例 ID 或 IP；域名没有独立账号时留空即可。"><Input placeholder="登录账号、邮箱、实例 ID 或 IP，可空" /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="renewalDate" label="续期日期" rules={[{ required: watchedCycle !== "lifetime", message: "永久资产无需填写续期日期" }]}><Input type="date" disabled={watchedCycle === "lifetime"} placeholder={watchedCycle === "lifetime" ? "永久有效" : undefined} /></Form.Item></Col>
          <Col span={12}><Form.Item name="cycle" label="周期"><Select options={assetCycleOptions} onChange={(cycle: Asset["cycle"]) => {
            if (cycle === "lifetime") form.setFieldValue("renewalDate", "");
            if (cycle !== "lifetime" && !form.getFieldValue("renewalDate")) form.setFieldValue("renewalDate", dayjs().add(1, "year").format("YYYY-MM-DD"));
          }} /></Form.Item></Col>
        </Row>
        <Button title="查询 WHOIS/RDAP，并同步注册商、托管商和续期日；不会自动改写备注" icon={<GlobalOutlined />} onClick={fillWhois} loading={whoisLoading} disabled={watchedType !== "domain"}>占验 WHOIS 并同步资产信息</Button>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="price" label={t("price")}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
          <Col span={12}><Form.Item name="currency" label="货币"><Select showSearch options={currencyOptions} /></Form.Item></Col>
        </Row>
        <Form.Item name="url" label="管理地址"><Input placeholder="https://console.example.com / https://admin.example.com" /></Form.Item>
        <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[","]} /></Form.Item>
        <Form.Item name="notes" label="备注"><TextArea rows={3} /></Form.Item>
      </Form>
    </Drawer>
  );
}

function AssetsModule({
  globalSearch,
  goAi,
  quickCreateNonce,
}: {
  globalSearch?: string;
  goAi?: () => void;
  quickCreateNonce?: number;
}) {
  const { t } = useTranslation();
  const { filtered, keyword, setKeyword, type, setType } = useFilteredAssets(globalSearch);
  const addAsset = useYiHuoStore((state) => state.addAsset);
  const deleteAsset = useYiHuoStore((state) => state.deleteAsset);
  const importAssets = useYiHuoStore((state) => state.importAssets);
  const preferredCurrency = useYiHuoStore((state) => state.settings.currency);
  const hydrating = useYiHuoStore((state) => state.hydrating);
  const [view, setView] = useState<ViewMode>("table");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Asset>();
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(5);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [api, contextHolder] = message.useMessage();
  const [columnWidths, setColumnWidths] = useState<Record<AssetColumnKey, number>>(() => loadAssetColumnWidths());

  const startColumnResize = (event: ReactMouseEvent<HTMLElement>, key: AssetColumnKey, minWidth = 96) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[key] ?? defaultAssetColumnWidths[key];
    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => {
        const next = { ...current, [key]: nextWidth };
        persistAssetColumnWidths(next);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-resizing-column");
    };
    document.body.classList.add("is-resizing-column");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const columnTitle = (key: AssetColumnKey, label: string, minWidth = 96) => (
    <span className="resizable-column-title">
      <span>{label}</span>
      <span
        className="column-resize-handle"
        title="拖拽调整列宽"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDown={(event) => startColumnResize(event, key, minWidth)}
      />
    </span>
  );

  const tableScrollX = Object.values(columnWidths).reduce((total, width) => total + width, 0) + 64;

  useEffect(() => {
    if (quickCreateNonce) {
      setEditing(undefined);
      setDrawerOpen(true);
    }
  }, [quickCreateNonce]);

  useEffect(() => {
    setTablePage(1);
  }, [keyword, type, tablePageSize]);

  const runAssetImport = () => {
    const parsed = parseImportedAssets(importText);
    if (!parsed.length) {
      api.warning("请先投放清单文本，再启纳火阵");
      return;
    }
    importAssets(parsed);
    setImportOpen(false);
    setImportText("");
    api.success(`已纳入 ${parsed.length} 枚资产火种`);
  };

  const runBatchDelete = () => {
    const ids = selectedIds.map(String);
    if (!ids.length) return;
    ids.forEach((id) => deleteAsset(id));
    setSelectedIds([]);
    api.success(`已删除 ${ids.length} 枚资产火种`);
  };

  const cloneAsset = (asset: Asset) => {
    addAsset({
      name: `${asset.name} 副本`,
      type: normalizeAssetType(asset.type),
      provider: asset.provider,
      providerUrl: asset.providerUrl,
      hostProvider: asset.hostProvider,
      hostUrl: asset.hostUrl,
      account: asset.account,
      renewalDate: asset.renewalDate,
      price: asset.price,
      currency: asset.currency,
      cycle: asset.cycle,
      url: asset.url,
      tags: [...(asset.tags ?? [])],
      notes: asset.notes,
    });
    api.success(`已克隆：${asset.name}`);
  };

  const columns: ColumnsType<Asset> = [
    {
      title: columnTitle("name", "名称", 220),
      dataIndex: "name",
      key: "name",
      width: columnWidths.name,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (value: string, record) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{value}</Text>
          <Space size={4}>{(record.tags ?? []).map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
        </Space>
      ),
    },
    {
      title: columnTitle("type", "类型", 110),
      dataIndex: "type",
      key: "type",
      width: columnWidths.type,
      filters: assetTypes.map((item) => ({ text: assetTypeName[item], value: item })),
      onFilter: (value, record) => normalizeAssetType(record.type) === value,
      render: (value: AssetType) => {
        const normalized = normalizeAssetType(value);
        return <Tag color={typeTone[normalized]}>{assetTypeName[normalized]}</Tag>;
      },
    },
    {
      title: columnTitle("provider", t("provider"), 130),
      dataIndex: "provider",
      key: "provider",
      width: columnWidths.provider,
      sorter: (a, b) => a.provider.localeCompare(b.provider),
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Text>{value}</Text>
          {normalizeAssetType(record.type) === "domain" && record.hostProvider ? <Text className="muted asset-subline">托管：{record.hostProvider}</Text> : null}
        </Space>
      ),
    },
    {
      title: columnTitle("renewalDate", "续期日", 160),
      dataIndex: "renewalDate",
      key: "renewalDate",
      width: columnWidths.renewalDate,
      sorter: (a, b) => {
        if (a.cycle === "lifetime" && b.cycle !== "lifetime") return 1;
        if (a.cycle !== "lifetime" && b.cycle === "lifetime") return -1;
        return dayjs(a.renewalDate).valueOf() - dayjs(b.renewalDate).valueOf();
      },
      render: (value: string, record) => <Space><CalendarOutlined />{renewalText(record)}<Tag color={record.cycle === "lifetime" ? "green" : "orange"}>{dayUnit(value, record.cycle)}</Tag></Space>,
    },
    {
      title: columnTitle("price", t("price"), 110),
      key: "price",
      width: columnWidths.price,
      render: (_, record) => formatPreferredAmount(record.price, record.currency, preferredCurrency),
    },
    {
      title: columnTitle("manage", "管理地址", 130),
      key: "manage",
      width: columnWidths.manage,
      render: (_, record) => {
        const manageUrl = assetManageUrl(record);
        const hostUrl = normalizeAssetType(record.type) === "domain" ? assetHostManageUrl(record) : "";
        if (!manageUrl && !hostUrl) return <Text className="muted">未填</Text>;
        return (
          <Space direction="vertical" size={0}>
            {manageUrl ? <a className="asset-manage-link" href={manageUrl} target="_blank" rel="noreferrer">服务商后台</a> : null}
            {hostUrl ? <a className="asset-manage-link asset-subline" href={hostUrl} target="_blank" rel="noreferrer">托管后台</a> : null}
          </Space>
        );
      },
    },
    {
      title: columnTitle("action", t("action"), 120),
      key: "action",
      width: columnWidths.action,
      render: (_, record) => (
        <Space>
          <Button title="编辑这条资产" size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); setDrawerOpen(true); }} />
          <Button title="克隆这条资产" size="small" icon={<CopyOutlined />} onClick={() => cloneAsset(record)} />
          <Popconfirm title="确认删除该资产？" onConfirm={() => deleteAsset(record.id)}>
            <Button title="删除这条资产" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" gap={16} wrap="wrap">
        <div><Title level={2}>{t("assets")}</Title><Text className="muted">主流平台先入阁，冷门火种亦可自铸；支持搜寻、筛选、排序、分页与批量圈选。</Text></div>
        <Space wrap>
          <Button title="进入 AI 炼化炉，将文本或表格炼成资产火种" icon={<RobotOutlined />} onClick={goAi}>AI 炼化</Button>
          <Button title="投放表格文本，批量纳火入阁" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>{t("import")}</Button>
          <Button title="手动收录一枚火种；WHOIS 可在编辑抽屉中手动占验" type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setDrawerOpen(true); }}>{t("addAsset")}</Button>
        </Space>
      </Flex>
      <Card className="yhg-card">
        <Flex justify="space-between" gap={12} wrap="wrap" className="toolbar-row">
          <Input className="search-input" prefix={<SearchOutlined />} placeholder={t("search")} value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Space wrap>
            <Select value={type} onChange={setType} options={[{ value: "all", label: t("all") }, ...assetTypes.map((value) => ({ value, label: assetTypeName[value] }))]} />
            <Radio.Group value={view} onChange={(event) => setView(event.target.value)}>
              <Radio.Button value="table">{t("table")}</Radio.Button>
              <Radio.Button value="card">{t("card")}</Radio.Button>
            </Radio.Group>
            <Popconfirm
              title={`确认删除已选 ${selectedIds.length} 枚火种？`}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              disabled={!selectedIds.length}
              onConfirm={runBatchDelete}
            >
              <Button
                className="batch-delete-button"
                title="删除已勾选资产"
                danger
                disabled={!selectedIds.length}
                icon={<DeleteOutlined />}
              >
                批量删除 {selectedIds.length || ""}
              </Button>
            </Popconfirm>
          </Space>
        </Flex>
        {hydrating ? (
          <div className="summon-panel">
            <SummonLoading title="异火库" />
            <Text className="muted">正在连接数据库，火种尚未归位，请稍候。</Text>
          </div>
        ) : view === "table" ? (
          <Table
            rowKey="id"
            className="asset-table"
            columns={columns}
            dataSource={filtered}
            tableLayout="fixed"
            showSorterTooltip={{ rootClassName: "yhg-sorter-tooltip" }}
            scroll={{ x: tableScrollX }}
            pagination={{
              current: tablePage,
              pageSize: tablePageSize,
              total: filtered.length,
              showSizeChanger: true,
              pageSizeOptions: ["5", "10", "20", "50", "100"],
              showTotal: (total) => `共 ${total} 枚火种`,
              onChange: (page, size) => {
                setTablePage(page);
                setTablePageSize(size);
              },
              onShowSizeChange: (_page, size) => {
                setTablePage(1);
                setTablePageSize(size);
              },
            }}
            onChange={(pagination) => {
              setTablePage(pagination.current ?? 1);
              setTablePageSize(pagination.pageSize ?? tablePageSize);
            }}
            rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys), preserveSelectedRowKeys: true }}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filtered.map((asset) => (
              <Col xs={24} md={12} xl={8} key={asset.id}>
                <Card className="asset-card" actions={[<Tooltip title="编辑资产" key="edit"><EditOutlined onClick={() => { setEditing(asset); setDrawerOpen(true); }} /></Tooltip>, <Tooltip title="克隆资产" key="clone"><CopyOutlined onClick={() => cloneAsset(asset)} /></Tooltip>, <Tooltip title="删除资产" key="delete"><DeleteOutlined onClick={() => deleteAsset(asset.id)} /></Tooltip>]}>
                  <Flex justify="space-between" align="start">
                    <Title level={4}>{asset.name}</Title>
                    {statusLabel(asset.status, t)}
                  </Flex>
                  <Space wrap><Tag color={typeTone[normalizeAssetType(asset.type)]}>{assetTypeName[normalizeAssetType(asset.type)]}</Tag><Tag>{asset.provider}</Tag>{asset.hostProvider ? <Tag>托管：{asset.hostProvider}</Tag> : null}</Space>
                  <Divider />
                  <Text className="muted">续期：{renewalText(asset)} · {dayUnit(asset.renewalDate, asset.cycle)}</Text>
                  <br />
                  <Text>{formatPreferredAmount(asset.price, asset.currency, preferredCurrency)} / {cycleName[asset.cycle]}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
      <AssetDrawer open={drawerOpen} editing={editing} onClose={() => setDrawerOpen(false)} />
      <Modal open={importOpen} title="批量纳火入阁" onCancel={() => setImportOpen(false)} onOk={runAssetImport} okText="纳入">
        <Paragraph className="muted">每行一枚火种：名称,类型,服务商,续期日期,价格。类型可填：域名、VPS、虚拟主机、AI订阅、会员订阅、自定义。</Paragraph>
        <TextArea rows={8} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="示例：异火阁主域名,域名,火网注册局,2026-12-31,12" />
      </Modal>
    </div>
  );
}


function ChannelDrawer({ open, editing, onClose }: { open: boolean; editing?: NotificationChannel; onClose: () => void }) {
  const [form] = Form.useForm<NotificationChannel>();
  const addChannel = useYiHuoStore((state) => state.addChannel);
  const updateChannel = useYiHuoStore((state) => state.updateChannel);
  const [api, contextHolder] = message.useMessage();
  const [testing, setTesting] = useState(false);
  const watchedType = (Form.useWatch("type", form) ?? editing?.type ?? DEFAULT_NOTIFY_TYPE) as NotifyType;
  const preset = notifyPresets[watchedType];

  useEffect(() => {
    if (!open) return;
    const type = editing?.type ?? DEFAULT_NOTIFY_TYPE;
    form.setFieldsValue({
      type,
      enabled: true,
      target: "",
      name: channelTypeName[type],
      secretMasked: "",
      config: {},
      ...editing,
      template: editing?.template ?? defaultNotifyTemplate(type),
    });
  }, [editing, form, open]);

  const handleTypeChange = (type: NotifyType) => {
    form.setFieldsValue({
      type,
      target: "",
      secretMasked: "",
      config: {},
      name: channelTypeName[type],
      template: defaultNotifyTemplate(type),
    });
  };

  const save = async () => {
    const values = await form.validateFields();
    if (editing) updateChannel({ ...editing, ...values });
    else addChannel(values);
    onClose();
  };

  const testTemplate = async () => {
    const values = await form.validateFields();
    const type = values.type ?? DEFAULT_NOTIFY_TYPE;
    const template = values.template || defaultNotifyTemplate(type);
    const channel = {
      ...values,
      id: editing?.id ?? values.id ?? "draft",
      enabled: values.enabled ?? true,
      name: values.name || channelTypeName[type],
      template,
    };
    setTesting(true);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ channel }),
      });
      const result = await response.json().catch(() => ({})) as { deliveredAt?: string; error?: string; messageId?: string };
      if (!response.ok) throw new Error(result.error || `通道返回 ${response.status}`);
      Modal.success({
        className: "yhg-themed-modal",
        rootClassName: "yhg-themed-modal-root",
        title: "空间通道试炼",
        width: 640,
        okText: "知道了",
        content: (
          <div className="notify-test-modal">
            <div className="notify-test-head">
              <FireOutlined />
              <span>{channelTypeName[type]} · 已送达</span>
            </div>
            <pre>{template}</pre>
            <Text className="muted">远端传讯阵法已确认收取此试炼。{result.messageId ? ` 回执：${result.messageId}` : ""}{result.deliveredAt ? ` 时间：${dayjs(result.deliveredAt).format("YYYY-MM-DD HH:mm:ss")}` : ""}</Text>
          </div>
        ),
      });
      api.success(`${channelTypeName[type]} 空间通道试炼已送达`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "空间通道试炼失败");
    } finally {
      setTesting(false);
    }
  };

  const renderField = (field: NotifyFieldPreset) => {
    const rules = field.required ? [{ required: true, message: `请填写${field.label}` }] : undefined;
    const control = field.options ? (
      <Select options={field.options} />
    ) : field.multiline ? (
      <TextArea rows={3} placeholder={field.placeholder} />
    ) : field.secret ? (
      <Input.Password placeholder={field.placeholder} autoComplete="new-password" />
    ) : (
      <Input placeholder={field.placeholder} />
    );
    return (
      <Form.Item key={field.name} name={fieldName(field.name)} label={field.label} rules={rules} extra={field.help}>
        {control}
      </Form.Item>
    );
  };

  return (
    <Drawer
      size="large"
      open={open}
      onClose={onClose}
      title={editing ? "编辑通知功法" : "新增通知功法"}
      extra={(
        <Space>
          <Button title="向真实远端发送空间通道试炼，成功后才显示回执" loading={testing} onClick={testTemplate}>测试通道</Button>
          <Button title="封存当前传讯阵法配置" type="primary" onClick={save}>保存</Button>
        </Space>
      )}
    >
      {contextHolder}
      <Form form={form} layout="vertical" className="channel-form">
        <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder={channelTypeName[watchedType]} /></Form.Item>
        <Form.Item name="type" label="类型">
          <Select showSearch onChange={handleTypeChange} options={notifyTypes.map((value) => ({ value, label: channelTypeName[value] }))} />
        </Form.Item>
        <Card className="notify-config-card" title={`${channelTypeName[watchedType]} 配置`}>
          <Paragraph className="muted">{preset.summary}</Paragraph>
          <Row gutter={16}>
            {preset.fields.map((field) => (
              <Col xs={24} md={field.multiline ? 24 : 12} key={field.name}>
                {renderField(field)}
              </Col>
            ))}
          </Row>
        </Card>
        <Card className="notify-template-card" title="空间通道试炼">
          <Paragraph className="muted">所有渠道共用此试炼辞令，仅用于验证通道是否稳定。</Paragraph>
          <Form.Item name="template" label="试炼辞令" rules={[{ required: true, message: "请填写试炼辞令" }]}>
            <TextArea rows={8} />
          </Form.Item>
        </Card>
        <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Drawer>
  );
}

function NotificationsModule() {
  const { t } = useTranslation();
  const channels = useYiHuoStore((state) => state.channels);
  const deleteChannel = useYiHuoStore((state) => state.deleteChannel);
  const testChannel = useYiHuoStore((state) => state.testChannel);
  const toggleChannel = useYiHuoStore((state) => state.toggleChannel);
  const [api, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationChannel>();
  const [testingId, setTestingId] = useState<string>();

  const runSavedTest = async (record: NotificationChannel) => {
    setTestingId(record.id);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ channel: record }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || `通道返回 ${response.status}`);
      testChannel(record.id);
      api.success(`${record.name || channelTypeName[record.type]} 空间通道试炼已送达`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "空间通道试炼失败");
    } finally {
      setTestingId(undefined);
    }
  };

  const columns: ColumnsType<NotificationChannel> = [
    { title: "名称", dataIndex: "name", render: (value: string) => <Text strong>{value}</Text> },
    { title: "类型", dataIndex: "type", render: (value: NotifyType) => <Tag color="gold">{channelTypeName[value]}</Tag> },
    { title: "目标", dataIndex: "target" },
    {
      title: "状态",
      dataIndex: "enabled",
      render: (value: boolean, record) => (
        <Switch
          checked={value}
          checkedChildren={t("enabled")}
          unCheckedChildren={t("disabled")}
          onChange={(checked) => toggleChannel(record.id, checked)}
        />
      ),
    },
    { title: "上次测试", dataIndex: "lastTest" },
    {
      title: t("action"),
      render: (_, record) => (
        <Space>
          <Button title="向真实远端发送空间通道试炼" size="small" loading={testingId === record.id} onClick={() => runSavedTest(record)}>{t("test")}</Button>
          <Button title="编辑该通知功法" size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); setOpen(true); }} />
          <Popconfirm title="删除该通知功法？" onConfirm={() => deleteChannel(record.id)}><Button title="删除该通知渠道" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>{t("notifications")}</Title><Text className="muted">Email、Telegram、Discord、Slack、Webhook、钉钉、企业微信、飞书、Bark、Server酱、PushPlus、ntfy、Gotify、Pushover、Teams、Google Chat、Matrix 等主流渠道。</Text></div>
        <Button title="新铸 Email、Telegram、Discord、Webhook、钉钉、企业微信、飞书等传讯阵法" type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setOpen(true); }}>新增渠道</Button>
      </Flex>
      <Card className="yhg-card"><Table rowKey="id" dataSource={channels} columns={columns} pagination={false} /></Card>
      <ChannelDrawer open={open} editing={editing} onClose={() => setOpen(false)} />
    </div>
  );
}


function AiModule({ onForgeDone }: { onForgeDone?: () => void }) {
  const { t } = useTranslation();
  const aiConfig = useYiHuoStore((state) => state.aiConfig);
  const updateAiConfig = useYiHuoStore((state) => state.updateAiConfig);
  const addModel = useYiHuoStore((state) => state.addModel);
  const removeModel = useYiHuoStore((state) => state.removeModel);
  const [text, setText] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [forging, setForging] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [api, contextHolder] = message.useMessage();

  useEffect(() => {
    if (aiConfig.provider === "\u5f00\u653e\u63a5\u53e3\u517c\u5bb9") {
      updateAiConfig({ provider: "OpenAI Compatible" });
    }
  }, [aiConfig.provider, updateAiConfig]);

  const readForgeFile = async (file: File) => {
    try {
      const content = await file.text();
      if (!content.trim()) {
        api.warning("此卷为空，未感知到可炼化内容");
        return false;
      }
      setText((current) => current.trim() ? `${current}\n\n${content}` : content);
      api.success(`已按原文读取 ${file.name}，将整份内容交给模型炼化`);
    } catch {
      api.error("残卷读取失败，请换成 CSV 或纯文本清单");
    }
    return false;
  };

  const runImport = async () => {
    if (!text.trim()) {
      api.warning("\u8bf7\u5148\u6295\u653e\u5f85\u70bc\u5316\u7684\u8d44\u4ea7\u6e05\u5355");
      return;
    }
    setForging(true);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/ai/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { assets?: Asset[]; count?: number; source?: "ai" | "fallback"; warning?: string; error?: string; model?: string };
      if (!response.ok) throw new Error(payload.error || `AI \u70bc\u5316\u5931\u8d25 ${response.status}`);
      const assets = payload.assets ?? [];
      if (!assets.length) throw new Error("\u672a\u70bc\u6210\u53ef\u5165\u5e93\u7684\u8d44\u4ea7");
      useYiHuoStore.setState((state) => ({ assets: [...assets, ...state.assets] }));
      setText("");
      api.success({
        content: `炼化成功：${assets.length} 枚火种已入库，正在前往异火库`,
        duration: 4,
      });
      window.setTimeout(() => onForgeDone?.(), 650);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "AI \u70bc\u5316\u5931\u8d25");
    } finally {
      setForging(false);
    }
  };

  const fetchModels = async () => {
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/ai/models/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ baseUrl: aiConfig.baseUrl, apiKey: aiConfig.apiKey }),
      });
      if (response.status === 401) {
        api.error("管理阁令不符，请先在设置中封存管理密钥");
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { models?: string[]; endpoint?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || `远端模型接口返回 ${response.status}`);
      const models = Array.from(new Set((payload.models ?? []).filter(Boolean)));
      if (!models.length) throw new Error("远端未返回可用模型");
      updateAiConfig({
        models,
        defaultModel: models.includes(aiConfig.defaultModel) ? aiConfig.defaultModel : models[0],
      });
      api.success(`已自远端召回 ${models.length} 个模型${payload.endpoint ? `，通道：${payload.endpoint}` : ""}`);
    } catch (error) {
      api.error(error instanceof Error ? error.message : "模型列表召回失败");
    }
  };

  const testSelectedModel = async () => {
    if (!aiConfig.defaultModel) {
      api.warning("请先选择或加入一个默认模型");
      return;
    }
    setTestingModel(true);
    try {
      const adminKey = window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) },
        body: JSON.stringify({ model: aiConfig.defaultModel }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; model?: string; endpoint?: string; content?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || `模型测试失败 ${response.status}`);
      api.success({
        content: `模型可用：${payload.model || aiConfig.defaultModel}`,
        duration: 4,
      });
    } catch (error) {
      api.error(error instanceof Error ? error.message : "模型测试失败");
    } finally {
      setTestingModel(false);
    }
  };

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>AI 炼化</Title><Text className="muted">投放文本、表格或知识库残卷，交由模型炼化为可续期火种。</Text></div>
      </Flex>
      <Row className="ai-layout" gutter={[28, 28]}>
        <Col xs={24} xl={14}>
          <Card className="yhg-card" title="AI 炼化炉">
            <Upload.Dragger beforeUpload={readForgeFile} maxCount={1} accept=".csv,.txt,.tsv,text/csv,text/plain">
              <p className="ant-upload-drag-icon"><ImportOutlined /></p>
              <p>将表格、清单或知识库残卷投入此炉，交由所选模型炼化</p>
            </Upload.Dragger>
            <TextArea className="import-textarea" rows={10} wrap="off" value={text} onChange={(event) => setText(event.target.value)} />
            <div className="ai-forge-actions">
              <Button className="ai-forge-button" title="将上方文本炼成资产火种并收入阁中" type="primary" icon={<RobotOutlined />} loading={forging} onClick={runImport}>开始炼化资产</Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="yhg-card" title="炼化配置">
            <Space className="ai-config-stack" orientation="vertical" style={{ width: "100%" }}>
              <label className="field-label">模型提供方</label>
              <Select
                showSearch
                className="ai-provider-select"
                popupClassName="ai-provider-dropdown"
                popupMatchSelectWidth={560}
                style={{ width: "100%" }}
                value={aiConfig.provider}
                optionFilterProp="label"
                onChange={(value) => {
                  const preset = aiProviderOptions.find((item) => item.value === value);
                  updateAiConfig({ provider: value, ...(preset?.baseUrl ? { baseUrl: preset.baseUrl } : {}) });
                }}
                options={aiProviderOptions.map(({ value, label }) => ({ value, label }))}
              />
              <label className="field-label">接口密钥</label>
              <Input.Password value={aiConfig.apiKey} autoComplete="new-password" onChange={(event) => updateAiConfig({ apiKey: event.target.value })} placeholder="sk-..." />
              <label className="field-label">接口地址</label>
              <Input value={aiConfig.baseUrl} onChange={(event) => updateAiConfig({ baseUrl: event.target.value })} />
              <label className="field-label">默认模型</label>
              <Space.Compact style={{ width: "100%" }}>
                <Select style={{ width: "100%" }} value={aiConfig.defaultModel} onChange={(value) => updateAiConfig({ defaultModel: value })} options={aiConfig.models.map((model) => ({ value: model, label: model }))} />
                <Button title="测试当前默认模型是否可用" loading={testingModel} onClick={testSelectedModel}>测试模型</Button>
              </Space.Compact>
            </Space>
          </Card>
          <Card className="yhg-card ai-model-card" title={t("modelManage")}>
            <Space.Compact style={{ width: "100%" }}>
              <Input value={modelInput} placeholder="输入模型名后回车/加入" onPressEnter={() => { if (modelInput.trim()) { addModel(modelInput.trim()); setModelInput(""); } }} onChange={(event) => setModelInput(event.target.value)} />
              <Button title="把输入框中的模型名加入列表" onClick={() => { if (modelInput.trim()) { addModel(modelInput.trim()); setModelInput(""); } }}>加入</Button>
              <Button title="从后端接口同步可用模型列表" onClick={fetchModels}>获取列表</Button>
              <Button title="测试当前默认模型是否可正常回复" loading={testingModel} onClick={testSelectedModel}>测试</Button>
            </Space.Compact>
            <div className="model-list">
              {aiConfig.models.map((model) => (
                <Tag key={model} closable onClose={() => removeModel(model)} color={model === aiConfig.defaultModel ? "orange" : "purple"}>{model}</Tag>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function SettingsModule() {
  const settings = useYiHuoStore((state) => state.settings);
  const assets = useYiHuoStore((state) => state.assets);
  const domains = useYiHuoStore((state) => state.domains);
  const channels = useYiHuoStore((state) => state.channels);
  const aiConfig = useYiHuoStore((state) => state.aiConfig);
  const updateSettings = useYiHuoStore((state) => state.updateSettings);
  const [backupForm] = Form.useForm<BackupTarget>();
  const [backupOpen, setBackupOpen] = useState(false);
  const [editingBackupId, setEditingBackupId] = useState<string>();
  const [adminKey, setAdminKey] = useState(() => window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");
  const [api, contextHolder] = message.useMessage();
  const backupTargets = settings.backupTargets ?? [];
  const visibleModuleOrder = settings.moduleOrder.filter((key) => moduleKeys.includes(key));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ settings: { ...settings, backupTargets }, assets, domains, channels, aiConfig }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yihuoge-export-${dayjs().format("YYYYMMDD-HHmmss")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    api.success("阁令、火种、AI 与备份法阵已一并封存");
  };

  const importJson = async (file: File) => {
    try {
      const imported = JSON.parse(await file.text()) as { settings?: Partial<typeof settings> };
      if (imported.settings) updateSettings(imported.settings);
      api.success("配置卷轴已读取，备份法阵已并入阁令");
    } catch {
      api.error("此卷轴灵纹不合，无法识别为有效数据");
    }
    return false;
  };

  const openBackupEditor = (target?: BackupTarget) => {
    setEditingBackupId(target?.id);
    backupForm.setFieldsValue(target ?? { type: "WebDAV", enabled: true, name: "", target: "", notes: "" });
    setBackupOpen(true);
  };

  const saveBackupTarget = async () => {
    const values = await backupForm.validateFields();
    const nextTarget: BackupTarget = { ...values, id: editingBackupId ?? `backup-${Date.now()}` };
    updateSettings({
      backupTargets: editingBackupId
        ? backupTargets.map((item) => (item.id === editingBackupId ? nextTarget : item))
        : [nextTarget, ...backupTargets],
    });
    setBackupOpen(false);
    api.success("备份法阵已刻录");
  };

  const removeBackupTarget = (id: string) => {
    updateSettings({ backupTargets: backupTargets.filter((item) => item.id !== id) });
    api.success("备份法阵已抹除");
  };

  const saveAdminKey = () => {
    window.localStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
    api.success("管理阁令已封存于当前浏览器");
  };

  return (
    <div className="module-stack">
      {contextHolder}
      <Flex className="module-head" justify="space-between" wrap="wrap">
        <div><Title level={2}>设置</Title><Text className="muted">语言、时区、偏好币种、提醒策略、传讯阵法、模块顺序、主题、导入导出、AI 全局配置与备份法阵。</Text></div>
      </Flex>
      <Row gutter={[18, 18]}>
        <Col xs={24} xl={12}>
          <Card className="yhg-card" title="全局偏好">
            <Form layout="vertical">
              <Form.Item label="语言"><Select value={settings.language} onChange={(language: Language) => updateSettings({ language })} options={[{ value: "zh", label: "中文" }, { value: "en", label: "英文" }]} /></Form.Item>
              <Form.Item label="时区"><Select showSearch value={settings.timezone} onChange={(timezone) => updateSettings({ timezone })} options={timezoneOptions} /></Form.Item>
              <Form.Item label="偏好币种"><Select value={settings.currency} onChange={(currency) => updateSettings({ currency })} options={currencyOptions} /></Form.Item>
              <Form.Item label="默认提醒天数"><Select mode="tags" value={settings.reminderDays.map(String)} onChange={(values) => updateSettings({ reminderDays: values.map(Number).filter((value) => !Number.isNaN(value)) })} /></Form.Item>
              <Form.Item label="默认通知功法"><Select value={settings.defaultChannel} onChange={(defaultChannel) => updateSettings({ defaultChannel })} options={channels.map((channel) => ({ value: channel.id, label: channel.name }))} /></Form.Item>
              <Form.Item label="模块顺序"><Select mode="multiple" value={visibleModuleOrder} onChange={(moduleOrder) => updateSettings({ moduleOrder })} options={moduleKeys.map((key) => ({ value: key, label: moduleName[key] ?? key }))} /></Form.Item>
              <Form.Item label="外观主题"><Select value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: "dark-fire", label: "玄墨异火" }, { value: "abyss-purple", label: "幽冥紫炎" }, { value: "ink-gold", label: "墨金阁令" }]} /></Form.Item>
              <Form.Item label="管理密钥">
                <Space.Compact style={{ width: "100%" }}>
                  <Input.Password value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="输入 .env.local / Vercel 中的 YIHUOGE_ADMIN_KEY" />
                  <Button title="把管理密钥保存到当前浏览器，用于调用受保护接口" onClick={saveAdminKey}>保存</Button>
                </Space.Compact>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="yhg-card backup-card"
            title="备份法阵"
            extra={<Button title="新铸 WebDAV 或 S3/R2/MinIO 备份法阵" icon={<PlusOutlined />} onClick={() => openBackupEditor()}>新增法阵</Button>}
          >
            <div className="backup-list">
              {backupTargets.map((target) => (
                <div className="backup-row" key={target.id}>
                  <div>
                    <Space wrap>
                      <Tag color={target.enabled ? "cyan" : "default"}>{target.enabled ? "启用" : "停用"}</Tag>
                      <Tag color="purple">{backupTypeName[target.type]}</Tag>
                    </Space>
                    <Title level={5}>{target.name}</Title>
                    <Text className="muted">{target.target}</Text>
                    {target.notes && <Paragraph className="muted backup-note">{target.notes}</Paragraph>}
                  </div>
                  <Space wrap>
                    <Switch checked={target.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => updateSettings({ backupTargets: backupTargets.map((item) => item.id === target.id ? { ...item, enabled } : item) })} />
                    <Button title="编辑该备份方式" icon={<EditOutlined />} onClick={() => openBackupEditor(target)}>编辑</Button>
                    <Popconfirm title="确认删除该备份方式？" onConfirm={() => removeBackupTarget(target.id)}>
                      <Button title="删除该备份方式" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              ))}
              {!backupTargets.length && <Text className="muted">暂无备份法阵，请新铸 WebDAV 或 S3/R2/MinIO。</Text>}
            </div>
            <Divider />
            <Space wrap>
              <Upload beforeUpload={importJson} showUploadList={false} accept="application/json">
                <Button title="从 JSON 卷轴导入阁令，包含备份法阵" icon={<ImportOutlined />}>导入配置</Button>
              </Upload>
              <Button title="导出全部阁令、火种、传讯阵法、AI 配置，并包含备份法阵" onClick={exportJson}>导出数据</Button>
            </Space>
          </Card>
        </Col>
      </Row>
      <Modal open={backupOpen} title={editingBackupId ? "编辑备份法阵" : "新增备份法阵"} onCancel={() => setBackupOpen(false)} onOk={saveBackupTarget} okText="保存">
        <Form form={backupForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请填写备份名称" }]}><Input placeholder="例如：网盘镜像 / 对象存储仓" /></Form.Item>
          <Form.Item name="type" label="类型"><Select options={(Object.keys(backupTypeName) as BackupTarget["type"][]).map((value) => ({ value, label: backupTypeName[value] }))} /></Form.Item>
          <Form.Item name="target" label="目标地址" rules={[{ required: true, message: "请填写备份目标地址" }]}><Input placeholder="https://dav.example.local 或 s3://bucket/path" /></Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="notes" label="备注"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const settings = useYiHuoStore((state) => state.settings);
  const setLanguage = useYiHuoStore((state) => state.setLanguage);
  const [active, setActive] = useState("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [quickCreateNonce, setQuickCreateNonce] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [api, contextHolder] = message.useMessage();
  const [accessState, setAccessState] = useState<AccessState>(() =>
    window.localStorage.getItem(ADMIN_KEY_STORAGE) ? "unlocked" : "locked",
  );
  const [savedAccessKey, setSavedAccessKey] = useState(() => window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "");

  const unlock = async (key: string) => {
    try {
      const ok = await verifyAdminKey(key);
      if (!ok) {
        window.localStorage.removeItem(ADMIN_KEY_STORAGE);
        setSavedAccessKey("");
        setAccessState("locked");
        return false;
      }
      window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
      setSavedAccessKey(key);
      await hydrateFromServer(key);
      setAccessState("unlocked");
      return true;
    } catch {
      setAccessState("locked");
      return false;
    }
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    if (!stored) return;
    setSavedAccessKey(stored);
    setAccessState("unlocked");
    void hydrateFromServer(stored);
  }, []);

  useEffect(() => {
    i18n.changeLanguage(settings.language);
    dayjs.locale(settings.language === "zh" ? "zh-cn" : "en");
    document.title = settings.language === "zh" ? "异火阁-天下万火，尽纳于此" : "YiHuoGe - All Flames Gathered Here";
  }, [i18n, settings.language]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!moduleKeys.includes(active)) setActive("overview");
  }, [active]);

  useEffect(() => {
    document.body.dataset.theme = settings.theme;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [settings.theme]);

  const openQuickCreate = () => {
    setActive("assets");
    setQuickCreateNonce((value) => value + 1);
  };

  const menuItems = [
    { key: "overview", icon: <LayoutOutlined />, label: t("overview") },
    { key: "assets", icon: <AppstoreOutlined />, label: t("assets") },
    { key: "notifications", icon: <BellOutlined />, label: t("notifications") },
    { key: "ai", icon: <RobotOutlined />, label: t("ai") },
    { key: "settings", icon: <SettingOutlined />, label: t("settings") },
  ];

  const module = {
    overview: <OverviewModule setActive={setActive} onQuickAdd={openQuickCreate} />,
    assets: <AssetsModule globalSearch={globalSearch} goAi={() => setActive("ai")} quickCreateNonce={quickCreateNonce} />,
    notifications: <NotificationsModule />,
    ai: <AiModule onForgeDone={() => setActive("assets")} />,
    settings: <SettingsModule />,
  }[active];
  const palette = themePalettes[settings.theme] ?? themePalettes["dark-fire"];

  return (
    <ConfigProvider
      locale={settings.language === "zh" ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: palette.primary,
          colorBgBase: palette.bg,
          colorTextBase: palette.text,
          colorBorder: `${palette.primary}44`,
          colorBgSpotlight: "rgba(13, 10, 9, 0.98)",
          borderRadius: 14,
          fontFamily: "YiHuoNotoSans, 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'PingFang SC', system-ui, sans-serif",
        },
        components: {
          Layout: { siderBg: "#0b0b0f", headerBg: "rgba(11,11,15,.88)", bodyBg: "#0b0b0f" },
          Card: { colorBgContainer: "rgba(24,26,32,.82)" },
          Table: {
            colorBgContainer: "rgba(18,18,23,.72)",
            headerBg: "rgba(14,13,17,.92)",
            headerSortActiveBg: "rgba(14,13,17,.92)",
            headerSortHoverBg: "rgba(24,18,13,.96)",
            bodySortBg: "transparent",
          },
        },
      }}
    >
      {contextHolder}
      {accessState !== "unlocked" ? (
        <AccessGate initialKey={savedAccessKey} checking={accessState === "checking"} onUnlock={unlock} />
      ) : (
        <Layout className={`app-shell theme-${settings.theme}`}>
        <Sider width={268} className="side-nav" breakpoint="lg" collapsedWidth={0}>
          <div className="brand-mark">
            <img className="brand-logo" src="/logo.png" alt="异火阁" />
            <div>
              <strong>异火阁</strong>
              <span>{t("brandMotto")}</span>
            </div>
          </div>
          <Menu mode="inline" selectedKeys={[active]} items={menuItems} onClick={({ key }) => setActive(key)} />
          <div className="side-footer">
            <ExclamationCircleOutlined /> 自托管异火阁
          </div>
        </Sider>
        <Layout>
          <Header className="topbar">
            <Input
              prefix={<SearchOutlined />}
              placeholder={t("search")}
              className="top-search"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              onPressEnter={() => setActive("assets")}
              allowClear
            />
            <Space className="topbar-right" wrap>
              <Tag className="date-tag" icon={<CalendarOutlined />}>{topbarDate(now, settings.language, settings.timezone)}</Tag>
              <div className="language-switch" role="group" aria-label="Language switch">
                <button className={settings.language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button>
                <button className={settings.language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>英</button>
              </div>
              <span className="top-action-tip" data-tooltip={t("openAssetsTip")}>
                <Button className="top-action" icon={<ApiOutlined />} onClick={() => { setActive("assets"); api.info(settings.language === "zh" ? "资产火阁已开启" : "Asset forge opened"); }}>{t("topAssets")}</Button>
              </span>
              <span className="top-action-tip" data-tooltip={t("openNotificationsTip")}>
                <Button className="top-action" icon={<BellOutlined />} onClick={() => { setActive("notifications"); api.info(settings.language === "zh" ? "传讯阵法已开启" : "Notification array opened"); }}>{t("topNotifications")}</Button>
              </span>
              <span className="top-action-tip" data-tooltip={t("openSettingsTip")}>
                <Button className="top-action" icon={<SettingOutlined />} onClick={() => { setActive("settings"); api.info(settings.language === "zh" ? "阁令中枢已开启" : "Settings sanctum opened"); }}>{t("topSettings")}</Button>
              </span>
            </Space>
          </Header>
          <Content className="content-canvas">{module}</Content>
        </Layout>
        </Layout>
      )}
    </ConfigProvider>
  );
}
