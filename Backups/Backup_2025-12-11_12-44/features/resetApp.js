// Independent feature: Reset Application
// - Reloads the page to return to the initial state

(function () {
  function initResetApp() {
    const resetButton = document.querySelector(".op-btn-reset");
    if (!resetButton) {
      console.warn("[ResetApp] Button not found; feature will not initialize.");
      return;
    }

    resetButton.addEventListener("click", () => {
        // Optional: Add confirmation if there is unsaved work, 
        // but for now we simply reload as requested to get to initial position.
        // Check if any photos or floor plans are loaded to decide on confirmation?
        const hasContent = 
            (window.uploadedPhotos && window.uploadedPhotos.length > 0) || 
            (window.currentFloorPlanContext && window.currentFloorPlanContext.title) ||
            document.getElementById("photo-gallery").children.length > 0;

        if (hasContent) {
            if (confirm("Reset application? All uploaded floor plans and photos will be lost.")) {
                window.location.reload();
            }
        } else {
             window.location.reload();
        }
    });
  }

  window.initResetApp = initResetApp;
})();










