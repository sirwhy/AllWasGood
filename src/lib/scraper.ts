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
 */
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

export async function scrapeProductUrl(url: string): Promise<ScrapedProduct> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL must start with http:// or https://");
  }
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const jsonLdProduct = extractJsonLdProduct($);
  const og = extractOpenGraph($);
  const heuristic = extractHeuristic($);

  const title =
    jsonLdProduct?.name ??
    og.title ??
    heuristic.title ??
    $("title").first().text().trim() ??
    "Untitled product";

  const description =
    jsonLdProduct?.description ??
    og.description ??
    heuristic.description ??
    $('meta[name="description"]').attr("content") ??
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
  const target = env.SCRAPER_PROXY_URL
    ? `${env.SCRAPER_PROXY_URL}?url=${encodeURIComponent(url)}`
    : url;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Scraper fetch ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
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
