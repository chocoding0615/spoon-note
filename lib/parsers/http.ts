import { lookup } from "node:dns/promises";
import { PARSE_FETCH_TIMEOUT_MS } from "../constants";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1"]);

/** hostname이 정확히 domain이거나 domain의 서브도메인인지 확인한다.
 *  단순 endsWith/includes는 "evil-naver.com"(끝은 같지만 다른 도메인),
 *  "google.evil.com"(부분일치)처럼 도메인 경계를 안 지키는 문자열로 우회된다. */
export function isHostnameOf(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// 지도 링크는 항상 도메인 이름이라, IP 리터럴 형태는 공개/사설 구분 없이 전부
// 거부하는 게 우회를 막기 훨씬 간단하고 안전하다(사설 대역만 걸러내면
// "::ffff:127.0.0.1" 같은 IPv4-매핑 IPv6, 십진수/hex 정수형 표기 등으로
// 쉽게 우회됨).
function isPrivateHostname(hostname: string): boolean {
  // URL의 IPv6 호스트명은 대괄호가 붙어서 온다(예: "[::1]") - 벗기고 판정.
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith(".local")) return true;

  if (lower.includes(":")) return true; // IPv6 리터럴
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return true; // IPv4 dotted-quad
  if (/^\d+$/.test(lower)) return true; // 십진수 정수형 IPv4(예: 2130706433)
  if (/^0x[0-9a-f]+$/.test(lower)) return true; // hex 정수형(예: 0x7f000001)
  if (/^0o[0-7]+$/.test(lower)) return true; // octal 정수형

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

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// isPrivateHostname(문자열 자체를 보는 검사)과 달리, 여기는 DNS가 실제로
// 돌려준 주소를 판정한다. kakao.com/google.com 같은 정상 도메인도 AAAA
// 레코드(IPv6)를 갖고 있을 수 있어서, "IPv6는 전부 차단" 정책을 여기 그대로
// 쓰면 정상 요청까지 막힌다 - IPv6는 실제 사설/예약 대역만 정확히 걸러낸다.
function isPrivateResolvedIp(address: string): boolean {
  if (!address.includes(":")) return isPrivateIpv4(address);

  const lower = address.toLowerCase();
  if (lower === "::1") return true; // 루프백
  if (lower.startsWith("::ffff:")) {
    // IPv4-매핑 IPv6(예: ::ffff:127.0.0.1) - 내부 IPv4 부분으로 재판정
    const mapped = lower.slice("::ffff:".length);
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(mapped) ? isPrivateIpv4(mapped) : true;
  }
  const firstHextet = parseInt(lower.split(":")[0] || "0", 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // link-local fe80::/10
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true; // unique-local fc00::/7
  return false;
}

/** hostname이 실제로 가리키는 IP까지 확인한다(DNS 리바인딩 대비) - isSafeUrl은
 *  호스트명 문자열만 보기 때문에, 평범해 보이는 공개 도메인이 내부 IP로
 *  resolve되는 경우는 못 잡는다. fetch 직전에 한 번 더 여기서 막는다.
 *  (한계: 이 조회와 실제 fetch() 사이에는 여전히 짧은 시간차가 있어, DNS
 *  TTL을 0으로 걸어두고 응답 시점까지 정밀하게 노리는 리바인딩 공격까지
 *  완전히 막지는 못한다 - 다만 지금처럼 검사 자체가 없는 것보다는 훨씬 낫다) */
async function isSafeResolvedHost(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  try {
    const results = await lookup(bare, { all: true, verbatim: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateResolvedIp(r.address));
  } catch {
    return false; // DNS 조회 실패 - 안전하게 거부
  }
}

/** 지정 시간 안에 응답이 없으면 abort하고 null을 반환한다(예외를 던지지 않음).
 *  이 앱의 모든 외부 fetch가 여기를 거치므로, DNS 리바인딩 검사도 호출부마다
 *  반복하지 않고 여기 한 곳에서 처리한다. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = PARSE_FETCH_TIMEOUT_MS
): Promise<Response | null> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!(await isSafeResolvedHost(hostname))) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const BOT_USER_AGENT = "Mozilla/5.0 (compatible; SpoonNoteBot/1.0)";

/** 안전 검증 후, 각 리다이렉트 홉도 검증하며 최종 URL까지 따라간다. */
export async function resolveFinalUrl(url: string, maxRedirects = 5): Promise<string | null> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!isSafeUrl(current)) return null;

    const res = await fetchWithTimeout(current, {
      redirect: "manual",
      headers: { "user-agent": BOT_USER_AGENT },
    });
    if (!res) return null;

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

/** 최종 페이지의 HTML을 안전하게 가져온다(OG/메타 파싱용).
 *  redirect는 "manual"로 막는다 - 리다이렉트 추적/홉별 검증은 resolveFinalUrl의
 *  역할이고, 여기서 넘어오는 url은 이미 검증된 최종 URL이다. 기본값인
 *  "follow"를 쓰면 그 최종 URL이 다시(예: 내부망으로) 리다이렉트할 때 검증 없이
 *  따라가버려 SSRF 구멍이 생긴다. */
export async function fetchHtml(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;

  const res = await fetchWithTimeout(url, {
    redirect: "manual",
    headers: { "user-agent": BOT_USER_AGENT },
  });
  if (!res || !res.ok || (res.status >= 300 && res.status < 400)) return null;
  return await res.text();
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
