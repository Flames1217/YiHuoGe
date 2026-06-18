const MODEL_FETCH_TIMEOUT_MS = 18000;

export type ModelFetchResult = {
  models: string[];
  endpoint: string;
};

function addCandidate(urls: string[], value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized && !urls.includes(normalized)) urls.push(normalized);
}

export function modelEndpointCandidates(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];

  const urls: string[] = [];
  if (/\/models$/i.test(base)) {
    addCandidate(urls, base);
    return urls;
  }

  if (/\/chat\/completions$/i.test(base)) {
    addCandidate(urls, base.replace(/\/chat\/completions$/i, "/models"));
    return urls;
  }

  if (/\/(?:v\d+(?:beta)?|openai\/v\d+(?:beta)?|compatible-mode\/v\d+)$/i.test(base)) {
    addCandidate(urls, `${base}/models`);
    return urls;
  }

  addCandidate(urls, `${base}/v1/models`);
  addCandidate(urls, `${base}/models`);
  return urls;
}

export function extractModelIds(payload: any): string[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.modelList)
          ? payload.modelList
          : Array.isArray(payload?.model_list)
            ? payload.model_list
            : Array.isArray(payload?.availableModels)
              ? payload.availableModels
              : payload?.data && typeof payload.data === "object"
                ? Object.values(payload.data)
                : payload?.models && typeof payload.models === "object"
                  ? Object.values(payload.models)
                  : [];

  const ids = source
    .map((item: any) => typeof item === "string" ? item : item?.id ?? item?.name ?? item?.model ?? item?.model_name ?? item?.modelName)
    .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id: string) => id.trim());
  return Array.from(new Set<string>(ids));
}

function responsePreview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 180);
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "请求失败";
  const cause = (error as Error & { cause?: any }).cause;
  const causeMessage = cause?.code || cause?.message || cause?.reason;
  return causeMessage ? `${error.message} (${causeMessage})` : error.message;
}

export async function fetchProviderModels(baseUrl: string, apiKey: string): Promise<ModelFetchResult> {
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
          "User-Agent": "YiHuoGe/1.0",
          ...(apiKey ? { Authorization: /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`, "x-api-key": apiKey.replace(/^Bearer\s+/i, "") } : {}),
          "anthropic-version": "2023-06-01",
        },
      });
      const text = await response.text();
      if (!response.ok) {
        errors.push(`${endpoint} -> HTTP ${response.status}${text ? `: ${responsePreview(text)}` : ""}`);
        continue;
      }
      const payload = text ? JSON.parse(text) : null;
      const models = extractModelIds(payload);
      if (models.length) return { models, endpoint };
      errors.push(`${endpoint} -> 未发现模型字段`);
    } catch (error) {
      errors.push(`${endpoint} -> ${errorMessage(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`远端未返回可用模型。已尝试：${errors.join("；")}`);
}
