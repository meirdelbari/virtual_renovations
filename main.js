// Entry point: wire up independent feature modules using globals.

// Shared flow lock to enforce required steps between Renovate/Furniture and Style/Gemini
// type can be "renovate" or "stage"; requiresStyleAck=true forces Style click after selection
// Call with null/undefined/false to clear the lock.
window.setFlowLock = function (type) {
  if (!type) {
    window.flowLock = { active: false, type: null, requiresStyleAck: false };
    return;
  }
  window.flowLock = { active: true, type, requiresStyleAck: true };
};

function initOpsGuard() {
  const operationsBar = document.querySelector(".operations-bar");
  if (!operationsBar) return;

  operationsBar.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const role = btn.getAttribute("data-role") || "";
      // Allow Reset at any time
      if (btn.classList.contains("op-btn-reset")) return;
      const lock = window.flowLock && window.flowLock.active ? window.flowLock : null;

      // Rule 3: Style cannot be first
      if (role === "style-selector" && !window.currentRenovationId && !lock) {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert("Please select  Renovation or Furniture");
        return;
      }

      // Rule 4: AlgoreitAI cannot be first
      if (
        role === "gemini-ai" &&
        !window.currentRenovationId &&
        !window.enhanceSelected &&
        !window.customPromptPending
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert(" Please select Renovation, Furniture ,  Enhance Quilty or Custom");
        return;
      }

      if (!lock) return;

      // Allow Style to proceed (acknowledges and clears lock)
      if (role === "style-selector") {
        window.setFlowLock(null);
        return;
      }

      // Block other buttons while lock is active and style not chosen
      e.stopImmediatePropagation();
      e.preventDefault();
      const msg =
        lock.type === "stage"
          ? " Please select Style and apply AlgotritAI "
          : " Please complete Renovation by select Style and apply AlgotritAI ";
      alert(msg);
    },
    true
  );
}

document.addEventListener("DOMContentLoaded", function () {
  // Initialize Auth (Clerk) - Priority 1
  if (window.initAuth) {
    window.initAuth();
  }

  /* QUARANTINED: Upload Floor Plans feature
  if (window.initUploadFloorPlans) {
    window.initUploadFloorPlans();
  }
  */
  
  if (window.initUploadPhotos) {
    window.initUploadPhotos();
  }
  if (window.initRoomViewer) {
    window.initRoomViewer();
  }
  if (window.initEnhancePhotos) {
    window.initEnhancePhotos();
  }
  if (window.initGuideMe) {
    window.initGuideMe();
  }
  if (window.initGeminiAI) {
    window.initGeminiAI();
  }
  if (window.initStyleSelector) {
    window.initStyleSelector();
  }
  if (window.initRenovateSelector) {
    window.initRenovateSelector();
  }
  if (window.initFurnitureSelector) {
    window.initFurnitureSelector();
  }
  if (window.initResetApp) {
    window.initResetApp();
  }

  initOpsGuard();
  console.info("AlgoreitAI Virtual Renovations app loaded.");
});

