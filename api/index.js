require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const geminiClient = require("./geminiClient");

const app = express();
const PORT = process.env.PORT || 4000;

const openai =
  process.env.OPENAI_API_KEY && new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(
  cors({
    origin: true, // allows file:// and http://localhost origins
    credentials: false,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.get("/api/auth-config", (req, res) => {
  res.json({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE || process.env.CLERK_PUBLISHABLE_KEY,
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

  // AlgoreitAI endpoints

// Process a photo (image generation)
app.post("/api/gemini/process-photo", async (req, res) => {
  const { imageDataUrl, instructions, meta } = req.body || {};

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
    const scrubbedDetails = rawDetails
      .replace(/Google\s*Gemini/gi, "AlgoreitAI")
      .replace(/Gemini/gi, "AlgoreitAI")
      .replace(/Google\s*/gi, "");
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
    const scrubbedDetails = rawDetails
      .replace(/Google\s*Gemini/gi, "AlgoreitAI")
      .replace(/Gemini/gi, "AlgoreitAI")
      .replace(/Google\s*/gi, "");
    res.status(502).json({
      error: "Failed to analyze photo with AlgoreitAI",
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

