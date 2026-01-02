// Independent feature: AlgoreitAI Photo Processing
// - Sends photos to AlgoreitAI (Gemini) API for AI-powered image generation
// - Works with the last room photo viewed (similar to Enhance Quality)
// - Allows user to provide custom instructions or uses style/renovation presets
// - Updates gallery and triggers download of processed image
// - Uses Google Imagen 3 for image-to-image transformations

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
    "enhance_quality": "Enhance the photo quality: improve clarity, sharpness, lighting, and color balance while preserving the original scene",
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

  // --- NEW: Update Working Area with Collage Preview ---
  window.updateWorkingAreaWithCollage = async function() {
    // 1. Get current photo context
    let url = window.lastFocusedRoomPhoto && window.lastFocusedRoomPhoto.url;

    // Fallback: Get from DOM if not in state
    const container = document.getElementById("photo-working-area");
    if (!container) return;
    const img = container.querySelector("img");
    
    // If state is missing but DOM has an image, use that
    if (!url && img && img.src && !img.src.startsWith("data:")) {
        url = img.src;
        console.log("[GeminiAI] State missing, using DOM URL for collage:", url);
    }
    
    if (!url) {
        console.warn("[GeminiAI] Cannot update working area: No photo URL found.");
        return; 
    }

    // 3. Check for product selection
    if (window.currentProductSelection && window.currentProductSelection.imageUrl) {
        console.log("[GeminiAI] Updating working area with Reference Product collage...");
        
        // Indicate loading
        const originalOpacity = img.style.opacity;
        img.style.opacity = "0.5";
        
        try {
            // Build collage
            const productUrl = window.currentProductSelection.imageUrl;
            const collageInfo = await buildRoomAndProductCollage(url, productUrl);
            
            if (collageInfo && collageInfo.dataUrl) {
                // Update Image
                img.src = collageInfo.dataUrl;
                
                // Optional: Update caption/title to indicate preview mode
                const caption = container.querySelector(".working-area-caption");
                if (caption) {
                    caption.textContent = "Reference Product Active (Preview Mode)";
                    caption.style.color = "#4285f4";
                    caption.style.fontWeight = "600";
                }

                // --- SHOW PRODUCT DETAILS PANEL ---
                let detailsPanel = container.querySelector(".product-details-panel");
                if (!detailsPanel) {
                    detailsPanel = document.createElement("div");
                    detailsPanel.className = "product-details-panel";
                    detailsPanel.style.marginTop = "12px";
                    detailsPanel.style.textAlign = "left";
                    detailsPanel.style.background = "#f9fafb";
                    detailsPanel.style.padding = "12px";
                    detailsPanel.style.borderRadius = "8px";
                    detailsPanel.style.fontSize = "14px";
                    detailsPanel.style.border = "1px solid #e5e7eb";
                    
                    if (caption) {
                         caption.parentNode.insertBefore(detailsPanel, caption.nextSibling);
                    } else {
                         container.appendChild(detailsPanel);
                    }
                }
                
                const p = window.currentProductSelection;
                detailsPanel.innerHTML = `
                    <div style="display: flex; gap: 12px; align-items: start;">
                        <img src="${p.imageUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #111827;">${escapeHtml(p.name)}</div>
                            <div style="margin-top: 2px;">
                                ${p.purchaseLink 
                                    ? `<a href="${p.purchaseLink}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; font-size: 13px; text-decoration: underline; font-weight: 500;">${escapeHtml(p.supplierName || 'Supplier')}</a>`
                                    : `<span style="color: #4b5563; font-size: 13px;">${escapeHtml(p.supplierName || 'Supplier')}</span>`
                                }
                            </div>
                            <div style="font-weight: 600; color: #4f46e5; margin-top: 4px;">$${p.price}</div>
                            ${p.description ? `<div style="color: #6b7280; font-size: 12px; margin-top: 4px; line-height: 1.4; border-top: 1px solid #eee; padding-top: 4px;">${escapeHtml(p.description)}</div>` : ''}
                        </div>
                    </div>
                `;
                detailsPanel.style.display = "block";

            } else {
                console.error("[GeminiAI] Collage generation returned null.");
            }
        } catch (e) {
            console.error("[GeminiAI] Failed to update working area with collage:", e);
        } finally {
            img.style.opacity = "1";
        }
    } else {
        // Revert to original if no product (and check we are not in 'renovated' view mode that might want to keep it)
        // Only revert if we are currently showing a data URL (likely the collage) 
        // and we have the original URL
        if (img.src !== url && img.src.startsWith("data:")) {
             // ... existing revert logic ...
             // BUT, if we just finished processing (handled below), we might want to keep the product panel visible 
             // if the resulting image is indeed the renovated one.
             
             // However, this block runs inside updateWorkingAreaWithCollage which is for PREVIEW.
             // The Post-Processing display logic is separate (in handleGeminiProcess).
             
            console.log("[GeminiAI] Reverting working area to original photo.");
            img.src = url;
             const caption = container.querySelector(".working-area-caption");
            if (caption) {
                caption.textContent = tr("upload.workingAreaReady", null, "Ready to Renovate");
                caption.style.color = "#6b7280";
                caption.style.fontWeight = "normal";
            }
            
            // Hide product panel if exists
            const detailsPanel = container.querySelector(".product-details-panel");
            if (detailsPanel) {
                detailsPanel.style.display = "none";
            }
        }
    }
  };

  function isPhotoRelated(instructions) {
    if (!instructions || typeof instructions !== "string") return false;
    const text = instructions.toLowerCase();
    
    // English keywords
    const keywords = [
      "photo", "room", "image", "picture", "wall", "floor", "ceiling", 
      "kitchen", "bath", "garden", "exterior", "interior", "counter", 
      "furniture", "window", "door", "table", "chair", "sofa", "bed", 
      "rug", "carpet", "paint", "color", "light", "design", "style",
      "remove", "add", "change", "replace"
    ];
    
    // Hebrew keywords (common renovation terms)
    const hebrewKeywords = [
        "חדר", "תמונה", "קיר", "רצפה", "תקרה", "מטבח", "אמבטיה", "גינה", 
        "חוץ", "פנים", "שיש", "ריהוט", "חלון", "דלת", "שולחן", "כיסא", "כורסה",
        "ספה", "מיטה", "שטיח", "צבע", "עיצוב", "סגנון", "להסיר", "להוסיף", 
        "לשנות", "להחליף", "תקטין", "תגדיל", "הזז", "שים", "תשים"
    ];

    return keywords.some((word) => text.includes(word)) || hebrewKeywords.some((word) => text.includes(word));
  }

  async function handleGeminiProcess(customInstructions = null) {
    console.log("[GeminiAI] handleGeminiProcess started. Custom instructions:", customInstructions);
    const button = document.querySelector('[data-role="gemini-ai"]');
    const isCustomDirect = !!customInstructions;
    const summaryEl = document.getElementById("selection-summary");
    const hideSummary = () => {
      if (summaryEl) summaryEl.classList.add("is-hidden");
    };
    const showSummary = () => {
      if (typeof window.renderSelectionSummary === "function") {
        window.renderSelectionSummary();
      } else if (summaryEl) {
        summaryEl.classList.remove("is-hidden");
      }
    };

    hideSummary();
    
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
        tr("alerts.noPhotosToProcess", null, "There are no uploaded photos to process. Use 'Upload Photos' first.")
      );
      showSummary();
      return;
    }

    // Validate that user has selected a room/photo
    // If no explicit 'last focused', but we have photos, default to the last uploaded one
    if (!last || !last.photoId) {
        if (matches.length > 0) {
            // Auto-select the most recent photo
            const recent = matches[matches.length - 1];
            last = { 
                photoId: recent.id, 
                url: recent.url,
                roomId: recent.roomId,
                originalName: recent.originalName
            };
            // Also ensure it is open in working area
            if (typeof window.openInWorkingArea === "function") {
                window.openInWorkingArea(recent.id);
            }
        } else {
            alert(
                tr("alerts.selectRoomFirst", null, "Please select a room first by clicking the 'Room' button and choosing a photo to renovate.")
            );
            showSummary();
            return;
        }
    }

    // NEW: Refresh 'match' from the latest state to ensure it points to the currently active photo in Working Area
    // The previous logic relied on 'matches.find' using last.photoId, which might be stale if the user
    // clicked a different photo in the gallery but didn't trigger a full focus event, or if chaining updates.
    // We explicitly re-fetch the photo object corresponding to window.lastFocusedRoomPhoto.photoId
    if (window.lastFocusedRoomPhoto && window.lastFocusedRoomPhoto.photoId) {
         const activeId = window.lastFocusedRoomPhoto.photoId;
         const freshMatch = matches.find(m => m.id === activeId);
         if (freshMatch) {
             last = {
                 photoId: freshMatch.id,
                 url: freshMatch.url,
                 roomId: freshMatch.roomId,
                 originalName: freshMatch.originalName
             };
        }
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
          showSummary();
          return; // User cancelled
        }
      }
    }
    if (!isPhotoRelated(instructions)) {
      alert(tr("alerts.requestMustBePhotoRelated", null, "Requests must describe a change to the current photo. Please update your instructions."));
      showSummary();
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
    let originalText = "";
    if (button) {
      button.disabled = true;
      originalText = button.textContent;
      button.textContent = tr("gemini.processingBtn", null, "Processing with AlgoreitAI...");
      thinkingIndicator = showGeminiThinkingIndicator(button);
    }

    try {
      // --- COLLAGE / REFERENCE PRODUCT LOGIC ---
      // 1. Check if we have a product selection
      let imageDataUrl = null;
      let splitRatio = null; // Used to crop result if we used a collage

      if (window.currentProductSelection && window.currentProductSelection.imageUrl) {
        console.log("[GeminiAI] Supplier product selected. Building reference collage for backend...");
        const productUrl = window.currentProductSelection.imageUrl;
        const collageInfo = await buildRoomAndProductCollage(match.url, productUrl);
        
        if (collageInfo) {
          // No modal here anymore - we just use it implicitly.
          // The user should have already seen the preview in the working area.
          
          // Use the collage for upload
          imageDataUrl = collageInfo.dataUrl;
          splitRatio = collageInfo.splitRatio;
          
          console.log("[GeminiAI] Collage generated for processing. Split ratio:", splitRatio);
        }
      }

      // 3. Optimize image for Upload (if not already set by collage)
      if (!imageDataUrl) {
          imageDataUrl = await prepareImageForUpload(match.url);
      } else {
          // Even if we have collage dataUrl, run it through prepare to ensure size limits
          imageDataUrl = await prepareImageForUpload(imageDataUrl);
      }

      // Get metadata from current context
      const meta = buildMetadata();

      // Send to backend
      const userId = window.Clerk && window.Clerk.user ? window.Clerk.user.id : null;

      const response = await fetch(getApiUrl("/api/gemini/process-photo"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
          instructions,
          meta,
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const mainError = errorData.error || `HTTP ${response.status}`;
        
        // Handle Insufficient Credits (only relevant when credits enforcement is enabled)
        if (response.status === 402 || errorData.code === "INSUFFICIENT_CREDITS") {
           // Do not hard-block the app UI here (payments may not be configured yet).
           // Keep a friendly message and let the caller handle it.
           console.warn("[GeminiAI] Credits required (402).");
           alert("Credits are currently unavailable. Please try again later or contact support.");
           throw new Error("Insufficient Credits");
        }

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
      let processedImageUrl = result.imageDataUrl;

      if (!processedImageUrl) {
        throw new Error("No processed image received from AlgoreitAI");
      }

      // 4. POST-PROCESS: CROP IF COLLAGE WAS USED
      if (splitRatio) {
          console.log("[GeminiAI] Cropping result to remove reference panel...");
          processedImageUrl = await cropCollageResult(processedImageUrl, splitRatio);
      }

      // Update the photo in the gallery
      // We ONLY do this if we are NOT in "No Floor Plan" mode (Option B), 
      // because in Option B we want to keep the raw photos row intact.
      const isOptionB = !!document.getElementById("photo-working-area");
      
      // Add to the "Processed Photos" top row (For both Option A and Option B)
      let newItem = null;
      if (typeof window.addProcessedPhotoToGallery === "function") {
          // Determine labels
          let styleLabel = window.currentStyleId;
          let renovationLabel = window.currentRenovationId;
          
          // If we had custom instructions and no standard selections were active (or just to be explicit)
          if (customInstructions) {
              styleLabel = styleLabel || "Custom Style";
              renovationLabel = renovationLabel || "Custom Edit";
          }

          newItem = window.addProcessedPhotoToGallery(
              match.id, 
              processedImageUrl, 
              styleLabel, 
              renovationLabel
          );
      } else {
          // If the helper is not available (Option A only mode), try to update the raw photo if it exists
          if (!isOptionB && typeof window.updatePhotoUrlForGallery === "function") {
             window.updatePhotoUrlForGallery(match.id, processedImageUrl);
          }
      }

      if (!newItem) {
          console.warn("[GeminiAI] Failed to add item to gallery. ID:", match.id);
          // Fallback: Alert the user or try legacy method
          alert("The image was processed but could not be added to the gallery. Please try refreshing.");
      } else {
          // CRITICAL FIX: Update the current focus to the NEW renovated photo.
          window.lastFocusedRoomPhoto = {
              roomId: newItem.roomId,
              photoId: newItem.id,
              url: newItem.url,
              originalName: newItem.originalName
          };
          console.log("[GeminiAI] Updated focus to new renovated photo for chaining:", newItem.id);
          
          // Scroll to the result so the user sees it
          const processedGallery = document.getElementById("processed-gallery");
          if (processedGallery) {
              processedGallery.scrollIntoView({ behavior: "smooth", block: "start" });
              // Flash effect to highlight
              processedGallery.style.transition = "background-color 0.5s";
              processedGallery.style.backgroundColor = "#eff6ff";
              setTimeout(() => { processedGallery.style.backgroundColor = "transparent"; }, 1000);
          }
      }

      // Update overlay if this photo is currently displayed
      updateOverlayIfActive(match.url, processedImageUrl, match.roomId);

      // Success feedback
      console.log("✓ Photo processed and gallery updated.");
      
      // Explicitly notify user
      if (typeof showToast === "function") {
          showToast("✨ Transformation Complete! Result added to Renovation Photos.", "success");
      }
      
      // Auto-scroll to the top so they see the result
      const processedGallery = document.getElementById("processed-gallery");
      if (processedGallery) {
          processedGallery.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      // --- SHOW PRODUCT DETAILS AFTER PROCESSING ---
      // If we just processed a product integration, ensure the details panel remains visible 
      // under the NEW renovated photo in the working area.
      if (window.currentProductSelection) {
           const workingArea = document.getElementById("photo-working-area");
           if (workingArea) {
                // The openInWorkingArea call above (via addProcessedPhotoToGallery) might have reset the content.
                // We need to re-inject the product details panel.
                
                let detailsPanel = workingArea.querySelector(".product-details-panel");
                if (!detailsPanel) {
                    detailsPanel = document.createElement("div");
                    detailsPanel.className = "product-details-panel";
                    detailsPanel.style.marginTop = "12px";
                    detailsPanel.style.textAlign = "left";
                    detailsPanel.style.background = "#f9fafb";
                    detailsPanel.style.padding = "12px";
                    detailsPanel.style.borderRadius = "8px";
                    detailsPanel.style.fontSize = "14px";
                    detailsPanel.style.border = "1px solid #e5e7eb";
                    
                    const caption = workingArea.querySelector(".working-area-caption");
                    if (caption) {
                         caption.parentNode.insertBefore(detailsPanel, caption.nextSibling);
                    } else {
                         workingArea.appendChild(detailsPanel);
                    }
                }
                
                const p = window.currentProductSelection;
                detailsPanel.innerHTML = `
                    <div style="display: flex; gap: 12px; align-items: start;">
                        <img src="${p.imageUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #111827;">${escapeHtml(p.name)}</div>
                            <div style="margin-top: 2px;">
                                ${p.purchaseLink 
                                    ? `<a href="${p.purchaseLink}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; font-size: 13px; text-decoration: underline; font-weight: 500;">${escapeHtml(p.supplierName || 'Supplier')}</a>`
                                    : `<span style="color: #4b5563; font-size: 13px;">${escapeHtml(p.supplierName || 'Supplier')}</span>`
                                }
                            </div>
                            <div style="font-weight: 600; color: #4f46e5; margin-top: 4px;">$${p.price}</div>
                            ${p.description ? `<div style="color: #6b7280; font-size: 12px; margin-top: 4px; line-height: 1.4; border-top: 1px solid #eee; padding-top: 4px;">${escapeHtml(p.description)}</div>` : ''}
                        </div>
                    </div>
                `;
                detailsPanel.style.display = "block";
           }
      }

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
        button.textContent = originalText || tr("ops.algoreit", null, "✨ AlgoreitAI");
      }
      hideGeminiThinkingIndicator(thinkingIndicator);
      showSummary();
      window.selectionSummaryResetOnNextSelection = true;
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

    const title = tr("gemini.modal.title", null, "AlgoreitAI Processing");
    const desc = tr(
      "gemini.modal.desc",
      null,
      "Describe what you want AlgoreitAI to do with this photo. Be specific about materials, colors, styles, or transformations."
    );
    const placeholder = tr(
      "gemini.modal.placeholder",
      null,
      "Example: Replace the floor with light oak hardwood, repaint walls in warm beige, and update lighting fixtures to modern brass style..."
    );
    const hint = suggestion
      ? tr("gemini.modal.prefilled", null, "✓ Pre-filled based on your style and renovation selections.")
      : tr("gemini.modal.tip", null, "Tip: Use your Style and Renovate selections first for auto-suggestions.");
    const cancel = tr("gemini.modal.cancel", null, "Cancel");
    const submit = tr("gemini.modal.submit", null, "Send to AlgoreitAI");

    modal.innerHTML = `
      <div class="gemini-modal-header">
        <h2>${title}</h2>
        <button class="gemini-modal-close" type="button">&times;</button>
      </div>
      <div class="gemini-modal-body">
        <p class="gemini-modal-description">
          ${desc}
        </p>
        <textarea
          class="gemini-instructions-input"
          placeholder="${escapeHtml(placeholder)}"
          rows="6"
        >${suggestion}</textarea>
        <div class="gemini-modal-hint">
          ${hint}
        </div>
      </div>
      <div class="gemini-modal-footer">
        <button class="gemini-btn-cancel" type="button">${cancel}</button>
        <button class="gemini-btn-submit" type="button">${submit}</button>
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
        alert(tr("alerts.provideInstructions", null, "Please provide instructions before submitting."));
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
  
  // (Preview Modal function removed)

  function createTweakModal(callback) {
    const overlay = document.createElement("div");
    overlay.className = "gemini-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "gemini-modal";

    const title = tr("gemini.tweak.title", null, "Quick Tweak");
    const desc = tr("gemini.tweak.desc", null, "Tell AlgoreitAI what you would like to do with this photo.");
    const placeholder = tr("gemini.tweak.placeholder", null, "Tell AlgoreitAI what you would like to do...");
    const hint = tr("gemini.tweak.hint", null, "Keep it photo-specific (e.g., repaint walls, swap countertop).");
    const cancel = tr("gemini.tweak.cancel", null, "Cancel");
    const submit = tr("gemini.tweak.submit", null, "Send Tweak");

    modal.innerHTML = `
      <div class="gemini-modal-header">
        <h2>${title}</h2>
        <button class="gemini-modal-close" type="button">&times;</button>
      </div>
      <div class="gemini-modal-body">
        <p class="gemini-modal-description">
          ${desc}
        </p>
        <textarea
          class="gemini-instructions-input"
          placeholder="${escapeHtml(placeholder)}"
          rows="4"
        ></textarea>
        <div class="gemini-modal-hint">
          ${hint}
        </div>
      </div>
      <div class="gemini-modal-footer">
        <button class="gemini-btn-cancel" type="button">${cancel}</button>
        <button class="gemini-btn-submit" type="button">${submit}</button>
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
        alert(tr("alerts.tweakEmpty", null, "Please tell AlgoreitAI what to change in this photo."));
        return;
      }
      if (!isPhotoRelated(instructions)) {
        alert(tr("alerts.tweakNotRelated", null, "Requests must relate to the current photo. Please describe a change in this image."));
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
    let renovationText =
      RENOVATION_TASKS[safeId] ||
      `Apply a precise update to the ${safeId.replace(/_/g, " ")}`;

    // Inject Supplier Product if selected
    let supplierProductBlock = "";
    if (window.currentProductSelection) {
        const p = window.currentProductSelection;
        const cat = p.category ? ` (${p.category})` : "";
        const desc = p.description ? `\n- Description: ${p.description}` : "";
        const supplier = p.supplierName ? `\n- Supplier: ${p.supplierName}` : "";
        const price = (p.price || p.price === 0) ? `\n- Price: $${p.price}` : "";

        // Dedicated block used by the specific templates below (esp. furniture staging)
        supplierProductBlock = `\n\nSUPPLIER PRODUCT REFERENCE:\n- The INPUT IMAGE is a COLLAGE.\n- LEFT SIDE: The room to modify.\n- RIGHT SIDE: The Reference Product ("${p.name}") to insert.${desc}${supplier}${price}\n\nINSTRUCTIONS:\n1. IGNORE the right side panel in the final output.\n2. INSERT the product from the RIGHT into the room on the LEFT.\n3. PRESERVE the existing room details (walls, floor, windows, ceiling) and EXISTING FURNITURE as much as possible. Only move/remove items if they physically conflict with the new product's placement.\n4. Make it look photorealistic: match lighting, perspective, and shadows.\n5. The final result must ONLY show the room (left side) with the product integrated.`;

        // Also reinforce the generic renovationText so the non-special templates still include it
        renovationText = `Task: ADD the Reference Product shown on the RIGHT side into the room on the LEFT.\nDo not re-stage the entire room. Keep existing elements.\nContext: ${renovationText}`;
        console.log("Injected Product into prompt (Strong Override):", p.name);
        console.log("Full Prompt:", renovationText); // Added logging
    }

    // Special handling for enhance quality
    if (safeId === "enhance_quality") {
      return `You are an expert photo editor.
TASK: Enhance the quality of this image.
DETAILS: ${renovationText}
CRITICAL CONSTRAINTS:
1. Do NOT change the style, furniture, layout, or structural elements.
2. PRESERVE the original aesthetic and design completely.
3. Focus ONLY on improving resolution, sharpness, lighting balance, and color vibrancy.
4. Reduce noise and artifacts.
5. Make the image look cleaner and more professional, but keep it authentic to the original scene.`;
    }

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
TASK: ${renovationText} (${roomTypeContext}).${supplierProductBlock}
STYLE DETAILS: Use furniture and decor that strictly follows the ${styleText} aesthetic.
CRITICAL CONSTRAINTS:
1. The input image is a side-by-side collage (Room | Product).
2. Your output must ONLY show the modified Room (Left side).
3. ADD the product from the right panel into the room.
4. PRESERVE the original room's structural elements (walls, floor, ceiling, windows) AND existing furniture layout where possible.
5. Ensure realistic lighting and shadows for the added product.`;
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
      // 1. Get the blob to check size (or from data URL)
      let blob;
      if (url.startsWith("data:")) {
         const res = await fetch(url);
         blob = await res.blob();
      } else {
         const response = await fetch(url);
         blob = await response.blob();
      }

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

  // Returns { dataUrl, splitRatio } where splitRatio is roomWidth / totalWidth
  async function buildRoomAndProductCollage(roomUrl, productUrl) {
    try {
        // Fetch both images as blobs
        const [roomBlob, productBlob] = await Promise.all([
          fetch(roomUrl).then((r) => r.blob()),
          fetch(productUrl).then((r) => r.blob()),
        ]);
    
        const roomImg = await loadImageFromBlob(roomBlob);
        const productImg = await loadImageFromBlob(productBlob);
    
        // Layout: room on left, product on right
        const roomW = roomImg.naturalWidth || roomImg.width;
        const roomH = roomImg.naturalHeight || roomImg.height;
    
        // Keep product panel ~35% of room width, at least 420px, at most 900px
        const productPanelW = Math.max(420, Math.min(900, Math.round(roomW * 0.35)));
        const productPanelH = roomH;
    
        const canvas = document.createElement("canvas");
        const totalW = roomW + productPanelW;
        canvas.width = totalW;
        canvas.height = roomH;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
    
        // Background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        // Draw room (left)
        ctx.drawImage(roomImg, 0, 0, roomW, roomH);
    
        // Divider
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(roomW, 0, 2, roomH);
    
        // Product panel background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(roomW + 2, 0, productPanelW - 2, productPanelH);
    
        // Fit product image inside right panel with padding
        const pad = 24;
        const headerH = 108; // space for hint + title
        const boxW = productPanelW - pad * 2;
        const dy = pad + headerH;
        const boxH = productPanelH - dy - pad;
    
        const pw = productImg.naturalWidth || productImg.width;
        const ph = productImg.naturalHeight || productImg.height;
        const scale = Math.min(boxW / pw, boxH / ph);
        const drawW = Math.round(pw * scale);
        const drawH = Math.round(ph * scale);
        const dx = roomW + pad + Math.round((boxW - drawW) / 2);
    
        // Hint (translated) ABOVE title
        ctx.fillStyle = "#374151";
        ctx.font = "700 22px Inter, system-ui, -apple-system, Segoe UI, Arial";
        ctx.fillText(
          tr("products.mergeHint", null, "Operate AlgoreitAI to merge the Photo"),
          roomW + pad,
          34
        );

        // Title
        ctx.fillStyle = "#111827";
        ctx.font = "bold 28px Inter, system-ui, -apple-system, Segoe UI, Arial";
        ctx.fillText("Reference Product", roomW + pad, 66);
    
        // Draw product
        ctx.drawImage(productImg, dx, dy, drawW, drawH);
    
        // Footer hint
        ctx.fillStyle = "#374151";
        ctx.font = "16px Inter, system-ui, -apple-system, Segoe UI, Arial";
        ctx.fillText("Use the product on the right in the room on the left.", roomW + pad, roomH - 18);
    
        // Calculate split ratio for later cropping
        const splitRatio = roomW / totalW;

        // Convert to JPEG data URL
        const dataUrl = canvas.toDataURL("image/jpeg", 0.90);
        
        return { dataUrl, splitRatio };
    } catch (e) {
        console.error("[GeminiAI] Failed to build collage:", e);
        return null;
    }
  }

  function cropCollageResult(dataUrl, splitRatio) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            // The result should have the same aspect ratio as input collage
            // We want to keep the left part (the room)
            const keepW = Math.floor(w * splitRatio);
            
            const canvas = document.createElement('canvas');
            canvas.width = keepW;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            
            // Draw only the left part
            ctx.drawImage(img, 0, 0, keepW, h, 0, 0, keepW, h);
            
            // Return high quality JPEG
            resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = (e) => reject(new Error("Failed to load image for cropping"));
        img.src = dataUrl;
    });
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(blob);
      img.onload = () => {
        try { URL.revokeObjectURL(objUrl); } catch (_) {}
        resolve(img);
      };
      img.onerror = (e) => {
        try { URL.revokeObjectURL(objUrl); } catch (_) {}
        reject(e);
      };
      img.src = objUrl;
    });
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
      <span class="gemini-thinking-text">${escapeHtml(tr("gemini.thinking", null, "Processing…"))}</span>
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
