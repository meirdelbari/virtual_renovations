/**
 * Product Importer (MVP)
 *
 * Goal: Given a supplier website URL, extract product data (name/image/link/price/description)
 * and optionally "copy" images by downloading and storing as data URLs.
 *
 * Strategy:
 * - Prefer schema.org JSON-LD (<script type="application/ld+json">) because it's common on e-commerce.
 * - Recursively search JSON-LD nodes for @type=Product
 * - Fallback is intentionally minimal; many sites block scraping or require a sitemap/feed.
 */

const net = require("net");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0") return true;

  // Basic private IP protection (MVP; does not resolve DNS)
  if (net.isIP(h)) {
    if (h.startsWith("10.")) return true;
    if (h.startsWith("192.168.")) return true;
    if (h.startsWith("127.")) return true;
    if (h.startsWith("169.254.")) return true;
    const m = h.match(/^172\.(\d+)\./);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
  }
  return false;
}

function normalizeHostnameForCompare(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h.startsWith("www.") ? h.slice(4) : h;
}

function sameSiteHostname(a, b) {
  const na = normalizeHostnameForCompare(a);
  const nb = normalizeHostnameForCompare(b);
  return !!na && na === nb;
}

function canonicalizeToBaseUrl(rawUrl, siteUrl) {
  try {
    const base = new URL(siteUrl);
    const u = new URL(rawUrl);
    if (!sameSiteHostname(u.hostname, base.hostname)) return u.toString();
    // Normalize protocol + hostname to match the user-provided siteUrl.
    // This avoids sites that redirect http://www -> https://non-www and breaks scraping.
    u.protocol = base.protocol;
    u.hostname = base.hostname;
    return u.toString();
  } catch (_) {
    return rawUrl;
  }
}

function toAbsoluteUrl(maybeUrl, baseUrl) {
  const raw = (maybeUrl || "").toString().trim();
  if (!raw) return null;
  try {
    // If already absolute
    const u = new URL(raw);
    return u.toString();
  } catch (_) {
    // relative
    try {
      const u = new URL(raw, baseUrl);
      return u.toString();
    } catch (_) {
      return null;
    }
  }
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const content = (m[1] || "").trim();
    if (content) blocks.push(content);
  }
  return blocks;
}

