/**
 * Generic e-commerce / product URL scraper.
 *
 * Strategy (best-effort, in order):
 *   1. JSON-LD `Product` schema (most reliable, used by Shopify, Tokopedia,
 *      Lazada, Amazon, many CMS-based shops).
 *   2. OpenGraph / Twitter card meta tags.
 *   3. Regex / DOM heuristics on common selectors.
 *
 * We deliberately keep this dependency-light (only cheerio) and avoid
 * platform-specific scrapers — for serious users we recommend pairing this
 * with a paid scraping API by setting SCRAPER_PROXY_URL in .env.
 *
 * SSRF protection: every fetched hostname (and every redirect target) is
 * resolved to an IP and checked against private/loopback/link-local/CGNAT
 * ranges before the request is made. This prevents authenticated users from
 * pointing the scraper at internal services (Redis, Postgres, AWS metadata
 * at 169.254.169.254, k8s API, etc).
 */
import { lookup } from "node:dns/promises";
import * as cheerio from "cheerio";

import { env } from "@/lib/env";

export interface ScrapedProduct {
  url: string;
  title: string;
  description: string;
  brand?: string;
  price?: string;
  currency?: string;
  availability?: string;
  rating?: string;
  reviewCount?: string;
  images: string[];
  features: string[];
  rawJsonLd?: unknown;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; AllWasGoodBot/1.0; +https://github.com/sirwhy/AllWasGood)";

const FETCH_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 5;

export async function scrapeProductUrl(url: string): Promise<ScrapedProduct> {
  const parsed = parseAndValidateUrl(url);
  await assertSafeHost(parsed.hostname);
  const html = await fetchHtml(parsed.toString());
  const $ = cheerio.load(html);

  const jsonLdProduct = extractJsonLdProduct($);
  const og = extractOpenGraph($);
  const heuristic = extractHeuristic($);

  const title =
    jsonLdProduct?.name ||
    og.title ||
    heuristic.title ||
    $("title").first().text().trim() ||
    "Untitled product";

  const description =
    jsonLdProduct?.description ||
    og.description ||
    heuristic.description ||
    $('meta[name="description"]').attr("content") ||
    "";

  const images = uniq(
    [
      ...(jsonLdProduct?.images ?? []),
      og.image,
      ...heuristic.images,
    ].filter(Boolean) as string[],
  )
    .map((src) => absolutize(src, url))
    .slice(0, 8);

  const offer = jsonLdProduct?.offers;
  const price = offer?.price ?? heuristic.price;
  const currency = offer?.priceCurrency ?? heuristic.currency;

  const features = heuristic.features.slice(0, 12);

  return {
    url,
    title: title.trim(),
    description: description.trim(),
    brand: jsonLdProduct?.brand,
    price: price?.toString(),
    currency,
    availability: offer?.availability,
    rating: jsonLdProduct?.aggregateRating?.ratingValue?.toString(),
    reviewCount: jsonLdProduct?.aggregateRating?.reviewCount?.toString(),
    images,
    features,
    rawJsonLd: jsonLdProduct?.raw,
  };
}

async function fetchHtml(url: string): Promise<string> {
  // If a SCRAPER_PROXY_URL is configured we trust the proxy operator with
  // egress filtering — pass through directly. Otherwise we follow redirects
  // manually, validating each hop's IP against the private-range blocklist.
  if (env.SCRAPER_PROXY_URL) {
    const target = `${env.SCRAPER_PROXY_URL}?url=${encodeURIComponent(url)}`;
    return doFetch(target, { redirect: "follow" });
  }
  return fetchHtmlManualRedirects(url);
}

async function fetchHtmlManualRedirects(initialUrl: string): Promise<string> {
  let current = initialUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const parsed = parseAndValidateUrl(current);
    await assertSafeHost(parsed.hostname);
    const res = await rawFetch(parsed.toString(), { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Scraper got ${res.status} without Location header`);
      current = new URL(loc, parsed.toString()).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`Scraper fetch ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  }
  throw new Error(`Scraper exceeded ${MAX_REDIRECTS} redirects`);
}

async function doFetch(url: string, init: RequestInit): Promise<string> {
  const res = await rawFetch(url, init);
  if (!res.ok) throw new Error(`Scraper fetch ${res.status}: ${res.statusText}`);
  return await res.text();
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function parseAndValidateUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http:// or https://");
  }
  if (!parsed.hostname) throw new Error("URL missing hostname");
  return parsed;
}

/**
 * Resolve `hostname` and reject if it points at a private/loopback/link-local
 * range. Also rejects literal IP hostnames in those ranges (where dns.lookup
 * just echoes the literal back).
 */
async function assertSafeHost(hostname: string) {
  // strip ipv6 brackets
  const host = hostname.replace(/^\[|\]$/g, "");
  // localhost / *.local: blocked in production, allowed in dev/test so you
  // can scrape a product page running on your own machine.
  if (host === "localhost" || host.endsWith(".local")) {
    if (env.NODE_ENV === "production") {
      throw new Error(`Refusing to fetch ${hostname}: loopback/local hostnames are blocked in production`);
    }
    return;
  }
  let address: string;
  let family: number;
  try {
    const r = await lookup(host, { verbatim: true });
    address = r.address;
    family = r.family;
  } catch {
    throw new Error(`Could not resolve ${hostname}`);
  }
  if (isPrivateIp(address, family)) {
    throw new Error(
      `Refusing to fetch ${hostname} (resolves to ${address}): private/internal addresses are blocked`,
    );
  }
}

function isPrivateIp(ip: string, family: number): boolean {
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  // 0.0.0.0/8 — "this" network
  if (a === 0) return true;
  // 10.0.0.0/8 — RFC 1918
  if (a === 10) return true;
  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local incl. AWS/GCP metadata 169.254.169.254
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 + 192.0.2.0/24 + 192.88.99.0/24 — IETF reserved/test/anycast
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 88) return true;
  // 192.168.0.0/16 — RFC 1918
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 — benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 + 203.0.113.0/24 — TEST-NET-2/3
  if (a === 198 && b === 51) return true;
  if (a === 203 && b === 0) return true;
  // 224.0.0.0/4 — multicast; 240.0.0.0/4 — reserved
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // ::ffff:x.x.x.x — IPv4-mapped, mixed dotted-quad notation
  const v4mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mappedDotted) return isPrivateIpv4(v4mappedDotted[1]);
  // ::ffff:HHHH:LLLL — IPv4-mapped in hex (the form WHATWG URL + dns.lookup
  // produce, so this is the form we usually see in practice). Reconstruct
  // the four octets and recheck against the IPv4 blocklist.
  const v4mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4mappedHex) {
    const hi = parseInt(v4mappedHex[1], 16);
    const lo = parseInt(v4mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(v4);
  }
  // ::HHHH:LLLL — IPv4-compatible (deprecated, but be safe)
  const v4compat = lower.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4compat) {
    const hi = parseInt(v4compat[1], 16);
    const lo = parseInt(v4compat[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(v4);
  }
  // fc00::/7 — unique local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab]/.test(lower)) return true;
  // ff00::/8 — multicast
  if (lower.startsWith("ff")) return true;
  return false;
}

interface JsonLdProduct {
  raw: unknown;
  name?: string;
  description?: string;
  brand?: string;
  images: string[];
  offers?: { price?: string | number; priceCurrency?: string; availability?: string };
  aggregateRating?: { ratingValue?: string | number; reviewCount?: string | number };
}

function extractJsonLdProduct($: cheerio.CheerioAPI): JsonLdProduct | undefined {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const el of scripts) {
    const text = $(el).contents().text();
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const product = findProduct(parsed);
    if (product) return product;
  }
  return undefined;
}

