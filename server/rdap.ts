import { resolveNs } from "node:dns/promises";

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown[];
  publicIds?: Array<{ type?: string; identifier?: string }>;
  entities?: RdapEntity[];
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapNameserver {
  ldhName?: string;
  unicodeName?: string;
}

interface RdapResponse {
  objectClassName?: string;
  ldhName?: string;
  unicodeName?: string;
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
  notices?: unknown[];
  remarks?: unknown[];
}

interface RdapBootstrap {
  services?: Array<[string[], string[]]>;
}

export interface DomainWhoisLookup {
  name: string;
  registrar: string;
  createdAt: string;
  expiresAt: string;
  dns: string[];
  whoisStatus: string[];
  rawWhois?: RdapResponse;
  source: "rdap";
}

function cleanDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/rdap+json, application/json;q=0.9" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} 返回 ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function dateOnly(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function eventDate(events: RdapEvent[] | undefined, actions: string[]) {
  const lowered = actions.map((action) => action.toLowerCase());
  const found = events?.find((event) => event.eventAction && lowered.includes(event.eventAction.toLowerCase()));
  return dateOnly(found?.eventDate);
}

function vcardText(entity: RdapEntity | undefined, key: string) {
  const entries = Array.isArray(entity?.vcardArray?.[1]) ? entity?.vcardArray?.[1] as unknown[] : [];
  for (const item of entries) {
    if (!Array.isArray(item) || item[0] !== key) continue;
    const value = item[3];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function flattenEntities(entities: RdapEntity[] = []): RdapEntity[] {
  return entities.flatMap((entity) => [entity, ...flattenEntities(entity.entities ?? [])]);
}

function registrarName(entities: RdapEntity[] = []) {
  const all = flattenEntities(entities);
  const registrar = all.find((entity) => entity.roles?.some((role) => role.toLowerCase() === "registrar")) ?? all[0];
  const name = vcardText(registrar, "fn") || vcardText(registrar, "org");
  const iana = registrar?.publicIds?.find((item) => item.type?.toLowerCase().includes("iana"))?.identifier;
  return [name, iana ? `IANA ${iana}` : ""].filter(Boolean).join(" / ") || "RDAP Registrar";
}

function rdapDomainUrl(baseUrl: string, domain: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (/\/domain$/i.test(normalized)) return `${normalized}/${encodeURIComponent(domain)}`;
  return `${normalized}/domain/${encodeURIComponent(domain)}`;
}

async function rdapLookupUrls(domain: string) {
  const tld = domain.split(".").pop() ?? "";
  const urls: string[] = [];
  try {
    const bootstrap = await fetchJson<RdapBootstrap>("https://data.iana.org/rdap/dns.json", 8000);
    const service = bootstrap.services?.find(([tlds]) => tlds.some((item) => item.toLowerCase() === tld));
    urls.push(...(service?.[1] ?? []).map((url) => rdapDomainUrl(url, domain)));
  } catch {
    // Fall through to the public RDAP proxy below.
  }
  urls.push(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  return [...new Set(urls)];
}

async function resolveBestNameservers(inputDomain: string, registeredDomain: string, rdapNameservers: string[]) {
  const candidates = parentDomainCandidates(inputDomain);
  for (const candidate of candidates) {
    try {
      const records = await resolveNs(candidate);
      const nameservers = records.map((item) => item.replace(/\.$/, "")).filter(Boolean);
      if (nameservers.length) return nameservers;
    } catch {
      // Try parent domain. Subdomains often are not delegated.
    }
  }
  if (registeredDomain !== inputDomain) {
    try {
      const records = await resolveNs(registeredDomain);
      const nameservers = records.map((item) => item.replace(/\.$/, "")).filter(Boolean);
      if (nameservers.length) return nameservers;
    } catch {
      // Fall back to RDAP nameservers below.
    }
  }
  return rdapNameservers;
}

async function lookupExactDomainRdap(domain: string): Promise<DomainWhoisLookup> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("域名格式无效");

  const errors: string[] = [];
  let data: RdapResponse | undefined;
  for (const url of await rdapLookupUrls(domain)) {
    try {
      data = await fetchJson<RdapResponse>(url);
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${url} 查询失败`);
    }
  }
  if (!data) throw new Error(errors.join("；") || "RDAP 查询失败");

  const expiresAt = eventDate(data.events, ["expiration", "expiry"]);
  if (!expiresAt) throw new Error("RDAP 未返回到期日");

  const rdapNameservers = (data.nameservers ?? [])
    .map((nameserver) => nameserver.ldhName || nameserver.unicodeName || "")
    .filter(Boolean);

  return {
    name: data.ldhName?.toLowerCase() || data.unicodeName?.toLowerCase() || domain,
    registrar: registrarName(data.entities),
    createdAt: eventDate(data.events, ["registration", "registered"]),
    expiresAt,
    dns: rdapNameservers,
    whoisStatus: data.status?.length ? data.status : ["ok"],
    rawWhois: data,
    source: "rdap",
  };
}

function parentDomainCandidates(domain: string) {
  const labels = domain.split(".").filter(Boolean);
  const candidates: string[] = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join("."));
  }
  return [...new Set(candidates)];
}

export async function lookupDomainRdap(input: string): Promise<DomainWhoisLookup> {
  const domain = cleanDomain(input);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("域名格式无效");

  const errors: string[] = [];
  for (const candidate of parentDomainCandidates(domain)) {
    try {
      const result = await lookupExactDomainRdap(candidate);
      return {
        ...result,
        name: domain,
        dns: await resolveBestNameservers(domain, result.name, result.dns),
      };
    } catch (error) {
      errors.push(`${candidate}: ${error instanceof Error ? error.message : "RDAP 查询失败"}`);
    }
  }
  throw new Error(errors.join("；") || "RDAP 查询失败");
}