function safeJsonParse(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  // Some sites wrap JSON-LD in HTML comments or include trailing semicolons.
  const cleaned = t
    .replace(/^\s*<!--/g, "")
    .replace(/-->\s*$/g, "")
    .replace(/;\s*$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function typeIncludesProduct(typeVal) {
  if (!typeVal) return false;
  if (Array.isArray(typeVal)) return typeVal.some((t) => String(t).toLowerCase() === "product");
  return String(typeVal).toLowerCase() === "product";
}

function collectProductsFromNode(node, out) {
  if (!node || typeof node !== "object") return;

  // JSON-LD graphs
  if (Array.isArray(node)) {
    node.forEach((n) => collectProductsFromNode(n, out));
    return;
  }

  if (node["@graph"]) collectProductsFromNode(node["@graph"], out);

  if (typeIncludesProduct(node["@type"])) {
    out.push(node);
  }

  // common nesting locations
  const keys = Object.keys(node);
  for (const k of keys) {
    const v = node[k];
    if (!v) continue;
    if (typeof v === "object") collectProductsFromNode(v, out);
  }
}

function looksLikeProductImageUrl(src) {
  const s = String(src || "").toLowerCase();
  if (!s) return false;
  // Strong signals
  if (s.includes("/wp-content/uploads/")) return true;
  if (s.includes("/uploads/")) return true;
  if (s.includes("/imagebank/")) return true;
  // Weak signals
  if (s.includes("/products/") && (s.endsWith(".jpg") || s.endsWith(".png") || s.endsWith(".webp"))) return true;
  return false;
}

function isLikelyNonProductAsset(src) {
  const s = String(src || "").toLowerCase();
  if (!s) return true;
  const bad = ["logo", "icon", "sprite", "favicon", "waze", "facebook", "instagram", "whatsapp", "linkedin", "tiktok"];
  if (bad.some((b) => s.includes(b))) return true;
  return false;
}

function filenameToName(urlOrPath) {
  try {
    const u = isHttpUrl(urlOrPath) ? new URL(urlOrPath) : null;
    const path = u ? u.pathname : String(urlOrPath || "");
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "Product";
    const noQuery = last.split("?")[0];
    const base = noQuery.replace(/\.[a-z0-9]+$/i, "");
    const decoded = decodeURIComponent(base);
    // Clean common patterns: underscores, dashes, dimension suffixes
    return decoded
      .replace(/[_-]+/g, " ")
      .replace(/\b\d{2,4}x\d{2,4}\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Product";
  } catch (_) {
    return "Product";
  }
}

function scoreLikelyCatalogLink(text, href) {
  const t = String(text || "").toLowerCase();
  const h = String(href || "").toLowerCase();

  // English
  const kw = ["products", "product", "catalog", "collection", "collections", "shop", "store", "gallery"];
  // Hebrew (common)
  const kwHe = ["מוצרים", "קטלוג", "חנות", "גלריה", "אוסף"];

  let score = 0;
  for (const k of kw) {
    if (t.includes(k)) score += 5;
    if (h.includes(k)) score += 4;
  }
  for (const k of kwHe) {
    if (t.includes(k)) score += 6;
    if (h.includes(k)) score += 5;
  }

  // Penalize obvious non-catalog pages
  const bad = ["contact", "about", "service", "privacy", "terms", "blog", "news", "profile", "login", "signup"];
  for (const b of bad) {
    if (h.includes(b)) score -= 6;
  }

  return score;
}

function extractImageProductsFromHtml(html, pageUrl, { maxPerPage = 12 } = {}) {
  const out = [];
  const seen = new Set();
  const text = String(html || "");

  // Best-effort for sites that render catalog items as:
  // <a ... data-url="DETAIL_PAGE" ... href="FULL_IMAGE" title="..." ...><img src="THUMB"></a>
  // IMPORTANT: Require data-url to avoid grabbing unrelated image links (e.g., blog thumbnails).
  // Attribute order varies, so we parse the <a> tag attributes generically.
  const anchorWithImg = /<a\b([^>]*\bdata-url=["'][^"']+["'][^>]*)>[\s\S]{0,800}?<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = anchorWithImg.exec(text))) {
    const aAttrs = m[1] || "";
    const src = m[2] || "";

    if (!src) continue;
    if (isLikelyNonProductAsset(src)) continue;
    if (!looksLikeProductImageUrl(src)) continue;
    const imageUrl = toAbsoluteUrl(src, pageUrl);
    if (!imageUrl) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    function getAttr(name) {
      const re = new RegExp(`${name}=[\"']([^\"']+)[\"']`, "i");
      const mm = aAttrs.match(re);
      return mm ? mm[1] : "";
    }

    const dataUrl = getAttr("data-url");
    const href = getAttr("href");
    const title = (getAttr("title") || "").trim();

    const productUrl = toAbsoluteUrl(dataUrl, pageUrl) || toAbsoluteUrl(href, pageUrl) || imageUrl;
    out.push({
      name: title || filenameToName(imageUrl),
      description: "",
      price: "",
      currency: "",
      imageUrl,
      productUrl,
      source: "image-heuristic",
      discoveredFrom: pageUrl,
    });
    if (out.length >= maxPerPage) return out;
  }

  // Try to capture <a href="..."><img ... src="..."></a>
  const anchorImg = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]{0,400}?<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  // reset match var (already declared)
  while ((m = anchorImg.exec(text))) {
    const href = m[1];
    const src = m[2];
    if (!src) continue;
    if (isLikelyNonProductAsset(src)) continue;
    if (!looksLikeProductImageUrl(src)) continue;
    const imageUrl = toAbsoluteUrl(src, pageUrl);
    if (!imageUrl) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    // If the anchor href doesn't look like a product/detail page, fall back to the image URL
    // This avoids dedupe collisions where many images link to a single generic page.
    const hrefAbs = toAbsoluteUrl(href, pageUrl);
    const productUrl = hrefAbs && scoreLikelyCatalogLink("", hrefAbs) > 0 ? hrefAbs : imageUrl;
    out.push({
      name: filenameToName(imageUrl),
      description: "",
      price: "",
      currency: "",
      imageUrl,
      productUrl,
      source: "image-heuristic",
      discoveredFrom: pageUrl,
    });
    if (out.length >= maxPerPage) return out;
  }

  // Fallback: all <img> tags (use pageUrl as productUrl)
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  while ((m = imgRe.exec(text))) {
    const src = m[1];
    const alt = (m[2] || "").trim();
    if (!src) continue;
    if (isLikelyNonProductAsset(src)) continue;
    if (!looksLikeProductImageUrl(src)) continue;
    const imageUrl = toAbsoluteUrl(src, pageUrl);
    if (!imageUrl) continue;
    if (seen.has(imageUrl)) continue;
    seen.add(imageUrl);

    out.push({
      name: alt || filenameToName(imageUrl),
      description: "",
      price: "",
      currency: "",
      imageUrl,
      productUrl: imageUrl,
      source: "image-heuristic",
      discoveredFrom: pageUrl,
    });
    if (out.length >= maxPerPage) return out;
  }

  return out;
}