function findProduct(node: unknown): JsonLdProduct | undefined {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProduct(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (obj["@graph"]) {
    const found = findProduct(obj["@graph"]);
    if (found) return found;
  }
  const type = obj["@type"];
  const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
  if (types.includes("Product")) {
    const images: string[] = [];
    const img = obj.image;
    if (Array.isArray(img)) images.push(...(img.filter((x) => typeof x === "string") as string[]));
    else if (typeof img === "string") images.push(img);
    else if (img && typeof img === "object" && "url" in img && typeof (img as { url: unknown }).url === "string")
      images.push((img as { url: string }).url);

    const offers = obj.offers;
    let offerInfo: JsonLdProduct["offers"] | undefined;
    const firstOffer = Array.isArray(offers) ? offers[0] : offers;
    if (firstOffer && typeof firstOffer === "object") {
      const o = firstOffer as Record<string, unknown>;
      offerInfo = {
        price: typeof o.price === "string" || typeof o.price === "number" ? o.price : undefined,
        priceCurrency: typeof o.priceCurrency === "string" ? o.priceCurrency : undefined,
        availability: typeof o.availability === "string" ? o.availability : undefined,
      };
    }
    const brand = obj.brand;
    let brandName: string | undefined;
    if (typeof brand === "string") brandName = brand;
    else if (brand && typeof brand === "object" && "name" in brand && typeof (brand as { name: unknown }).name === "string")
      brandName = (brand as { name: string }).name;

    const rating = obj.aggregateRating;
    let ratingInfo: JsonLdProduct["aggregateRating"] | undefined;
    if (rating && typeof rating === "object") {
      const r = rating as Record<string, unknown>;
      ratingInfo = {
        ratingValue:
          typeof r.ratingValue === "string" || typeof r.ratingValue === "number" ? r.ratingValue : undefined,
        reviewCount:
          typeof r.reviewCount === "string" || typeof r.reviewCount === "number" ? r.reviewCount : undefined,
      };
    }

    return {
      raw: obj,
      name: typeof obj.name === "string" ? obj.name : undefined,
      description: typeof obj.description === "string" ? obj.description : undefined,
      brand: brandName,
      images,
      offers: offerInfo,
      aggregateRating: ratingInfo,
    };
  }
  return undefined;
}

function extractOpenGraph($: cheerio.CheerioAPI) {
  const get = (name: string) =>
    $(`meta[property="${name}"]`).attr("content") ?? $(`meta[name="${name}"]`).attr("content");
  return {
    title: get("og:title") ?? get("twitter:title"),
    description: get("og:description") ?? get("twitter:description"),
    image: get("og:image") ?? get("twitter:image"),
  };
}

function extractHeuristic($: cheerio.CheerioAPI) {
  const title =
    $("h1").first().text().trim() ||
    $('[itemprop="name"]').first().text().trim() ||
    undefined;

  const description =
    $('[itemprop="description"]').first().text().trim() ||
    $(".product-description, .description, [data-description]").first().text().trim() ||
    undefined;

  const priceText =
    $('[itemprop="price"]').attr("content") ||
    $('[itemprop="price"]').first().text().trim() ||
    $(".price, .product-price, [data-price]").first().text().trim() ||
    undefined;
  const priceMatch = priceText?.match(/[\d.,]+/);
  const price = priceMatch ? priceMatch[0] : undefined;
  const currencyMatch = priceText?.match(/[A-Z]{3}|Rp|\$|€|£|¥/);
  const currency = currencyMatch ? currencyMatch[0] : undefined;

  const images: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src");
    if (src && /\.(jpe?g|png|webp|gif|avif)/i.test(src)) images.push(src);
  });

  const features: string[] = [];
  $(".product-features li, .features li, [data-features] li, ul.specifications li, ul.specs li").each(
    (_, el) => {
      const txt = $(el).text().trim();
      if (txt) features.push(txt);
    },
  );

  return { title, description, price, currency, images, features };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function absolutize(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}
