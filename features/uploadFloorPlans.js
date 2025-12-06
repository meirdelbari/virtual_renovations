// Independent feature: Upload Floor Plans
// - Lets the user upload a JSON file that matches the floor_plan_1 structure
// - Renders the rooms as a simple table in the workspace area

(function () {
  // Shared context so other features (e.g. photo upload) can see
  // the current floor plan title and room names.
  window.currentFloorPlanContext =
    window.currentFloorPlanContext || { title: null, rooms: [] };
  window.currentFloorPlanMeasurements =
    window.currentFloorPlanMeasurements || null;

  let currentVisualUrl = null;
  let editablePlanData = null;
  let lastLayoutMode = null;
  let measurementHandlersBound = false;

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
      if (isOptionBLocked(viewer)) {
        alert(
          "The photo-only workspace (Option B) is active. Please click Reset to return to the standard layout before uploading a floor plan."
        );
        return;
      }
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

  function isOptionBLocked(viewer) {
    if (window.isOptionBActive) return true;
    if (!viewer) return false;
    const workingAreaExists = !!document.getElementById("photo-working-area");
    const viewerHidden =
      viewer.classList.contains("app-placeholder") &&
      viewer.style.display === "none";
    return workingAreaExists && viewerHidden;
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
    window.currentFloorPlanContext = {
      title: rawTitle,
      rooms: [], // rooms cannot be inferred from a generic PDF/Image
    };

    // Initial state: Analyzing
    container.innerHTML = `
      <div class="floor-plan-header">
        <div>
          <div class="floor-plan-title">${safeName}</div>
          <div class="floor-plan-subtitle">
            ✨ Analyzing floor plan with AI... Please wait.
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
            subtitle.innerHTML = `
                Analysis failed. <button class="op-btn op-btn-gemini" id="retry-pdf-btn" style="padding: 4px 12px; font-size: 12px;">Retry AI Analysis</button>
            `;
            const retryBtn = document.getElementById("retry-pdf-btn");
            if (retryBtn) {
                retryBtn.addEventListener("click", () => {
                    subtitle.textContent = "✨ Retrying analysis...";
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
      Analyze this floor plan image. Identify all the rooms.
      Return ONLY a valid JSON object with this structure:
      {
        "label": "Floor Plan",
        "rooms": [
          { "name": "Living Room", "width": 5.0, "length": 4.0, "ceiling_height": 2.8 },
          ...
        ],
        "units": "meters"
      }
      Estimate dimensions if not explicitly written. If ceiling height is unknown, assume 2.8.
      Do not include any markdown formatting or explanation, just the raw JSON string.
    `;

    const response = await fetch("/api/gemini/analyze-photo", {
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

    const title = normalizedPlan.label || normalizedPlan.id || "Floor Plan";
    const units = normalizedPlan.units || "units";

    container.setAttribute("data-floor-plan-name", title);
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
      </div>
    `;

    // Use the original image if provided (from PDF analysis), otherwise generate SVG
    let layoutHtml;
    if (backgroundImageUrl) {
        layoutHtml = `
        <div class="floor-plan-layout" style="text-align: center; background: #f9fafb; padding: 10px; border-radius: 12px; border: 1px solid var(--color-border-subtle); overflow: hidden;">
            <img src="${backgroundImageUrl}" style="width: 100%; height: auto; display: block; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" alt="Floor Plan Analysis Source" />
            <div style="margin-top: 8px; font-size: 12px; color: #6b7280;">
                AI-Analyzed Floor Plan (Visual Reference)
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

    const photosPlaceholderHtml = `
      <div id="photo-gallery" class="photo-gallery photo-gallery-empty">
        <div class="app-placeholder">
          After the floor plan is loaded, click "Upload Photos" to attach
          photos and match them to rooms. Photo names will follow the room
          names from this floor plan.
        </div>
      </div>
    `;

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

    container.innerHTML =
      headerHtml + layoutHtml + photosPlaceholderHtml + tableHtml;
    enableMeasurementEditing(container);
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
