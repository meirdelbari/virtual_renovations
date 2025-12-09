// Independent feature: Room viewer (Action 3 - "Room")
// - Shows a list of rooms that have at least one matched photo
// - When the user picks a room, its photo is overlaid at that room's
//   position on the floor plan (JSON plans only).

(function () {
  function getFloorPlanContext() {
    return window.currentFloorPlanContext || { title: null, rooms: [] };
  }

  function getPhotoMatches() {
    return window.currentPhotoMatches || [];
  }

  function initRoomViewer() {
    const button = document.querySelector('[data-role="room-viewer"]');
    const viewer = document.getElementById("floor-plan-viewer"); // Optional

    if (!button) {
      console.warn(
        "[RoomViewer] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const ctx = getFloorPlanContext();
      const photos = getPhotoMatches();

      // If no floor plan rooms, use Option B (Photo List) behavior
      // Also fallback to Option B if viewer is missing (Quarantined mode)
      if (!ctx.rooms || !ctx.rooms.length || !viewer) {
          if (!photos.length) {
            alert("No photos uploaded yet. Please upload photos first.");
            return;
          }
          // Show list of photos/rooms to open in Working Area
          openOptionBRoomList(photos, button);
          return;
      }

      if (!photos.length) {
        alert(
          "No photos are matched yet. Upload and match photos to rooms before using the Room button."
        );
        return;
      }

      openRoomList(viewer, ctx, photos);
    });
  }

  window.initRoomViewer = initRoomViewer;

  // New: Option B specific list
  function openOptionBRoomList(photos, button) {
    closeRoomList(); // ensure only one panel

    const panel = document.createElement("div");
    panel.id = "room-selector-panel";
    panel.className = "room-selector-panel";
    panel.style.zIndex = "2000";
    panel.style.position = "absolute";
    
    // Calculate position relative to the button
    if (button) {
        const rect = button.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        panel.style.left = `${rect.left + scrollX}px`;
        panel.style.top = `${rect.bottom + scrollY + 8}px`;
        panel.style.transform = "none";
    } else {
        // Fallback if no button provided
        panel.style.position = "fixed";
        panel.style.top = "20%";
        panel.style.left = "50%";
        panel.style.transform = "translateX(-50%)";
    }

    const itemsHtml = photos
      .map(
        (photo) => `
        <button
          type="button"
          class="room-selector-item"
          data-photo-id="${photo.id}"
        >
          ${escapeHtml(photo.roomName || photo.assignedName || photo.originalName)}
        </button>
      `
      )
      .join("");

    panel.innerHTML = `
      <div class="room-selector-header">
        <div class="room-selector-title">Select Room to Edit</div>
        <button type="button" class="room-selector-close" aria-label="Close">
          ✕
        </button>
      </div>
      <div class="room-selector-body" style="max-height: 300px; overflow-y: auto;">
        ${itemsHtml}
      </div>
    `;

    document.body.appendChild(panel);

    // Add click outside to close
    const clickHandler = (event) => {
        if (!panel.contains(event.target) && (!button || !button.contains(event.target))) {
            closeRoomList();
            document.removeEventListener("click", clickHandler);
        }
    };
    // Delay adding the event listener slightly to avoid immediate triggering
    setTimeout(() => {
        document.addEventListener("click", clickHandler);
    }, 10);

    panel
      .querySelector(".room-selector-close")
      .addEventListener("click", closeRoomList);

    panel.querySelectorAll(".room-selector-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const photoId = Number(btn.getAttribute("data-photo-id"));
        if (typeof window.openInWorkingArea === "function") {
             window.openInWorkingArea(photoId);
        }
        closeRoomList();
      });
    });
  }

  function openRoomList(container, ctx, photos) {
    closeRoomList(); // ensure only one panel

    const roomsWithPhotos = ctx.rooms.filter((room) =>
      photos.some((p) => p.roomId === room.id)
    );

    if (!roomsWithPhotos.length) {
      alert(
        "No rooms currently have photos assigned. Use the Upload Photos feature to match photos to rooms."
      );
      return;
    }

    const panel = document.createElement("div");
    panel.id = "room-selector-panel";
    panel.className = "room-selector-panel";
    // Force high z-index to ensure it appears above photo overlays
    panel.style.zIndex = "2000";

    const itemsHtml = roomsWithPhotos
      .map(
        (room) => `
        <button
          type="button"
          class="room-selector-item"
          data-room-id="${room.id}"
        >
          ${escapeHtml(room.name)}
        </button>
      `
      )
      .join("");

    panel.innerHTML = `
      <div class="room-selector-header">
        <div class="room-selector-title">Show room photo</div>
        <button type="button" class="room-selector-close" aria-label="Close">
          ✕
        </button>
      </div>
      <div class="room-selector-body">
        ${itemsHtml}
      </div>
    `;

    container.appendChild(panel);

    panel
      .querySelector(".room-selector-close")
      .addEventListener("click", closeRoomList);

    panel.querySelectorAll(".room-selector-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const roomId = Number(btn.getAttribute("data-room-id") || "0");
        const photosForRoom = photos.filter((p) => p.roomId === roomId);
        const photo = photosForRoom[0] || null;

        if (!photo) {
          alert("This room does not have a photo matched yet.");
          return;
        }

        // Remember the last focused room + photo for the Enhance feature
        window.lastFocusedRoomPhoto = {
          roomId,
          photoId: photo.id,
          url: photo.url,
          originalName: photo.originalName || "",
        };

        focusRoomWithPhoto(roomId, photo);
        closeRoomList();
      });
    });
  }

  function closeRoomList() {
    const existing = document.getElementById("room-selector-panel");
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function focusRoomWithPhoto(roomId, photo) {
    const viewer = document.getElementById("floor-plan-viewer");
    const svg = viewer ? viewer.querySelector(".floor-plan-svg") : null;
    
    // Check for AI-analyzed image mode
    const imageContainer = viewer ? viewer.querySelector(".floor-plan-layout img") : null;

    if (imageContainer) {
      // Image Mode (PDF Analysis): Show photo as a centered overlay
      showPhotoOverlay(viewer, photo, roomId);
      return;
    }

    if (!svg) {
      alert(
        "Room photos can currently be shown only for floor plans with a visible layout."
      );
      return;
    }

    const group = svg.querySelector(
      `.floor-plan-room[data-room-id="${roomId}"]`
    );
    if (!group) {
      alert("Could not locate this room on the current floor plan.");
      return;
    }

    // ... (SVG logic continues below) ...
    
    // SVG Mode: Allow multiple overlays by using unique IDs
    const overlayId = `room-photo-overlay-${roomId}`;
    const previousSpecific = svg.querySelector(`#${overlayId}`);
    
    // Only remove if we are replacing the SAME room's photo (to update it)
    if (previousSpecific && previousSpecific.parentNode) {
      previousSpecific.parentNode.removeChild(previousSpecific);
    }
    
    // Also clean up the old legacy single-overlay if it exists
    const legacy = svg.querySelector("#room-photo-overlay");
    if (legacy && legacy.parentNode) {
        legacy.parentNode.removeChild(legacy);
    }

    const bbox = group.getBBox();
    if (!bbox || !bbox.width || !bbox.height) return;

    const ns = "http://www.w3.org/2000/svg";
    const image = document.createElementNS(ns, "image");
    image.id = overlayId; // Use unique ID
    image.dataset.roomId = roomId; // Tag it

    const marginFactor = 0.1; // leave small margin inside the room
    const maxWidth = bbox.width * (1 - marginFactor * 2);
    const maxHeight = bbox.height * (1 - marginFactor * 2);
    const size = Math.min(maxWidth, maxHeight);

    const x = bbox.x + (bbox.width - size) / 2;
    const y = bbox.y + (bbox.height - size) / 2;

    image.setAttribute("x", String(x));
    image.setAttribute("y", String(y));
    image.setAttribute("width", String(size));
    image.setAttribute("height", String(size));
    image.setAttribute("preserveAspectRatio", "xMidYMid slice");
    image.setAttributeNS("http://www.w3.org/1999/xlink", "href", photo.url);
    image.setAttribute("href", photo.url);

    // Add click handler to bring to front or update focus
    image.addEventListener("click", () => {
        // Update global state
        window.lastFocusedRoomPhoto = {
          roomId,
          photoId: photo.id,
          url: photo.url,
          originalName: photo.originalName || "",
        };
        
        // Bring to end of SVG (top of stack)
        if (image.parentNode) {
            image.parentNode.appendChild(image);
        }
    });

    svg.appendChild(image);
  }

  // New helper for Image Mode overlay
  function showPhotoOverlay(container, photo, roomId) {
    // Unique ID for this room's overlay
    const overlayId = `room-photo-overlay-${roomId}`;
    
    // Check if already exists
    let overlay = document.getElementById(overlayId);
    
    if (overlay) {
      // Just bring to front if already open
      overlay.style.zIndex = parseInt(overlay.style.zIndex || 100) + 1;
      return;
    }

    overlay = document.createElement("div");
    overlay.id = overlayId;
    // Store data for updates
    overlay.dataset.originalUrl = photo.url;
    
    // Offset slightly so they don't stack perfectly on top of each other
    const offset = (document.querySelectorAll('[id^="room-photo-overlay-"]').length * 20) % 100;
    
    overlay.style.cssText = `
      position: absolute;
      top: calc(50% + ${offset}px);
      left: calc(50% + ${offset}px);
      transform: translate(-50%, -50%);
      width: 300px;
      height: 220px;
      background: #fff;
      border: 4px solid #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      border-radius: 8px;
      z-index: 100;
      cursor: grab;
      overflow: hidden;
      resize: both;
    `;
    
    // Ensure container is relative so absolute works
    const layoutDiv = container.querySelector(".floor-plan-layout");
    if (layoutDiv) layoutDiv.style.position = "relative";

    overlay.innerHTML = `
      <img src="${photo.url}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;" />
      <div style="position: absolute; bottom: 0; left: 0; right: 15px; background: rgba(0,0,0,0.6); color: #fff; padding: 4px 8px; font-size: 12px; text-align: center; pointer-events: none;">
        ${escapeHtml(photo.originalName)} (Drag to move)
      </div>
      <button class="overlay-btn-expand" style="position: absolute; top: 5px; right: 35px; background: #4285f4; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold; z-index: 10; display: flex; align-items: center; justify-content: center; font-size: 16px;" title="Maximize">⤢</button>
      <button class="overlay-btn-close" style="position: absolute; top: 5px; right: 5px; background: red; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-weight: bold; z-index: 10;" onclick="document.getElementById('${overlayId}').remove()">✕</button>
      <div class="resize-handle" style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #4285f4 50%); z-index: 20;"></div>
    `;

    // Expand Logic
    const expandBtn = overlay.querySelector('.overlay-btn-expand');
    let isExpanded = false;
    let preExpandState = {};

    expandBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent drag start
        if (isExpanded) {
            // Restore
            overlay.style.width = preExpandState.width;
            overlay.style.height = preExpandState.height;
            overlay.style.top = preExpandState.top;
            overlay.style.left = preExpandState.left;
            overlay.style.transform = preExpandState.transform;
            overlay.style.position = preExpandState.position;
            overlay.style.zIndex = preExpandState.zIndex;
            isExpanded = false;
            expandBtn.textContent = '⤢';
            expandBtn.title = "Maximize";
        } else {
            // Save state
            preExpandState = {
                width: overlay.style.width,
                height: overlay.style.height,
                top: overlay.style.top,
                left: overlay.style.left,
                transform: overlay.style.transform,
                position: overlay.style.position,
                zIndex: overlay.style.zIndex
            };
            // Expand to fixed viewport
            overlay.style.width = '90vw';
            overlay.style.height = '90vh';
            overlay.style.top = '50%';
            overlay.style.left = '50%';
            overlay.style.transform = 'translate(-50%, -50%)';
            overlay.style.position = 'fixed';
            overlay.style.zIndex = '9999'; // Always on top
            isExpanded = true;
            expandBtn.textContent = '⤡'; // Collapse icon
            expandBtn.title = "Restore";
        }
    });

    // Resize Logic
    const resizeHandle = overlay.querySelector('.resize-handle');
    resizeHandle.addEventListener('mousedown', initResize);

    function initResize(e) {
        e.stopPropagation(); // Prevent drag start
        e.preventDefault();
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
    }

    function resize(e) {
        const rect = overlay.getBoundingClientRect();
        overlay.style.width = (e.clientX - rect.left) + 'px';
        overlay.style.height = (e.clientY - rect.top) + 'px';
    }

    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
    }

    // Make draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let currentLeft;
    let currentTop;

    overlay.addEventListener("mousedown", dragStart);

    function dragStart(e) {
      // Ignore clicks on the close button or resizing handle
      if (e.target.tagName === 'BUTTON') return;
      
      // Update global state to this photo so Gemini knows which one to process
      window.lastFocusedRoomPhoto = {
          roomId,
          photoId: photo.id,
          url: photo.url,
          originalName: photo.originalName || "",
      };

      // Bring to front on click
      const allOverlays = document.querySelectorAll('[id^="room-photo-overlay-"]');
      let maxZ = 100;
      allOverlays.forEach(el => {
          const z = parseInt(el.style.zIndex || 100);
          if (z > maxZ) maxZ = z;
      });
      overlay.style.zIndex = maxZ + 1;

      initialX = e.clientX;
      initialY = e.clientY;
      
      // Get current computed position
      const rect = overlay.getBoundingClientRect();
      const parentRect = (layoutDiv || container).getBoundingClientRect();
      
      // Convert to relative position if not set yet
      if (overlay.style.transform) {
          // Reset transform and set explicit left/top to make dragging easier logic
          overlay.style.transform = 'none';
          overlay.style.left = (rect.left - parentRect.left) + 'px';
          overlay.style.top = (rect.top - parentRect.top) + 'px';
      }

      currentLeft = parseFloat(overlay.style.left) || 0;
      currentTop = parseFloat(overlay.style.top) || 0;

      isDragging = true;
      overlay.style.cursor = "grabbing";
      
      document.addEventListener("mousemove", drag);
      document.addEventListener("mouseup", dragEnd);
    }

    function drag(e) {
      if (!isDragging) return;
      e.preventDefault();
      
      const dx = e.clientX - initialX;
      const dy = e.clientY - initialY;

      overlay.style.left = (currentLeft + dx) + "px";
      overlay.style.top = (currentTop + dy) + "px";
    }

    function dragEnd() {
      isDragging = false;
      overlay.style.cursor = "grab";
      document.removeEventListener("mousemove", drag);
      document.removeEventListener("mouseup", dragEnd);
    }
    
    if (layoutDiv) {
      layoutDiv.appendChild(overlay);
    } else {
      container.appendChild(overlay);
    }
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