function normalizeProductJsonLd(p, baseUrl) {
  const name = (p.name || p.title || "").toString().trim();
  if (!name) return null;

  let image = p.image;
  if (Array.isArray(image)) image = image.find((x) => typeof x === "string") || image[0];
  if (image && typeof image === "object" && image.url) image = image.url;
  const imageUrl = toAbsoluteUrl(image, baseUrl);

  let url = p.url;
  if (!url && p.offers && p.offers.url) url = p.offers.url;
  const productUrl = toAbsoluteUrl(url, baseUrl);

  // offers can be array or object
  const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  const price = offers && offers.price !== undefined ? String(offers.price) : "";
  const currency = offers && offers.priceCurrency ? String(offers.priceCurrency) : "";

  const description = (p.description || "").toString().trim();

  return {
    name,
    description,
    price,
    currency,
    imageUrl,
    productUrl,
    source: "jsonld",
    discoveredFrom: baseUrl,
  };
}

async function fetchHtml(url, { timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlgoreitAIImporter/1.0; +https://example.invalid)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching website`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      // Some sites return HTML without the header; allow but warn.
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, { timeoutMs = 25000, accept = "*/*" } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlgoreitAIImporter/1.0; +https://example.invalid)",
        Accept: accept,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractUrlsFromSitemapXml(xmlText) {
  const xml = String(xmlText || "");
  const urls = [];
  // Very lightweight XML parsing: find <loc>https://...</loc>
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const u = (m[1] || "").trim();
    if (u) urls.push(u);
  }
  return urls;
}

function extractCandidateLinksFromHtml(html, baseUrl, { max = 25 } = {}) {
  const text = String(html || "");
  const out = [];
  const seen = new Set();

  const aRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,250}?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(text))) {
    const hrefRaw = (m[1] || "").trim();
    if (!hrefRaw || hrefRaw.startsWith("#")) continue;
    const inner = (m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const href = toAbsoluteUrl(hrefRaw, baseUrl);
    if (!href || !isHttpUrl(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    const score = scoreLikelyCatalogLink(inner, href);
    if (score <= 0) continue;
    out.push({ href, score });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, max).map((x) => x.href);
}

async function discoverEntryPagesFromHomepage(siteUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  try {
    const html = await fetchHtml(siteUrl, { timeoutMs });
    const links = extractCandidateLinksFromHtml(html, siteUrl, { max: 25 });
    const base = new URL(siteUrl);
    return links.filter((u) => {
      try {
        const uu = new URL(u);
        return sameSiteHostname(uu.hostname, base.hostname);
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return [];
  }
}

async function discoverCandidatePagesFromSitemaps(siteUrl, options = {}) {
  const maxCandidates = Number.isFinite(Number(options.maxPages))
    ? Math.max(1, Math.min(300, Number(options.maxPages)))
    : 120;
  const timeoutMs = options.timeoutMs || 25000;
  const base = new URL(siteUrl);

  // Common sitemap locations (WP & general)
  const candidates = [
    new URL("/sitemap.xml", base).toString(),
    new URL("/sitemap_index.xml", base).toString(),
    new URL("/wp-sitemap.xml", base).toString(),
    new URL("/sitemap.xml.gz", base).toString(), // may fail (gz) - we won't decompress in MVP
  ];

  const seen = new Set();
  const out = [];

  async function tryFetchSitemap(url) {
    if (seen.has(url)) return [];
    seen.add(url);
    try {
      const text = await fetchText(url, { timeoutMs, accept: "application/xml,text/xml,*/*" });
      return extractUrlsFromSitemapXml(text);
    } catch (_) {
      return [];
    }
  }

  // First pass: fetch known sitemap endpoints
  const roots = [];
  for (const u of candidates) {
    const locs = await tryFetchSitemap(u);
    if (locs.length) roots.push({ sitemap: u, locs });
  }

  // Sitemaps can be: urlset (urls) or sitemapindex (child sitemaps).
  // We'll treat all <loc> as either page urls or child sitemap urls and expand 1 level deep.
  for (const root of roots) {
    for (const loc of root.locs) {
      if (!isHttpUrl(loc)) continue;
      try {
        const u = new URL(loc);
        if (!sameSiteHostname(u.hostname, base.hostname)) continue; // stay on same site (allow www)
      } catch (_) {
        continue;
      }

      // Heuristic: if it looks like another sitemap file, expand it
      if (loc.includes("sitemap") && (loc.endsWith(".xml") || loc.includes(".xml?") || loc.includes(".xml&"))) {
        const locs2 = await tryFetchSitemap(loc);
        for (const x of locs2) {
          if (out.length >= maxCandidates) break;
          if (!isHttpUrl(x)) continue;
          try {
            const xu = new URL(x);
            if (!sameSiteHostname(xu.hostname, base.hostname)) continue;
          } catch (_) {
            continue;
          }
          out.push(canonicalizeToBaseUrl(x, siteUrl));
        }
      } else {
        if (out.length >= maxCandidates) break;
        out.push(canonicalizeToBaseUrl(loc, siteUrl));
      }
      if (out.length >= maxCandidates) break;
    }
    if (out.length >= maxCandidates) break;
  }

  // Deduplicate + prioritize likely product URLs
  const uniq = Array.from(new Set(out));
  uniq.sort((a, b) => {
    const score = (u) => {
      const s = u.toLowerCase();
      let v = 0;
      // Site-specific known pattern: many catalogs use /products/view/...
      if (s.includes("/products/view/")) v += 20;
      // Even better: item pages often end with an id like /products/view/<group>/<id>
      if (/\/products\/view\/[^/]+\/\d+/.test(s)) v += 30;
      if (s.includes("/product/")) v += 5;
      if (s.includes("product")) v += 3;
      if (s.includes("shop")) v += 2;
      if (s.includes("category")) v += 1;
      if (s.includes("wp-json")) v -= 10;
      if (s.endsWith(".jpg") || s.endsWith(".png") || s.endsWith(".webp")) v -= 10;
      return -v; // lower is better for sort
    };
    return score(a) - score(b);
  });

  return uniq.slice(0, maxCandidates);
}

async function scanPagesForProducts(pageUrls, siteUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  const maxPages = Number.isFinite(Number(options.maxPages))
    ? Math.max(1, Math.min(300, Number(options.maxPages)))
    : 80;
  const concurrency = Number.isFinite(Number(options.concurrency))
    ? Math.max(1, Math.min(6, Number(options.concurrency)))
    : 3;

  const base = new URL(siteUrl);
  const queue = pageUrls.slice(0, maxPages);
  const products = [];

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const my = idx++;
      const url = canonicalizeToBaseUrl(queue[my], siteUrl);
      // polite delay
      if (options.politeDelayMs) await sleep(options.politeDelayMs);
      try {
        const html = await fetchHtml(url, { timeoutMs });
        const jsonLdBlocks = extractJsonLdBlocks(html);
        const parsed = jsonLdBlocks.map(safeJsonParse).filter(Boolean);
        const rawProducts = [];
        parsed.forEach((p) => collectProductsFromNode(p, rawProducts));
        if (rawProducts.length > 0) {
          for (const rp of rawProducts) {
            const np = normalizeProductJsonLd(rp, url);
            if (!np) continue;
            if (!np.imageUrl && !np.productUrl) continue;
            if (np.productUrl) {
              try {
                const pu = new URL(np.productUrl);
                if (!sameSiteHostname(pu.hostname, base.hostname)) continue;
              } catch (_) {}
            }
            products.push(np);
          }
        } else if (options.enableHeuristics !== false) {
          // Heuristic fallback: extract product-like images from pages like /products, /shop, etc.
          const lower = url.toLowerCase();
          // Only run heuristics on likely catalog pages (avoid importing random gallery images from About/Home).
          const shouldHeuristic =
            lower.includes("/products") ||
            lower.includes("/shop") ||
            lower.includes("catalog") ||
            lower.includes("store");

          if (shouldHeuristic) {
            const maxPer = Number.isFinite(Number(options.maxPerPageHeuristic))
              ? Math.max(12, Math.min(500, Number(options.maxPerPageHeuristic)))
              : 120;
            const imgProducts = extractImageProductsFromHtml(html, url, { maxPerPage: maxPer });
            for (const p of imgProducts) {
              // keep within site
              try {
                const iu = new URL(p.imageUrl);
                if (!sameSiteHostname(iu.hostname, base.hostname)) continue;
              } catch (_) {}
              products.push(p);
            }
          }
        }
      } catch (_) {
        // ignore per-page errors
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return products;
}

async function downloadImageAsDataUrl(url, { maxBytes = 2_000_000, timeoutMs = 25000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlgoreitAIImporter/1.0; +https://example.invalid)",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} while downloading image`);

    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    const contentLength = Number(res.headers.get("content-length") || "0");
    if (contentLength && contentLength > maxBytes) {
      throw new Error(`Image too large (${contentLength} bytes)`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Image too large (${buf.length} bytes)`);
    }

    const b64 = buf.toString("base64");
    return `data:${contentType};base64,${b64}`;
  } finally {
    clearTimeout(t);
  }
}

async function scrapeProductsFromWebsite(websiteUrl, options = {}) {
  // Allow larger imports for catalog-style sites. Keep an upper bound to avoid runaway scraping.
  const maxProducts = Number.isFinite(Number(options.maxProducts))
    ? Math.max(1, Math.min(500, Number(options.maxProducts)))
    : 30;

  // maxCandidates: how many candidates we *collect* before the API layer de-dupes and applies the final import limit.
  // This is critical so we can still import "new" items even when the first N candidates are all duplicates.
  const maxCandidates = Number.isFinite(Number(options.maxCandidates))
    ? Math.max(1, Math.min(2000, Number(options.maxCandidates)))
    : maxProducts;
  const downloadImages = options.downloadImages === true;
  const crawlSitemap = options.crawlSitemap !== false; // default true

  if (!isHttpUrl(websiteUrl)) throw new Error("Invalid URL (must start with http/https)");
  const u = new URL(websiteUrl);
  if (isBlockedHost(u.hostname)) throw new Error("Blocked/unsafe website hostname");

  // Phase 1: Try the provided URL
  const normalized = [];
  let rawFound = 0;
  try {
    const html = await fetchHtml(websiteUrl, { timeoutMs: options.timeoutMs || 25000 });
    const jsonLdBlocks = extractJsonLdBlocks(html);
    const parsed = jsonLdBlocks.map(safeJsonParse).filter(Boolean);
    const rawProducts = [];
    parsed.forEach((p) => collectProductsFromNode(p, rawProducts));
    rawFound += rawProducts.length;
    for (const rp of rawProducts) {
      const np = normalizeProductJsonLd(rp, websiteUrl);
      if (!np) continue;
      if (!np.imageUrl && !np.productUrl) continue;
      normalized.push(np);
      if (normalized.length >= maxCandidates) break;
    }
  } catch (_) {}

  // Phase 2: If none found and enabled, crawl sitemaps and scan pages
  let sitemapScannedPages = 0;
  if (normalized.length === 0 && crawlSitemap) {
    // Smart discovery: read homepage nav/buttons and look for Products/Catalog/Shop links (EN + HE)
    const entryPages = await discoverEntryPagesFromHomepage(websiteUrl, {
      timeoutMs: options.timeoutMs || 25000,
    });

    const sitemapPages = await discoverCandidatePagesFromSitemaps(websiteUrl, {
      maxPages: options.maxScanPages || 120,
      timeoutMs: options.timeoutMs || 25000,
    });
    let pages = Array.from(new Set([...(entryPages || []), ...(sitemapPages || [])]));
    // Prefer deep catalog pages first so we don't fill the candidate window with homepage/preview items.
    pages.sort((a, b) => {
      const sa = String(a).toLowerCase();
      const sb = String(b).toLowerCase();
      const pa = sa.includes("/products/view/") ? ( /\/products\/view\/[^/]+\/\d+/.test(sa) ? 0 : 1 ) : 2;
      const pb = sb.includes("/products/view/") ? ( /\/products\/view\/[^/]+\/\d+/.test(sb) ? 0 : 1 ) : 2;
      if (pa !== pb) return pa - pb;
      return sa.localeCompare(sb);
    });

    sitemapScannedPages = pages.length;
    const fromPages = await scanPagesForProducts(pages, websiteUrl, {
      timeoutMs: options.timeoutMs || 25000,
      maxPages: options.maxScanPages || 120,
      concurrency: options.concurrency || 3,
      politeDelayMs: options.politeDelayMs || 0,
      // When we fall back to heuristic image extraction, pull more per page so big catalogs work.
      maxPerPageHeuristic: options.maxPerPageHeuristic || 120,
    });
    rawFound += fromPages.length;

    for (const np of fromPages) {
      normalized.push(np);
      if (normalized.length >= maxCandidates) break;
    }
  }

  // Optionally copy images as data URLs
  const results = [];
  for (const p of normalized) {
    let finalImageUrl = p.imageUrl;
    let imageCopied = false;
    let imageError = "";

    if (downloadImages && p.imageUrl) {
      try {
        finalImageUrl = await downloadImageAsDataUrl(p.imageUrl, {
          maxBytes: options.maxImageBytes || 2_000_000,
          timeoutMs: options.timeoutMs || 25000,
        });
        imageCopied = true;
      } catch (e) {
        imageError = e.message || String(e);
        // keep original URL as fallback
        finalImageUrl = p.imageUrl;
      }
    }

    results.push({
      ...p,
      imageUrl: finalImageUrl,
      imageCopied,
      imageError,
    });
  }

  return {
    websiteUrl,
    found: rawFound,
    importedCandidates: normalized.length,
    products: results,
    notes:
      normalized.length === 0
        ? "No schema.org Product JSON-LD found (even after sitemap scan). For some sites we may need WooCommerce API keys, a product feed (CSV/XML), or a custom connector."
        : "",
    debug: {
      crawlSitemap,
      sitemapScannedPages,
    },
  };
}

module.exports = {
  scrapeProductsFromWebsite,
};

