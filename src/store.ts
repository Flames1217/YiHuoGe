import { nanoid } from "nanoid";
import { create } from "zustand";
import { aiConfigSeed, assetsSeed, channelsSeed, domainsSeed, settingsSeed } from "./data/mock";
import type { AiConfig, AppSettings, Asset, DomainRecord, Language, NotificationChannel } from "./types";
import { statusByDate } from "./utils/calendar";

interface YiHuoState {
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
  assets: assetsSeed.map((asset) => ({ ...asset, status: statusByDate(asset.renewalDate) })),
  domains: domainsSeed.map((domain) => ({ ...domain, status: statusByDate(domain.expiresAt) })),
  channels: channelsSeed,
  aiConfig: aiConfigSeed,
  settings: settingsSeed,

  addAsset: (asset) =>
    set((state) => ({
      assets: [
        {
          ...asset,
          id: nanoid(10),
          status: asset.status ?? statusByDate(asset.renewalDate),
          tags: asset.tags ?? [],
        },
        ...state.assets,
      ],
    })),

  updateAsset: (asset) =>
    set((state) => ({
      assets: state.assets.map((item) => (item.id === asset.id ? { ...asset, status: statusByDate(asset.renewalDate) } : item)),
    })),

  deleteAsset: (id) => set((state) => ({ assets: state.assets.filter((item) => item.id !== id) })),

  importAssets: (assets) =>
    set((state) => ({
      assets: [
        ...assets.map((asset) => ({ ...asset, id: asset.id || nanoid(10), status: statusByDate(asset.renewalDate) })),
        ...state.assets,
      ],
    })),

  addChannel: (channel) => set((state) => ({ channels: [{ ...channel, id: nanoid(10) }, ...state.channels] })),
  updateChannel: (channel) => set((state) => ({ channels: state.channels.map((item) => (item.id === channel.id ? channel : item)) })),
  deleteChannel: (id) => set((state) => ({ channels: state.channels.filter((item) => item.id !== id) })),
  toggleChannel: (id, enabled) =>
    set((state) => ({
      channels: state.channels.map((item) => (item.id === id ? { ...item, enabled } : item)),
    })),
  testChannel: (id) =>
    set((state) => ({
      channels: state.channels.map((item) =>
        item.id === id ? { ...item, lastTest: new Date().toLocaleString("zh-CN", { hour12: false }) } : item,
      ),
    })),

  updateAiConfig: (patch) => set((state) => ({ aiConfig: { ...state.aiConfig, ...patch } })),
  addModel: (model) =>
    set((state) => ({
      aiConfig: state.aiConfig.models.includes(model)
        ? state.aiConfig
        : { ...state.aiConfig, models: [...state.aiConfig.models, model], defaultModel: state.aiConfig.defaultModel || model },
    })),
  removeModel: (model) =>
    set((state) => ({
      aiConfig: {
        ...state.aiConfig,
        models: state.aiConfig.models.filter((item) => item !== model),
        defaultModel: state.aiConfig.defaultModel === model ? state.aiConfig.models.filter((item) => item !== model)[0] ?? "" : state.aiConfig.defaultModel,
      },
    })),
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setLanguage: (language) => set((state) => ({ settings: { ...state.settings, language } })),
}));
