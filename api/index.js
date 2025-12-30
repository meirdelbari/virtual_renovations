require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const geminiClient = require("./geminiClient");
const paymentService = require("./paymentService");

const supplierRoutes = require("./supplierRoutes");

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
  if (userId) {
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
      // Fallback: If credit check fails due to system error, maybe block or allow?
      // Blocking for safety.
      return res.status(500).json({ error: "Failed to verify credits." });
    }
  } else {
    // strict mode: require user ID
    // return res.status(401).json({ error: "User not authenticated" });
    console.warn("Processing without userId - bypassing credit check (Legacy/Dev mode)");
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

    // Send to provider
    const result = await geminiClient.processImageWithGemini({
      imageBase64,
      instructions,
      meta: meta || {},
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
  if (userId) {
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
    let provider = "AlgoreitAI (Imagen 3)";

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
app.use(express.static(path.join(__dirname, "..")));

// For local development
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Virtual Renovations backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
