// Independent feature: Renovate selector ("Renovate ▾" button)
// - Provides renovation options (Wood Floor, Carpet, Tiles, Paint, Kitchen, Bathroom).
// - Uses the currently selected style and last room photo to generate a
//   "renovated" photo (visual filter) and replace it on screen.
// - Downloads the renovated image so the user can save it locally.

(function () {
  // API base helper (supports file:// fallback to http://localhost:4000)
  function getApiUrl(path) {
    if (typeof window.getApiUrl === "function") {
      return window.getApiUrl(path);
    }
    const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
    const p = String(path || "");
    return base + (p.startsWith("/") ? p : "/" + p);
  }

  const RENOVATIONS = [
    {
      label: "Room",
      groups: [
        {
          label: "Floor",
          id: "room_floor",
          options: [
            { id: "hardwood", label: "Hardwood" },
            { id: "laminate", label: "Laminate" },
            { id: "ceramics", label: "Ceramics" },
            { id: "tiles", label: "Tiles" },
            { id: "vinyl", label: "Vinyl" },
            { id: "carpet", label: "Carpet" },
          ],
        },
        {
          label: "Walls",
          id: "room_walls",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Ceiling",
          id: "room_ceiling",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Windows",
          id: "room_windows",
          options: [
            { id: "painting", label: "Painting" },
            { id: "aluminum", label: "Aluminum" },
          ],
        },
        {
          label: "Doors",
          id: "room_doors",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Lighting",
          id: "room_lighting",
          options: [
            { id: "add", label: "Add" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Frameheads",
          id: "room_frameheads",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
      ],
    },
    {
      label: "Bathroom",
      groups: [
        {
          label: "Floor",
          id: "bathroom_floor",
          options: [
            { id: "ceramics", label: "Ceramics" },
            { id: "tiles", label: "Tiles" },
            { id: "vinyl", label: "Vinyl" },
            { id: "hardwood", label: "Hardwood" },
            { id: "laminate", label: "Laminate" },
          ],
        },
        {
          label: "Walls",
          id: "bathroom_walls",
          options: [
            { id: "painting", label: "Painting" },
            { id: "tiles", label: "Tiles" },
          ],
        },
        {
          label: "Ceiling",
          id: "bathroom_ceiling",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Sink",
          id: "bathroom_sink",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Bath",
          id: "bathroom_bath",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Toilet",
          id: "bathroom_toilet",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Windows",
          id: "bathroom_windows",
          options: [
            { id: "painting", label: "Painting" },
            { id: "aluminum", label: "Aluminum" },
          ],
        },
        {
          label: "Door",
          id: "bathroom_door",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
      ],
    },
    {
      label: "Kitchen",
      groups: [
        {
          label: "Cabinets",
          id: "kitchen_cabinets",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Countertop",
          id: "kitchen_countertop",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Backsplash",
          id: "kitchen_backsplash",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Floor",
          id: "kitchen_floor",
          options: [
            { id: "ceramics", label: "Ceramics" },
            { id: "tiles", label: "Tiles" },
            { id: "vinyl", label: "Vinyl" },
            { id: "hardwood", label: "Hardwood" },
            { id: "laminate", label: "Laminate" },
          ],
        },
        {
          label: "Walls",
          id: "kitchen_walls",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Ceiling",
          id: "kitchen_ceiling",
          options: [{ id: "painting", label: "Painting" }],
        },
      ],
    },
    {
      label: "Exterior",
      groups: [
        {
          label: "Walls",
          id: "exterior_walls",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Windows",
          id: "exterior_windows",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Doors",
          id: "exterior_doors",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Roof",
          id: "exterior_roof",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Garden",
          id: "exterior_garden",
          options: [
            { id: "clear", label: "Clear" },
            { id: "gardening", label: "Gardening" },
          ],
        },
        {
          label: "Structure",
          id: "exterior_structure",
          options: [
            { id: "replace", label: "Replace" },
          ],
        },
      ],
    },
  ];

  function initRenovateSelector() {
    const button = document.querySelector('[data-role="renovate-selector"]');
    const operationsBar = document.querySelector(".operations-bar");

    if (!button || !operationsBar) {
      console.warn(
        "[RenovateSelector] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("renovate-selector-panel");
      if (existing) {
        existing.parentNode.removeChild(existing);
        return;
      }
      openPanel(button, document.body);
    });

    document.addEventListener("click", (event) => {
      const panel = document.getElementById("renovate-selector-panel");
      if (!panel) return;
      if (!panel.contains(event.target) && !button.contains(event.target)) {
        panel.parentNode.removeChild(panel);
      }
    });
  }

  window.initRenovateSelector = initRenovateSelector;

  function openPanel(button, container) {
    const panel = document.createElement("div");
    panel.id = "renovate-selector-panel";
    panel.className = "renovate-selector-panel";
    
    // Override class styles for dropdown behavior
    panel.style.position = "absolute";
    panel.style.minWidth = "220px";
    panel.style.zIndex = "2000"; // Ensure it's on top of everything
    panel.style.right = "auto"; // Unset right from class

    let itemsHtml = "";

    // Add Remove Furniture option at the top
    itemsHtml += `
      <div class="renovate-category">
        <button
          type="button"
          class="renovate-option-item"
          data-renovation-id="furniture_clear_remove"
          data-renovation-label="Remove Furniture"
          style="width: 100%; text-align: left; padding: 10px 12px; font-weight: 600; background: #fff; border: none; border-bottom: 1px solid #e5e7eb; color: #dc2626; cursor: pointer; display: flex; align-items: center; gap: 8px;"
        >
          <span>🧹</span> Remove Furniture
        </button>
      </div>
    `;
    
    RENOVATIONS.forEach((category, index) => {
        const categoryId = `renovate-cat-${index}`;
        const groupsHtml = category.groups
          .map((group, gIndex) => {
            const groupId = `${categoryId}-group-${gIndex}`;
            const optionButtons = group.options
              .map(
                (option) => `
                  <button
                    type="button"
                    class="renovate-option-item"
                    data-renovation-id="${group.id}_${option.id}"
                    data-renovation-label="${escapeHtml(option.label)}"
                    style="padding-left: 32px;"
                  >
                    ${escapeHtml(option.label)}
                  </button>
                `
              )
              .join("");
            return `
              <div class="renovate-group">
                <button
                  type="button"
                  class="renovate-group-toggle"
                  data-target="${groupId}"
                  style="width: 100%; text-align: left; padding: 8px 12px; font-weight: 500; background: #fff; border: none; border-bottom: 1px solid #e5e7eb; color: #374151; cursor: pointer;"
                >
                  ${escapeHtml(group.label)}
                </button>
                <div
                  id="${groupId}"
                  class="renovate-group-options"
                  style="display: none; border-bottom: 1px solid #f3f4f6;"
                >
                  ${optionButtons}
                </div>
              </div>
            `;
          })
          .join("");

        itemsHtml += `
          <div class="renovate-category">
            <button 
              type="button" 
              class="renovate-category-toggle" 
              data-target="${categoryId}"
              style="width: 100%; text-align: left; padding: 10px 12px; font-weight: 600; background: #eef2ff; border: none; border-bottom: 1px solid #e5e7eb; color: #374151; cursor: pointer;"
            >
              ${escapeHtml(category.label)}
            </button>
            <div 
              id="${categoryId}" 
              class="renovate-category-items" 
              style="display: none; border-bottom: 1px solid #e5e7eb;"
            >
              ${groupsHtml}
            </div>
          </div>
        `;
    });

    panel.innerHTML = `
      <div class="renovate-selector-header">
        <div class="renovate-selector-title">Apply renovation</div>
      </div>
      <div class="renovate-selector-body" style="max-height: 400px; overflow-y: auto;">
        ${itemsHtml}
      </div>
    `;

    container.appendChild(panel);

    // Calculate position relative to document body
    const rect = button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    panel.style.left = `${rect.left + scrollX}px`;
    panel.style.top = `${rect.bottom + scrollY + 8}px`;

    panel.querySelectorAll(".renovate-category-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const targetId = toggle.getAttribute("data-target");
        const target = document.getElementById(targetId);
        if (!target) return;
        const isOpen = target.style.display === "block";
        target.style.display = isOpen ? "none" : "block";
      });
    });

    panel.querySelectorAll(".renovate-group-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const targetId = toggle.getAttribute("data-target");
        const target = document.getElementById(targetId);
        if (!target) return;
        const isOpen = target.style.display === "block";
        target.style.display = isOpen ? "none" : "block";
      });
    });

    panel.querySelectorAll(".renovate-option-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        // Try multiple ways to get the ID to be safe
        const renovationId = btn.dataset.renovationId || btn.getAttribute("data-renovation-id");
        const renovationLabel =
          btn.dataset.renovationLabel ||
          btn.getAttribute("data-renovation-label") ||
          btn.textContent.trim() ||
          renovationId;
        
        console.log("[RenovateSelector] Clicked option. ID:", renovationId);
        
        if (!renovationId) {
          console.error("[RenovateSelector] Error: Could not find renovation ID on button", btn);
          alert("Internal Error: Renovation ID missing");
          return;
        }
        
        if (panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }

        // Update global state
        window.currentRenovationSelection = {
          id: renovationId,
          label: renovationLabel,
        };

        if (window.updateSelectionSummary) {
          window.updateSelectionSummary({ renovation: renovationLabel });
        }

        window.currentRenovationId = renovationId;
        if (window.setFlowLock) {
          // Garden clear and Remove Furniture do not require Style; allow direct processing
          if (
            renovationId === "exterior_garden_clear" ||
            renovationId === "furniture_clear_remove"
          ) {
            window.setFlowLock(null);
          } else {
            window.setFlowLock("renovate");
          }
        }
        
        // Visual feedback
        const geminiBtn = document.querySelector('[data-role="gemini-ai"]');
        if (geminiBtn) {
            geminiBtn.classList.add('pulse-animation'); // We'll add this CSS
            geminiBtn.textContent = "✨ Click to Process";
            setTimeout(() => {
                geminiBtn.classList.remove('pulse-animation');
                geminiBtn.textContent = "✨ AlgoreitAI";
            }, 3000);
        }
        
        // We no longer auto-trigger here to allow the user to select a style first
        console.log("[RenovateSelector] Renovation selected:", renovationId, "- Waiting for user to click AlgoreitAI");
      });
    });
  }

  // Legacy local renovation function (kept as fallback)
  async function applyRenovation(renovationId) {
    const styleCtx = window.currentStyleContext || { id: null, label: null };
    if (!styleCtx.id) {
      alert(
        "Please choose a Style first. Click the 'Style' button and pick a design style."
      );
      return;
    }

    const matches = Array.isArray(window.currentPhotoMatches)
      ? window.currentPhotoMatches
      : [];
    const last = window.lastFocusedRoomPhoto || null;

    if (!matches.length) {
      alert(
        "There are no uploaded photos to renovate. Use 'Upload Photos' and match them to rooms first."
      );
      return;
    }

    if (!last || !last.photoId) {
      alert(
        "Renovate works on the last room photo you viewed. First click 'Room', choose a room, then try again."
      );
      return;
    }

    const match =
      matches.find((m) => m.id === last.photoId) || {
        id: last.photoId,
        url: last.url,
        originalName: last.originalName || "",
      };

    try {
      const originalUrl = match.url;
      const renovatedUrl = await renovateImage(
        originalUrl,
        styleCtx.id,
        renovationId
      );

      if (typeof window.updatePhotoUrlForGallery === "function") {
        window.updatePhotoUrlForGallery(match.id, renovatedUrl);
      }

      // Keep last-focused pointer in sync with the renovated image
      window.lastFocusedRoomPhoto = {
        roomId: last.roomId,
        photoId: match.id,
        url: renovatedUrl,
        originalName: match.originalName || "",
      };

      const overlay = document.getElementById("room-photo-overlay");
      if (overlay) {
        const currentHref =
          overlay.getAttribute("href") || overlay.getAttribute("xlink:href");
        if (currentHref === originalUrl) {
          overlay.setAttribute("href", renovatedUrl);
          overlay.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
            renovatedUrl
          );
        }
      }

      const downloadName = buildRenovatedFileName(
        match.originalName,
        styleCtx.id,
        renovationId,
        match.id
      );
      triggerDownload(renovatedUrl, downloadName);

      alert(
        `Renovation '${renovationId}' applied in '${styleCtx.label}' style. A renovated copy was downloaded—save it into your 'Enhanched_Photos' (or similar) folder.`
      );
    } catch (error) {
      console.error("[RenovateSelector] Failed to apply renovation", error);
      alert("Something went wrong while applying the renovation.");
    }
  }

  async function renovateImage(url, styleId, renovationId) {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageDataUrl = canvas.toDataURL("image/png");

    // Try backend AI renovation first
    try {
      const response = await fetch(getApiUrl("/api/renovate-room"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl,
          styleId,
          renovationId,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json && json.imageDataUrl) {
          return json.imageDataUrl;
        }
      }
    } catch (e) {
      console.warn(
        "[RenovateSelector] Backend renovation failed, falling back to local filter."
      );
    }

    // Fallback: apply local tint so there is at least a visible change
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const tint = getTint(styleId, renovationId);
    const alpha = tint.alpha;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const tr = r * (1 - alpha) + tint.r * alpha;
      const tg = g * (1 - alpha) + tint.g * alpha;
      const tb = b * (1 - alpha) + tint.b * alpha;

      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
    }

    const contrast = 1.08;
    const brightness = 6;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = data[i + c];
        v = v * contrast + brightness;
        if (v < 0) v = 0;
        if (v > 255) v = 255;
        data[i + c] = v;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  function getTint(styleId, renovationId) {
    // Basic color suggestions based on style and renovation type.
    // These are not photorealistic, but give a distinct visual cue.
    const base = { r: 255, g: 255, b: 255, alpha: 0.0 };

    if (renovationId === "wood_floor") {
      return tintForStyle(styleId, {
        modern: { r: 196, g: 154, b: 108 },
        traditional: { r: 150, g: 105, b: 60 },
        minimalist: { r: 220, g: 200, b: 170 },
      });
    }
    if (renovationId === "carpet") {
      return tintForStyle(styleId, {
        modern: { r: 220, g: 220, b: 230 },
        traditional: { r: 165, g: 60, b: 60 },
        minimalist: { r: 230, g: 230, b: 230 },
      });
    }
    if (renovationId === "tiles") {
      return tintForStyle(styleId, {
        modern: { r: 210, g: 215, b: 225 },
        traditional: { r: 200, g: 190, b: 175 },
        industrial: { r: 190, g: 190, b: 190 },
      });
    }
    if (renovationId === "paint") {
      return tintForStyle(styleId, {
        modern: { r: 240, g: 246, b: 255 },
        traditional: { r: 245, g: 232, b: 220 },
        coastal: { r: 220, g: 235, b: 245 },
        minimalist: { r: 250, g: 250, b: 250 },
      });
    }
    if (renovationId === "kitchen") {
      return tintForStyle(styleId, {
        modern: { r: 225, g: 230, b: 240 },
        farmhouse: { r: 230, g: 220, b: 205 },
        industrial: { r: 210, g: 210, b: 210 },
      });
    }
    if (renovationId === "bathroom") {
      return tintForStyle(styleId, {
        modern: { r: 225, g: 240, b: 245 },
        coastal: { r: 210, g: 235, b: 240 },
        minimalist: { r: 240, g: 245, b: 248 },
      });
    }

    return { ...base, alpha: 0.0 };
  }

  function tintForStyle(styleId, map) {
    const base = { r: 255, g: 255, b: 255, alpha: 0.0 };
    const chosen = map[styleId] || map.modern || null;
    if (!chosen) return base;
    // Stronger alpha so the renovation is clearly visible
    return { r: chosen.r, g: chosen.g, b: chosen.b, alpha: 0.32 };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename || "renovated_photo.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function buildRenovatedFileName(originalName, styleId, renovationId, id) {
    const base =
      typeof originalName === "string" && originalName
        ? originalName.replace(/\.[a-zA-Z0-9]+$/, "")
        : `photo_${id}`;
    return `${base}_${styleId || "style"}_${renovationId}_renovated_${String(
      id
    ).padStart(2, "0")}.jpg`;
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
})();


