// Independent feature: AlgoreitAI Photo Processing
// - Sends photos to AlgoreitAI (Gemini) API for AI-powered image generation
// - Works with the last room photo viewed (similar to Enhance Quality)
// - Allows user to provide custom instructions or uses style/renovation presets
// - Updates gallery and triggers download of processed image
// - Uses Google Imagen 3 for image-to-image transformations

(function () {
  // API base helper:
  // - When opened via file://, relative "/api/..." becomes "file:///api/..." and fails.
  // - The backend serves both UI and API locally on http://localhost:4000
  function getApiUrl(path) {
    if (typeof window.getApiUrl === "function") {
      return window.getApiUrl(path);
    }
    const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
    const p = String(path || "");
    return base + (p.startsWith("/") ? p : "/" + p);
  }
  const RENOVATION_TASKS = {
    // Room - Floor
    "room_floor_hardwood": "Replace the main room flooring with premium hardwood planks",
    "room_floor_laminate": "Replace the main room flooring with durable laminate boards",
    "room_floor_ceramics": "Install ceramic tile flooring throughout the main room",
    "room_floor_tiles": "Install large-format porcelain tiles across the main room floor",
    "room_floor_vinyl": "Install water-resistant vinyl flooring throughout the room",
    "room_floor_carpet": "Install plush wall-to-wall carpet across the room",
    // Room - Other elements
    "room_walls_painting": "Repaint all walls in the main room",
    "room_ceiling_painting": "Repaint the entire ceiling in the main room",
    "room_windows_painting": "Repaint the interior window frames in the room",
    "room_windows_aluminum": "Replace the room's window frames with slim aluminum frames",
    "room_doors_painting": "Repaint the interior doors in the room",
    "room_doors_replace": "Replace the existing interior doors with new ones",
    "room_lighting_add": "Add supplemental ceiling or wall lighting fixtures",
    "room_lighting_replace": "Replace the existing lighting fixtures with new ones",
    "room_frameheads_painting": "Repaint the door and window frameheads",
    "room_frameheads_replace": "Replace the door and window frameheads with new trim",
    // Bathroom
    "bathroom_floor_ceramics": "Install ceramic tile flooring across the bathroom",
    "bathroom_floor_tiles": "Install large-format porcelain floor tiles in the bathroom",
    "bathroom_floor_vinyl": "Install waterproof vinyl flooring throughout the bathroom",
    "bathroom_floor_hardwood": "Install sealed hardwood planks on the bathroom floor",
    "bathroom_floor_laminate": "Install water-resistant laminate flooring in the bathroom",
    "bathroom_walls_painting": "Repaint the bathroom walls",
    "bathroom_walls_tiles": "Retile the bathroom walls",
    "bathroom_ceiling_painting": "Repaint the bathroom ceiling",
    "bathroom_sink_replace": "Replace the bathroom sink/vanity with a new one",
    "bathroom_bath_replace": "Replace the bathtub with a new design",
    "bathroom_toilet_replace": "Replace the toilet with a new fixture",
    "bathroom_windows_painting": "Repaint the bathroom window frames",
    "bathroom_windows_aluminum": "Replace bathroom windows with aluminum-frame units",
    "bathroom_door_painting": "Repaint the bathroom door",
    "bathroom_door_replace": "Replace the bathroom door with a new one",
    // Kitchen
    "kitchen_cabinets_painting": "Repaint all visible kitchen cabinet fronts",
    "kitchen_cabinets_replace": "Replace the kitchen cabinet fronts with new ones",
    "kitchen_countertop_replace": "Replace the kitchen countertop with a new surface",
    "kitchen_backsplash_replace": "Replace the kitchen backsplash with new materials",
    "kitchen_floor_ceramics": "Install ceramic tile flooring across the kitchen",
    "kitchen_floor_tiles": "Install large-format porcelain tiles throughout the kitchen floor",
    "kitchen_floor_vinyl": "Install resilient vinyl flooring in the kitchen",
    "kitchen_floor_hardwood": "Install hardwood planks across the kitchen floor",
    "kitchen_floor_laminate": "Install laminate flooring across the kitchen",
    "kitchen_walls_painting": "Repaint the kitchen walls",
    "kitchen_ceiling_painting": "Repaint the kitchen ceiling",
    // Exterior
    "exterior_walls_painting": "Repaint the exterior walls",
    "exterior_windows_painting": "Repaint the exterior window frames",
    "exterior_windows_replace": "Replace the exterior windows with new modern frames",
    "exterior_doors_painting": "Repaint the exterior doors",
    "exterior_doors_replace": "Replace the exterior doors with new secure ones",
    "exterior_roof_painting": "Repaint the roof",
    "exterior_roof_replace": "Replace the roof shingles or tiles",
    "exterior_garden_clear": "Remove all gardening and show bare land",
    "exterior_garden_gardening": "Landscape the garden with new plants and features",
    "exterior_structure_replace": "Renovate the exterior structure",

    // Furniture
    "furniture_clear_remove": "Remove all furniture and decor from the room, revealing the empty floor and walls",
    "furniture_stage_room": "Virtually stage the room with furniture and decor matching the selected style",
    // Legacy/simple options
    "wood_floor": "Replace the flooring with high-quality wood planks",
    "carpet": "Replace the flooring with wall-to-wall carpeting",
    "tiles": "Replace the flooring with high-quality tiles",
    "paint": "Repaint the walls",
    "kitchen": "Renovate the kitchen finishes and fixtures",
    "bathroom": "Renovate the bathroom finishes and fixtures",
  };

  function initGeminiAI() {
    const button = document.querySelector('[data-role="gemini-ai"]');
    const tweakButton = document.querySelector('[data-role="gemini-tweak"]');
    if (!button) {
      console.warn(
        "[GeminiAI] Button not found; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", async () => {
      await handleGeminiProcess();
    });

    if (tweakButton) {
      tweakButton.addEventListener("click", async () => {
        window.customPromptPending = true;
        const quickInstructions = await promptForTweak();
        if (!quickInstructions) return;
        await handleGeminiProcess(quickInstructions);
      });
    }
  }

  window.initGeminiAI = initGeminiAI;

  // Public method to process with Gemini using specific instructions
  // bypassing the modal dialog
  window.processWithGemini = async function(customInstructions) {
    console.log("[GeminiAI] processWithGemini called with:", customInstructions);
    await handleGeminiProcess(customInstructions);
  };

  function isPhotoRelated(instructions) {
    if (!instructions || typeof instructions !== "string") return false;
    const text = instructions.toLowerCase();
    const keywords = [
      "photo",
      "room",
      "image",
      "picture",
      "wall",
      "floor",
      "ceiling",
      "kitchen",
      "bath",
      "garden",
      "exterior",
      "interior",
      "counter",
      "furniture",
      "window",
      "door"
    ];
    return keywords.some((word) => text.includes(word));
  }

  async function handleGeminiProcess(customInstructions = null) {
    console.log("[GeminiAI] handleGeminiProcess started. Custom instructions:", customInstructions);
    const button = document.querySelector('[data-role="gemini-ai"]');
    const isCustomDirect = !!customInstructions;
    
    // Ensure we have the latest matches
    const matches = Array.isArray(window.currentPhotoMatches)
      ? window.currentPhotoMatches
      : [];
    
    console.log("[GeminiAI] Current matches:", matches.length);

    // If no last focused room, try to find the first one if only one exists
    let last = window.lastFocusedRoomPhoto || null;
    
    // Auto-select if only one match and nothing focused
    if (!last && matches.length === 1) {
       last = { 
         photoId: matches[0].id, 
         url: matches[0].url,
         roomId: matches[0].roomId,
         originalName: matches[0].originalName
       };
       console.log("[GeminiAI] Auto-selected single match:", last);
    } else if (last) {
        console.log("[GeminiAI] Using last focused photo:", last);
    } else {
        console.log("[GeminiAI] No photo selected.");
    }

    // Validate that we have photos OR a selected photo context
    // We allow proceeding if 'last' is valid, even if matches list seems empty (fallback for edge cases)
    if (!matches.length && (!last || !last.url)) {
      alert(
        "There are no uploaded photos to process. Use 'Upload Photos' first."
      );
      return;
    }

    // Validate that user has selected a room/photo
    if (!last || !last.photoId) {
      alert(
        "Please select a room first by clicking the 'Room' button and choosing a photo to renovate."
      );
      return;
    }

    // Find the photo to process
    const match =
      matches.find((m) => m.id === last.photoId) || {
        id: last.photoId,
        roomId: last.roomId,
        url: last.url,
        originalName: last.originalName || "",
        assignedName: last.assignedName || "",
      };
    
    console.log("[GeminiAI] Processing match:", match);

    let instructions = customInstructions;

    // If no custom instructions provided, try an automatic suggestion; if none, fall back to modal
    if (!instructions) {
      instructions = getSuggestedInstructions();
      if (instructions) {
        console.log("[GeminiAI] Using auto-suggested instructions (no modal).");
      } else {
        console.log("[GeminiAI] Prompting for instructions via modal...");
        instructions = await promptForInstructions();
        if (!instructions) {
          console.log("[GeminiAI] User cancelled modal.");
          return; // User cancelled
        }
      }
    }
    if (!isPhotoRelated(instructions)) {
      alert("Requests must describe a change to the current photo. Please update your instructions.");
      return;
    }

    // If this came from the Custom button, append strict guardrails to avoid unintended edits
    if (isCustomDirect) {
      instructions = `${instructions}

CRITICAL CONSTRAINTS:
1. Change ONLY what was requested in this prompt.
2. Preserve all other elements: furniture, flooring, ceiling, walls, windows, doors, landscape, lighting, camera angle, and perspective.
3. Do NOT add or remove objects beyond the requested change.
4. Keep lighting, shadows, and style consistent with the original photo.`;
    }
    
    console.log("[GeminiAI] Instructions prepared:", instructions);

    // Disable button and show processing state
    let thinkingIndicator = null;
    if (button) {
      button.disabled = true;
      var originalText = button.textContent;
      button.textContent = "Processing with AlgoreitAI...";
      thinkingIndicator = showGeminiThinkingIndicator(button);
    }

    try {
      // Optimize image for Vercel (Smart Compression)
      const imageDataUrl = await prepareImageForUpload(match.url);

      // Get metadata from current context
      const meta = buildMetadata();

      // Send to backend
      const response = await fetch(getApiUrl("/api/gemini/process-photo"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
          instructions,
          meta,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const mainError = errorData.error || `HTTP ${response.status}`;
        const details = errorData.details ? `\nDetails: ${errorData.details}` : "";
        
        // Handle specific Vercel/Server errors
        if (response.status === 504) {
             throw new Error("Server Timeout (504). The AI took too long to respond. Vercel limits requests to 10-60 seconds.");
        }
        if (response.status === 413) {
             throw new Error("File Too Large (413). The image is still too big for the server.");
        }
        
        throw new Error(`${mainError}${details}`);
      }

      const result = await response.json();
      const processedImageUrl = result.imageDataUrl;

      if (!processedImageUrl) {
        throw new Error("No processed image received from AlgoreitAI");
      }

      // Update the photo in the gallery
      // We ONLY do this if we are NOT in "No Floor Plan" mode (Option B), 
      // because in Option B we want to keep the raw photos row intact.
      const isOptionB = !!document.getElementById("photo-working-area");
      
      // STOP replacing the raw photo in the gallery for Option A. 
      // We now use the "Renovated Row" for both options.
      // if (!isOptionB && typeof window.updatePhotoUrlForGallery === "function") {
      //   window.updatePhotoUrlForGallery(match.id, processedImageUrl);
      // }
      
      // Add to the "Processed Photos" top row (For both Option A and Option B)
      let newItem = null;
      if (typeof window.addProcessedPhotoToGallery === "function") {
          newItem = window.addProcessedPhotoToGallery(
              match.id, 
              processedImageUrl, 
              window.currentStyleId, 
              window.currentRenovationId
          );
      }

      // CRITICAL FIX: Update the current focus to the NEW renovated photo.
      // This ensures that the next renovation request (e.g., "paint walls") 
      // is applied to THIS result, not the original raw photo.
      if (newItem) {
          window.lastFocusedRoomPhoto = {
              roomId: newItem.roomId,
              photoId: newItem.id,
              url: newItem.url,
              originalName: newItem.originalName
          };
          console.log("[GeminiAI] Updated focus to new renovated photo for chaining:", newItem.id);
      }

      // Update overlay if this photo is currently displayed
      updateOverlayIfActive(match.url, processedImageUrl, match.roomId);

      // Trigger download
      // const downloadName = buildProcessedFileName(match);
      // triggerDownload(processedImageUrl, downloadName);

      // Success feedback (No popup, just log)
      console.log("✓ Photo processed and gallery updated.");
    } catch (error) {
      console.error("[GeminiAI] Processing failed", error);
      
      const sanitizedMessage = String(error && error.message ? error.message : error)
        .replace(/Google\s*Gemini/gi, "AlgoreitAI")
        .replace(/Gemini/gi, "AlgoreitAI")
        .replace(/Google\s*/gi, "");

      const parts = [
        "AlgoreitAI refused to process this request:",
        sanitizedMessage
      ];
      alert(parts.join("\n"));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "✨ AlgoreitAI";
      }
      hideGeminiThinkingIndicator(thinkingIndicator);
    }
  }

  async function promptForInstructions() {
    // Get current style and renovation selections if available
    const currentStyle = window.currentStyleId || null;
    const currentRenovation = window.currentRenovationId || null;

    // Build suggested instructions based on selections
    let suggestion = "";
    if (currentStyle || currentRenovation) {
      suggestion = buildInstructionsFromSelections(currentStyle, currentRenovation);
    }

    // Create modal dialog for instructions
    return new Promise((resolve) => {
      const modal = createInstructionsModal(suggestion, (instructions) => {
        resolve(instructions);
      });
      document.body.appendChild(modal);
    });
  }

  async function promptForTweak() {
    return new Promise((resolve) => {
      const modal = createTweakModal((instructions) => {
        resolve(instructions);
      });
      document.body.appendChild(modal);
    });
  }

  function getSuggestedInstructions() {
    const currentStyle = window.currentStyleId || null;
    const currentRenovation = window.currentRenovationId || null;
    if (currentStyle || currentRenovation) {
      return buildInstructionsFromSelections(currentStyle, currentRenovation);
    }
    return null;
  }

  function createInstructionsModal(suggestion, callback) {
    const overlay = document.createElement("div");
    overlay.className = "gemini-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "gemini-modal";

    modal.innerHTML = `
      <div class="gemini-modal-header">
        <h2>AlgoreitAI Processing</h2>
        <button class="gemini-modal-close" type="button">&times;</button>
      </div>
      <div class="gemini-modal-body">
        <p class="gemini-modal-description">
          Describe what you want AlgoreitAI to do with this photo.
          Be specific about materials, colors, styles, or transformations.
        </p>
        <textarea
          class="gemini-instructions-input"
          placeholder="Example: Replace the floor with light oak hardwood, repaint walls in warm beige, and update lighting fixtures to modern brass style..."
          rows="6"
        >${suggestion}</textarea>
        <div class="gemini-modal-hint">
          ${suggestion ? "✓ Pre-filled based on your style and renovation selections." : "Tip: Use your Style and Renovate selections first for auto-suggestions."}
        </div>
      </div>
      <div class="gemini-modal-footer">
        <button class="gemini-btn-cancel" type="button">Cancel</button>
        <button class="gemini-btn-submit" type="button">Send to AlgoreitAI</button>
      </div>
    `;

    overlay.appendChild(modal);

    const textarea = modal.querySelector(".gemini-instructions-input");
    const submitBtn = modal.querySelector(".gemini-btn-submit");
    const cancelBtn = modal.querySelector(".gemini-btn-cancel");
    const closeBtn = modal.querySelector(".gemini-modal-close");

    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    submitBtn.addEventListener("click", () => {
      const instructions = textarea.value.trim();
      if (!instructions) {
        alert("Please provide instructions before submitting.");
        return;
      }
      cleanup();
      callback(instructions);
    });

    cancelBtn.addEventListener("click", () => {
      cleanup();
      callback(null);
    });

    closeBtn.addEventListener("click", () => {
      cleanup();
      callback(null);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        callback(null);
      }
    });

    // Focus textarea
    setTimeout(() => textarea.focus(), 100);

    return overlay;
  }

  function createTweakModal(callback) {
    const overlay = document.createElement("div");
    overlay.className = "gemini-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "gemini-modal";

    modal.innerHTML = `
      <div class="gemini-modal-header">
        <h2>Quick Tweak</h2>
        <button class="gemini-modal-close" type="button">&times;</button>
      </div>
      <div class="gemini-modal-body">
        <p class="gemini-modal-description">
          Tell AlgoreitAi what  would you like do with this photo.
        </p>
        <textarea
          class="gemini-instructions-input"
          placeholder="Tell AlgoreitAi what  would you like do..."
          rows="4"
        ></textarea>
        <div class="gemini-modal-hint">
          Keep it photo-specific (e.g., repaint walls, swap countertop).
        </div>
      </div>
      <div class="gemini-modal-footer">
        <button class="gemini-btn-cancel" type="button">Cancel</button>
        <button class="gemini-btn-submit" type="button">Send Tweak</button>
      </div>
    `;

    overlay.appendChild(modal);

    const textarea = modal.querySelector(".gemini-instructions-input");
    const submitBtn = modal.querySelector(".gemini-btn-submit");
    const cancelBtn = modal.querySelector(".gemini-btn-cancel");
    const closeBtn = modal.querySelector(".gemini-modal-close");

    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    submitBtn.addEventListener("click", () => {
      const instructions = textarea.value.trim();
      if (!instructions) {
        alert("Please tell AlgoreitAI what to change in this photo.");
        return;
      }
      if (!isPhotoRelated(instructions)) {
        alert("Requests must relate to the current photo. Please describe a change in this image.");
        return;
      }
      cleanup();
      callback(instructions);
    });

    cancelBtn.addEventListener("click", () => {
      cleanup();
      callback(null);
    });

    closeBtn.addEventListener("click", () => {
      cleanup();
      callback(null);
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        callback(null);
      }
    });

    setTimeout(() => textarea.focus(), 100);

    return overlay;
  }

  // Make helper publicly available for other modules
  window.buildGeminiInstructions = buildInstructionsFromSelections;

  function buildInstructionsFromSelections(styleId, renovationId) {
    console.log("[GeminiAI] Building instructions. Style:", styleId, "Renovation:", renovationId);
    
    const styleText = styleId ? styleId.replace(/_/g, " ") : "modern";
    const safeId = String(renovationId || "").trim().toLowerCase();
    const renovationText =
      RENOVATION_TASKS[safeId] ||
      `Apply a precise update to the ${safeId.replace(/_/g, " ")}`;

    // Special handling for furniture removal to avoid contradictory constraints
    if (safeId === "furniture_clear_remove") {
      return `You are an expert interior designer.
TASK: ${renovationText}.
STYLE DETAILS: Ensure the exposed floor and walls match the ORIGINAL room style and colors.
CRITICAL CONSTRAINTS:
1. Remove ALL furniture, rugs, and decor. The room should be empty.
2. Do NOT change the room layout, camera angle, or perspective.
3. Preserve existing windows, doors, and lighting fixtures.
4. Inpaint the floor and walls where furniture was removed to look natural and consistent with the original materials.
5. DO NOT apply any new design style; just reveal the original empty room.`;
    }

    // Special handling for furniture staging
    if (safeId === "furniture_stage_room") {
      // Attempt to infer room type from context if available, otherwise generic
      const last = window.lastFocusedRoomPhoto || {};
      const roomName = last.roomName || last.originalName || "this room";
      
      // Simple heuristic to guess room type if not explicit
      let roomTypeContext = "suitable for this type of room";
      const lowerName = roomName.toLowerCase();
      if (lowerName.includes("bedroom")) roomTypeContext = "as a bedroom (bed, nightstands, etc)";
      else if (lowerName.includes("living")) roomTypeContext = "as a living room (sofa, coffee table, rug)";
      else if (lowerName.includes("dining")) roomTypeContext = "as a dining room (table, chairs)";
      else if (lowerName.includes("kitchen")) roomTypeContext = "as a kitchen";
      else if (lowerName.includes("office") || lowerName.includes("study")) roomTypeContext = "as a home office (desk, chair)";

      return `You are an expert interior designer.
TASK: ${renovationText} (${roomTypeContext}).
STYLE DETAILS: Use furniture and decor that strictly follows the ${styleText} aesthetic.
CRITICAL CONSTRAINTS:
1. Place furniture realistically within the existing space, respecting perspective and scale.
2. Do NOT change the room layout, walls, floor, ceiling, or windows.
3. Only ADD furniture; do not remove structural elements.
4. Ensure lighting and shadows on the new furniture match the room's original lighting.`;
    }

    return `You are an expert interior designer specialized in renovation.
Task: ${renovationText} so it matches a ${styleText} design style.
Style Details: Ensure any new materials strictly follow the ${styleText} aesthetic (colors, textures, finishes).
Critical Constraints (STRICT ADHERENCE REQUIRED):
1. MODIFICATION SCOPE: Change ONLY the specific element mentioned in the Task (e.g., if task is "paint walls", DO NOT change the floor, ceiling, furniture, or windows).
2. PRESERVATION: ALL other elements (furniture, flooring, ceiling, lighting, windows, doors, decor, exterior landscape) must remain EXACTLY as they are in the original photo.
3. INTEGRITY: Do NOT change the room layout, camera angle, perspective, or structural lines.
4. LIGHTING: Maintain the exact original lighting, shadows, and time of day.
5. PHOTOREALISM: The result must look like a real photo of the same room with only the specified change.`;
  }

  function buildMetadata() {
    const ctx = window.currentFloorPlanContext || {};
    const last = window.lastFocusedRoomPhoto || {};

    return {
      floorPlanTitle: ctx.title || null,
      roomName: last.roomName || null,
      styleId: window.currentStyleId || null,
      renovationId: window.currentRenovationId || null,
    };
  }

  // --- Smart Compression Helper ---
  
  async function prepareImageForUpload(url) {
    try {
      // 1. Get the blob to check size
      const response = await fetch(url);
      const blob = await response.blob();
      const sizeMB = blob.size / (1024 * 1024);
      
      console.log(`[GeminiAI] Original image size: ${sizeMB.toFixed(2)} MB`);

      // Vercel Limit: 4.5MB Body Size.
      // Base64 overhead: ~33%.
      // Max safe binary size: ~3.2MB.
      // We set a safe threshold of 3MB to be sure.
      const MAX_SAFE_MB = 3.0;

      if (sizeMB <= MAX_SAFE_MB) {
          console.log("[GeminiAI] Image is within safe limits. Sending original.");
          return blobToDataUrl(blob);
      }

      console.log("[GeminiAI] Image too large. Optimizing...");
      return compressImage(blob);
    } catch (e) {
      console.warn("[GeminiAI] Optimization failed, falling back to original:", e);
      // Fallback
      return convertToDataUrl(url);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function compressImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        let width = img.width;
        let height = img.height;
        const MAX_DIMENSION = 2048; // Standard 2K resolution for Real Estate

        // Resize if needed
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
                height = Math.round((height * MAX_DIMENSION) / width);
                width = MAX_DIMENSION;
            } else {
                width = Math.round((width * MAX_DIMENSION) / height);
                height = MAX_DIMENSION;
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 85% quality
        // This usually reduces file size drastically (often < 1MB) without visible loss
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        
        // Log new size
        const head = "data:image/jpeg;base64,";
        const sizeInBytes = Math.round((dataUrl.length - head.length) * 3 / 4);
        console.log(`[GeminiAI] Optimized size: ${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`);
        
        resolve(dataUrl);
      };
      
      img.onerror = (err) => reject(new Error("Failed to load image for compression"));
      img.src = url;
    });
  }

  async function convertToDataUrl(url) {
    // If already a data URL, return as-is
    if (url.startsWith("data:")) {
      return url;
    }

    // Fetch blob and convert to data URL
    const response = await fetch(url);
    const blob = await response.blob();

    return blobToDataUrl(blob);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateOverlayIfActive(originalUrl, newUrl, roomId) {
    console.log("[GeminiAI] Updating overlay. RoomID:", roomId, "New URL:", newUrl);

    // 1. Try updating SVG overlay (JSON floor plan mode)
    const svgOverlay = document.getElementById("room-photo-overlay");
    if (svgOverlay) {
      const currentHref =
        svgOverlay.getAttribute("href") || svgOverlay.getAttribute("xlink:href");

      if (currentHref === originalUrl) {
        svgOverlay.setAttribute("href", newUrl);
        svgOverlay.setAttributeNS("http://www.w3.org/1999/xlink", "href", newUrl);
        console.log("[GeminiAI] Updated SVG overlay");
      }
    }

    // 2. Try updating HTML overlay (PDF/Image mode)
    // Use the roomId specific overlay if available
    let htmlOverlayImg = null;
    
    if (roomId !== undefined && roomId !== null) {
       const selector = `#room-photo-overlay-${roomId} img`;
       console.log("[GeminiAI] Looking for specific overlay:", selector);
       const specificOverlay = document.querySelector(selector);
       if (specificOverlay) {
           htmlOverlayImg = specificOverlay;
           console.log("[GeminiAI] Found specific overlay");
       } else {
           console.warn("[GeminiAI] Specific overlay not found");
       }
    }
    
    // Fallback to old generic ID just in case (legacy support)
    if (!htmlOverlayImg) {
        const genericOverlay = document.querySelector("#room-photo-html-overlay img");
        if (genericOverlay) {
            htmlOverlayImg = genericOverlay;
            console.log("[GeminiAI] Found legacy generic overlay");
        }
    }

    // Also try finding ANY overlay that matches the original URL?
    // This is robust if IDs are messed up
    if (!htmlOverlayImg) {
        const allOverlays = document.querySelectorAll('[id^="room-photo-overlay-"] img');
        for (const img of allOverlays) {
            if (img.src === originalUrl || img.src.endsWith(originalUrl)) { // .endsWith is risky with data URLs but good for blobs
                 htmlOverlayImg = img;
                 console.log("[GeminiAI] Found overlay by URL match");
                 break;
            }
        }
    }

    if (htmlOverlayImg) {
      // Force update the image src to the new renovated URL
      htmlOverlayImg.src = newUrl;
      
      // Also update the caption if possible
      const container = htmlOverlayImg.parentElement;
      const caption = container ? container.querySelector("div") : null;
      if (caption) {
        caption.textContent = "Renovated with AlgoreitAI (Drag to move)";
      }
      console.log("[GeminiAI] Successfully updated HTML overlay image source");
    } else {
        console.warn("[GeminiAI] No HTML overlay found to update");
    }
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || "gemini_processed.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function buildProcessedFileName(match) {
    const base =
      match.assignedName ||
      (typeof match.originalName === "string" && match.originalName
        ? match.originalName.replace(/\.[a-zA-Z0-9]+$/, "")
        : `photo_${match.id}`);

    // Remove extension if present
    const baseName = base.replace(/\.[a-zA-Z0-9]+$/, "");

    return `${baseName}_gemini_ai.jpg`;
  }

  function showGeminiThinkingIndicator(anchor) {
    const indicator = document.createElement("div");
    indicator.className = "gemini-thinking-indicator";
    indicator.innerHTML = `
      <div class="gemini-thinking-dots">
        <span class="gemini-thinking-dot"></span>
        <span class="gemini-thinking-dot"></span>
        <span class="gemini-thinking-dot"></span>
      </div>
      <span class="gemini-thinking-text">Processing…</span>
    `;

    document.body.appendChild(indicator);

    const rect = anchor ? anchor.getBoundingClientRect() : null;
    const positionIndicator = () => {
      if (rect) {
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const tentativeLeft = rect.left + scrollX;
        const maxLeft =
          scrollX + document.documentElement.clientWidth - indicator.offsetWidth - 20;
        indicator.style.top = `${rect.bottom + 12 + scrollY}px`;
        indicator.style.left = `${Math.max(scrollX + 20, Math.min(tentativeLeft, maxLeft))}px`;
      } else {
        indicator.style.bottom = "32px";
        indicator.style.left = "32px";
      }
    };

    positionIndicator();
    requestAnimationFrame(() => indicator.classList.add("is-visible"));
    return indicator;
  }

  function hideGeminiThinkingIndicator(indicator) {
    if (!indicator) return;
    indicator.classList.remove("is-visible");
    indicator.addEventListener(
      "transitionend",
      () => indicator.parentElement && indicator.parentElement.removeChild(indicator),
      { once: true }
    );
  }
})();




