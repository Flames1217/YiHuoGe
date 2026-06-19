import { readAppCache, writeAppCache } from "../api/_state.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const EXCHANGE_RATE_CACHE_KEY = "exchange-rates";

const fallbackRatesToCny: Record<string, number> = {
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
  TRY: 0.18,
};

type ExchangeRateCache = {
  base: "CNY";
  ratesToCny: Record<string, number>;
  updatedAt: string;
  nextUpdateAt?: string;
  source: string;
  attribution: string;
};

type ExchangeRateApiResponse = {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
};

let memoryCache: ExchangeRateCache | undefined;

function isFresh(cache: ExchangeRateCache) {
  const updatedAt = Date.parse(cache.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < CACHE_TTL_MS;
}

async function readCache() {
  if (memoryCache && isFresh(memoryCache)) return memoryCache;
  try {
    const parsed = await readAppCache<ExchangeRateCache>(EXCHANGE_RATE_CACHE_KEY);
    if (parsed?.base === "CNY" && parsed.ratesToCny && isFresh(parsed)) {
      memoryCache = parsed;
      return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function writeCache(cache: ExchangeRateCache) {
  memoryCache = cache;
  try {
    await writeAppCache(EXCHANGE_RATE_CACHE_KEY, cache);
  } catch {
    // 数据库短暂不可用时，当前实例仍可用内存缓存兜底。
  }
}

function fallbackCache(): ExchangeRateCache {
  return {
    base: "CNY",
    ratesToCny: fallbackRatesToCny,
    updatedAt: new Date().toISOString(),
    source: "fallback",
    attribution: "Static fallback rates",
  };
}

export async function getExchangeRates() {
  const cached = await readCache();
  if (cached) return { ...cached, cached: true };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch("https://open.er-api.com/v6/latest/CNY", { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`exchange rate api ${response.status}`);
    const data = await response.json() as ExchangeRateApiResponse;
    if (data.result !== "success" || data.base_code !== "CNY" || !data.rates) throw new Error("invalid exchange rate payload");

    const ratesToCny = Object.fromEntries(
      Object.entries(data.rates)
        .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
        .map(([code, rate]) => [code, code === "CNY" ? 1 : 1 / rate]),
    );
    const nextUpdateAt = data.time_next_update_unix ? new Date(data.time_next_update_unix * 1000).toISOString() : undefined;
    const updatedAt = data.time_last_update_unix ? new Date(data.time_last_update_unix * 1000).toISOString() : new Date().toISOString();
    const fresh: ExchangeRateCache = {
      base: "CNY",
      ratesToCny: { ...fallbackRatesToCny, ...ratesToCny, CNY: 1 },
      updatedAt,
      nextUpdateAt,
      source: "open.er-api.com",
      attribution: "Rates By Exchange Rate API",
    };
    await writeCache(fresh);
    return { ...fresh, cached: false };
  } catch {
    const stale = memoryCache;
    if (stale) return { ...stale, cached: true, stale: true };
    return { ...fallbackCache(), cached: false, stale: true };
  }
}
