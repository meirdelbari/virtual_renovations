/**
 * Google Gemini API Client
 * 
 * This module handles communication with Google's Gemini API for image generation and editing.
 * Uses Imagen 3 for image-to-image transformations.
 * 
 * Configuration via environment variables:
 * - GOOGLE_GEMINI_API_KEY: Your Google AI Studio API key
 * 
 * Documentation: https://ai.google.dev/gemini-api/docs/image-generation
 */

const https = require("https");

const API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const BASE_URL = "generativelanguage.googleapis.com";
const REQUEST_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Generate or edit an image using Google Gemini "Nano Banana" (Gemini 2.5 Flash Image)
 * 
 * @param {Object} options
 * @param {string} options.imageBase64 - Base64-encoded image data (without data URL prefix)
 * @param {string} options.instructions - Processing instructions/prompt
 * @param {Object} options.meta - Optional metadata
 * @returns {Promise<Object>} - { imageBase64: string }
 */
async function processImageWithGemini({ imageBase64, instructions, meta = {}, model = null }) {
  if (!API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  if (!imageBase64 || !instructions) {
    throw new Error("imageBase64 and instructions are required");
  }

  // Default to Nano Banana Pro (Gemini 3.0 Pro Image) unless overridden
  const modelId = model || "gemini-3.0-pro-image"; 
  
  // Correct payload format for Image Editing (Text + Image -> Image)
  const payload = {
    contents: [
      {
        parts: [
          { text: instructions },
          {
            inline_data: {
              mime_type: "image/png", // Assuming PNG, but works for JPEG too usually
              data: imageBase64
            }
          }
        ]
      }
    ]
  };

  // Correct endpoint path
  const path = `/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;

  try {
    const response = await makeRequest({
      hostname: BASE_URL,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeout: REQUEST_TIMEOUT_MS,
    });

    // Handle response to extract the generated image
    // The response format should contain 'inlineData' in the parts
    
    if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts) {
      console.error("Unexpected Gemini response structure:", JSON.stringify(response, null, 2));
      throw new Error("Invalid response from Gemini API");
    }

    const parts = response.candidates[0].content.parts;
    
    // Look for the image part
    const imagePart = parts.find(p => p.inline_data || p.inlineData);
    
    if (!imagePart) {
      // Sometimes it might refuse and return only text (e.g. safety refusal)
      const textPart = parts.find(p => p.text);
      if (textPart) {
        throw new Error(`Gemini refused to generate image: ${textPart.text}`);
      }
      throw new Error("Gemini did not return an image or text explanation");
    }

    const generatedImageBase64 = imagePart.inline_data ? imagePart.inline_data.data : imagePart.inlineData.data;

    return {
      imageBase64: generatedImageBase64,
    };
  } catch (error) {
    console.error("[Gemini] API request failed:", error.message);
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

/**
 * Generate an image from text using Google Imagen 3 (via Gemini API)
 * 
 * @param {Object} options
 * @param {string} options.prompt - Text description of image to generate
 * @returns {Promise<Object>} - { imageBase64: string }
 */
async function generateImageFromText({ prompt }) {
  if (!API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  if (!prompt) {
    throw new Error("prompt is required");
  }

  // Use Gemini 3.0 Pro Image (Nano Banana Pro) for generation
  const modelId = "gemini-3.0-pro-image";
  const path = `/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    // Ensure we request image/media generation if required by specific API shape,
    // but standard generateContent with text prompt on an image model often defaults to generation.
    // If specific parameters are needed for generation vs text, they go here.
    // For Gemini 3 Pro Image, it often works like the editing endpoint but without input image.
  };

  try {
    const response = await makeRequest({
      hostname: BASE_URL,
      path,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (response.error) {
       throw new Error(response.error.message || JSON.stringify(response.error));
    }
    
    // Extract image from response (similar to processImageWithGemini)
    if (!response.candidates || !response.candidates[0] || !response.candidates[0].content || !response.candidates[0].content.parts) {
       throw new Error("Invalid response from Gemini API");
    }

    const parts = response.candidates[0].content.parts;
    const imagePart = parts.find(p => p.inline_data || p.inlineData);

    if (!imagePart) {
        // Fallback for safety/refusal
        const textPart = parts.find(p => p.text);
        if (textPart) throw new Error(`Gemini refused generation: ${textPart.text}`);
        throw new Error("Gemini did not return an image");
    }

    const generatedImageBase64 = imagePart.inline_data ? imagePart.inline_data.data : imagePart.inlineData.data;
    return { imageBase64: generatedImageBase64 };

  } catch (error) {
     console.warn("[Gemini 3 Pro] Generation request failed:", error.message);
     return { imageBase64: null, error: error.message }; 
  }
}

/**
 * Use Gemini vision + text generation for image analysis
 * This uses the correct Gemini API format
 */
async function analyzeImageWithGemini({ imageBase64, instructions }) {
  if (!API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
  }

  // Use gemini-2.0-flash-exp or gemini-1.5-flash for vision
  // Correct API format based on official documentation
  const payload = {
    contents: [
      {
        parts: [
          {
            text: instructions
          },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: imageBase64
            }
          }
        ]
      }
    ]
  };

  // Correct endpoint path
  const path = `/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`;

  try {
    const response = await makeRequest({
      hostname: BASE_URL,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      timeout: REQUEST_TIMEOUT_MS,
    });

    // Extract text response
    if (!response.candidates || !response.candidates[0]) {
      throw new Error("No response from Gemini");
    }

    const textContent = response.candidates[0].content.parts[0].text;

    return {
      analysis: textContent,
    };
  } catch (error) {
    console.error("[Gemini] Vision API request failed:", error.message);
    throw new Error(`Gemini Vision API error: ${error.message}`);
  }
}

/**
 * Generic HTTPS request helper
 */
function makeRequest({ hostname, path, method, headers, body, timeout }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
      timeout,
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            // Handle Gemini API error format
            const errorMsg = parsed.error?.message || parsed.error || `HTTP ${res.statusCode}`;
            reject(new Error(errorMsg));
          }
        } catch (parseError) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ raw: data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Validate Gemini configuration
 */
function checkConfiguration() {
  return {
    configured: !!API_KEY,
    provider: "Google Gemini",
    models: {
      imageGeneration: "gemini-3.0-pro-image",
      vision: "gemini-2.0-flash-exp",
    },
  };
}

module.exports = {
  processImageWithGemini,
  analyzeImageWithGemini,
  generateImageFromText,
  checkConfiguration,
};

