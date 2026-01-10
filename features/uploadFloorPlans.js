// Independent feature: Upload Floor Plans
// - Lets the user upload a JSON file that matches the floor_plan_1 structure
// - Renders the rooms as a simple table in the workspace area

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") {
        // Support both historical and current signatures.
        const v1 = window.t(key, vars || null, fallback);
        if (typeof v1 === "string" && v1 && v1 !== key) return v1;
        const v2 = window.t(key, vars || null, { defaultValue: fallback });
        if (typeof v2 === "string" && v2) return v2;
      }
    } catch (_) {}
    return fallback || key;
  }

  // Shared context so other features (e.g. photo upload) can see
  // the current floor plan title and room names.
  window.currentFloorPlanContext =
    window.currentFloorPlanContext || { title: null, rooms: [] };
  window.currentFloorPlanMeasurements =
    window.currentFloorPlanMeasurements || null;

  // API base helper (supports file:// fallback to http://localhost:4000)
  function getApiUrl(path) {
    if (typeof window.getApiUrl === "function") {
      return window.getApiUrl(path);
    }
    const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
    const p = String(path || "");
    return base + (p.startsWith("/") ? p : "/" + p);
  }

  let currentVisualUrl = null;
  let editablePlanData = null;
  let lastLayoutMode = null;
  let measurementHandlersBound = false;
  let areasHandlersBound = false;

  // Persistent (until refresh/reset) editable list shown under the floor plan.
  // This is the single source of truth for 3D generation "areas list".
  window.currentFloorPlanAreas = window.currentFloorPlanAreas || [];
  // User control: whether 3D generation should use the corrected areas list.
  window.currentFloorPlanUseAreasListFor3D =
    window.currentFloorPlanUseAreasListFor3D !== undefined
      ? window.currentFloorPlanUseAreasListFor3D
      : true;

  function initUploadFloorPlans() {
    const uploadButton = document.querySelector(
      '[data-role="upload-floor-plans"]'
    );
    const fileInput = document.getElementById("floor-plan-file-input");
    const viewer = document.getElementById("floor-plan-viewer");

    if (!uploadButton || !fileInput || !viewer) {
      console.warn(
        "[UploadFloorPlans] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    uploadButton.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const lowerName = (file.name || "").toLowerCase();
      const isPdf =
        file.type === "application/pdf" || lowerName.endsWith(".pdf");
      const isImage =
        file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/.test(lowerName);

      if (isPdf || isImage) {
        renderVisualFloorPlan(file, viewer, isPdf);
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        renderFloorPlan(data, viewer);
      } catch (error) {
        console.error("[UploadFloorPlans] Failed to read file", error);
        viewer.innerHTML =
          '<div class="app-placeholder">Could not read this file. Please make sure it is valid JSON, PDF, or Image.</div>';
      }
    });
  }


  window.initUploadFloorPlans = initUploadFloorPlans;

  function renderVisualFloorPlan(file, container, isPdf) {
    if (currentVisualUrl) {
      URL.revokeObjectURL(currentVisualUrl);
      currentVisualUrl = null;
    }

    const url = URL.createObjectURL(file);
    currentVisualUrl = url;

    const safeName = escapeHtml(file.name || "Floor plan");
    const rawTitle = file.name || "Floor plan";

    container.setAttribute("data-floor-plan-name", rawTitle);
    container.style.display = "block"; // Ensure visible
    window.currentFloorPlanContext = {
      title: rawTitle,
      rooms: [], // rooms cannot be inferred from a generic PDF/Image
    };

    const analyzingText =
      tr(
        "floorPlan.analyzing",
        null,
        "✨ Analyzing floor plan with AI... Please wait."
      );

    // Initial state: Analyzing
    container.innerHTML = `
      <div class="floor-plan-header">
        <div>
          <div class="floor-plan-title">${safeName}</div>
          <div class="floor-plan-subtitle">
            <div class="floor-plan-status floor-plan-status--processing" role="status" aria-live="polite">
              <span class="floor-plan-status-spinner" aria-hidden="true"></span>
              <span class="floor-plan-status-text">${escapeHtml(analyzingText)}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="floor-plan-pdf-wrapper">
        ${isPdf 
            ? `<iframe class="floor-plan-pdf-frame" src="${url}" title="${safeName}"></iframe>`
            : `<img src="${url}" style="max-width: 100%; height: auto; max-height: 500px; border: 1px solid #e5e7eb; border-radius: 8px;" />`
        }
      </div>
    `;

    // Automatically trigger analysis
    analyzeVisualFloorPlan(file, container, isPdf).catch(error => {
        console.error("Analysis failed:", error);
        const subtitle = container.querySelector(".floor-plan-subtitle");
        if (subtitle) {
            const failedText = tr("floorPlan.analysisFailed", null, "Analysis failed.");
            const retryLabel = tr("floorPlan.retryAi", null, "Retry AI Analysis");

            subtitle.innerHTML = `
                <div class="floor-plan-status floor-plan-status--error" role="status" aria-live="polite">
                  <span class="floor-plan-status-spinner" aria-hidden="true"></span>
                  <span>${escapeHtml(failedText)}</span>
                  <button class="op-btn op-btn-gemini" id="retry-pdf-btn" style="padding: 4px 12px; font-size: 12px;">${escapeHtml(retryLabel)}</button>
                </div>
            `;
            const retryBtn = document.getElementById("retry-pdf-btn");
            if (retryBtn) {
                retryBtn.addEventListener("click", () => {
                    const retryingText = tr("floorPlan.retrying", null, "✨ Retrying analysis...");
                    subtitle.innerHTML = `
                      <div class="floor-plan-status floor-plan-status--processing" role="status" aria-live="polite">
                        <span class="floor-plan-status-spinner" aria-hidden="true"></span>
                        <span class="floor-plan-status-text">${escapeHtml(retryingText)}</span>
                      </div>
                    `;
                    analyzeVisualFloorPlan(file, container, isPdf);
                });
            }
        }
    });
  }

  async function analyzeVisualFloorPlan(file, container, isPdf) {
    let imageDataUrl;

    if (isPdf) {
        // 1. Render first page of PDF to image
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1);
        
        const scale = 2.0; // Higher scale for better text recognition
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        
        await page.render({ canvasContext: ctx, viewport }).promise;
        imageDataUrl = autoCropCanvas(canvas);
    } else {
        // 2. Read image directly
        imageDataUrl = await readFileAsDataURL(file);
        
        // Auto-crop logic via temporary canvas
        const img = await loadImage(imageDataUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        imageDataUrl = autoCropCanvas(canvas);
    }

    // 3. Send to AlgoreitAI for analysis
    const prompt = `
      Analyze this floor plan image and extract a structured list of areas for 3D visualization.

      IMPORTANT RULES:
      - Focus on areas INSIDE the home (rooms, hallway, stairs, closets, etc).
      - If you also notice OUTSIDE areas (yard, garden, patio, paved plaza, driveway, balcony/terrace), you MAY include them, but you MUST mark them as outside so the app can exclude them by default.
      - For EACH area, provide:
        1) A clean name (no duplicates if possible)
        2) Items noticed in that area (fixtures/furniture/major elements)
        3) Location on the floor plan (relative, e.g. "top-left", "top-center", "center-right", "bottom-left", etc)
        4) Windows locations within that area (e.g. "north wall", "two windows on east wall", or "none")

      Return ONLY a valid JSON object with EXACTLY this structure:
      {
        "label": "Floor Plan",
        "rooms": [
          {
            "id": "R1",
            "name": "Living Room",
            "is_outside": false,
            "location_on_plan": "center-left",
            "items_noticed": ["sofa", "tv", "dining table"],
            "windows_location": "Two large windows on the north wall",
            "doors_location": "Door to hallway on south",
            "width": 5.0,
            "length": 4.0,
            "ceiling_height": 2.8,
            "layout_shape": "Rectangular",
            "flooring_guess": "Wood parquet",
            "connecting_rooms": "Hallway (South), Dining (East)",
            "furniture_location": "Sofa in center facing east wall",
            "architectural_features": "Fireplace on east wall, coffered ceiling",
            "item_relations": "Coffee table between sofa and TV unit",
            "furniture_type": "Modern sectional sofa, glass coffee table",
            "kitchen_shape": null,
            "bathroom_accessories": null
          }
        ],
        "units": "meters"
      }

      Output must be raw JSON only (no markdown, no explanations).
    `;

    const response = await fetch(getApiUrl("/api/gemini/analyze-photo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        instructions: prompt
      })
    });

    if (!response.ok) throw new Error("AlgoreitAI API failed");
    
    const result = await response.json();
    let text = result.analysis;
    
    // Clean up markdown code blocks if present
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    try {
      const floorPlanData = JSON.parse(text);
      // Success! Render the extracted data
      // Pass the imageDataUrl as background for reference, but also for generation
      renderFloorPlan(floorPlanData, container, imageDataUrl);
    } catch (e) {
      console.error("Failed to parse AlgoreitAI JSON:", text);
      throw new Error("AlgoreitAI returned invalid JSON data.");
    }
  }
  
  // Helper to read file as DataURL
  function readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
      });
  }

  // Helper to load image object
  function loadImage(src) {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
      });
  }

  function renderFloorPlan(plan, container, backgroundImageUrl = null) {
    if (!plan || !Array.isArray(plan.rooms)) {
      container.innerHTML =
        "<div class=\"app-placeholder\">This JSON does not look like a floor plan (missing 'rooms' array).</div>";
      return;
    }

    const normalizedPlan = clonePlan(plan);
    editablePlanData = normalizedPlan;
    lastLayoutMode = backgroundImageUrl ? "image" : "svg";
    window.currentFloorPlanMeasurements = editablePlanData;

    // Store the floor plan image URL globally for use in generation
    if (backgroundImageUrl) {
        window.currentFloorPlanImage = backgroundImageUrl;
    }

    const title = normalizedPlan.label || normalizedPlan.id || "Floor Plan";
    const units = normalizedPlan.units || "units";

    container.setAttribute("data-floor-plan-name", title);
    container.style.display = "block"; // Ensure visible
    window.currentFloorPlanContext = {
      title,
      rooms: (Array.isArray(normalizedPlan.rooms) ? normalizedPlan.rooms : []).map(
        (room, index) => ({
          id: index,
          name: room && room.name ? String(room.name) : `Room ${index + 1}`,
        })
      ),
    };

    const headerHtml = `
      <div class="floor-plan-header">
        <div>
          <div class="floor-plan-title">${escapeHtml(title)}</div>
          <div class="floor-plan-subtitle">
            ${
              normalizedPlan.bedrooms
                ? `${normalizedPlan.bedrooms}-bedroom apartment • `
                : ""
            }${escapeHtml(units)} (width × length × ceiling height)
          </div>
        </div>
          <div style="display: flex; gap: 10px;">
           <!-- Removed Download List and Virtual Tour buttons as per request -->
           <button class="op-btn" id="generate-3d-btn" style="display: none; align-items: center; gap: 6px;" title="Convert this floor plan into a 3D isometric view using AI.">
             <span>🧊</span> <span>3D View</span>
           </button>
           <button class="op-btn" id="room-viewer-btn" style="display: none; align-items: center; gap: 6px;" title="Select a room from the floor plan to view its photo.">
             <span>👁️</span> <span>Room</span>
           </button>
        </div>
      </div>
    `;

    // Use the original image if provided (from PDF analysis), otherwise generate SVG
    let layoutHtml;
    if (backgroundImageUrl) {
        const visualRefText = tr(
          "floorPlan.visualReference",
          null,
          "AI-Analyzed Floor Plan (Visual Reference)"
        );
        const visualRefAlt = tr(
          "floorPlan.visualReferenceAlt",
          null,
          "Floor Plan Analysis Source"
        );
        layoutHtml = `
        <div class="floor-plan-layout" style="text-align: center; background: #f9fafb; padding: 10px; border-radius: 12px; border: 1px solid var(--color-border-subtle); overflow: hidden;">
            <img src="${backgroundImageUrl}" style="width: 100%; height: auto; display: block; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" alt="${escapeHtml(visualRefAlt)}" />
            <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                ${escapeHtml(visualRefText)}
            </div>
        </div>
        `;
    } else {
        layoutHtml = createFloorPlanLayout(normalizedPlan);
    }

    const rowsHtml = normalizedPlan.rooms
      .map((room, index) => {
        const name = escapeHtml(room.name || "Room");
        const widthValue = numericOrNull(room.width);
        const lengthValue = numericOrNull(room.length);
        const heightValue = numericOrNull(room.ceiling_height);
        const ariaName = room && room.name ? String(room.name) : `Room ${index + 1}`;
        const area = computeArea(widthValue, lengthValue);

        return `
          <tr data-room-index="${index}">
            <td class="floor-plan-room-label">${name}</td>
            ${renderMeasurementInputCell({
              field: "width",
              index,
              value: widthValue,
              roomName: ariaName,
              units
            })}
            ${renderMeasurementInputCell({
              field: "length",
              index,
              value: lengthValue,
              roomName: ariaName,
              units
            })}
            ${renderMeasurementInputCell({
              field: "ceiling_height",
              index,
              value: heightValue,
              roomName: ariaName,
              units
            })}
            <td data-field="area" data-room-index="${index}">
              ${formatNumber(area)}
            </td>
          </tr>
        `;
      })
      .join("");

    const tableHtml = `
      <table class="floor-plan-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Width</th>
            <th>Length</th>
            <th>Ceiling height</th>
            <th>Area (m²)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;

    container.innerHTML = headerHtml + layoutHtml;
    
    // Render table to separate container at the bottom
    let tableContainer = document.getElementById("measurements-table-container");
    
    // Robust fallback: create container at the very bottom if missing
    if (!tableContainer) {
        const workspace = document.querySelector(".app-workspace");
        if (workspace) {
            tableContainer = document.createElement("div");
            tableContainer.id = "measurements-table-container";
            workspace.appendChild(tableContainer); // Appends to end -> Bottom
        }
    }

    if (tableContainer) {
        // 1) Persistent Areas panel (always under floor plan)
        const areasPanelHtml = renderAreasPanelHtmlFromRooms(normalizedPlan.rooms);
        tableContainer.innerHTML = areasPanelHtml + tableHtml;
        tableContainer.style.display = "block";
        tableContainer.style.marginTop = "20px";
        enableMeasurementEditing(tableContainer);
        enableAreasEditing(tableContainer);
    } else {
        // Extreme fallback
        container.insertAdjacentHTML("beforeend", renderAreasPanelHtmlFromRooms(normalizedPlan.rooms));
        container.insertAdjacentHTML("beforeend", tableHtml);
        enableMeasurementEditing(container);
        enableAreasEditing(container);
    }

    // Virtual Tour Button Logic - DISABLED
    /*
    const tourBtn = document.getElementById("start-virtual-tour-btn");
    if (tourBtn) {
        // Translate button text if possible
        try {
             if (window.t) {
                 const label = window.t("floorPlan.virtualTour", null, "Start Virtual Tour");
                 tourBtn.querySelector("span:last-child").textContent = label;
             }
        } catch(_) {}

        // Show button only if we have rooms
        if (normalizedPlan.rooms && normalizedPlan.rooms.length > 0) {
            tourBtn.style.display = "flex";
            tourBtn.onclick = () => startVirtualTour(normalizedPlan.rooms);
        }
    }
    */

    // PDF Button Logic - DISABLED
    /*
    const pdfBtn = document.getElementById("download-pdf-btn");
    if (pdfBtn && normalizedPlan.rooms && normalizedPlan.rooms.length > 0) {
        pdfBtn.style.display = "flex";
        pdfBtn.onclick = () => generateFloorPlanPdf(normalizedPlan);
    }
    */

    // Room Button Logic
    const roomBtn = document.getElementById("room-viewer-btn");
    if (roomBtn) {
         try {
             if (window.t) {
                 const label = window.t("ops.room", null, "Room");
                 roomBtn.querySelector("span:last-child").textContent = label;
             }
        } catch(_) {}

        if (normalizedPlan) {
            roomBtn.style.display = "flex";
            roomBtn.onclick = (e) => {
                if (window.handleRoomViewerClick) {
                    window.handleRoomViewerClick(roomBtn);
                }
            };
        }
    }

    // 3D View Button Logic
    const view3dBtn = document.getElementById("generate-3d-btn");
    if (view3dBtn) {
         // Translate
         try {
             if (window.t) {
                 const label = window.t("floorPlan.generate3d", null, "Generate 3D View");
                 view3dBtn.querySelector("span:last-child").textContent = label;
             }
        } catch(_) {}

        // Enable if we have an image or just allow it generally (it will warn if no image)
        // Only show if we have a plan or image
        if (normalizedPlan || backgroundImageUrl) {
            view3dBtn.style.display = "flex";
            view3dBtn.onclick = () =>
              reviewAreasThenGenerate3DView(
                backgroundImageUrl,
                (editablePlanData && Array.isArray(editablePlanData.rooms))
                  ? editablePlanData.rooms
                  : (normalizedPlan ? normalizedPlan.rooms : [])
              );
        }
    }
  }

  function isOutsideArea(room) {
    if (!room) return false;
    if (room.is_outside === true) return true;
    const kind = (room.kind || room.area_kind || "").toString().toLowerCase();
    if (kind === "outside" || kind === "exterior" || kind === "outdoor") return true;
    const name = (room.name || "").toString().toLowerCase();
    return /(yard|garden|patio|terrace|balcony|plaza|driveway|outdoor|exterior|courtyard)/i.test(
      name
    );
  }

  function normalizeItemsForInput(items) {
    if (!items) return "";
    if (Array.isArray(items)) return items.map((x) => String(x)).filter(Boolean).join(", ");
    return String(items);
  }

  function buildPersistentAreasFromRooms(rooms) {
    const list = Array.isArray(rooms) ? rooms : [];
    return list.map((r, idx) => {
      const outside = isOutsideArea(r);
      return {
        ...r,
        // Stable-ish id if present, otherwise create one.
        id: (r && r.id) ? String(r.id) : `R${idx + 1}`,
        name: r && r.name ? String(r.name) : `Room ${idx + 1}`,
        is_outside: outside,
        include: outside ? false : true,
        location_on_plan: r && r.location_on_plan ? String(r.location_on_plan) : "",
        windows_location: r && r.windows_location ? String(r.windows_location) : "",
        items_noticed: Array.isArray(r && r.items_noticed) ? r.items_noticed : []
      };
    });
  }

  function renderAreasPanelHtmlFromAreas(areas) {
    // Does NOT mutate global state; pure render from the provided areas array.
    const list = Array.isArray(areas) ? areas : [];

    const title = tr("floorPlan.areasPanelTitle", null, "Areas (editable)");
    const desc = tr(
      "floorPlan.areasPanelDesc",
      null,
      "Review and correct detected areas before generating 3D. Changes stay until you refresh or press Reset."
    );
    const useListLabel = tr(
      "floorPlan.useAreasListFor3d",
      null,
      "Use this list for 3D generation"
    );
    const useListHint = tr(
      "floorPlan.useAreasListFor3dHint",
      null,
      "If off, the 3D view will be generated from the floorplan image only."
    );
    const addLabel = tr("floorPlan.addArea", null, "+ Add area");
    const removeLabel = tr("floorPlan.removeArea", null, "Remove");
    const includeLabel = tr("floorPlan.includeArea", null, "Include");
    const outsideBadge = tr("floorPlan.outsideBadge", null, "Outside");
    const outsideHint = tr(
      "floorPlan.outsideHint",
      null,
      "Outside areas are excluded by default. You can include them if you want."
    );
    const placeholder = tr(
      "floorPlan.areaNamePlaceholder",
      null,
      "e.g., Living Room"
    );
    const itemsPlaceholder = tr(
      "floorPlan.itemsPlaceholder",
      null,
      "e.g., sink, toilet, shower"
    );
    const locationPlaceholder = tr(
      "floorPlan.locationPlaceholder",
      null,
      "e.g., top-left"
    );
    const windowsPlaceholder = tr(
      "floorPlan.windowsPlaceholder",
      null,
      "e.g., two windows on north wall"
    );
    const locationLabel = tr("floorPlan.locationLabel", null, "Location");
    const itemsLabel = tr("floorPlan.itemsLabel", null, "Items noticed");
    const windowsLabel = tr("floorPlan.windowsLabel", null, "Windows");
    const styleLabel = tr("floorPlan.styleLabel", null, "Style / Custom Instructions");
    const stylePlaceholder = tr(
      "floorPlan.stylePlaceholder",
      null,
      "e.g. Modern Scandinavian with light oak floors..."
    );

    function rowHtml(area, idx) {
      const safeName = escapeHtml((area && area.name ? area.name : "").trim());
      const safeLoc = escapeHtml((area && area.location_on_plan ? area.location_on_plan : "").trim());
      // We'll hide items/windows from UI to prevent "ruining" the 3D generation with over-specifics
      // const safeWindows = escapeHtml((area && area.windows_location ? area.windows_location : "").trim());
      // const safeItems = escapeHtml(normalizeItemsForInput(area && area.items_noticed).trim());
      const outside = !!(area && area.is_outside);
      const checked = area && area.include !== false ? "checked" : "";
      const badge = outside
        ? `<span style="display:inline-block; margin-left:8px; font-size:12px; padding:2px 8px; border:1px solid #f59e0b; color:#92400e; background:#fffbeb; border-radius:999px;">${escapeHtml(outsideBadge)}</span>`
        : "";
      return `
        <div class="fp-area-row" data-area-index="${idx}" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin: 10px 0; background: #fff;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#374151;">
              <input class="fp-area-include" type="checkbox" ${checked} />
              <span>${escapeHtml(includeLabel)}</span>
            </label>
            <div style="display:flex; align-items:center; gap: 10px;">
              ${badge}
              <button type="button" class="op-btn fp-area-remove" style="padding: 8px 10px;">${escapeHtml(removeLabel)}</button>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
            <div>
              <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">Room / Area</div>
              <input class="fp-area-name" type="text" value="${safeName}" placeholder="${escapeHtml(placeholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
            </div>
            <div>
              <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">${escapeHtml(locationLabel)}</div>
              <input class="fp-area-location" type="text" value="${safeLoc}" placeholder="${escapeHtml(locationPlaceholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
            </div>
          </div>
        </div>
      `;
    }

    const rows = list
      .map((a, idx) => rowHtml(a, idx))
      .join("");

    return `
      <div id="floorplan-areas-panel" style="margin: 0 0 16px 0;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 12px;">
          <div>
            <div style="font-weight: 700; font-size: 16px; color:#111827;">${escapeHtml(title)}</div>
            <div style="margin-top:6px; font-size:13px; color:#4b5563;">${escapeHtml(desc)}</div>
            <div style="margin-top:6px; font-size:12px; color:#6b7280;">${escapeHtml(outsideHint)}</div>
            <div style="margin-top:10px;">
              <label style="display:flex; align-items:flex-start; gap:10px; font-size:13px; color:#374151; user-select:none;">
                <input class="fp-use-areas-list" type="checkbox" ${
                  window.currentFloorPlanUseAreasListFor3D ? "checked" : ""
                } />
                <span>
                  <div style="font-weight:600;">${escapeHtml(useListLabel)}</div>
                  <div style="margin-top:2px; font-size:12px; color:#6b7280;">${escapeHtml(useListHint)}</div>
                </span>
              </label>
            </div>
          </div>
          <button type="button" class="op-btn fp-area-add" style="white-space: nowrap;">${escapeHtml(addLabel)}</button>
        </div>
        
        <div style="margin-top: 12px;">
            <div style="font-size: 12px; font-weight: 600; color:#374151; margin-bottom: 4px;">${escapeHtml(styleLabel)}</div>
            <textarea class="fp-custom-instructions" placeholder="${escapeHtml(stylePlaceholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px; min-height: 60px; font-family: inherit;">${escapeHtml(window.currentFloorPlanInstructions || "")}</textarea>
        </div>

        <div class="fp-areas-list" style="margin-top: 12px;">
          ${rows}
        </div>
      </div>
    `;
  }

  function renderAreasPanelHtmlFromRooms(rooms) {
    // Reset persistent list on each new floor plan render.
    window.currentFloorPlanAreas = buildPersistentAreasFromRooms(rooms);
    return renderAreasPanelHtmlFromAreas(window.currentFloorPlanAreas);
  }

  function enableAreasEditing(container) {
    if (!container || areasHandlersBound) return;
    container.addEventListener("click", handleAreasClick);
    container.addEventListener("input", handleAreasInput);
    container.addEventListener("change", handleAreasInput);
    areasHandlersBound = true;
  }

  function handleAreasClick(event) {
    const target = event.target;
    if (!target) return;
    if (target.classList && target.classList.contains("fp-area-add")) {
      const listEl = document.querySelector("#floorplan-areas-panel .fp-areas-list");
      if (!listEl) return;
      const next = {
        id: `U${Date.now()}`,
        name: "",
        is_outside: false,
        include: true,
        location_on_plan: "",
        windows_location: "",
        items_noticed: []
      };
      window.currentFloorPlanAreas = Array.isArray(window.currentFloorPlanAreas)
        ? [...window.currentFloorPlanAreas, next]
        : [next];
      // Re-render panel (cheap enough)
      const panel = document.getElementById("floorplan-areas-panel");
      if (panel && panel.parentNode) {
        panel.outerHTML = renderAreasPanelHtmlFromAreas(window.currentFloorPlanAreas);
      }
      return;
    }
    if (target.classList && target.classList.contains("fp-area-remove")) {
      const row = target.closest(".fp-area-row");
      if (!row) return;
      const idx = Number.parseInt(row.getAttribute("data-area-index") || "", 10);
      if (!Number.isFinite(idx)) return;
      if (!Array.isArray(window.currentFloorPlanAreas)) return;
      window.currentFloorPlanAreas.splice(idx, 1);
      // Remove row and re-index by re-render
      const panel = document.getElementById("floorplan-areas-panel");
      if (panel) panel.outerHTML = renderAreasPanelHtmlFromAreas(window.currentFloorPlanAreas);
      return;
    }
  }

  function handleAreasInput(event) {
    const target = event.target;
    if (!target) return;

    // Global toggle lives in the panel header (not inside a row)
    if (target.classList && target.classList.contains("fp-use-areas-list")) {
      window.currentFloorPlanUseAreasListFor3D = !!target.checked;
      return;
    }

    // Custom instructions live in the panel but not in a row
    if (target.classList && target.classList.contains("fp-custom-instructions")) {
        window.currentFloorPlanInstructions = String(target.value || "");
        return;
    }

    const row = target.closest && target.closest(".fp-area-row");
    if (!row) return;
    const idx = Number.parseInt(row.getAttribute("data-area-index") || "", 10);
    if (!Number.isFinite(idx)) return;
    if (!Array.isArray(window.currentFloorPlanAreas) || !window.currentFloorPlanAreas[idx]) return;

    const area = window.currentFloorPlanAreas[idx];
    if (target.classList.contains("fp-area-include")) {
      area.include = !!target.checked;
      return;
    }
    if (target.classList.contains("fp-area-name")) {
      area.name = String(target.value || "");
      return;
    }
    if (target.classList.contains("fp-area-location")) {
      area.location_on_plan = String(target.value || "");
      return;
    }
    if (target.classList.contains("fp-area-windows")) {
      area.windows_location = String(target.value || "");
      return;
    }
    if (target.classList.contains("fp-area-items")) {
      const raw = String(target.value || "").trim();
      area.items_noticed = raw
        ? raw.split(",").map((x) => x.trim()).filter(Boolean)
        : [];
      return;
    }
  }

  function openAreasReviewModal({ rooms = [], title = "" } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "guide-modal-overlay";
      overlay.style.zIndex = "2100";
      // Allow ESC handling via keydown by making overlay focusable.
      overlay.tabIndex = -1;

      const modal = document.createElement("div");
      modal.className = "guide-modal";
      modal.style.maxWidth = "720px";
      modal.style.width = "92%";
      modal.style.padding = "18px";

      const modalTitle = tr(
        "floorPlan.reviewAreasTitle",
        null,
        "Review detected areas"
      );
      const modalDesc = tr(
        "floorPlan.reviewAreasDesc",
        null,
        "Before generating the 3D view, confirm the room/area names we detected from your floor plan. You can edit, remove, or add areas."
      );
      const addLabel = tr("floorPlan.addArea", null, "+ Add area");
      const cancelLabel = tr("common.cancel", null, "Cancel");
      const continueLabel = tr(
        "floorPlan.continueTo3d",
        null,
        "Continue to 3D"
      );
      const placeholder = tr(
        "floorPlan.areaNamePlaceholder",
        null,
        "e.g., Living Room"
      );
      const itemsPlaceholder = tr(
        "floorPlan.itemsPlaceholder",
        null,
        "e.g., sink, toilet, shower"
      );
      const locationPlaceholder = tr(
        "floorPlan.locationPlaceholder",
        null,
        "e.g., top-left"
      );
      const windowsPlaceholder = tr(
        "floorPlan.windowsPlaceholder",
        null,
        "e.g., two windows on north wall"
      );
      const removeLabel = tr("floorPlan.removeArea", null, "Remove");
      const noneDetected = tr(
        "floorPlan.noAreasDetected",
        null,
        "No areas detected yet. Add the areas you want to appear in the 3D generation."
      );
      const includeLabel = tr("floorPlan.includeArea", null, "Include");
      const outsideBadge = tr("floorPlan.outsideBadge", null, "Outside");
      const locationLabel = tr("floorPlan.locationLabel", null, "Location");
      const itemsLabel = tr("floorPlan.itemsLabel", null, "Items noticed");
      const windowsLabel = tr("floorPlan.windowsLabel", null, "Windows");
      const excludeHint = tr(
        "floorPlan.outsideHint",
        null,
        "Outside areas are excluded by default. You can include them if you want."
      );

      // Keep a copy so we can preserve extra fields (dims/features) for the prompt.
      const originalRooms = Array.isArray(rooms) ? rooms : [];

      function rowHtml(room, idx) {
        const name = room && room.name ? String(room.name) : "";
        const loc = room && room.location_on_plan ? String(room.location_on_plan) : "";
        const windows = room && room.windows_location ? String(room.windows_location) : "";
        const items = normalizeItemsForInput(room && room.items_noticed);
        const safeName = escapeHtml(name.trim());
        const safeLoc = escapeHtml(loc.trim());
        const safeWindows = escapeHtml(windows.trim());
        const safeItems = escapeHtml(items.trim());
        const indexAttr = typeof idx === "number" ? ` data-room-index="${idx}"` : "";
        const outside = isOutsideArea(room);
        const defaultInclude = outside ? "" : "checked";
        const badge = outside
          ? `<span style="display:inline-block; margin-left:8px; font-size:12px; padding:2px 8px; border:1px solid #f59e0b; color:#92400e; background:#fffbeb; border-radius:999px;">${escapeHtml(outsideBadge)}</span>`
          : "";
        return `
          <div class="fp-area-row" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin: 10px 0; background: #fff;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap: 10px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#374151;">
                <input class="fp-area-include" type="checkbox" ${defaultInclude} />
                <span>${escapeHtml(includeLabel)}</span>
              </label>
              <div style="display:flex; align-items:center; gap: 10px;">
                ${badge}
                <button type="button" class="op-btn fp-area-remove" style="padding: 8px 10px;">${escapeHtml(removeLabel)}</button>
              </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
              <div>
                <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">Room / Area</div>
                <input class="fp-area-input" type="text" ${indexAttr} value="${safeName}" placeholder="${escapeHtml(placeholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
              </div>
              <div>
                <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">${escapeHtml(locationLabel)}</div>
                <input class="fp-area-location" type="text" value="${safeLoc}" placeholder="${escapeHtml(locationPlaceholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
              </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
              <div>
                <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">${escapeHtml(itemsLabel)}</div>
                <input class="fp-area-items" type="text" value="${safeItems}" placeholder="${escapeHtml(itemsPlaceholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
              </div>
              <div>
                <div style="font-size: 12px; color:#6b7280; margin-bottom: 4px;">${escapeHtml(windowsLabel)}</div>
                <input class="fp-area-windows" type="text" value="${safeWindows}" placeholder="${escapeHtml(windowsPlaceholder)}" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px; font-size:14px;" />
              </div>
            </div>
          </div>
        `;
      }

      const rows = originalRooms.length
        ? originalRooms
            .map((r, idx) => rowHtml(r || {}, idx))
            .join("")
        : `<div class="app-placeholder" style="margin: 10px 0;">${escapeHtml(noneDetected)}</div>`;

      const planName = title || (window.currentFloorPlanContext && window.currentFloorPlanContext.title) || "";
      const planLine = planName
        ? `<div style="font-size:12px; color:#6b7280; margin-top:4px;">${escapeHtml(planName)}</div>`
        : "";

      modal.innerHTML = `
        <div style="text-align:left;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 12px;">
            <div>
              <h2 style="margin:0;">${escapeHtml(modalTitle)}</h2>
              ${planLine}
              <p style="margin:10px 0 0 0; color:#4b5563;">${escapeHtml(modalDesc)}</p>
              <div style="margin-top:8px; font-size:12px; color:#6b7280;">${escapeHtml(excludeHint)}</div>
            </div>
            <button type="button" class="op-btn op-btn-reset fp-areas-close" style="height: 36px;">✕</button>
          </div>

          <div class="fp-areas-list" style="margin-top: 14px;">
            ${rows}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; margin-top: 14px;">
            <button type="button" class="op-btn fp-area-add">${escapeHtml(addLabel)}</button>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
              <button type="button" class="op-btn op-btn-reset fp-areas-cancel">${escapeHtml(cancelLabel)}</button>
              <button type="button" class="op-btn op-btn-accent fp-areas-continue">${escapeHtml(continueLabel)}</button>
            </div>
          </div>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      try {
        overlay.focus();
      } catch (_) {}

      function cleanup(result) {
        try {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        } catch (_) {}
        resolve(result);
      }

      function bindRowEvents(rowEl) {
        const rmBtn = rowEl.querySelector(".fp-area-remove");
        if (rmBtn) {
          rmBtn.addEventListener("click", () => {
            try {
              rowEl.parentNode && rowEl.parentNode.removeChild(rowEl);
            } catch (_) {}
          });
        }
      }

      // Bind existing rows
      modal.querySelectorAll(".fp-area-row").forEach(bindRowEvents);

      const listEl = modal.querySelector(".fp-areas-list");
      const addBtn = modal.querySelector(".fp-area-add");
      if (addBtn && listEl) {
        addBtn.addEventListener("click", () => {
          // If list currently has placeholder, clear it.
          const placeholderEl = listEl.querySelector(".app-placeholder");
          if (placeholderEl) placeholderEl.remove();

          const wrapper = document.createElement("div");
          wrapper.innerHTML = rowHtml({}, null).trim();
          const row = wrapper.firstElementChild;
          if (row) {
            listEl.appendChild(row);
            bindRowEvents(row);
            const input = row.querySelector(".fp-area-input");
            if (input) input.focus();
          }
        });
      }

      const closeBtn = modal.querySelector(".fp-areas-close");
      const cancelBtn = modal.querySelector(".fp-areas-cancel");
      const continueBtn = modal.querySelector(".fp-areas-continue");

      function cancel() {
        cleanup(null);
      }

      function confirm() {
        const confirmed = [];
        const rows = Array.from(modal.querySelectorAll(".fp-area-row"));

        rows.forEach((rowEl) => {
          const includeEl = rowEl.querySelector(".fp-area-include");
          const nameEl = rowEl.querySelector(".fp-area-input");
          const locEl = rowEl.querySelector(".fp-area-location");
          const itemsEl = rowEl.querySelector(".fp-area-items");
          const windowsEl = rowEl.querySelector(".fp-area-windows");

          const include = includeEl ? !!includeEl.checked : true;
          const name = nameEl ? String(nameEl.value || "").trim() : "";
          if (!name) return;

          const location_on_plan = locEl ? String(locEl.value || "").trim() : "";
          const windows_location = windowsEl ? String(windowsEl.value || "").trim() : "";
          const itemsRaw = itemsEl ? String(itemsEl.value || "").trim() : "";
          const items_noticed = itemsRaw
            ? itemsRaw.split(",").map((x) => x.trim()).filter(Boolean)
            : [];

          const idxRaw = nameEl ? nameEl.getAttribute("data-room-index") : null;
          const idx = idxRaw !== null ? Number.parseInt(idxRaw, 10) : NaN;

          const base =
            Number.isFinite(idx) && originalRooms[idx] ? { ...originalRooms[idx] } : {};

          confirmed.push({
            ...base,
            name,
            include,
            location_on_plan,
            windows_location,
            items_noticed
          });
        });
        cleanup(confirmed);
      }

      if (closeBtn) closeBtn.addEventListener("click", cancel);
      if (cancelBtn) cancelBtn.addEventListener("click", cancel);
      if (continueBtn) continueBtn.addEventListener("click", confirm);

      // Close on click outside
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cancel();
      });

      // Keyboard: ESC cancels, Enter continues (unless user is typing multiline — inputs are single-line)
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          confirm();
        }
      });
    });
  }

  async function reviewAreasThenGenerate3DView(sourceImageUrl, rooms = []) {
    if (!sourceImageUrl) {
      const msg = tr(
        "floorPlan.noSourceImage",
        null,
        "No source image available to generate 3D view. Please upload a floor plan image or PDF first."
      );
      alert(msg);
      return;
    }

    // If the user disables the list, generate using the floorplan image only.
    if (window.currentFloorPlanUseAreasListFor3D === false) {
      await generate3DView(sourceImageUrl, []);
      return;
    }

    // Otherwise use the persistent under-floorplan editor if present; fall back to provided rooms.
    const sourceAreas =
      Array.isArray(window.currentFloorPlanAreas) && window.currentFloorPlanAreas.length
        ? window.currentFloorPlanAreas
        : rooms;
    const included = (Array.isArray(sourceAreas) ? sourceAreas : []).filter(
      (r) => r && r.include !== false
    );
    await generate3DView(sourceImageUrl, included);
  }

  async function generate3DView(sourceImageUrl, rooms = []) {
      if (!sourceImageUrl) {
          const msg = tr(
            "floorPlan.noSourceImage",
            null,
            "No source image available to generate 3D view. Please upload a floor plan image or PDF first."
          );
          alert(msg);
          return;
      }

      // Create a modal to show progress and result
      const overlay = document.createElement("div");
      overlay.className = "guide-modal-overlay";
      overlay.style.zIndex = "2100";

      const modal = document.createElement("div");
      modal.className = "guide-modal";
      modal.style.maxWidth = "800px";
      modal.style.width = "90%";
      modal.style.padding = "20px";
      modal.style.textAlign = "center";
      
      const genTitle =
        tr("floorPlan.generating3dTitle", null, "✨ Generating 3D Floor Plan...");
      const genDesc =
        tr(
          "floorPlan.generating3dDesc",
          null,
          "Converting your 2D plan into a realistic 3D isometric view. This may take 10-20 seconds."
        );
      const cancelLabel =
        tr("common.cancel", null, "Cancel");

      modal.innerHTML = `
          <h2 style="margin-top:0;">${escapeHtml(genTitle)}</h2>
          <p>${escapeHtml(genDesc)}</p>
          <div style="margin: 20px 0;">
              <div class="app-spinner" style="margin: 0 auto;"></div>
          </div>
          <button class="op-btn op-btn-reset close-3d-btn">${escapeHtml(cancelLabel)}</button>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const closeBtn = modal.querySelector(".close-3d-btn");
      closeBtn.onclick = () => overlay.remove();

      try {
          let roomSummary = "";
          let useData = false;
          
          if (rooms && rooms.length > 0) {
              useData = true;
              roomSummary =
                "The floor plan contains the following areas (user-confirmed):\n" +
                rooms
                  .map((r) => {
                    const loc = r && r.location_on_plan ? `, location: ${r.location_on_plan}` : "";
                    return `- ${(r && r.name) || "Room"}${loc}`;
                  })
                  .join("\n");
          }

          // Custom Style Instructions (User Input)
          const customInstructions = window.currentFloorPlanInstructions 
            ? `\nCUSTOM STYLE/INSTRUCTIONS: ${window.currentFloorPlanInstructions}` 
            : "";

          let prompt;
          
          if (useData) {
            // Prompt WITH simplified room list (Name + Location only) to prevent conflicting geometry
            prompt = `
              Convert this 2D floor plan into a high-quality 3D isometric rendered floor plan.
              
              ROOM LABELS & LOCATIONS:
              ${roomSummary}
              ${customInstructions}
  
              Key requirements:
              1. Geometry & Layout: Strictly follow the floor plan IMAGE.
              2. Labelling: Use the list above to understand which room is which.
              3. Style: Modern, clean, photorealistic.
              4. View angle: Classic isometric top-down (45 degrees).
              5. High resolution, architectural visualization style.
            `;
          } else {
             // Simple Prompt (NO DATA) - Restoration of the original stable prompt
             prompt = `
                Convert this 2D floor plan into a high-quality 3D isometric rendered floor plan.
                ${customInstructions}
                
                Key requirements:
                1. Maintain the exact layout, walls, and room proportions shown in the image.
                2. Extrude walls to show depth.
                3. Apply realistic materials: wood flooring in living areas, tiles in wet areas.
                4. Furnish rooms with modern furniture appropriate for each room type inferred from the image.
                5. Use soft, warm, photorealistic lighting.
                6. View angle: Classic isometric top-down (45 degrees).
                7. High resolution, architectural visualization style.
             `;
          }

          const response = await fetch(getApiUrl("/api/gemini/process-photo"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  imageDataUrl: sourceImageUrl,
                  instructions: prompt,
                  // We omit userId to bypass strict credit checks for this demo feature,
                  // similar to how virtual tour works. Or pass it if you want to charge.
              })
          });

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error || err.details || "Generation failed");
          }

          const data = await response.json();
          
          if (data.imageDataUrl) {
              // Success! Show result.
              const readyTitle =
                tr("floorPlan.ready3dTitle", null, "✨ 3D Floor Plan Ready");
              const closeLabel2 =
                tr("common.close", null, "Close");
              const editLabel =
                tr("floorPlan.editInWorkingArea", null, "Edit in Working Area");
              const downloadLabel =
                tr("common.download", null, "Download");

              modal.innerHTML = `
                  <h2 style="margin-top:0;">${escapeHtml(readyTitle)}</h2>
                  <div style="margin: 20px 0; background: #f9fafb; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                      <img src="${data.imageDataUrl}" style="max-width: 100%; max-height: 60vh; display: block; margin: 0 auto;" />
                  </div>
                  <div style="display: flex; gap: 10px; justify-content: center;">
                      <button class="op-btn close-3d-btn" title="${escapeHtml(tr("floorPlan.tooltipClose3d", null, "Close this window without saving."))}">${escapeHtml(closeLabel2)}</button>
                      <button class="op-btn op-btn-accent edit-3d-btn" title="${escapeHtml(tr("floorPlan.tooltipEdit3d", null, "Load this 3D image into the main workspace to renovate or edit it."))}">${escapeHtml(editLabel)}</button>
                      <button class="op-btn op-btn-accent download-3d-btn" title="${escapeHtml(tr("floorPlan.tooltipDownload3d", null, "Save this 3D floor plan image to your computer."))}">⬇️ ${escapeHtml(downloadLabel)}</button>
                  </div>
              `;
              
              const newCloseBtn = modal.querySelector(".close-3d-btn");
              newCloseBtn.onclick = () => overlay.remove();

              const editBtn = modal.querySelector(".edit-3d-btn");
              editBtn.onclick = () => {
                   if (window.handleImageUpload) {
                       // Create a file object from the data URL
                       fetch(data.imageDataUrl)
                           .then(res => res.blob())
                           .then(blob => {
                               const file = new File([blob], "3d_floor_plan.png", { type: "image/png" });
                               
                               // Let's use the standard "Photo Upload" simulation
                               const dt = new DataTransfer();
                               dt.items.add(file);
                               const fileInput = document.getElementById("photo-file-input");
                               if (fileInput) {
                                   fileInput.files = dt.files;
                                   fileInput.dispatchEvent(new Event('change'));
                                   overlay.remove();
                               } else {
                                   alert("Could not load into working area. Photo uploader not found.");
                               }
                           });
                   } else {
                        // Fallback if handleImageUpload check fails, try input directly
                       fetch(data.imageDataUrl)
                           .then(res => res.blob())
                           .then(blob => {
                               const file = new File([blob], "3d_floor_plan.png", { type: "image/png" });
                               const dt = new DataTransfer();
                               dt.items.add(file);
                               const fileInput = document.getElementById("photo-file-input");
                               if (fileInput) {
                                   fileInput.files = dt.files;
                                   fileInput.dispatchEvent(new Event('change'));
                                   overlay.remove();
                               } else {
                                   alert("Could not load into working area. Photo uploader not found.");
                               }
                           });
                   }
              };
              
              const downloadBtn = modal.querySelector(".download-3d-btn");
              downloadBtn.onclick = () => {
                  const link = document.createElement("a");
                  link.href = data.imageDataUrl;
                  link.download = `3d_floor_plan_${Date.now()}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
              };

              // Add to "Processed Photos" gallery so it persists
              if (typeof window.addProcessedPhotoToGallery === "function") {
                  // Create a dummy match object for the floor plan if one doesn't exist
                  // Or use a generic ID
                  const planId = window.currentFloorPlanContext && window.currentFloorPlanContext.id 
                                 ? window.currentFloorPlanContext.id 
                                 : Date.now();
                                 
                  window.addProcessedPhotoToGallery(
                      planId,
                      data.imageDataUrl,
                      "3D View", // Style Label
                      "Floor Plan" // Renovation Label
                  );
                  console.log("3D View added to Renovation Photos gallery.");
              }
          } else {
             throw new Error("No image returned.");
          }

      } catch (e) {
          console.error(e);
          modal.innerHTML = `
              <h2 style="color: #ef4444; margin-top:0;">Generation Failed</h2>
              <p>${escapeHtml(e.message)}</p>
              <button class="op-btn op-btn-reset close-3d-btn" style="margin-top: 20px;">Close</button>
          `;
          const errCloseBtn = modal.querySelector(".close-3d-btn");
          errCloseBtn.onclick = () => overlay.remove();
      }
  }

  async function generateFloorPlanPdf(plan) {
      if (!window.jspdf) {
          alert("PDF Generator library not loaded. Please refresh.");
          return;
      }
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text(plan.label || "Floor Plan Room List", 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      const dateStr = new Date().toLocaleDateString();
      doc.text(`Generated by AlgoreitAI on ${dateStr}`, 14, 30);
      
      // Columns
      const tableColumn = ["Room", "Dimensions", "Area", "Features"];
      const tableRows = [];

      plan.rooms.forEach(room => {
          const width = typeof room.width === "number" ? room.width.toFixed(2) : "?";
          const length = typeof room.length === "number" ? room.length.toFixed(2) : "?";
          const area = (typeof room.width === "number" && typeof room.length === "number") 
              ? (room.width * room.length).toFixed(2) 
              : "-";
          
          // Combine features into one text block
          let features = [];
          if (room.windows_location) features.push(`Windows: ${room.windows_location}`);
          if (room.doors_location) features.push(`Doors: ${room.doors_location}`);
          if (room.furniture_type) features.push(`Style: ${room.furniture_type}`);
          if (room.kitchen_shape) features.push(`Kitchen: ${room.kitchen_shape}`);
          if (room.bathroom_accessories) features.push(`Bath: ${room.bathroom_accessories}`);
          
          const featureText = features.join("\n");
          
          const rowData = [
              room.name || "Unnamed Room",
              `${width} x ${length} ${plan.units || 'm'}`,
              `${area} m²`,
              featureText
          ];
          tableRows.push(rowData);
      });

      if (doc.autoTable) {
          doc.autoTable({
              head: [tableColumn],
              body: tableRows,
              startY: 40,
              theme: 'grid',
              headStyles: { fillColor: [66, 133, 244] }, // Google Blue-ish
              columnStyles: {
                  0: { fontStyle: 'bold', cellWidth: 30 },
                  1: { cellWidth: 25 },
                  2: { cellWidth: 20 },
                  3: { cellWidth: 'auto' }
              },
              styles: { overflow: 'linebreak', fontSize: 10, cellPadding: 4 }
          });
      } else {
           // Fallback if autoTable is missing
           let y = 40;
           tableRows.forEach(row => {
               doc.text(`${row[0]} | ${row[1]} | ${row[3]}`, 14, y);
               y += 10;
           });
      }
      
      // Save
      doc.save(`virtual_tour_list_${Date.now()}.pdf`);
  }

  function startVirtualTour(rooms) {
      if (!rooms || !rooms.length) return;
      
      let currentIndex = 0;
      const matches = window.currentPhotoMatches || []; // From uploadPhotos.js

      // Create Modal
      const overlay = document.createElement("div");
      overlay.className = "guide-modal-overlay"; // Reuse guide modal overlay style
      overlay.style.zIndex = "2000";

      const modal = document.createElement("div");
      modal.className = "guide-modal"; // Reuse guide modal style
      modal.style.maxWidth = "800px";
      modal.style.width = "90%";
      modal.style.padding = "0";
      modal.style.overflow = "hidden";

      // Render function
      function renderSlide(index) {
          const room = rooms[index];
          const roomName = room.name || `Room ${index + 1}`;
          
          // Find photo for this room
          // Match by Room ID (Option A)
          let match = matches.find(m => m.roomId === index || m.roomId === room.id); 
          
          // If not found by ID, try fuzzy match by name (fallback)
          if (!match && roomName) {
              const slug = roomName.toLowerCase().replace(/[^a-z0-9]/g, "");
              match = matches.find(m => {
                  const mName = (m.roomName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                  return mName.includes(slug) || slug.includes(mName);
              });
          }

          const photoUrl = match ? match.url : null;
          
          // Dimensions
          const width = typeof room.width === 'number' ? room.width.toFixed(2) : "?";
          const length = typeof room.length === 'number' ? room.length.toFixed(2) : "?";

          modal.innerHTML = `
            <div style="background: #fff; display: flex; flex-direction: column; height: 70vh; max-height: 600px;">
                <div style="padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; font-size: 18px;">
                        ${index + 1}. ${escapeHtml(roomName)}
                        <span style="font-weight: 400; color: #666; font-size: 14px; margin-left: 10px;">
                           ${width} x ${length}
                        </span>
                    </div>
                    <button class="close-tour-btn" style="background:none; border:none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="flex: 1; position: relative; background: #f9fafb; display: flex; align-items: center; justify-content: center; overflow: hidden;" id="tour-slide-content-${index}">
                    ${photoUrl 
                        ? `<img src="${photoUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />` 
                        : `<div style="text-align: center; color: #9ca3af; padding: 20px;">
                             <div style="font-size: 40px; margin-bottom: 10px;">📷</div>
                             <div>No photo matched to this room yet.</div>
                             <div style="font-size: 12px; margin-top: 5px; margin-bottom: 15px;">Option 1: Upload photos and match them to "${escapeHtml(roomName)}"</div>
                             <button class="op-btn op-btn-gemini generate-view-btn" data-index="${index}" style="margin-top: 10px;">
                                ✨ Option 2: Generate with AlgoreitAI
                             </button>
                           </div>`
                    }
                    
                    ${index > 0 
                        ? `<button class="tour-nav-btn prev" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;">❮</button>` 
                        : ''}
                    
                    ${index < rooms.length - 1 
                        ? `<button class="tour-nav-btn next" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;">❯</button>` 
                        : ''}
                </div>

                <div style="padding: 15px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #fff;">
                    <div style="font-size: 14px; color: #666;">
                        Room ${index + 1} of ${rooms.length}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        ${photoUrl 
                            ? `<button class="op-btn op-btn-accent" onclick="window.openInWorkingArea(${match.id}); document.querySelector('.guide-modal-overlay').remove();">
                                 Edit this Room
                               </button>`
                            : ''
                        }
                    </div>
                </div>
            </div>
          `;

          // Bind events
          const closeBtn = modal.querySelector(".close-tour-btn");
          if(closeBtn) closeBtn.onclick = () => overlay.remove();

          const prevBtn = modal.querySelector(".tour-nav-btn.prev");
          if(prevBtn) prevBtn.onclick = () => renderSlide(index - 1);

          const nextBtn = modal.querySelector(".tour-nav-btn.next");
          if(nextBtn) nextBtn.onclick = () => renderSlide(index + 1);
          
          const genBtn = modal.querySelector(".generate-view-btn");
          if(genBtn) {
             genBtn.onclick = async () => {
                 const btn = genBtn;
                 const originalText = btn.innerHTML;
                 btn.disabled = true;
                 btn.innerHTML = "✨ Generating...";
                 
                 const container = document.getElementById(`tour-slide-content-${index}`);
                 
                 try {
                     // Build detailed prompt from room data
                     const r = room; // shorthand
                     let details = "";
                     
                     if (r.layout_shape) details += `, shape: ${r.layout_shape}`;
                     if (r.flooring_guess) details += `, flooring: ${r.flooring_guess}`;
                     if (r.architectural_features) details += `, features: ${r.architectural_features}`;
                     if (r.connecting_rooms) details += `, connections: ${r.connecting_rooms}`;
                     
                     if (r.windows_location) details += `, windows: ${r.windows_location}`;
                     if (r.doors_location) details += `, doors: ${r.doors_location}`;
                     if (r.furniture_type) details += `, furniture style: ${r.furniture_type}`;
                     if (r.furniture_location) details += `, layout: ${r.furniture_location}`;
                     if (r.item_relations) details += `, arrangement: ${r.item_relations}`;
                     if (r.kitchen_shape) details += `, kitchen shape: ${r.kitchen_shape}`;
                     if (r.bathroom_accessories) details += `, bathroom features: ${r.bathroom_accessories}`;

                     // USE FLOOR PLAN CONTEXT IF AVAILABLE (Strategy A)
                     let contextImage = null;
                     if (window.currentFloorPlanImage) {
                         contextImage = window.currentFloorPlanImage;
                         console.log("Using floor plan image context for room generation");
                     }

                     let prompt;
                     if (contextImage) {
                         // Vision + Generation Prompt
                         prompt = `Generate a photorealistic eye-level view of the ${roomName} shown in this floor plan. 
                         Focus specifically on the area labeled "${roomName}".
                         Dimensions: ${width}m x ${length}m.
                         Details: ${details}.
                         Perspective: Standing inside the room looking towards the main feature.
                         Structure: Strictly follow the ${r.layout_shape || 'layout'} shown in the plan.
                         Style: Modern interior design, 4k, photorealistic.`;
                     } else {
                         // Text-Only Fallback
                         prompt = `Realistic high-quality architectural photography of a ${roomName}, modern interior design, ${width}m x ${length}m room${details}, empty or lightly furnished, bright natural lighting, 4k, photorealistic`;
                     }
                     
                     const response = await fetch(getApiUrl("/api/gemini/generate-view"), {
                         method: "POST",
                         headers: { "Content-Type": "application/json" },
                         // Pass contextImage if available
                         body: JSON.stringify({ 
                             prompt,
                             contextImage 
                         }) 
                     });
                     
                     const data = await response.json();

                     if (!response.ok) {
                         throw new Error(data.details || data.error || "Generation failed");
                     }
                     
                     if (data.imageDataUrl) {
                         // 1. Add to gallery so it persists
                         if (window.addVirtualTourPhoto) {
                             window.addVirtualTourPhoto(data.imageDataUrl, roomName);
                         }
                         
                         // Update Slide View
                         container.innerHTML = `
                            <img src="${data.imageDataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                            <div style="position: absolute; bottom: 20px; background: rgba(0,0,0,0.7); color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px;">
                                ✨ AI Generated View
                            </div>
                         `;
                         
                         // Re-bind nav buttons since we wiped container HTML
                         if (index > 0) {
                             const prev = document.createElement("button");
                             prev.className = "tour-nav-btn prev";
                             prev.style.cssText = "position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;";
                             prev.innerHTML = "❮";
                             prev.onclick = () => renderSlide(index - 1);
                             container.appendChild(prev);
                         }
                         if (index < rooms.length - 1) {
                             const next = document.createElement("button");
                             next.className = "tour-nav-btn next";
                             next.style.cssText = "position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.8); border: 1px solid #ddd; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;";
                             next.innerHTML = "❯";
                             next.onclick = () => renderSlide(index + 1);
                             container.appendChild(next);
                         }

                     }
                 } catch (e) {
                     console.error(e);
                     alert("Generation Error: " + e.message);
                     btn.innerHTML = "Error. Try again.";
                     btn.disabled = false;
                 }
             };
          }
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // Start at 0
      renderSlide(0);

      // Close on click outside
      overlay.onclick = (e) => {
          if (e.target === overlay) overlay.remove();
      };
  }


  function createFloorPlanLayout(plan) {
    const rooms = Array.isArray(plan.rooms) ? plan.rooms : [];
    if (!rooms.length) {
      return "";
    }

    const numericWidth = (value) => (typeof value === "number" ? value : 0);
    const numericLength = (value) => (typeof value === "number" ? value : 0.5);

    const hasCoordinates = rooms.every(
      (room) => typeof room.x === "number" && typeof room.y === "number"
    );

    const maxCanvasWidth = 600;
    const maxCanvasHeight = 400;

    let svgWidth;
    let svgHeight;
    let rects;

    if (hasCoordinates) {
      let maxX = 0;
      let maxY = 0;

      rooms.forEach((room) => {
        const w = numericWidth(room.width);
        const l = numericLength(room.length);
        const right = (room.x || 0) + w;
        const bottom = (room.y || 0) + l;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      });

      if (maxX === 0) maxX = 1;
      if (maxY === 0) maxY = 1;

      const scale = Math.min(
        maxCanvasWidth / maxX,
        maxCanvasHeight / maxY
      );

      svgWidth = maxX * scale;
      svgHeight = maxY * scale;

      rects = rooms
        .map((room, index) => {
          const roomWidth = numericWidth(room.width);
          const roomLength = numericLength(room.length);

          const w = roomWidth * scale;
          const h = roomLength * scale;
          const x = (room.x || 0) * scale;
          const y = (room.y || 0) * scale;

          const name = escapeHtml(room.name || `Room ${index + 1}`);
          const area = computeArea(room.width, room.length);
          const hasArea = typeof area === "number" && isFinite(area);
          const dimsLabel = `${formatNumber(room.width)} × ${formatNumber(
            room.length
          )} ${escapeHtml(plan.units || "m")}`;
          const areaLabel = hasArea ? `${formatNumber(area)} m²` : "";

          const textYCenter = y + h / 2;
          const nameY = textYCenter - 10;
          const dimsY = textYCenter + 6;
          const areaY = textYCenter + 20;

        return `
          <g class="floor-plan-room" data-room-id="${index}">
            <rect
              x="${x}"
              y="${y}"
              width="${w}"
              height="${h}"
              class="floor-plan-room-rect"
            ></rect>
            <text
              x="${x + w / 2}"
              y="${nameY}"
              class="floor-plan-room-name"
            >
              ${name}
            </text>
            <text
              x="${x + w / 2}"
              y="${dimsY}"
              class="floor-plan-room-size"
            >
              ${dimsLabel}
            </text>
            ${
              hasArea
                ? `<text
              x="${x + w / 2}"
              y="${areaY}"
              class="floor-plan-room-area"
            >
              ${areaLabel}
            </text>`
                : ""
            }
          </g>
        `;
        })
        .join("");
    } else {
      const maxWidth =
        rooms.reduce(
          (max, room) => Math.max(max, numericWidth(room.width)),
          0
        ) || 1;

      const totalLength =
        rooms.reduce(
          (sum, room) => sum + numericLength(room.length),
          0
        ) || 1;

      const scale = Math.min(
        maxCanvasWidth / maxWidth,
        maxCanvasHeight / totalLength
      );

      let currentY = 0;
      const gapMeters = 0.2;

      rects = rooms
        .map((room, index) => {
          const roomWidth = numericWidth(room.width) || maxWidth;
          const roomLength = numericLength(room.length);

          const w = roomWidth * scale;
          const h = roomLength * scale;
          const x = 0;
          const y = currentY;

          currentY += roomLength * scale + gapMeters * scale;

          const name = escapeHtml(room.name || `Room ${index + 1}`);
          const area = computeArea(room.width, room.length);
          const hasArea = typeof area === "number" && isFinite(area);
          const dimsLabel = `${formatNumber(room.width)} × ${formatNumber(
            room.length
          )} ${escapeHtml(plan.units || "m")}`;
          const areaLabel = hasArea ? `${formatNumber(area)} m²` : "";

          const textYCenter = y + h / 2;
          const nameY = textYCenter - 10;
          const dimsY = textYCenter + 6;
          const areaY = textYCenter + 20;

        return `
          <g class="floor-plan-room" data-room-id="${index}">
            <rect
              x="${x}"
              y="${y}"
              width="${w}"
              height="${h}"
              class="floor-plan-room-rect"
            ></rect>
            <text
              x="${x + w / 2}"
              y="${nameY}"
              class="floor-plan-room-name"
            >
              ${name}
            </text>
            <text
              x="${x + w / 2}"
              y="${dimsY}"
              class="floor-plan-room-size"
            >
              ${dimsLabel}
            </text>
            ${
              hasArea
                ? `<text
              x="${x + w / 2}"
              y="${areaY}"
              class="floor-plan-room-area"
            >
              ${areaLabel}
            </text>`
                : ""
            }
          </g>
        `;
        })
        .join("");

      svgWidth = maxWidth * scale;
      svgHeight = totalLength * scale;
    }

    return `
      <div class="floor-plan-layout">
        <svg
          class="floor-plan-svg"
          viewBox="0 0 ${svgWidth} ${svgHeight}"
          role="img"
          aria-label="Simplified 2D floor plan"
        >
          ${rects}
        </svg>
      </div>
    `;
  }

  const measurementLabels = {
    width: "Width",
    length: "Length",
    ceiling_height: "Ceiling height",
  };

  function renderMeasurementInputCell({ field, index, value, roomName, units }) {
    const label = measurementLabels[field] || field;
    const inputId = `${field}-room-${index}`;
    const safeValue = escapeHtml(formatInputValue(value));
    const readableRoomName = roomName || `Room ${index + 1}`;
    const ariaLabelText = `${label} for ${readableRoomName}${
      units ? ` (${units})` : ""
    }`;
    const safeAriaLabel = escapeHtml(ariaLabelText);

    return `
      <td class="floor-plan-measurement-cell">
        <label class="sr-only" for="${inputId}">${safeAriaLabel}</label>
        <input
          id="${inputId}"
          class="floor-plan-dimension-input"
          type="number"
          step="0.05"
          min="0"
          placeholder="-"
          inputmode="decimal"
          data-room-index="${index}"
          data-field="${field}"
          value="${safeValue}"
          aria-label="${safeAriaLabel}"
        />
      </td>
    `;
  }

  function enableMeasurementEditing(container) {
    if (!container || measurementHandlersBound) return;
    container.addEventListener("change", handleMeasurementChange);
    measurementHandlersBound = true;
  }

  function handleMeasurementChange(event) {
    const input = event.target;
    if (!input || !input.classList.contains("floor-plan-dimension-input")) {
      return;
    }
    applyMeasurementUpdate(input, event.currentTarget);
  }

  function applyMeasurementUpdate(input, container) {
    if (
      !editablePlanData ||
      !Array.isArray(editablePlanData.rooms) ||
      !container
    ) {
      return;
    }

    const roomIndex = Number.parseInt(input.dataset.roomIndex, 10);
    const field = input.dataset.field;

    if (
      Number.isNaN(roomIndex) ||
      !field ||
      !editablePlanData.rooms[roomIndex]
    ) {
      return;
    }

    const rawValue = input.value.trim();
    const numericValue =
      rawValue === "" ? null : Number.parseFloat(rawValue);

    if (
      numericValue === null ||
      !Number.isFinite(numericValue) ||
      numericValue < 0
    ) {
      delete editablePlanData.rooms[roomIndex][field];
      input.value = "";
    } else {
      editablePlanData.rooms[roomIndex][field] = numericValue;
      input.value = numericValue.toFixed(2);
    }

    updateAreaCell(container, roomIndex);
    refreshEditableLayout(container);
  }

  function updateAreaCell(container, roomIndex) {
    if (
      !container ||
      !editablePlanData ||
      !editablePlanData.rooms[roomIndex]
    ) {
      return;
    }

    const areaCell = container.querySelector(
      `[data-field="area"][data-room-index="${roomIndex}"]`
    );

    if (!areaCell) return;

    const room = editablePlanData.rooms[roomIndex];
    const area = computeArea(room.width, room.length);
    areaCell.textContent = formatNumber(area);
  }

  function refreshEditableLayout(container) {
    if (!container || lastLayoutMode !== "svg" || !editablePlanData) return;

    const layoutWrapper = container.querySelector(".floor-plan-layout");
    if (!layoutWrapper || !layoutWrapper.parentNode) return;

    const template = document.createElement("template");
    template.innerHTML = createFloorPlanLayout(editablePlanData).trim();
    const nextLayout = template.content.firstElementChild;

    if (nextLayout) {
      layoutWrapper.parentNode.replaceChild(nextLayout, layoutWrapper);
    }
  }

  function numericOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function formatInputValue(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "";
    }
    return value.toFixed(2);
  }

  function clonePlan(plan) {
    try {
      return JSON.parse(JSON.stringify(plan));
    } catch (error) {
      console.warn("[UploadFloorPlans] Failed to clone plan via JSON", error);
      return {
        ...plan,
        rooms: Array.isArray(plan.rooms) ? [...plan.rooms] : [],
      };
    }
  }

  function autoCropCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let top = 0, bottom = h;

    // Find Top (scan for non-white)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Check for non-white pixel (allowing some noise/compression artifacts)
        // If R, G, or B < 250, it's not pure white
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
          top = y;
          // Break both loops
          y = h;
          break;
        }
      }
    }

    // Find Bottom
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
          bottom = y;
          // Break both loops
          y = -1;
          break;
        }
      }
    }

    // If empty or pure white, return original
    if (bottom <= top) return canvas.toDataURL("image/jpeg", 0.8);

    // Add padding
    const padding = 20;
    top = Math.max(0, top - padding);
    bottom = Math.min(h, bottom + padding);
    
    const cropHeight = bottom - top;

    // Create cropped canvas
    const cropped = document.createElement("canvas");
    cropped.width = w;
    cropped.height = cropHeight;
    const croppedCtx = cropped.getContext("2d");

    // Fill white first (for transparency handling if any)
    croppedCtx.fillStyle = "#FFFFFF";
    croppedCtx.fillRect(0, 0, w, cropHeight);

    // Draw the slice
    croppedCtx.drawImage(
      canvas,
      0, top, w, cropHeight, // Source x, y, w, h
      0, 0, w, cropHeight    // Dest x, y, w, h
    );

    return cropped.toDataURL("image/jpeg", 0.9);
  }

  function computeArea(width, length) {
    if (typeof width !== "number" || typeof length !== "number") return NaN;
    return width * length;
  }

  function formatNumber(value) {
    if (typeof value !== "number" || !isFinite(value)) return "-";
    return value.toFixed(2);
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
