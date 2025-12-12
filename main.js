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

// Shared summary row state and renderer
const selectionSummaryState = {
  renovation: null,
  furniture: null,
  style:
    (window.currentStyleContext && window.currentStyleContext.label) || null,
  enhance: null,
};
window.selectionSummaryResetOnNextSelection = false;

function renderSelectionSummary() {
  const container = document.getElementById("selection-summary");
  if (!container) return;

  const chips = [
    ["renovation", "Renovation"],
    ["furniture", "Furniture"],
    ["style", "Style"],
    ["enhance", "Enhance"],
  ];

  let hasValue = false;

  chips.forEach(([key, label]) => {
    const chip = container.querySelector(`[data-summary="${key}"]`);
    if (!chip) return;

    const value = selectionSummaryState[key];
    if (value) {
      chip.textContent = `${label}: ${value}`;
      chip.classList.remove("is-hidden");
      hasValue = true;
    } else {
      chip.textContent = "";
      chip.classList.add("is-hidden");
    }
  });

  container.classList.toggle("is-hidden", !hasValue);
}

window.updateSelectionSummary = function (partial) {
  if (partial && typeof partial === "object") {
    if (window.selectionSummaryResetOnNextSelection) {
      selectionSummaryState.renovation = null;
      selectionSummaryState.furniture = null;
      selectionSummaryState.style = null;
      selectionSummaryState.enhance = null;
      window.selectionSummaryResetOnNextSelection = false;
    }
    if ("renovation" in partial) {
      selectionSummaryState.renovation = partial.renovation || null;
    }
    if ("furniture" in partial) {
      selectionSummaryState.furniture = partial.furniture || null;
    }
    if ("style" in partial) {
      selectionSummaryState.style = partial.style || null;
    }
    if ("enhance" in partial) {
      selectionSummaryState.enhance = partial.enhance || null;
    }
  }
  renderSelectionSummary();
};

function initSelectionSummaryRow() {
  // Sync any pre-existing style selection (if set before render)
  if (
    window.currentStyleContext &&
    window.currentStyleContext.label &&
    !selectionSummaryState.style
  ) {
    selectionSummaryState.style = window.currentStyleContext.label;
  }
  renderSelectionSummary();
}

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
      const enhanceActive =
        window.enhanceSelected && window.currentRenovationId === "enhance_quality";
      if (enhanceActive && role !== "gemini-ai") {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert("Please select AlgoreitAI to process the Enhance Quality request.");
        return;
      }
      const lock = window.flowLock && window.flowLock.active ? window.flowLock : null;

      // Rule 3: Style cannot be first
      if (role === "style-selector" && !window.currentRenovationId && !lock) {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert("Please select  Renovation or Furniture");
        return;
      }

      // Rule 4: AlgoreitAI cannot be first
      if (role === "gemini-ai") {
        const lock = window.flowLock && window.flowLock.active ? window.flowLock : null;
        const needsStyle =
          lock &&
          lock.requiresStyleAck &&
          (!window.currentStyleContext || !window.currentStyleContext.id);
        if (
          (!window.currentRenovationId && !window.enhanceSelected && !window.customPromptPending) ||
          needsStyle
        ) {
          e.stopImmediatePropagation();
          e.preventDefault();
          alert(
            needsStyle
              ? " Please select Style and then apply AlgoreitAI "
              : " Please select Renovation, Furniture ,  Enhance Quilty or Custom"
          );
          return;
        }
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
  initSelectionSummaryRow();
  console.info("AlgoreitAI Virtual Renovations app loaded.");
});

