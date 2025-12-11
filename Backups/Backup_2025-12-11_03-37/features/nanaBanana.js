// Independent feature: AlgoreitAI Photo Processing
// - Sends photos to AlgoreitAI (Gemini) API for AI-powered image generation
// - Works with the last room photo viewed (similar to Enhance Quality)
// - Allows user to provide custom instructions or uses style/renovation presets
// - Updates gallery and triggers download of processed image
// - Uses Google Imagen 3 for image-to-image transformations

(function () {
  const BACKEND_URL = "";

  function initGeminiAI() {
    const button = document.querySelector('[data-role="gemini-ai"]');
    if (!button) {
      console.warn(
        "[GeminiAI] Button not found; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", async () => {
      await handleGeminiProcess();
    });
  }

  window.initGeminiAI = initGeminiAI;

  async function handleGeminiProcess() {
    const button = document.querySelector('[data-role="gemini-ai"]');
    const matches = Array.isArray(window.currentPhotoMatches)
      ? window.currentPhotoMatches
      : [];
    const last = window.lastFocusedRoomPhoto || null;

    // Validate that we have photos
    if (!matches.length) {
      alert(
        "There are no uploaded photos to process. Use 'Upload Photos' first."
      );
      return;
    }

    // Validate that user has selected a room/photo
    if (!last || !last.photoId) {
      alert(
        "AlgoreitAI works on the last room photo you viewed. First click 'Room', choose a room, then try again."
      );
      return;
    }

    // Find the photo to process
    const match =
      matches.find((m) => m.id === last.photoId) || {
        id: last.photoId,
        url: last.url,
        originalName: last.originalName || "",
        assignedName: last.assignedName || "",
      };

    // Prompt user for instructions
    const instructions = await promptForInstructions();
    if (!instructions) {
      return; // User cancelled
    }

    // Disable button and show processing state
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Processing with AlgoreitAI...";

    try {
      // Convert photo URL to data URL
      const imageDataUrl = await convertToDataUrl(match.url);

      // Get metadata from current context
      const meta = buildMetadata();

      // Send to backend
      const response = await fetch(`${BACKEND_URL}/api/gemini/process-photo`, {
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
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const processedImageUrl = result.imageDataUrl;

      if (!processedImageUrl) {
        throw new Error("No processed image received from AlgoreitAI");
      }

      // Update the photo in the gallery
      if (typeof window.updatePhotoUrlForGallery === "function") {
        window.updatePhotoUrlForGallery(match.id, processedImageUrl);
      }

      // Update overlay if this photo is currently displayed
      updateOverlayIfActive(match.url, processedImageUrl);

      // Trigger download
      const downloadName = buildProcessedFileName(match);
      triggerDownload(processedImageUrl, downloadName);

      alert(
        "✓ Photo processed successfully by AlgoreitAI!\n\n" +
        "The processed image has been updated in the gallery and downloaded. " +
        "Save it to the 'Enhanched_Photos' folder."
      );
    } catch (error) {
      console.error("[GeminiAI] Processing failed", error);
      alert(
        "Failed to process photo with AlgoreitAI.\n\n" +
        "Error: " + error.message + "\n\n" +
        "Please check:\n" +
        "- Backend server is running (http://localhost:4000)\n" +
        "- GOOGLE_GEMINI_API_KEY is configured in backend/.env\n" +
        "- Your AlgoreitAI API key is valid (get one at https://ai.google.dev/)"
      );
    } finally {
      button.disabled = false;
      button.textContent = originalText;
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

  function buildInstructionsFromSelections(styleId, renovationId) {
    const styleText = styleId ? styleId.replace(/_/g, " ") : "modern";
    let renovationText = "";

    switch (renovationId) {
      case "wood_floor":
        renovationText =
          "Replace the existing floor with high-quality modern wooden flooring";
        break;
      case "carpet":
        renovationText =
          "Replace the existing floor with a stylish carpet that fits the aesthetic";
        break;
      case "tiles":
        renovationText =
          "Replace the existing floor with modern tiles";
        break;
      case "paint":
        renovationText =
          "Repaint the walls with colors that match the style";
        break;
      case "kitchen":
        renovationText =
          "Renovate the kitchen finishes and cabinetry";
        break;
      case "bathroom":
        renovationText =
          "Renovate the bathroom finishes, tiles and fixtures";
        break;
      default:
        renovationText =
          "Apply a comprehensive renovation updating materials and finishes";
    }

    return `Transform this room in a ${styleText} interior design style. ${renovationText}. Keep the overall camera angle, room layout, and composition; update only the materials, finishes, and decorative elements to match the ${styleText} aesthetic.`;
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

  async function convertToDataUrl(url) {
    // If already a data URL, return as-is
    if (url.startsWith("data:")) {
      return url;
    }

    // Fetch blob and convert to data URL
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function updateOverlayIfActive(originalUrl, newUrl) {
    const overlay = document.getElementById("room-photo-overlay");
    if (!overlay) return;

    const currentHref =
      overlay.getAttribute("href") || overlay.getAttribute("xlink:href");

    if (currentHref === originalUrl) {
      overlay.setAttribute("href", newUrl);
      overlay.setAttributeNS("http://www.w3.org/1999/xlink", "href", newUrl);
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
})();

