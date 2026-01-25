// Independent feature: Upload Photos
// - Lets the user upload one or more photos
// - Lets the user match each photo to a room from the current floor plan
// - Builds a photo name based on floor plan + chosen room
// - Renders a simple gallery of thumbnails and assigned names

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  let photoCounter = 1;
  const photoItems = [];
  const processedItems = [];
  const virtualTourItems = []; // New separate list for Virtual Tour photos
  let saveDirectoryHandle = null;

  // Standard room types for Option B (No Floor Plan)
  const ROOM_TYPES = [
    { id: "living_room", label: "Living Room" },
    { id: "bedroom", label: "Bedroom" },
    { id: "kitchen", label: "Kitchen" },
    { id: "bathroom", label: "Bathroom" },
    { id: "dining_room", label: "Dining Room" },
    { id: "office", label: "Office" },
    { id: "hallway", label: "Hallway" },
    { id: "balcony", label: "Balcony" },
    { id: "kids_room", label: "Kids Room" },
    { id: "master_bedroom", label: "Master Bedroom" },
    { id: "guest_room", label: "Guest Room" },
    { id: "entrance", label: "Entrance" },
    { id: "home_exterior", label: "Home Exterior" },
    { id: "garden", label: "Garden" },
    { id: "other", label: "Other" }
  ];

  window.isOptionBActive = window.isOptionBActive || false;

  function getFloorPlanContext() {
    return window.currentFloorPlanContext || { title: null, rooms: [] };
  }

  function initUploadPhotos() {
    // UPDATED: Support multiple labels (desktop + mobile)
    const uploadLabels = document.querySelectorAll('label[for="photo-file-input"]');
    const uploadButton = document.querySelector('[data-role="upload-photos"]'); // Legacy fallback
    const fileInput = document.getElementById("photo-file-input");
    const floorPlanViewer = document.getElementById("floor-plan-viewer");

    if ((uploadLabels.length === 0 && !uploadButton) || !fileInput) {
      console.warn(
        "[UploadPhotos] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    // Attach listeners to ALL photo upload labels
    uploadLabels.forEach(label => {
        label.addEventListener("click", (e) => {
             // 1. Stop bubbling so parent menus don't close immediately (critical for desktop dropdown)
             e.stopPropagation();
             
             // 2. Reset input value to allow re-selecting the same file
             fileInput.value = "";
             
             // 3. Ensure gallery containers exist (visual feedback)
             ensureGalleryExists();
             
             // 4. Manually close the menu after a safe delay (only matters if inside a menu)
             setTimeout(() => {
                const menu = document.getElementById("upload-dropdown-menu");
                if (menu) menu.classList.remove("is-open");
             }, 800);
        });
    });

    // Fallback for old button structure
    if (uploadButton) {
        uploadButton.addEventListener("click", () => {
            ensureGalleryExists();
            fileInput.click();
        });
    }

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
                // Ensure Working Area is always at the top
                photosContainer.prepend(workingArea);
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

  // Public helper to add processed photo to TOP ROW and Working Area
  window.addProcessedPhotoToGallery = function(originalPhotoId, newUrl, styleId, renovationId) {
      // Try to find in raw photos first
      let original = photoItems.find(p => p.id === originalPhotoId);
      
      // If not found, try processed photos (chaining renovations)
      if (!original) {
          original = processedItems.find(p => p.id === originalPhotoId);
      }

      // If still not found, try virtual tour photos
      if (!original) {
          original = virtualTourItems.find(p => p.id === originalPhotoId);
      }
      
      // If still not found, creating a synthetic original if we can't find the source is risky without more info,
      // but we should try to avoid failing silently.
      if (!original) {
          console.warn("[UploadPhotos] Original photo not found for ID:", originalPhotoId);
          // Create a dummy original to allow saving the result
          original = {
              id: originalPhotoId,
              originalName: "Unknown Source",
              roomId: null
          };
      }

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
            <div class="photo-gallery-title">${escapeHtml(tr("upload.renovationsTitle", null, "✨ Renovation Photos"))}</div>
            <div class="photo-gallery-subtitle">${escapeHtml(tr("upload.renovationsSubtitle", null, "Click to view in Working Area"))}</div>
          </div>
          <button onclick="window.saveRenovatedPhotosToFolder(event)" class="op-btn renovation-save-btn" style="padding: 8px 18px; font-size: 13px;">
            ${escapeHtml(tr("upload.downloadRenovations", null, "💾 Download Photos"))}
          </button>
        </div>
      `;
      
      container.style.display = "block";
      container.innerHTML = `
        ${headerHtml}
        <div class="photo-gallery-grid">
          ${processedItems.map(item => `
            <figure class="photo-card" onclick="window.openInWorkingArea(${item.id}, true)" style="cursor: pointer; border-color: #4285f4; box-shadow: 0 4px 12px rgba(66, 133, 244, 0.15); position: relative;">
              <button onclick="event.stopPropagation(); window.deleteProcessedPhoto(${item.id})" style="position: absolute; top: 5px; right: 5px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="${escapeHtml(tr("upload.deleteRenovation", null, "Delete renovation"))}">🗑️</button>
              <button onclick="event.stopPropagation(); window.downloadPhoto('${item.url}', '${escapeHtml(item.originalName)}')" style="position: absolute; top: 5px; right: 34px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #4285f4; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="${escapeHtml(tr("upload.downloadPhoto", null, "Download photo"))}">⬇️</button>
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
  
  // Public helper to add a standalone virtual tour photo
  window.addVirtualTourPhoto = function(url, roomName) {
      const gallery = ensureGalleryExists(); // Ensures containers exist
      const newId = Date.now(); // Use timestamp to avoid collisions
      
      // Create a item specifically for Virtual Tour
      const newItem = {
          id: newId,
          url: url,
          originalName: `Virtual Tour - ${roomName}`,
          renovation: "AI Generation",
          style: "AlgoreitAI",
          roomId: null,
          isRenovated: true,
          isVirtualTour: true
      };
      
      virtualTourItems.push(newItem);
      
      let container = document.getElementById("virtual-tour-gallery");
      if (!container) {
          // Create container if it doesn't exist, insert before processed-gallery or at top of workspace photos area
          const workspace = document.querySelector(".app-workspace");
          const photosContainer = document.getElementById("photos-container") || workspace;
          const processedGallery = document.getElementById("processed-gallery");
          
          container = document.createElement("div");
          container.id = "virtual-tour-gallery";
          container.className = "photo-gallery";
          container.style.marginBottom = "20px";
          
          if (processedGallery && photosContainer.contains(processedGallery)) {
              processedGallery.parentNode.insertBefore(container, processedGallery);
          } else {
              photosContainer.prepend(container);
          }
      }
      
      container.style.display = "block";
      renderVirtualTourGallery(container);
      
      return newItem;
  };

  // Public helper to add processed photo to TOP ROW and Working Area
  window.addProcessedPhotoToGallery = function(originalPhotoId, newUrl, styleId, renovationId) {
      // Try to find in raw photos first
      let original = photoItems.find(p => p.id === originalPhotoId);
      
      // If not found, try processed photos (chaining renovations)
      if (!original) {
          original = processedItems.find(p => p.id === originalPhotoId);
      }

      // If still not found, try virtual tour photos
      if (!original) {
          original = virtualTourItems.find(p => p.id === originalPhotoId);
      }
      
      // If still not found, creating a synthetic original if we can't find the source is risky without more info,
      // but we should try to avoid failing silently.
      if (!original) {
          console.warn("[UploadPhotos] Original photo not found for ID:", originalPhotoId);
          // Create a dummy original to allow saving the result
          original = {
              id: originalPhotoId,
              originalName: "Unknown Source",
              roomId: null
          };
      }

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

  // Helper to delete a virtual tour photo
  window.deleteVirtualTourPhoto = function(id) {
      const index = virtualTourItems.findIndex(item => item.id === id);
      if (index !== -1) {
          // Check if we are deleting the currently viewed photo
          const workingArea = document.getElementById("photo-working-area");
          const currentImg = workingArea ? workingArea.querySelector("img") : null;
          if (currentImg && currentImg.src === virtualTourItems[index].url) {
              workingArea.style.display = "none";
          }
          
          virtualTourItems.splice(index, 1);
          const container = document.getElementById("virtual-tour-gallery");
          if (container) renderVirtualTourGallery(container);
      }
  };

  window.downloadVirtualTourPhotos = async function(event) {
      const list = virtualTourItems;
      if (!list.length) {
          alert("No virtual tour photos to save.");
          return;
      }
      // Re-use the save logic but target virtualTourItems
      await savePhotosListToFolder(list, "virtual_tour", event);
  };

  // Refactored save function to handle any list
  async function savePhotosListToFolder(list, defaultPrefix, event) {
      const triggerElement = event && event.currentTarget ? event.currentTarget : null;
      if (typeof window.showDirectoryPicker !== "function") {
          alert(tr("alerts.saveFolderNotSupported", null, "Your browser does not support saving directly to folders. Please use the Download buttons instead."));
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
          alert(tr("alerts.folderAccessFailed", null, "Could not access that folder. Please try again."));
          return;
      }
      if (!saveDirectoryHandle) return;

      const hasPermission = await ensureDirectoryWritePermission(saveDirectoryHandle);
      if (!hasPermission) {
          alert(tr("alerts.needFolderWrite", null, "Please allow write access to that folder in order to save photos."));
          saveDirectoryHandle = null;
          return;
      }
      try {
          const usedNames = new Set();
          let saved = 0;
          for (const item of list) {
              const filename = buildUniqueFilename(
                  sanitizeFilename(item.originalName || `${defaultPrefix}_${item.id}.png`),
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
              `Download complete! ${saved} photo${saved === 1 ? "" : "s"} saved to your folder.`,
              "success",
              { anchor: triggerElement }
          );
      } catch (error) {
          console.error("Saving photos failed:", error);
          alert(tr("alerts.savingFailed", null, "Saving photos failed. Please ensure the folder is still accessible."));
      }
  }

  // Bind old save function to new generic one for backward compatibility
  window.saveRenovatedPhotosToFolder = function(event) {
      savePhotosListToFolder(processedItems, "renovated", event);
  };

  function renderVirtualTourGallery(container) {
      if (!container) return;

      if (virtualTourItems.length === 0) {
          container.style.display = "none";
          container.innerHTML = "";
          return;
      }

      const headerHtml = `
        <div class="photo-gallery-header" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div>
            <div class="photo-gallery-title">Virtual Tour Photos</div>
            <div class="photo-gallery-subtitle">Generated by AlgoreitAI</div>
          </div>
          <button onclick="window.downloadVirtualTourPhotos(event)" class="op-btn renovation-save-btn" style="padding: 8px 18px; font-size: 13px;">
            💾 Download Folder
          </button>
        </div>
      `;
      
      container.style.display = "block";
      container.innerHTML = `
        ${headerHtml}
        <div class="photo-gallery-grid">
          ${virtualTourItems.map(item => `
            <figure class="photo-card" onclick="window.openInWorkingArea(${item.id}, false, true)" style="cursor: pointer; border-color: #8b5cf6; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15); position: relative;">
              <button onclick="event.stopPropagation(); window.deleteVirtualTourPhoto(${item.id})" style="position: absolute; top: 5px; right: 5px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Delete">🗑️</button>
              <button onclick="event.stopPropagation(); window.downloadPhoto('${item.url}', '${escapeHtml(item.originalName)}')" style="position: absolute; top: 5px; right: 34px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #8b5cf6; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Download">⬇️</button>
              <div class="photo-card-img-wrap">
                <img src="${item.url}" class="photo-card-img" />
              </div>
              <figcaption class="photo-card-caption">
                <div class="photo-card-name">${escapeHtml(item.originalName)}</div>
                <div class="photo-card-original" style="color: #8b5cf6;">AlgoreitAI</div>
              </figcaption>
            </figure>
          `).join("")}
        </div>
      `;
  }

  // Expose helper to open items from any list
  window.openInWorkingArea = function(id, isProcessed = false, isVirtualTour = false) {
      let list = photoItems;
      if (isVirtualTour) list = virtualTourItems;
      else if (isProcessed) list = processedItems;
      
      const item = list.find(p => p.id === id);
      if (item) openInWorkingArea(item);
  };

  function openInWorkingArea(item) {
      const container = document.getElementById("photo-working-area");
      if (!container) return;
      
      container.style.display = "block";
      container.innerHTML = `
        <div style="background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e0e0ea; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align: center;">
            <div style="margin-bottom: 10px; font-weight: 600; color: #4285f4;">${escapeHtml(tr("upload.workingAreaTitle", { name: item.originalName }, `Working Area - ${item.originalName}`))}</div>
            <div style="position: relative; display: inline-block; max-width: 100%;">
                <img src="${item.url}" style="max-width: 100%; max-height: 60vh; border-radius: 8px; display: block;" />
                <button onclick="window.openLightbox('${item.url}')" style="position: absolute; bottom: 12px; right: 12px; background: rgba(0, 0, 0, 0.6); color: white; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 6px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; backdrop-filter: blur(4px); transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.8)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="${escapeHtml(tr("upload.enlarge", null, "Enlarge Image"))}">
                    ⤢
                </button>
            </div>
            <div class="working-area-caption" style="margin-top: 10px; color: #6b7280; font-size: 13px;">${escapeHtml(tr("upload.workingAreaReady", null, "Ready to Renovate"))}</div>
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

  // Helper to add a photo from Virtual Tour (Text-to-Image)
  window.addVirtualTourPhoto = function(url, roomName) {
      // 1. Create a "fake" raw photo entry first so we have a base ID
      const newId = photoCounter++;
      const rawItem = {
          id: newId,
          url: url, // Use the generated image as the "raw" source too
          originalName: `Virtual Tour - ${roomName}.jpg`,
          roomId: null, // We'll try to find the room ID or just use name
          roomName: roomName,
          isVirtualTour: true
      };
      
      // Try to find matching room in floor plan context to link ID
      const ctx = getFloorPlanContext();
      if (ctx && ctx.rooms) {
          const match = ctx.rooms.find(r => r.name === roomName);
          if (match) rawItem.roomId = match.id;
      }
      
      photoItems.push(rawItem);
      
      // 2. Also add to processed gallery as a "result"
      const processedItem = {
          id: Date.now(),
          url: url,
          originalName: `Virtual Tour - ${roomName}`,
          style: "AlgoreitAI Generated",
          renovation: "Virtual Tour",
          roomId: rawItem.roomId,
          roomName: roomName,
          isRenovated: true
      };
      processedItems.push(processedItem);
      
      // 3. Update UI
      // Ensure gallery containers exist
      const gallery = document.getElementById("photo-gallery");
      if (gallery) renderGallery(gallery);
      
      const processedGallery = document.getElementById("processed-gallery");
      if (processedGallery) {
          processedGallery.style.display = "block";
          renderProcessedGallery(processedGallery);
      } else {
          // If processed gallery doesn't exist yet, force create it
          // reusing the init logic might be hard, so let's just refresh the whole view if possible
          // or manually trigger the ensureGallery logic.
          // For now, let's just rely on renderGallery updating the raw list which is good enough for persistence in session.
      }
      
      // Update global matches so the tour sees it next time
      const matches = window.currentPhotoMatches || [];
      matches.push({
          id: rawItem.id,
          url: url,
          originalName: rawItem.originalName,
          assignedName: roomName, // Simplified
          roomId: rawItem.roomId,
          roomName: roomName
      });
      window.currentPhotoMatches = matches;
  };

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
          ${escapeHtml(tr("upload.empty", null, "No photos uploaded yet. Click \"Upload Photos\" to add images linked to the current floor plan."))}
        </div>
      `;
      return;
    }

    container.classList.remove("photo-gallery-empty");

    const matchesForSharing = [];

    // Pre-calculate Option B numbering (Room Type counts)
    const typeCounts = {};
    photoItems.forEach(p => {
       if (p.roomTypeId) {
           typeCounts[p.roomTypeId] = (typeCounts[p.roomTypeId] || 0) + 1;
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
        } else if (item.roomTypeId) {
            // Option B: User selected room type
            const myTypeId = item.roomTypeId;
            const def = ROOM_TYPES.find(t => t.id === myTypeId) || { id: myTypeId, label: myTypeId };
            const translatedType = tr(`roomTypes.${myTypeId}`, null, def.label);
            // Determine index within this type to add number if needed
            const sameTypeBefore = photoItems
                .slice(0, index)
                .filter(p => p.roomTypeId === myTypeId).length;
            const typeIndex = sameTypeBefore + 1;
            const totalOfType = typeCounts[myTypeId];

            // "If there are few rooms number them"
            const suffix = totalOfType > 1 ? ` ${typeIndex}` : "";
            displayName = `${translatedType}${suffix}`;
            
            // Construct technical assigned name using stable IDs (avoid Hebrew in filenames)
            const fileRoom = `${myTypeId}${totalOfType > 1 ? `_${typeIndex}` : ""}`;
            assignedName = buildPhotoName(baseSlug, fileRoom, index + 1, item.originalName); 
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
                <option value="" disabled ${!item.roomTypeId ? "selected" : ""}>${escapeHtml(tr("upload.matchPhotoRoom", null, "Match Photo-Room"))}</option>
                ${ROOM_TYPES.map(type => {
                    const lbl = tr(`roomTypes.${type.id}`, null, type.label);
                    return `<option value="${type.id}" ${type.id === item.roomTypeId ? "selected" : ""}>${escapeHtml(lbl)}</option>`;
                }).join("")}
                ).join("")}
            </select>`;
        }
        
        return `
          <figure class="photo-card" ${clickAction} style="${cursorStyle} transition: transform 0.2s; position: relative;">
            <button onclick="event.stopPropagation(); window.deleteRawPhoto(${item.id})" style="position: absolute; top: 5px; right: 5px; background: rgba(255, 255, 255, 0.9); border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="${escapeHtml(tr("upload.deletePhoto", null, "Delete photo"))}">🗑️</button>
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
        <div class="photo-gallery-title">${escapeHtml(tr("upload.rawTitle", null, "Raw Photos"))}</div>
        <div class="photo-gallery-subtitle">${escapeHtml(workingAreaExists ? tr("upload.rawSubtitleClick", null, "Click a photo to open in Working Area") : tr("upload.rawSubtitleCount", { count: photoItems.length, plural: photoItems.length === 1 ? "" : "s" }, `${photoItems.length} photo${photoItems.length === 1 ? "" : "s"} uploaded`))}</div>
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
    
    item.roomTypeId = newType;
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
  // Lightbox feature
  window.openLightbox = function(url) {
      // If we are in "product merge preview" mode, the image src in the DOM might be different from the 'url' passed here initially.
      // We should check the current image in the working area first if available.
      const workingAreaImg = document.querySelector("#photo-working-area img");
      let targetUrl = url;
      
      // If the working area image is visible and has a source (and we are likely clicking the button from there), use its current source.
      // This ensures we see the collage/merge result if it's currently being previewed.
      if (workingAreaImg && workingAreaImg.src && workingAreaImg.parentElement && workingAreaImg.parentElement.querySelector("button:hover")) {
          targetUrl = workingAreaImg.src;
      }

      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.cursor = 'zoom-out';
      overlay.onclick = (e) => {
          if (e.target !== img) document.body.removeChild(overlay);
      };

      const img = document.createElement('img');
      img.src = targetUrl;
      img.style.maxWidth = '95vw';
      img.style.maxHeight = '95vh';
      img.style.objectFit = 'contain';
      img.style.borderRadius = '4px';
      img.style.boxShadow = '0 0 20px rgba(0,0,0,0.5)';
      img.onclick = (e) => e.stopPropagation(); // Click image doesn't close

      overlay.appendChild(img);
      
      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '20px';
      closeBtn.style.right = '20px';
      closeBtn.style.background = 'transparent';
      closeBtn.style.border = 'none';
      closeBtn.style.color = '#fff';
      closeBtn.style.fontSize = '40px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.padding = '10px';
      closeBtn.onclick = () => document.body.removeChild(overlay);
      overlay.appendChild(closeBtn);

      document.body.appendChild(overlay);
  };

})();
