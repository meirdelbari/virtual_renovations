// Independent feature: Reset Application
// - Reloads the page to return to the initial state

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  function initResetApp() {
    const resetButton = document.querySelector(".op-btn-reset");
    if (!resetButton) {
      console.warn("[ResetApp] Button not found; feature will not initialize.");
      return;
    }

    resetButton.addEventListener("click", () => {
        const photoGallery = document.getElementById("photo-gallery");
        const hasContent = 
            (window.uploadedPhotos && window.uploadedPhotos.length > 0) || 
            (window.currentFloorPlanContext && window.currentFloorPlanContext.title) ||
            (photoGallery && photoGallery.children && photoGallery.children.length > 0);

        const proceed =
            !hasContent || confirm(tr("alerts.resetConfirm", null, "Reset application? All uploaded floor plans and photos will be lost."));

        if (!proceed) return;

        // Flag to skip landing once after reload
        try {
            sessionStorage.setItem("skipLandingOnce", "1");
            
            // Clear persistent style selection
            if (window.localStorage) {
                window.localStorage.removeItem("VR_SELECTED_STYLE_ID");
            }
            if (window.sessionStorage) {
                window.sessionStorage.removeItem("VR_SELECTED_STYLE_ID");
            }

            // Also ensure product selection is cleared
            window.currentProductSelection = null;
        } catch (_) {}

        // Full reload to clear all state, but we'll auto-enter the app on load
        window.location.reload();
    });
  }

  window.initResetApp = initResetApp;
})();










