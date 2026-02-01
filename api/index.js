require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const geminiClient = require("./geminiClient");
const paymentService = require("./paymentService");
const productScraper = require("./productScraper");
const supplierRoutes = require("./supplierRoutes");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 4000;

// ... (Rest of config)

const openai =
  process.env.OPENAI_API_KEY && new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(
  cors({
    origin: true, // allows file:// and http://localhost origins
    credentials: false,
  })
);

// Stripe Webhook (Must be before express.json() to get raw body)
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    try {
      const result = await paymentService.handleWebhook(req.body, signature);
      res.json(result);
    } catch (err) {
      console.error("Webhook Error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Mount Supplier Routes
console.log("Mounting Supplier Routes at /api/suppliers");
app.use("/api/suppliers", supplierRoutes);

// Product Scraper Endpoint
app.post("/api/scrape-products", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  
  try {
    const result = await productScraper.scrapeProducts(url);
    if (result.error) {
        return res.status(422).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error("Scrape Error:", err);
    res.status(500).json({ error: "Internal scraper error" });
  }
});

app.get("/api/auth-config", (req, res) => {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE || process.env.CLERK_PUBLISHABLE_KEY || process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
  if (!key) {
      console.error("Auth Config Error: No Clerk Key found in environment variables.");
  }
  res.json({
    publishableKey: key,
  });
});

// Simple landing page so /api/ works
app.get("/api/", (req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Virtual Renovations Backend</title>
      </head>
      <body>
        <h1>Virtual Renovations backend is running</h1>
        <p>Try <code>/api/health</code> for JSON status.</p>
      </body>
    </html>
  `);
});

app.get("/api/health", (req, res) => {
  const geminiConfig = geminiClient.checkConfiguration();
  res.json({
    status: "ok",
    service: "virtual-renovations-backend",
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    geminiConfigured: geminiConfig.configured,
    geminiProvider: geminiConfig.provider,
  });
});

// Payments & Credits

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { userId, userEmail, planType, planId, returnUrl } = req.body;
    const session = await paymentService.createCheckoutSession({
      userId,
      userEmail,
      planType,
      planId,
      returnUrl: returnUrl || req.headers.referer,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/credits", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const credits = await paymentService.getUserCredits(userId);
    res.json({ credits });
  } catch (err) {
    console.error("Get Credits Error:", err);
    res.status(500).json({ error: "Failed to get credits" });
  }
});

// AI-powered renovation using OpenAI images API
app.post("/api/renovate-room", async (req, res) => {
  const { imageDataUrl, styleId, renovationId } = req.body || {};

  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return res.status(400).json({
      error: "imageDataUrl (base64 data URL) is required",
    });
  }

  if (!openai) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not configured on the server",
    });
  }

  try {
    const prompt = buildPrompt(styleId, renovationId);

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    const image = result.data && result.data[0];
    if (!image || !image.b64_json) {
      return res.status(500).json({
        error: "OpenAI did not return an image",
      });
    }

    const outDataUrl = `data:image/png;base64,${image.b64_json}`;

    res.json({
      imageDataUrl: outDataUrl,
    });
  } catch (error) {
    console.error("Error in /api/renovate-room:", error);
    res.status(500).json({
      error: "Failed to apply AI renovation",
      details: error.message || String(error),
    });
  }
});

function buildPrompt(styleId, renovationId) {
  const styleText = styleId ? styleId.replace(/_/g, " ") : "modern";
  let renovationText = "";

  switch (renovationId) {
    case "wood_floor":
      renovationText =
        "replace the existing floor with a high quality modern wooden floor, keeping walls and furniture unchanged";
      break;
    case "carpet":
      renovationText =
        "replace the existing floor with a stylish carpet that fits the style, keeping walls and furniture unchanged";
      break;
    case "tiles":
      renovationText =
        "replace the existing floor with modern tiles matching the style, keeping walls and furniture unchanged";
      break;
    case "paint":
      renovationText =
        "repaint the walls according to the chosen style, keeping floor and furniture unchanged";
      break;
    case "kitchen":
      renovationText =
        "renovate the kitchen finishes and cabinetry to match the chosen style, preserving room layout";
      break;
    case "bathroom":
      renovationText =
        "renovate the bathroom finishes, tiles and fixtures to match the chosen style, preserving layout";
      break;
    default:
      renovationText =
        "apply a subtle renovation that updates materials to match the chosen style while preserving room layout";
  }

  return `You are a virtual renovations designer. Based on the input room photo, in a ${styleText} interior design style, ${renovationText}. Keep the overall camera angle and composition; only update materials and finishes.`;
}

// AlgoreitAI endpoints (powered by Gemini backend)

// Process a photo (image generation)
app.post("/api/gemini/process-photo", async (req, res) => {
  const { imageDataUrl, instructions, meta, userId } = req.body || {};

  // Validate input
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return res.status(400).json({
      error: "imageDataUrl (base64 data URL) is required",
    });
  }

  if (!instructions || typeof instructions !== "string") {
    return res.status(400).json({
      error: "instructions (string) is required",
    });
  }

  // Check Credits
  if (userId && paymentService.isCreditsEnforced && paymentService.isCreditsEnforced()) {
    try {
      const allowed = await paymentService.deductCredit(userId, 1);
      if (!allowed) {
        return res.status(402).json({
          error: "Insufficient credits. Please purchase more credits to continue.",
          code: "INSUFFICIENT_CREDITS"
        });
      }
    } catch (err) {
      console.error("Payment Service Error:", err);
      // If credits enforcement is enabled, fail closed. Otherwise allow.
      return res.status(500).json({ error: "Failed to verify credits." });
    }
  } else {
    // strict mode: require user ID
    // return res.status(401).json({ error: "User not authenticated" });
    if (userId) {
      console.warn("Credits enforcement is disabled. Bypassing credit check.");
    } else {
      console.warn("Processing without userId - bypassing credit check (Legacy/Dev mode)");
    }
  }

  // Check if AlgoreitAI backend is configured
  const config = geminiClient.checkConfiguration();
  if (!config.configured) {
    return res.status(500).json({
      error: "AlgoreitAI API key is not configured on the server.",
    });
  }

  try {
    // Extract base64 data from data URL
    // Format: data:image/png;base64,iVBORw0KG...
    const base64Match = imageDataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/i);
    if (!base64Match) {
      return res.status(400).json({
        error: "Invalid imageDataUrl format. Expected data:image/...;base64,...",
      });
    }

    const imageBase64 = base64Match[1];

    // Determine model based on feature
    // - Product Merge (Collage) -> gemini-2.5-flash-image (Better at merging/spatial logic for collages)
    // - Renovations / Other -> gemini-3-pro-image-preview (Nano Banana Pro)
    // Note: If 3-pro-image-preview is unavailable, fallback to gemini-2.0-flash-exp
    const model = (meta && meta.isProductMerge) ? "gemini-2.5-flash-image" : "gemini-3-pro-image-preview";
    
    console.log(`[Gemini Process] Feature: ${meta && meta.isProductMerge ? 'Product Merge' : 'Renovation'}, Model: ${model}`);

    // Send to provider
    const result = await geminiClient.processImageWithGemini({
      imageBase64,
      instructions,
      meta: meta || {},
      model: model
    });

    if (!result.imageBase64) {
      return res.status(500).json({
        error: "AlgoreitAI did not return a processed image",
      });
    }

    // Convert back to data URL
    const outDataUrl = `data:image/png;base64,${result.imageBase64}`;
    res.json({
      imageDataUrl: outDataUrl,
      provider: "AlgoreitAI",
    });
  } catch (error) {
    console.error("Error in /api/gemini/process-photo:", error);
    const rawDetails = error.message || String(error);
    const scrubbedDetails = rawDetails.replace(/Gemini/gi, "AlgoreitAI");
    res.status(502).json({
      error: "Failed to process photo with AlgoreitAI",
      details: scrubbedDetails,
    });
  }
});

// Analyze image (alternative endpoint)
app.post("/api/gemini/analyze-photo", async (req, res) => {
  const { imageDataUrl, instructions } = req.body || {};

  if (!imageDataUrl || !instructions) {
    return res.status(400).json({
      error: "imageDataUrl and instructions are required",
    });
  }

  const config = geminiClient.checkConfiguration();
  if (!config.configured) {
    return res.status(500).json({
      error: "AlgoreitAI API key is not configured on the server",
    });
  }

  try {
    const base64Match = imageDataUrl.match(/^data:image\/[a-z]+;base64,(.+)$/i);
    if (!base64Match) {
      return res.status(400).json({
        error: "Invalid imageDataUrl format",
      });
    }

    const imageBase64 = base64Match[1];

    const result = await geminiClient.analyzeImageWithGemini({
      imageBase64,
      instructions,
    });

    res.json({
      analysis: result.analysis,
      provider: "AlgoreitAI",
    });
  } catch (error) {
    console.error("Error in /api/gemini/analyze-photo:", error);
    const rawDetails = error.message || String(error);
    const scrubbedDetails = rawDetails.replace(/Gemini/gi, "AlgoreitAI");
    res.status(502).json({
      error: "Failed to analyze photo with AlgoreitAI",
      details: scrubbedDetails,
    });
  }
});

// Generate image from text (New Feature with DALL-E Fallback)
app.post("/api/gemini/generate-view", async (req, res) => {
  // Supports optional image context
  const { prompt, userId, contextImage } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({
      error: "prompt (string) is required",
    });
  }

  // Check Credits (Optional logic mirroring process-photo)
  if (userId && paymentService.isCreditsEnforced && paymentService.isCreditsEnforced()) {
     try {
       const allowed = await paymentService.deductCredit(userId, 1);
       if (!allowed) {
         return res.status(402).json({
           error: "Insufficient credits.",
           code: "INSUFFICIENT_CREDITS"
         });
       }
     } catch(err) {
        console.warn("Credit check failed, proceeding cautiously:", err.message);
     }
  }

  try {
    const config = geminiClient.checkConfiguration();
    let imageBase64;
    let provider = "AlgoreitAI (Gemini 3 Pro)";

    // Try Gemini/Imagen First
    if (config.configured) {
        try {
            // NEW: If contextImage is provided, use processImageWithGemini (Img2Img)
            // Otherwise use generateImageFromText (Text2Img)
            if (contextImage) {
                console.log("Generating view with context image (Vision+Gen)...");
                // We treat this as an Img2Img transformation where instructions = prompt
                const base64Match = contextImage.match(/^data:image\/[a-z]+;base64,(.+)$/i);
                if (base64Match) {
                    const result = await geminiClient.processImageWithGemini({
                        imageBase64: base64Match[1],
                        instructions: prompt 
                    });
                    imageBase64 = result.imageBase64;
                } else {
                    console.warn("Invalid context image format, falling back to text-only.");
                    const result = await geminiClient.generateImageFromText({ prompt });
                    imageBase64 = result.imageBase64;
                }
            } else {
                const result = await geminiClient.generateImageFromText({ prompt });
                if (result.imageBase64) {
                    imageBase64 = result.imageBase64;
                }
            }
        } catch (geminiError) {
            console.warn("Gemini generation failed, trying OpenAI fallback:", geminiError.message);
            // Fall through to OpenAI if available
        }
    }

    // Try OpenAI Fallback
    if (!imageBase64 && openai) {
        console.log("Using OpenAI DALL-E fallback...");
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
        });
        
        if (response.data && response.data[0] && response.data[0].b64_json) {
            imageBase64 = response.data[0].b64_json;
            // User requested that "AlgoreitAI" is what they see when Gemini 3 Pro is implemented.
            // Since we are falling back to maintain functionality, we will keep the provider label compatible 
            // or just generic "AlgoreitAI" so the UI stays consistent with the brand.
            provider = "AlgoreitAI"; 
        }
    }

    if (!imageBase64) {
      throw new Error("AlgoreitAI Generation failed. Please try again later.");
    }

    const outDataUrl = `data:image/jpeg;base64,${imageBase64}`;
    res.json({
      imageDataUrl: outDataUrl,
      provider: provider,
    });
  } catch (error) {
    console.error("Error in /api/gemini/generate-view:", error);
    const rawDetails = error.message || String(error);
    const scrubbedDetails = rawDetails.replace(/Gemini|Imagen/gi, "AlgoreitAI");
    res.status(502).json({
      error: "Failed to generate view with AlgoreitAI",
      details: scrubbedDetails,
    });
  }
});

// Serve static files from the root directory (Local + Vercel Monolith Support)
const path = require("path");

// ============================================================================
// IMAGE PROXY: Fix CORS issues for canvas manipulation
// ============================================================================
app.get("/api/proxy-image", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("URL required");
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*"); // Allow client to read this
    res.send(buffer);
  } catch (e) {
    console.error("Image Proxy Error:", e.message);
    res.status(500).send(`Proxy Error: ${e.message}`);
  }
});

// ============================================================================
// DEMO PROXY: "Copy" a website and inject our features
// ============================================================================
app.get("/api/demo-proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing 'url' query parameter");
  }

  try {
    // 1. Fetch the target website
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${targetUrl}: ${response.statusText}`);
    }
    const html = await response.text();
    
    // Use the final URL (after redirects) for the base tag
    const finalUrl = response.url || targetUrl;

    // 2. Resolve relative URLs to absolute URLs
    // This is a naive implementation but works for most static assets in a demo context
    const urlObj = new URL(finalUrl);
    const origin = urlObj.origin;
    const supplierHostParam = encodeURIComponent(urlObj.hostname || "");
    
    // Replace src="/..." with src="https://site.com/..."
    // DISABLED: This regex is too aggressive and breaks inline scripts/JSON. 
    // We rely on the <base> tag instead.
    // let modifiedHtml = html.replace(/(src|href|action)="\/(?!\/)/gi, `$1="${origin}/`);
    let modifiedHtml = html;
    
    // Replace src="./..." or src="foo.jpg" (tricky, but let's try basic)
    // A better approach is using the <base> tag, but that breaks hash links often.
    // Let's inject a <base> tag as a backup, but script injection usually handles it.
    // modifiedHtml = modifiedHtml.replace('<head>', `<head><base href="${origin}/">`);
    
    // Note: <base> tag is powerful but can break in-page anchors. 
    // For a visual demo, it's usually the best way to load images/css correctly.
    if (!modifiedHtml.includes("<base")) {
        // Inject base tag right after head
        modifiedHtml = modifiedHtml.replace("<head>", `<head><base href="${finalUrl}">`);
    } else {
        // If base tag exists, we might need to update it? 
        // Usually original site has relative base or none. 
        // For now, assume if it exists it might be okay, or we replace it?
        // Let's replace existing base tag if it's there but relative? 
        // Simpler to just leave it if it exists, or force our own.
        // But for Gutstein, it doesn't have one initially likely.
    }

    // 3. Rewrite internal links to stay in demo proxy
    try {
        const $ = cheerio.load(modifiedHtml);
        const isUnsafeHref = (href) => {
            if (!href) return true;
            const lowered = href.toLowerCase();
            return (
                lowered.startsWith("javascript:") ||
                lowered.startsWith("mailto:") ||
                lowered.startsWith("tel:") ||
                lowered.startsWith("#")
            );
        };
        const normalizeHost = (host) =>
            (host || "").toLowerCase().replace(/^www\./, "");
        const isSupplierHost = (host) =>
            normalizeHost(host) === normalizeHost(urlObj.hostname);
        const toProxyUrl = (targetUrl) =>
            "/api/demo-proxy?url=" +
            encodeURIComponent(targetUrl) +
            "&t=" +
            Date.now();
        const rewriteUrl = (rawUrl) => {
            if (isUnsafeHref(rawUrl)) return null;
            let absoluteUrl;
            try {
                absoluteUrl = new URL(rawUrl, finalUrl);
            } catch (e) {
                return null;
            }
            if (!isSupplierHost(absoluteUrl.hostname)) return null;
            return toProxyUrl(absoluteUrl.toString());
        };

        $("a[href]").each((_, el) => {
            const href = $(el).attr("href");
            const proxied = rewriteUrl(href);
            if (proxied) $(el).attr("href", proxied);
        });

        $("form[action]").each((_, el) => {
            const method = ($(el).attr("method") || "get").toLowerCase();
            if (method !== "get") return;
            const action = $(el).attr("action");
            const proxied = rewriteUrl(action || finalUrl);
            if (proxied) $(el).attr("action", proxied);
        });

        modifiedHtml = $.html();
    } catch (e) {
        console.warn("Demo proxy link rewrite failed:", e.message);
    }

    // 4. Inject our "Virtual Renovations" Widget
    // We inject a script that adds a floating button
    const widgetScript = `
      <script>
        (function() {
          function initWidget() {
            if (document.getElementById("algoreit-demo-btn")) return;
            console.log("AlgoreitAI Demo Widget Initializing...");

            const supplierHost = ${JSON.stringify(urlObj.hostname)};
            const supplierLabel = (function () {
              const host = (supplierHost || "").toLowerCase().replace(/^www\\./, "");
              const base = host.split(".")[0] || "Supplier";
              return base
                .split(/[^a-z0-9]+/i)
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join("") + "AI";
            })();
            const BUTTON_LABEL = supplierLabel;
            const BUTTON_HTML = "<span class=\\"algoreit-emoji\\">✨</span><span>" + supplierLabel + "</span>";
            const SUPPLIER_HOST = ${JSON.stringify(urlObj.hostname)};
            const SUPPLIER_ORIGIN = ${JSON.stringify(origin)};
            const SUPPLIER_BASE = ${JSON.stringify(finalUrl)};
            
            // Inject button styles
            const style = document.createElement("style");
            style.textContent = [
              ":root {",
              "  --color-border-subtle: #e0e0ea;",
              "  --color-text-main: #111827;",
              "}",
              ".op-btn {",
              "  position: relative;",
              "  display: inline-flex;",
              "  align-items: center;",
              "  justify-content: center;",
              "  padding: 8px 18px;",
              "  border-radius: 999px;",
              "  border: 1px solid var(--color-border-subtle);",
              "  background: #ffffff;",
              "  color: var(--color-text-main);",
              "  font-size: 14px;",
              "  font-weight: 500;",
              "  cursor: pointer !important;",
              "  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease, border-color 0.15s ease;",
              "  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
              "  pointer-events: auto !important;",
              "  z-index: 2147483647 !important;",
              "  box-sizing: border-box;",
              "  line-height: 1.5;",
              "  text-decoration: none;",
              "}",
              ".op-btn:hover {",
              "  background: #f9fafb;",
              "  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);",
              "}",
              ".op-btn:active {",
              "  transform: translateY(1px);",
              "  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);",
              "}",
              ".op-btn-gemini {",
              "  background: linear-gradient(135deg, #4285f4, #34a853, #fbbc04, #ea4335);",
              "  color: #ffffff;",
              "  border-color: transparent;",
              "  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);",
              "  font-weight: 600;",
              "  direction: ltr;",
              "  unicode-bidi: isolate;",
              "  flex-direction: row;",
              "}",
              ".op-btn-gemini:hover {",
              "  background: linear-gradient(135deg, #3367d6, #2d8e47, #f9ab00, #d33b2c);",
              "  box-shadow: 0 6px 16px rgba(66, 133, 244, 0.4);",
              "}",
              ".algoreit-emoji {",
              "  display: inline-flex;",
              "  align-items: center;",
              "  margin-right: 6px;",
              "}",
              "#algoreit-demo-btn {",
              "  position: fixed !important;",
              "  bottom: 15px !important;",
              "  right: 20px !important;",
              "}",
            ].join("\\n");
            document.head.appendChild(style);

            // Create Button
            const btn = document.createElement("button");
            btn.className = "op-btn op-btn-gemini";
            btn.id = "algoreit-demo-btn";
            btn.innerHTML = BUTTON_HTML;
            btn.setAttribute("aria-label", "AlgoreitAI");
            btn.style.position = "fixed";
            // Keep it low-right and enforce against host styles
            btn.style.setProperty("bottom", "15px", "important");
            btn.style.setProperty("right", "20px", "important");
            btn.style.zIndex = "2147483647"; 
            btn.style.cursor = "pointer";
            btn.style.height = "auto";
            btn.style.width = "auto";

            function setupProxyNavigation() {
              if (!SUPPLIER_HOST) return;
              const isSafeHref = (href) => {
                if (!href) return false;
                const lowered = href.toLowerCase();
                return !(
                  lowered.startsWith("javascript:") ||
                  lowered.startsWith("mailto:") ||
                  lowered.startsWith("tel:")
                );
              };

              const toProxyUrl = (targetUrl) =>
                "/api/demo-proxy?url=" +
                encodeURIComponent(targetUrl) +
                "&t=" +
                Date.now();

              const normalizeHost = (host) =>
                (host || "").toLowerCase().replace(/^www\./, "");

              const isSupplierHost = (host) =>
                normalizeHost(host) === normalizeHost(SUPPLIER_HOST);

              const resolveSupplierUrl = (rawUrl) => {
                if (!rawUrl) return null;
                const lowered = rawUrl.toLowerCase();
                let resolved;
                try {
                  if (lowered.startsWith("http://") || lowered.startsWith("https://")) {
                    resolved = new URL(rawUrl);
                  } else if (lowered.startsWith("//")) {
                    resolved = new URL(new URL(SUPPLIER_BASE).protocol + rawUrl);
                  } else if (rawUrl.startsWith("/")) {
                    resolved = new URL(rawUrl, SUPPLIER_ORIGIN);
                  } else {
                    resolved = new URL(rawUrl, SUPPLIER_BASE);
                  }
                } catch (e) {
                  return null;
                }
                if (!isSupplierHost(resolved.hostname)) return null;
                return resolved.toString();
              };

              const rewriteSupplierUrl = (rawUrl) => {
                const supplierUrl = resolveSupplierUrl(rawUrl);
                return supplierUrl ? toProxyUrl(supplierUrl) : null;
              };

              document.addEventListener(
                "click",
                (event) => {
                  const anchor = event.target.closest && event.target.closest("a");
                  if (!anchor) return;
                  const href = anchor.getAttribute("href");
                  if (!isSafeHref(href)) return;

                  const proxyUrl = rewriteSupplierUrl(href);
                  if (!proxyUrl) return;
                  event.preventDefault();
                  const target = anchor.getAttribute("target");
                  if (target && target !== "_self") {
                    window.open(proxyUrl, target);
                  } else {
                    window.location.href = proxyUrl;
                  }
                },
                true
              );

              document.addEventListener(
                "submit",
                (event) => {
                  const form = event.target;
                  if (!form || !form.action) return;
                  const proxyUrl = rewriteSupplierUrl(form.action);
                  if (!proxyUrl) return;
                  event.preventDefault();

                  const method = (form.method || "get").toLowerCase();
                  if (method === "get") {
                    const formData = new FormData(form);
                    const params = new URLSearchParams(formData);
                    const joined = proxyUrl + "&" + params.toString();
                    window.location.href = joined;
                  } else {
                    // For non-GET, keep demo context without posting data
                    window.location.href = proxyUrl;
                  }
                },
                true
              );

              // Rewrite programmatic navigations
              const originalOpen = window.open;
              window.open = function (url, target, features) {
                const proxyUrl = rewriteSupplierUrl(url);
                return originalOpen.call(window, proxyUrl || url, target, features);
              };

              const originalAssign = window.location.assign.bind(window.location);
              window.location.assign = function (url) {
                const proxyUrl = rewriteSupplierUrl(url);
                return originalAssign(proxyUrl || url);
              };

              const originalReplace = window.location.replace.bind(window.location);
              window.location.replace = function (url) {
                const proxyUrl = rewriteSupplierUrl(url);
                return originalReplace(proxyUrl || url);
              };

              const originalPushState = history.pushState.bind(history);
              history.pushState = function (state, title, url) {
                const proxyUrl = rewriteSupplierUrl(url);
                return originalPushState(state, title, proxyUrl || url);
              };

              const originalReplaceState = history.replaceState.bind(history);
              history.replaceState = function (state, title, url) {
                const proxyUrl = rewriteSupplierUrl(url);
                return originalReplaceState(state, title, proxyUrl || url);
              };
            }
            // Create Modal Overlay
            const modal = document.createElement("div");
            modal.style.position = "fixed";
            modal.style.top = "0";
            modal.style.left = "0";
            modal.style.width = "100vw";
            modal.style.height = "100vh";
            modal.style.backgroundColor = "rgba(0,0,0,0.5)";
            modal.style.zIndex = "2147483646";
            modal.style.display = "none";
            modal.style.justifyContent = "center";
            modal.style.alignItems = "center";
            modal.style.backdropFilter = "blur(5px)";
            
            // Iframe Container
            const container = document.createElement("div");
            container.style.width = "90%";
            container.style.height = "90%";
            container.style.maxWidth = "1200px";
            container.style.backgroundColor = "white";
            container.style.borderRadius = "12px";
            container.style.overflow = "hidden";
            container.style.position = "relative";
            container.style.boxShadow = "0 20px 50px rgba(0,0,0,0.3)";
            
            const closeBtn = document.createElement("button");
            closeBtn.innerHTML = "×";
            closeBtn.style.position = "absolute";
            closeBtn.style.top = "10px";
            closeBtn.style.right = "10px";
            closeBtn.style.background = "white";
            closeBtn.style.border = "none";
            closeBtn.style.fontSize = "24px";
            closeBtn.style.cursor = "pointer";
            closeBtn.style.width = "40px";
            closeBtn.style.height = "40px";
            closeBtn.style.borderRadius = "50%";
            closeBtn.style.zIndex = "2147483647";
            
            closeBtn.onclick = (e) => {
               e.preventDefault();
               e.stopPropagation();
               modal.style.display = "none";
            };

            const iframe = document.createElement("iframe");
            iframe.src = "http://localhost:4000/index.html?mode=embed&supplierHost=${supplierHostParam}"; 
            iframe.allow = "camera; microphone; clipboard-write";
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            
            container.appendChild(closeBtn);
            container.appendChild(iframe);
            modal.appendChild(container);
            
            document.body.appendChild(btn);
            document.body.appendChild(modal);
            
            btn.addEventListener("click", (e) => {
              console.log("AlgoreitAI Button Clicked");
              e.preventDefault();
              e.stopPropagation();
              modal.style.display = "flex";
            }, true);

            setupProxyNavigation();
            // Anti-Overlay Check: Ensure nothing covers our button
            setInterval(() => {
                const rect = btn.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                const el = document.elementFromPoint(x, y);
                
                if (el && el !== btn && !btn.contains(el) && el !== modal && !modal.contains(el)) {
                    console.warn("AlgoreitAI Button is covered by:", el);
                    // Aggressive fix: make the covering element click-through
                    try {
                        el.style.pointerEvents = "none";
                    } catch(e) {}
                }
            }, 2500);
          }

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initWidget);
          } else {
            initWidget();
          }
        })();
      </script>
    `;

    // Inject before head close for earlier parsing, or body close if head missing
    if (modifiedHtml.includes("</head>")) {
        modifiedHtml = modifiedHtml.replace("</head>", `${widgetScript}</head>`);
    } else {
        modifiedHtml = modifiedHtml.replace("</body>", `${widgetScript}</body>`);
    }

    res.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.send(modifiedHtml);

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).send(`Failed to proxy website: ${error.message}`);
  }
});

app.use(express.static(path.join(__dirname, "..")));

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Virtual Renovations backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
