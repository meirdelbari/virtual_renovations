// Independent feature: Enhance Photos (Action 4 - "Enhance Quality")
// - Enhances only the photo of the last room chosen via the "Room" button.
// - Applies a basic visual enhancement (brightness/contrast).
// - Updates the on-screen photo (gallery + overlay) via shared helpers.
// - Triggers a download of the enhanced image so the user can save
//   it (e.g., into C:\Users\Meir\virtual_renovations\Enhanched_Photos).

(function () {
  function initEnhancePhotos() {
    const button = document.querySelector('[data-role="enhance-photos"]');
    if (!button) {
      console.warn(
        "[EnhancePhotos] Button not found; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", async () => {
      const matches = Array.isArray(window.currentPhotoMatches)
        ? window.currentPhotoMatches
        : [];
      const last = window.lastFocusedRoomPhoto || null;

      if (!matches.length) {
        alert(
          "There are no uploaded photos to enhance. Use 'Upload Photos' first."
        );
        return;
      }

      if (!last || !last.photoId) {
        alert(
          "Enhance Quality works on the last room photo you viewed. First click 'Room', choose a room, then try again."
        );
        return;
      }

      // Selection-only behavior; processing will occur when the user clicks AlgoreitAI
      window.enhanceSelected = true;
      window.currentRenovationId = "enhance_quality";
      if (window.setFlowLock) {
        window.setFlowLock(null); // No style required for enhance
      }
      if (window.updateSelectionSummary) {
        window.updateSelectionSummary({ enhance: "Enhance Quality" });
      } else {
        const summary = document.getElementById("selection-summary");
        if (summary) summary.classList.remove("is-hidden");
      }

      // Nudge AlgoreitAI button for visibility
      const geminiBtn = document.querySelector('[data-role="gemini-ai"]');
      if (geminiBtn) {
        geminiBtn.classList.add("pulse-animation");
        geminiBtn.textContent = "✨ Click to Process";
        setTimeout(() => {
          geminiBtn.classList.remove("pulse-animation");
          geminiBtn.textContent = "✨ AlgoreitAI";
        }, 3000);
      }
    });
  }

  window.initEnhancePhotos = initEnhancePhotos;

  async function enhanceImage(url) {
    const img = await loadImage(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const contrast = 1.12; // slight contrast boost
    const brightness = 8; // slight brightness boost

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
    a.download = filename || "enhanced_photo.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function buildEnhancedFileName(originalName, id) {
    const base =
      typeof originalName === "string" && originalName
        ? originalName.replace(/\.[a-zA-Z0-9]+$/, "")
        : `photo_${id}`;
    return `${base}_enhanced_${String(id).padStart(2, "0")}.jpg`;
  }

  function refreshRoomPhotoOverlays(originalUrl, enhancedUrl) {
    const overlays = document.querySelectorAll('[id^="room-photo-overlay"]');
    if (!overlays.length) return;

    overlays.forEach((overlay) => {
      const tag = overlay.tagName.toLowerCase();
      if (tag === "image") {
        const currentHref =
          overlay.getAttribute("href") ||
          overlay.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        if (currentHref === originalUrl) {
          overlay.setAttribute("href", enhancedUrl);
          overlay.setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
            enhancedUrl
          );
        }
        return;
      }

      const storedUrl = overlay.dataset.originalUrl;
      if (storedUrl && storedUrl === originalUrl) {
        const img = overlay.querySelector("img");
        if (img) {
          img.src = enhancedUrl;
        }
        overlay.dataset.originalUrl = enhancedUrl;
      }
    });
  }

  function updateWorkingAreaPhoto(photoId, originalUrl, enhancedUrl) {
    const workingArea = document.getElementById("photo-working-area");
    if (!workingArea) return;

    const img = workingArea.querySelector("img");
    if (!img) return;

    const isFocusedPhoto =
      window.lastFocusedRoomPhoto &&
      window.lastFocusedRoomPhoto.photoId === photoId;
    const isSameSrc =
      img.currentSrc === originalUrl ||
      img.getAttribute("src") === originalUrl ||
      img.src === originalUrl;

    if (!isFocusedPhoto && !isSameSrc) return;

    img.src = enhancedUrl;
  }

  function updateFocusedPhotoUrl(photoId, enhancedUrl) {
    if (
      window.lastFocusedRoomPhoto &&
      window.lastFocusedRoomPhoto.photoId === photoId
    ) {
      window.lastFocusedRoomPhoto.url = enhancedUrl;
    }
  }
})();


