import { PARSE_FETCH_TIMEOUT_MS } from "../constants";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;

  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/** http/https만 허용, 내부망/localhost 차단 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (isPrivateHostname(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** 안전 검증 후, 각 리다이렉트 홉도 검증하며 최종 URL까지 따라간다. */
export async function resolveFinalUrl(url: string, maxRedirects = 5): Promise<string | null> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!isSafeUrl(current)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PARSE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)" },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    return current;
  }
  return null; // 리다이렉트 한도 초과
}

/** 최종 페이지의 HTML을 안전하게 가져온다(OG/메타 파싱용). */
export async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** property/name 어느 쪽이든, 속성 순서 상관없이 <meta> content를 뽑는다. */
export function extractMeta(html: string, key: string): string | undefined {
  const tagRe = new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(tagRe)?.[0];
  if (!tag) return undefined;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeHtmlEntities(content) : undefined;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
