import { hasValidAdminKey, readState } from "../_state.js";

function completionEndpointCandidates(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return [];
  const urls = new Set<string>();
  if (/\/chat\/completions$/i.test(base)) urls.add(base);
  else {
    urls.add(`${base}/chat/completions`);
    if (!/\/(?:v\d+(?:beta)?|openai\/v\d+(?:beta)?|compatible-mode\/v\d+)$/i.test(base)) {
      urls.add(`${base}/v1/chat/completions`);
    }
  }
  return [...urls];
}

async function testModel(ai: Record<string, any>, modelOverride?: string) {
  const baseUrl = String(ai.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = String(ai.apiKey ?? "");
  const model = modelOverride || String(ai.defaultModel ?? "") || ai.models?.[0];
  if (!baseUrl || !apiKey || !model) throw new Error("AI 模型测试配置不完整");

  const body = JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: "system", content: "你是异火阁模型通道测试器。请只用一句中文回复：异火阁模型通道正常。" },
      { role: "user", content: "测试当前模型是否可用。" },
    ],
  });

  let lastError = "";
  for (const endpoint of completionEndpointCandidates(baseUrl)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 YiHuoGe/1.0",
        Authorization: /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`,
      },
      body,
    });
    const raw = await response.text();
    if (!response.ok) {
      lastError = `${response.status} @ ${endpoint}: ${raw.slice(0, 180)}`;
      continue;
    }
    const data = raw ? JSON.parse(raw) : {};
    const content = String(data.choices?.[0]?.message?.content ?? data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "").trim();
    return { endpoint, model, content: content || "异火阁模型通道正常" };
  }

  throw new Error(`AI 模型测试失败：${lastError || "远端通道无响应"}`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!hasValidAdminKey(req)) {
    res.status(401).json({ error: "invalid admin key" });
    return;
  }

  try {
    const db = await readState();
    const model = String(req.body?.model ?? db.ai?.defaultModel ?? "").trim();
    const result = await testModel(db.ai ?? {}, model);
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "AI 模型测试失败" });
  }
}
