import { nanoid } from "nanoid";
import { create } from "zustand";
import { aiConfigSeed, assetsSeed, channelsSeed, domainsSeed, settingsSeed } from "./data/mock";
import type { AiConfig, AppSettings, Asset, DomainRecord, Language, NotificationChannel } from "./types";
import { statusByDate } from "./utils/calendar";

const ADMIN_KEY_STORAGE = "yihuoge-admin-key";

function authHeaders(): HeadersInit {
  const key = typeof window === "undefined" ? "" : window.localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  return { "Content-Type": "application/json", ...(key ? { "x-admin-key": key } : {}) };
}

async function writeJson(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  try {
    const response = await fetch(path, {
      method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${method} ${path} ${response.status}`);
  } catch (error) {
    console.warn("[YiHuoGe] 存储写入失败", error);
  }
}

function persistAsset(asset: Asset, method: "POST" | "PUT" = "POST") {
  void writeJson(method === "POST" ? "/api/assets" : `/api/assets/${asset.id}`, method, asset);
}

function persistDeleteAsset(id: string) {
  void writeJson(`/api/assets/${id}`, "DELETE");
}

function persistChannel(channel: NotificationChannel, method: "POST" | "PUT" = "POST") {
  void writeJson(method === "POST" ? "/api/channels" : `/api/channels/${channel.id}`, method, channel);
}

function persistDeleteChannel(id: string) {
  void writeJson(`/api/channels/${id}`, "DELETE");
}

function persistSettings(settings: AppSettings) {
  void writeJson("/api/settings", "PUT", settings);
}

function persistAi(aiConfig: AiConfig) {
  void writeJson("/api/ai/config", "PUT", aiConfig);
}

interface YiHuoState {
  hydrating: boolean;
  hydrated: boolean;
  assets: Asset[];
  domains: DomainRecord[];
  channels: NotificationChannel[];
  aiConfig: AiConfig;
  settings: AppSettings;
  addAsset: (asset: Omit<Asset, "id" | "status"> & Partial<Pick<Asset, "status">>) => void;
  updateAsset: (asset: Asset) => void;
  deleteAsset: (id: string) => void;
  importAssets: (assets: Asset[]) => void;
  addChannel: (channel: Omit<NotificationChannel, "id">) => void;
  updateChannel: (channel: NotificationChannel) => void;
  deleteChannel: (id: string) => void;
  testChannel: (id: string) => void;
  toggleChannel: (id: string, enabled: boolean) => void;
  updateAiConfig: (patch: Partial<AiConfig>) => void;
  addModel: (model: string) => void;
  removeModel: (model: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  setLanguage: (language: Language) => void;
}

export const useYiHuoStore = create<YiHuoState>((set) => ({
  hydrating: false,
  hydrated: false,
  assets: assetsSeed.map((asset) => ({ ...asset, status: statusByDate(asset.renewalDate, asset.cycle) })),
  domains: domainsSeed.map((domain) => ({ ...domain, status: statusByDate(domain.expiresAt, domain.cycle) })),
  channels: channelsSeed,
  aiConfig: aiConfigSeed,
  settings: settingsSeed,

  addAsset: (asset) => {
    const nextAsset: Asset = {
      ...asset,
      id: nanoid(10),
      status: asset.status ?? statusByDate(asset.renewalDate, asset.cycle),
      tags: asset.tags ?? [],
    };
    set((state) => ({ assets: [nextAsset, ...state.assets] }));
    persistAsset(nextAsset);
  },

  updateAsset: (asset) => {
    const nextAsset = { ...asset, status: statusByDate(asset.renewalDate, asset.cycle) };
    set((state) => ({ assets: state.assets.map((item) => (item.id === asset.id ? nextAsset : item)) }));
    persistAsset(nextAsset, "PUT");
  },

  deleteAsset: (id) => {
    set((state) => ({ assets: state.assets.filter((item) => item.id !== id) }));
    persistDeleteAsset(id);
  },

  importAssets: (assets) => {
    const nextAssets = assets.map((asset) => ({ ...asset, id: asset.id || nanoid(10), status: statusByDate(asset.renewalDate, asset.cycle) }));
    set((state) => ({ assets: [...nextAssets, ...state.assets] }));
    nextAssets.forEach((asset) => persistAsset(asset));
  },

  addChannel: (channel) => {
    const nextChannel = { ...channel, id: nanoid(10) };
    set((state) => ({ channels: [nextChannel, ...state.channels] }));
    persistChannel(nextChannel);
  },
  updateChannel: (channel) => {
    set((state) => ({ channels: state.channels.map((item) => (item.id === channel.id ? channel : item)) }));
    persistChannel(channel, "PUT");
  },
  deleteChannel: (id) => {
    set((state) => ({ channels: state.channels.filter((item) => item.id !== id) }));
    persistDeleteChannel(id);
  },
  toggleChannel: (id, enabled) => {
    set((state) => {
      const channels = state.channels.map((item) => (item.id === id ? { ...item, enabled } : item));
      const changed = channels.find((item) => item.id === id);
      if (changed) persistChannel(changed, "PUT");
      return { channels };
    });
  },
  testChannel: (id) => {
    set((state) => {
      const channels = state.channels.map((item) =>
        item.id === id ? { ...item, lastTest: new Date().toLocaleString("zh-CN", { hour12: false }) } : item,
      );
      const changed = channels.find((item) => item.id === id);
      if (changed) persistChannel(changed, "PUT");
      return { channels };
    });
  },

  updateAiConfig: (patch) => {
    set((state) => {
      const aiConfig = { ...state.aiConfig, ...patch };
      persistAi(aiConfig);
      return { aiConfig };
    });
  },
  addModel: (model) => {
    set((state) => {
      const aiConfig = state.aiConfig.models.includes(model)
        ? state.aiConfig
        : { ...state.aiConfig, models: [...state.aiConfig.models, model], defaultModel: state.aiConfig.defaultModel || model };
      if (aiConfig !== state.aiConfig) persistAi(aiConfig);
      return { aiConfig };
    });
  },
  removeModel: (model) => {
    set((state) => {
      const nextModels = state.aiConfig.models.filter((item) => item !== model);
      const aiConfig = {
        ...state.aiConfig,
        models: nextModels,
        defaultModel: state.aiConfig.defaultModel === model ? nextModels[0] ?? "" : state.aiConfig.defaultModel,
      };
      persistAi(aiConfig);
      return { aiConfig };
    });
  },
  updateSettings: (patch) => {
    set((state) => {
      const settings = { ...state.settings, ...patch };
      persistSettings(settings);
      return { settings };
    });
  },
  setLanguage: (language) => {
    set((state) => {
      const settings = { ...state.settings, language };
      persistSettings(settings);
      return { settings };
    });
  },
}));
