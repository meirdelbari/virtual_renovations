// Independent feature: Upload Photos
// - Lets the user upload one or more photos
// - Lets the user match each photo to a room from the current floor plan
// - Builds a photo name based on floor plan + chosen room
// - Renders a simple gallery of thumbnails and assigned names

(function () {
  let photoCounter = 1;
  const photoItems = [];
  const processedItems = [];
  let saveDirectoryHandle = null;

  // Standard room types for Option B (No Floor Plan)
  const ROOM_TYPES = [
    "Living Room",
    "Bedroom",
    "Kitchen",
    "Bathroom",
    "Dining Room",
    "Office",
    "Hallway",
    "Balcony",
    "Kids Room",
    "Master Bedroom",
    "Guest Room",
    "Entrance",
    "Home Exterior",
    "Garden",
    "Other"
  ];

  window.isOptionBActive = window.isOptionBActive || false;

  function getFloorPlanContext() {
    return window.currentFloorPlanContext || { title: null, rooms: [] };
  }

  function initUploadPhotos() {
    const uploadButton = document.querySelector('[data-role="upload-photos"]');
    const fileInput = document.getElementById("photo-file-input");
    const floorPlanViewer = document.getElementById("floor-plan-viewer"); // Optional now

    if (!uploadButton || !fileInput) {
      console.warn(
        "[UploadPhotos] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    uploadButton.addEventListener("click", () => {
      // Allow upload without floor plan
      // Check if gallery exists, if not create it (No Floor Plan Mode)
      ensureGalleryExists();
      fileInput.click();
    });

    function ensureGalleryExists() {
        const workspace = document.querySelector(".app-workspace");
        const viewer = document.getElementById("floor-plan-viewer");
        
        // Robustly ensure photos-container exists in the correct position (after viewer, before table)
        let photosContainer = document.getElementById("photos-container");
        if (!photosContainer && workspace) {
            photosContainer = document.createElement("div");
            photosContainer.id = "photos-container";
            
            // Insert strictly after floor-plan-viewer
            if (viewer && viewer.parentNode === workspace) {
                viewer.insertAdjacentElement('afterend', photosContainer);
            } else {
                // If viewer is missing or weird, prepend to ensure it's above potential bottom elements
                workspace.prepend(photosContainer);
            }
        }
        
        let gallery = document.getElementById("photo-gallery");
        
        if (!gallery && photosContainer) {
            // Hide floor plan placeholder if it's the default empty one
            if (viewer && viewer.classList.contains("app-placeholder")) {
                viewer.style.display = "none";
            }

            // Always activate "Option B" mode
            window.isOptionBActive = true;
            
            if (!document.getElementById("photo-working-area")) {
                const workingArea = document.createElement("div");
                workingArea.id = "photo-working-area";
                workingArea.className = "photo-working-area";
                workingArea.style.marginBottom = "30px";
                workingArea.style.display = "none"; 
                photosContainer.appendChild(workingArea);
            }

            if (!document.getElementById("processed-gallery")) {
                const processedGallery = document.createElement("div");
                processedGallery.id = "processed-gallery";
                processedGallery.className = "photo-gallery";
                processedGallery.style.marginBottom = "20px";
                processedGallery.style.display = "none"; 
                photosContainer.appendChild(processedGallery);
            }

            gallery = document.createElement("div");
            gallery.id = "photo-gallery";
            gallery.className = "photo-gallery";
            photosContainer.appendChild(gallery);
        }
        return gallery;
    }

    fileInput.addEventListener("change", (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      const gallery = ensureGalleryExists();
      if (!gallery) {
        console.warn("[UploadPhotos] Could not create gallery.");
        return;
      }

      const ctx = getFloorPlanContext();
      const rooms = Array.isArray(ctx.rooms) ? ctx.rooms : [];

      files.forEach((file) => {
        const url = URL.createObjectURL(file);
        const newId = photoCounter++;

        const newItem = {
          id: newId,
          url,
          originalName: file.name || "",
          roomId: rooms.length ? rooms[0].id : null,
        };

        photoItems.push(newItem);
      });

      renderGallery(gallery);
      
      // If it's the first photo and we are in No Floor Plan mode, open it immediately
      if (photoItems.length === 1 && !document.getElementById("floor-plan-viewer")) {
          openInWorkingArea(photoItems[0]);
      }
      
      // Reset input so the same file can be uploaded again if needed
      fileInput.value = "";
    });
  }

  window.saveRenovatedPhotosToFolder = async function (event) {
      const triggerElement = event && event.currentTarget ? event.currentTarget : null;
      if (typeof window.showDirectoryPicker !== "function") {
          alert("Your browser does not support saving directly to folders. Please use the Download buttons instead.");
          return;
      }
      if (!processedItems.length) {
          alert("There are no renovation photos to save yet.");
          return;
      }
      try {
          if (!saveDirectoryHandle || (event && event.shiftKey)) {
              saveDirectoryHandle = await window.showDirectoryPicker({
                  mode: "readwrite",
              });
          }
      } catch (error) {
          if (error && error.name === "AbortError") return;
          console.error("Folder picker error:", error);
          alert("Could not access that folder. Please try again.");
          return;
      }
      if (!saveDirectoryHandle) return;

      const hasPermission = await ensureDirectoryWritePermission(saveDirectoryHandle);
      if (!hasPermission) {
          alert("Please allow write access to that folder in order to save photos.");
          saveDirectoryHandle = null;
          return;
      }
      try {
          const usedNames = new Set();
          let saved = 0;
          for (const item of processedItems) {
              const filename = buildUniqueFilename(
                  sanitizeFilename(item.originalName || `renovated_${item.id}.png`),
                  usedNames
              );
              const fileHandle = await saveDirectoryHandle.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              const response = await fetch(item.url);
              await writable.write(await response.blob());
              await writable.close();
              saved++;
          }
          showToast(
              `Download complete! ${saved} renovation photo${saved === 1 ? "" : "s"} saved to your folder.`,
              "success",
              { anchor: triggerElement }
          );
      } catch (error) {
          console.error("Saving renovation photos failed:", error);
          alert("Saving photos failed. Please ensure the folder is still accessible.");
      }
  };

  // Public helper to add processed photo to TOP ROW and Working Area
  window.addProcessedPhotoToGallery = function(originalPhotoId, newUrl, styleId, renovationId) {
      // Try to find in raw photos first
      let original = photoItems.find(p => p.id === originalPhotoId);
      
      // If not found, try processed photos (chaining renovations)
      if (!original) {
          original = processedItems.find(p => p.id === originalPhotoId);
      }
      
      if (!original) return;

      // 1. Create a NEW item for the renovated photo list (Renovated Row)
      const renovationLabel = renovationId ? renovationId.replace(/_/g, ' ') : "Renovated";
      const labelPrefix =
          typeof renovationLabel === "string" && renovationLabel.toLowerCase().includes("enhanc")
              ? "Enhanced"
              : "Renovated";
      
      // Simplify name to avoid "Renovated - Renovated - ..."
      let baseName = original.originalName || "";
      const knownPrefixes = ["Renovated - ", "Enhanced - "];
      knownPrefixes.forEach(prefix => {
          if (baseName.startsWith(prefix)) {
              baseName = baseName.substring(prefix.length);
          }
      });
      if (!baseName) {
          baseName = original.originalName || "";
      }
      
      const newItem = {
          id: Date.now(), // Use timestamp for unique ID in processed list
          url: newUrl,
          originalName: `${labelPrefix} - ${baseName || `photo_${originalPhotoId}`}`,
          style: styleId,
          renovation: renovationId,
          roomId: original.roomId, 
          isRenovated: true
      };
      
      // Add to processed list
      processedItems.push(newItem);
      
      // 2. Ensure processed-gallery exists in the correct place
      let container = document.getElementById("processed-gallery");
      if (!container) {
          const workspace = document.querySelector(".app-workspace");
          const photosContainer = document.getElementById("photos-container") || workspace;
          const rawGallery = document.getElementById("photo-gallery");
          
          container = document.createElement("div");
          container.id = "processed-gallery";
          container.className = "photo-gallery";
          container.style.marginBottom = "20px";
          container.style.display = "none"; 

          // Always insert before raw gallery in workspace
          if (rawGallery && photosContainer.contains(rawGallery)) {
              rawGallery.parentNode.insertBefore(container, rawGallery);
          } else {
              photosContainer.appendChild(container);
          }
      }

      // 3. Re-render Renovated Gallery
      container.style.display = "block";
      renderProcessedGallery(container);

      // 4. Update the Working Area (Only for Option B)
      // If Working Area doesn't exist (Option A), this function does nothing safely.
      openInWorkingArea(newItem);

      // Update caption to show details (Option B)
      const workingArea = document.getElementById("photo-working-area");
      if (workingArea) {
          const caption = workingArea.querySelector(".working-area-caption");
          if (caption) caption.textContent = `Result: ${renovationLabel} (${styleId || "Modern"})`;
      }

      return newItem; // Return the item so caller can use it (e.g. Gemini chaining)
  };

  // Public helper to delete a processed photo
  window.deleteProcessedPhoto = function(id) {
      const index = processedItems.findIndex(item => item.id === id);
      if (index !== -1) {
          // Check if we are deleting the currently viewed photo
          const workingArea = document.getElementById("photo-working-area");
          const currentImg = workingArea ? workingArea.querySelector("img") : null;
          if (currentImg && currentImg.src === processedItems[index].url) {
              // Clear working area or reset? Let's hide it to avoid confusion
              workingArea.style.display = "none";
          }
          
          processedItems.splice(index, 1);
          const container = document.getElementById("processed-gallery");
          if (container) renderProcessedGallery(container);
      }
  };

  // Public helper to delete a raw photo
  window.deleteRawPhoto = function(id) {
      const index = photoItems.findIndex(item => item.id === id);
      if (index !== -1) {
          // Check if we are deleting the currently viewed photo
          const workingArea = document.getElementById("photo-working-area");
          const currentImg = workingArea ? workingArea.querySelector("img") : null;
          if (currentImg && currentImg.src === photoItems[index].url) {
              workingArea.style.display = "none";
          }
          
          photoItems.splice(index, 1);
          const container = document.getElementById("photo-gallery");
          if (container) renderGallery(container);
      }
  };

  // Public helper to download a photo
  window.downloadPhoto = function(url, filename) {
      const link = document.createElement("a");
      link.href = url;
      const safeName = sanitizeFilename(filename || "renovated-photo.png");
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  function renderProcessedGallery(container) {
      if (!container) return;

      if (processedItems.length === 0) {
          container.style.display = "none";
          container.innerHTML = "";
          return;
      }

      const headerHtml = `
        <div class="photo-gallery-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div>
            <div class="photo-gallery-title">✨ Renovation Photos</div>
            <div class="photo-gallery-subtitle">Click to view in Working Area</div>
          </div>
          <button onclick="window.saveRenovatedPhotosToFolder(event)" class="op-btn renovation-save-btn" style="padding: 8px 18px; font-size: 13px;">
            💾 Download Renovation Photos
          </button>
        </div>
      `;
      
      container.style.display = "block";
      container.innerHTML = `
        ${headerHtml}
        <div class="photo-gallery-grid">
          ${processedItems.map(item => `
            <figure class="photo-card" onclick="window.openInWorkingArea(${item.id}, true)" style="cursor: pointer; border-color: #4285f4; box-shadow: 0 4px 12px rgba(66, 133, 244, 0.15); position: relative;">
              <button onclick="event.stopPropagation(); window.deleteProcessedPhoto(${item.id})" style="position: absolute; top: 5px; right: 5px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Delete renovation">🗑️</button>
              <button onclick="event.stopPropagation(); window.downloadPhoto('${item.url}', '${escapeHtml(item.originalName)}')" style="position: absolute; top: 5px; right: 34px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #4285f4; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Download photo">⬇️</button>
              <div class="photo-card-img-wrap">
                <img src="${item.url}" class="photo-card-img" />
              </div>
              <figcaption class="photo-card-caption">
                <div class="photo-card-name">${escapeHtml(item.renovation || "Renovated")}</div>
                <div class="photo-card-original" style="color: #4285f4;">${escapeHtml(item.style || "Modern")}</div>
              </figcaption>
            </figure>
          `).join("")}
        </div>
      `;
  }
  
  // Expose helper to open items from either list
  window.openInWorkingArea = function(id, isProcessed = false) {
      const list = isProcessed ? processedItems : photoItems;
      const item = list.find(p => p.id === id);
      if (item) openInWorkingArea(item);
  };

  function openInWorkingArea(item) {
      const container = document.getElementById("photo-working-area");
      if (!container) return;
      
      container.style.display = "block";
      container.innerHTML = `
        <div style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e0e0ea; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align: center;">
            <div style="margin-bottom: 10px; font-weight: 600; color: #4285f4;">Working Area - ${escapeHtml(item.originalName)}</div>
            <div style="position: relative; display: inline-block; max-width: 100%;">
                <img src="${item.url}" style="max-width: 100%; max-height: 60vh; border-radius: 8px; display: block;" />
            </div>
            <div class="working-area-caption" style="margin-top: 10px; color: #6b7280; font-size: 13px;">Ready to Renovate</div>
        </div>
      `;
      
      // Set focus for Gemini
      window.lastFocusedRoomPhoto = {
            roomId: item.roomId,
            photoId: item.id,
            url: item.url,
            originalName: item.originalName,
            // Important: Include the display name (e.g., "Bedroom 1") so Gemini knows the room type
            roomName: item.roomName || item.assignedName || item.originalName
      };
      
      // Scroll to it
      container.scrollIntoView({ behavior: "smooth" });
  }

  window.initUploadPhotos = initUploadPhotos;

  function renderGallery(container) {
    const ctx = getFloorPlanContext();
    const rooms = Array.isArray(ctx.rooms) ? ctx.rooms : [];
    const baseSlug = slugify(ctx.title || "floor_plan");

    if (!photoItems.length) {
      window.currentPhotoMatches = [];
      container.classList.add("photo-gallery-empty");
      container.innerHTML = `
        <div class="app-placeholder">
          No photos uploaded yet. Click "Upload Photos" to add images linked to the current floor plan.
        </div>
      `;
      return;
    }

    container.classList.remove("photo-gallery-empty");

    const matchesForSharing = [];

    // Pre-calculate Option B numbering (Room Type counts)
    const typeCounts = {};
    photoItems.forEach(p => {
       if (p.roomType) {
           typeCounts[p.roomType] = (typeCounts[p.roomType] || 0) + 1;
       }
    });

    const itemsHtml = photoItems
      .map((item, index) => {
        let assignedName = "";
        let displayName = "";

        const room = rooms.find((r) => r.id === item.roomId) || null;
        
        if (room) {
            // Option A: Linked to real floor plan room
            assignedName = buildPhotoName(baseSlug, room.name, index + 1, item.originalName);
            displayName = assignedName;
        } else if (item.roomType) {
            // Option B: User selected room type
            const myType = item.roomType;
            // Determine index within this type to add number if needed
            const sameTypeBefore = photoItems
                .slice(0, index)
                .filter(p => p.roomType === myType).length;
            const typeIndex = sameTypeBefore + 1;
            const totalOfType = typeCounts[myType];

            // "If there are few rooms number them"
            const suffix = totalOfType > 1 ? ` ${typeIndex}` : "";
            displayName = `${myType}${suffix}`;
            
            // Construct technical assigned name based on display name
            assignedName = buildPhotoName(baseSlug, `${myType}${suffix}`, index + 1, item.originalName); 
        } else {
            // Fallback / Unassigned
            assignedName = buildPhotoName(baseSlug, null, index + 1, item.originalName);
            displayName = assignedName;
        }

        item.assignedName = assignedName;
        // We also store the friendly room name on the item for other features to use
        item.roomName = displayName; 

        matchesForSharing.push({
          id: item.id,
          url: item.url,
          originalName: item.originalName,
          assignedName,
          roomId: item.roomId,
          roomName: displayName
        });

        const safeAssigned = escapeHtml(displayName);
        
        // Check if we are in Option B (Working Area exists)
        const workingAreaExists = !!document.getElementById("photo-working-area");
        const clickAction = workingAreaExists ? `onclick="window.openInWorkingArea(${item.id})"` : "";
        const cursorStyle = workingAreaExists ? "cursor: pointer;" : "cursor: default;";
        
        // Logic for Room Selector (Dropdown)
        let selectHtml = "";
        if (rooms.length > 0) {
             // Option A: Room List from Floor Plan
             selectHtml = `<select class="photo-card-select" onchange="window.updatePhotoRoom(${item.id}, this.value)" onclick="event.stopPropagation()">
              ${rooms
                .map(
                  (r) =>
                    `<option value="${r.id}" ${
                      r.id === item.roomId ? "selected" : ""
                    }>${escapeHtml(r.name)}</option>`
                )
                .join("")}
            </select>`;
        } else {
             // Option B: Static Room Types
             selectHtml = `<select class="photo-card-select" onchange="window.assignPhotoToRoomType(${item.id}, this.value)" onclick="event.stopPropagation()">
                <option value="" disabled ${!item.roomType ? "selected" : ""}>Match Photo-Room</option>
                ${ROOM_TYPES.map(type => 
                    `<option value="${type}" ${type === item.roomType ? "selected" : ""}>${type}</option>`
                ).join("")}
            </select>`;
        }
        
        return `
          <figure class="photo-card" ${clickAction} style="${cursorStyle} transition: transform 0.2s; position: relative;">
            <button onclick="event.stopPropagation(); window.deleteRawPhoto(${item.id})" style="position: absolute; top: 5px; right: 5px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Delete photo">🗑️</button>
            <div class="photo-card-img-wrap">
              <img
                src="${item.url}"
                alt="${safeAssigned}"
                class="photo-card-img"
              />
            </div>
            <figcaption class="photo-card-caption">
              ${selectHtml}
              <div class="photo-card-name">${safeAssigned}</div>
            </figcaption>
          </figure>
        `;
      })
      .join("");

    // Update global matches so other modules (like NanaBanana/Gemini) can use them
    window.currentPhotoMatches = matchesForSharing;

    // ... header ...
    const workingAreaExists = !!document.getElementById("photo-working-area");
    container.innerHTML = `
      <div class="photo-gallery-header">
        <div class="photo-gallery-title">Raw Photos</div>
        <div class="photo-gallery-subtitle">${workingAreaExists ? "Click a photo to open in Working Area" : `${photoItems.length} photo${photoItems.length === 1 ? "" : "s"} uploaded`}</div>
      </div>
      <div class="photo-gallery-grid">
        ${itemsHtml}
      </div>
    `;
  }

  // Public helper to update room assignment (Option A - by ID)
  window.updatePhotoRoom = function (photoId, newRoomId) {
    const item = photoItems.find((p) => p.id === photoId);
    if (!item) return;
    item.roomId = parseInt(newRoomId, 10);
    // Clear manual type if linked to a real room
    item.roomType = null;

    const gallery = document.getElementById("photo-gallery");
    if (gallery) renderGallery(gallery);
  };

  // Public helper to assign room type (Option B - by String)
  window.assignPhotoToRoomType = function(photoId, newType) {
    const item = photoItems.find((p) => p.id === photoId);
    if (!item) return;
    
    item.roomType = newType;
    // Clear specific room ID if switching to generic type (though usually they are mutually exclusive modes)
    item.roomId = null;
    
    const gallery = document.getElementById("photo-gallery");
    if (gallery) renderGallery(gallery);
    
    // Update focus immediately if this photo is currently in working area
    const workingArea = document.getElementById("photo-working-area");
    const currentImg = workingArea ? workingArea.querySelector("img") : null;
    if (currentImg && currentImg.src === item.url) {
        openInWorkingArea(item); // Re-open to refresh the caption/focus
    }
  };

  // Public helper so other features (e.g., Enhance) can update a photo URL
  window.updatePhotoUrlForGallery = function (photoId, newUrl) {
    const container = document.getElementById("photo-gallery");
    if (!container) return;
    const item = photoItems.find((p) => p.id === photoId);
    if (!item) return;
    item.url = newUrl;
    renderGallery(container);
  };

  function buildPhotoName(baseSlug, roomName, index, originalName) {
    const extMatch = (originalName || "").match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0].toLowerCase() : "";
    const indexStr = String(index).padStart(2, "0");

    // If roomName is missing, simply use "photo"
    if (!roomName) {
        return `photo_${indexStr}${ext}`;
    }
    
    const roomSlug = slugify(roomName);
    return `${baseSlug}_${roomSlug}_photo_${indexStr}${ext}`;
  }

  function slugify(str) {
    if (typeof str !== "string") return "floor_plan";
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "floor_plan";
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

  function sanitizeFilename(name) {
    if (typeof name !== "string" || !name.trim()) {
        return `renovated_${Date.now()}.png`;
    }
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  function buildUniqueFilename(name, registry) {
    if (!registry) return name;
    const dotIndex = name.lastIndexOf(".");
    const base = dotIndex === -1 ? name : name.slice(0, dotIndex);
    const ext = dotIndex === -1 ? "" : name.slice(dotIndex);
    let candidate = name;
    let counter = 2;
    while (registry.has(candidate)) {
        candidate = `${base}_${counter}${ext}`;
        counter++;
    }
    registry.add(candidate);
    return candidate;
  }

  async function ensureDirectoryWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== "function") {
        return true;
    }
    const opts = { mode: "readwrite" };
    const current = await handle.queryPermission(opts);
    if (current === "granted") {
        return true;
    }
    if (typeof handle.requestPermission === "function") {
        const result = await handle.requestPermission(opts);
        return result === "granted";
    }
    return false;
  }

  function showToast(message, variant = "info", options = {}) {
    const anchor = options && options.anchor ? options.anchor : null;
    const palette = {
        success: { bg: "linear-gradient(135deg, #8b5cf6, #0ea5e9)", text: "#ffffff", accent: "rgba(14,165,233,0.4)" },
        error: { bg: "#7f1d1d", text: "#fee2e2", accent: "#f87171" },
        info: { bg: "#1d4ed8", text: "#eff6ff", accent: "#93c5fd" },
    };
    const titles = {
        success: "Success",
        error: "Action needed",
        info: "Heads up",
    };

    const theme = palette[variant] || palette.info;
    const title = titles[variant] || titles.info;
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "assertive");
    toast.style.position = "fixed";
    toast.style.zIndex = "1200";
    toast.style.padding = "18px 22px";
    toast.style.minWidth = "300px";
    toast.style.maxWidth = "420px";
    toast.style.borderRadius = "14px";
    toast.style.boxShadow = "0 25px 65px rgba(15, 23, 42, 0.35)";
    toast.style.background = theme.bg;
    toast.style.color = theme.text;
    toast.style.fontFamily = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    toast.style.fontSize = "15px";
    toast.style.lineHeight = "1.4";
    toast.style.fontWeight = "500";
    toast.style.border = `1px solid ${theme.accent}`;
    toast.style.pointerEvents = "none";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "opacity 200ms ease, transform 200ms ease";

    const anchorRect =
        anchor && typeof anchor.getBoundingClientRect === "function"
            ? anchor.getBoundingClientRect()
            : null;
    const enterY = 20;
    const exitY = 0;

    if (anchorRect) {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const offsetTop = Math.min(
            viewportHeight - 80,
            Math.max(16, anchorRect.bottom + 12)
        );
        const offsetLeft = Math.max(32, anchorRect.left - 40);
        toast.style.top = `${offsetTop}px`;
        toast.style.left = `${offsetLeft}px`;
        toast.style.transform = `translate(0, ${enterY}px)`;
    } else {
        toast.style.bottom = "36px";
        toast.style.left = "36px";
        toast.style.right = "auto";
        toast.style.transform = `translate(0, ${enterY}px)`;
    }

    toast.innerHTML = `
      <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">${title}</div>
      <div>${message}</div>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = `translate(0, ${exitY}px)`;
    });

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = `translate(0, ${enterY}px)`;
        toast.addEventListener(
            "transitionend",
            () => document.body.contains(toast) && document.body.removeChild(toast),
            { once: true }
        );
    }, options && typeof options.duration === "number" ? options.duration : 4500);
  }
})();
