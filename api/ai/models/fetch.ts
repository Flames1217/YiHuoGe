const MODEL_FETCH_TIMEOUT_MS = 18000;

type ModelFetchResult = {
  models: string[];
  endpoint: string;
};

function modelEndpointCandidates(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  const urls = new Set<string>();
  if (/\/models$/i.test(base)) urls.add(base);
  else {
    urls.add(`${base}/models`);
    if (!/\/(?:v\d+(?:beta)?|openai\/v\d+(?:beta)?|compatible-mode\/v\d+)$/i.test(base)) {
      urls.add(`${base}/v1/models`);
    }
  }
  return [...urls];
}

function extractModelIds(payload: any): string[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.modelList)
          ? payload.modelList
          : payload?.data && typeof payload.data === "object"
            ? Object.values(payload.data)
            : payload?.models && typeof payload.models === "object"
              ? Object.values(payload.models)
              : [];

  const ids = source
    .map((item: any) => typeof item === "string" ? item : item?.id ?? item?.name ?? item?.model ?? item?.model_name)
    .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id: string) => id.trim());
  return Array.from(new Set<string>(ids));
}

async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<ModelFetchResult> {
  const endpoints = modelEndpointCandidates(baseUrl);
  if (!endpoints.length) throw new Error("请先填写接口地址");

  const errors: string[] = [];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 YiHuoGe/1.0",
          ...(apiKey ? { Authorization: /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`, "x-api-key": apiKey.replace(/^Bearer\s+/i, "") } : {}),
          "anthropic-version": "2023-06-01",
        },
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${endpoint} -> HTTP ${response.status}${text ? `：${text.slice(0, 160)}` : ""}`);
        continue;
      }
      const payload = text ? JSON.parse(text) : null;
      const models = extractModelIds(payload);
      if (models.length) return { models, endpoint };
      errors.push(`${endpoint} -> 未发现模型字段`);
    } catch (error) {
      errors.push(`${endpoint} -> ${error instanceof Error ? error.message : "请求失败"}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`远端未返回可用模型。已尝试：${errors.join("；")}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const adminKey = process.env.YIHUOGE_ADMIN_KEY ?? "";
  if (adminKey && req.headers["x-admin-key"] !== adminKey && req.headers.authorization !== `Bearer ${adminKey}`) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }

  try {
    const baseUrl = String(req.body?.baseUrl ?? "");
    const apiKey = String(req.body?.apiKey ?? "");
    const result = await fetchProviderModels(baseUrl, apiKey);
    res.status(200).json({ models: result.models, source: "provider", endpoint: result.endpoint });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "模型列表召回失败" });
  }
}
