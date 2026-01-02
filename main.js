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

function tr(key, vars, fallback) {
  try {
    if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
  } catch (_) {}
  return fallback || key;
}

function renderSelectionSummary() {
  const container = document.getElementById("selection-summary");
  if (!container) return;

  const chips = [
    ["renovation", tr("summary.renovation", null, "Renovation")],
    ["furniture", tr("summary.furniture", null, "Furniture")],
    ["style", tr("summary.style", null, "Style")],
    ["enhance", tr("summary.enhance", null, "Enhance")],
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

// Expose so other modules can re-show after i18n changes
window.renderSelectionSummary = renderSelectionSummary;

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
  
  // Clear any potential leftover persistent style if reload happened
  // This is a safety measure to ensure clean slate if not hydrated
  if (!window.currentStyleContext || !window.currentStyleContext.id) {
       selectionSummaryState.style = null;
  }
  
  renderSelectionSummary();
}

function initDropdowns() {
    const uploadBtn = document.querySelector('[data-role="upload-menu-btn"]');
    const uploadMenu = document.getElementById("upload-dropdown-menu");

    if (uploadBtn && uploadMenu) {
        uploadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = uploadMenu.classList.contains("is-open");
            // Close others if any
            document.querySelectorAll(".op-dropdown-menu").forEach(m => m.classList.remove("is-open"));
            
            if (!isOpen) {
                uploadMenu.classList.add("is-open");
            }
        });

        // Close when clicking an item
        uploadMenu.addEventListener("click", () => {
             uploadMenu.classList.remove("is-open");
        });
    }

    // Global click to close
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".op-dropdown-container")) {
            document.querySelectorAll(".op-dropdown-menu").forEach(m => m.classList.remove("is-open"));
        }
    });
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

      // --- Centralized Logic Check ---
      if (window.checkSelectionLogic) {
        const state = {
            currentRenovationId: window.currentRenovationId,
            enhanceSelected: window.enhanceSelected,
            customPromptPending: window.customPromptPending,
            currentStyleContext: window.currentStyleContext,
            flowLock: window.flowLock
        };
        
        const result = window.checkSelectionLogic(role, state);
        if (!result.allowed) {
            e.stopImmediatePropagation();
            e.preventDefault();
            alert(tr(result.messageKey, null, result.messageDefault));
            return;
        }
      }
      // -------------------------------

      // Products: after passing centralized guard, open selector
      if (role === "product-selector") {
        console.log("Clicked Product Selector button");
        if (window.productSelector && typeof window.productSelector.open === "function") {
          window.productSelector.open();
        } else {
          console.error("Product Selector module not loaded or open function missing");
          alert("Product selector module is not ready. Please refresh.");
        }
        return;
      }

      const lock = window.flowLock && window.flowLock.active ? window.flowLock : null;

      // Allow Style to proceed (acknowledges and clears lock)
      if (role === "style-selector" && lock) {
        window.setFlowLock(null);
        return;
      }
    },
    true
  );
}

// Rich tooltip system (custom tooltip with background)
function initRichTooltips() {
  // Single tooltip instance
  let tooltipEl = document.getElementById("vr-tooltip");
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "vr-tooltip";
    tooltipEl.className = "vr-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.setAttribute("aria-hidden", "true");
    tooltipEl.style.left = "-9999px";
    tooltipEl.style.top = "-9999px";
    document.body.appendChild(tooltipEl);
  }

  let activeTarget = null;

  function getTooltipText(el) {
    if (!el) return "";
    const explicit = el.getAttribute("data-tooltip");
    if (explicit) return explicit;

    const key = el.getAttribute("data-i18n-title") || el.getAttribute("data-tooltip-key");
    if (key && typeof window.t === "function") {
      const val = window.t(key);
      // if missing, i18n returns key itself; treat as empty to avoid showing raw keys
      if (val && val !== key) return val;
    }

    // last fallback
    return el.getAttribute("title") || "";
  }

  function suppressNativeTitle(el) {
    if (!el) return;
    const t = el.getAttribute("title");
    if (t && !el.dataset.vrTitle) {
      el.dataset.vrTitle = t;
      el.removeAttribute("title");
    }
  }

  function restoreNativeTitle(el) {
    if (!el) return;
    if (el.dataset && el.dataset.vrTitle) {
      el.setAttribute("title", el.dataset.vrTitle);
      delete el.dataset.vrTitle;
    }
  }

  function positionTooltip(el) {
    if (!el || !tooltipEl) return;
    const rect = el.getBoundingClientRect();

    // measure tooltip (must be visible-ish)
    const ttRect = tooltipEl.getBoundingClientRect();
    const gap = 10;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Prefer top placement, fallback to bottom
    let placement = "top";
    let top = rect.top - ttRect.height - gap;
    if (top < 8) {
      placement = "bottom";
      top = rect.bottom + gap;
    }

    // Center align
    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    left = Math.max(8, Math.min(vw - ttRect.width - 8, left));

    // Clamp bottom
    if (top + ttRect.height > vh - 8) {
      top = Math.max(8, vh - ttRect.height - 8);
    }

    tooltipEl.dataset.placement = placement;
    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function show(el) {
    const text = getTooltipText(el);
    if (!text) return;

    activeTarget = el;
    suppressNativeTitle(el);

    tooltipEl.textContent = text;
    tooltipEl.setAttribute("aria-hidden", "false");
    tooltipEl.classList.add("is-visible");
    // ensure measurement after text update
    positionTooltip(el);
  }

  function hide() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove("is-visible");
    tooltipEl.setAttribute("aria-hidden", "true");
    tooltipEl.style.left = "-9999px";
    tooltipEl.style.top = "-9999px";
    if (activeTarget) restoreNativeTitle(activeTarget);
    activeTarget = null;
  }

  function findTooltipTarget(fromEl) {
    if (!fromEl || typeof fromEl.closest !== "function") return null;
    return fromEl.closest("[data-i18n-title], [data-tooltip], [data-tooltip-key]");
  }

  document.addEventListener("mouseover", (e) => {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    show(target);
  });

  document.addEventListener("mouseout", (e) => {
    const leaving = findTooltipTarget(e.target);
    const entering = findTooltipTarget(e.relatedTarget);
    if (leaving && leaving === activeTarget && entering !== leaving) {
      hide();
    }
  });

  document.addEventListener("focusin", (e) => {
    const target = findTooltipTarget(e.target);
    if (!target) return;
    show(target);
  });

  document.addEventListener("focusout", (e) => {
    const leaving = findTooltipTarget(e.target);
    if (leaving && leaving === activeTarget) hide();
  });

  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", () => {
    if (activeTarget) positionTooltip(activeTarget);
  });

  // If language changes mid-tooltip, hide to avoid mismatch
  try {
    window.addEventListener("i18n:changed", hide);
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", function () {
  // Initialize Auth (Clerk) - Priority 1
  if (window.initAuth) {
    window.initAuth();
  }
  if (window.initPricing) {
    window.initPricing();
  }

  // Upload Floor Plans feature
  if (window.initUploadFloorPlans) {
    window.initUploadFloorPlans();
  }
  
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
  // Initialize Product Selector if available
  if (window.productSelector && window.productSelector.init) {
    window.productSelector.init();
    
    window.addEventListener('productSelected', (e) => {
        const product = e.detail;
        if (window.updateSelectionSummary) {
             window.updateSelectionSummary({ furniture: product.name });
        }
        // Tell GeminiAI about this selection
        if (window.setProductSelection) {
             window.setProductSelection(product);
        } else {
             // Fallback if setProductSelection not defined yet
             window.currentProductSelection = product;
        }

        // FIX: Ensure we have a valid Renovation ID so Style/Gemini flows are unlocked
        if (!window.currentRenovationId) {
            console.log("Product selected without active renovation. Defaulting to 'furniture_stage_room'.");
            window.currentRenovationId = "furniture_stage_room";
        }

        // UPDATE WORKING AREA WITH PREVIEW COLLAGE
        if (window.updateWorkingAreaWithCollage) {
             window.updateWorkingAreaWithCollage();
        }
        
        // Use product style if available
        // DISABLED per user request: The product's inherent style tag should NOT override the user's selected style context.
        /*
        if (product.style) {
             // Prefer friendly label (e.g. "Modern") vs raw id (e.g. "modern")
             const label = tr(`styles.${product.style}`, null, product.style);
             window.currentStyleContext = { id: product.style, label };
             window.currentStyleId = product.style;
             try {
               if (window.localStorage) window.localStorage.setItem("VR_SELECTED_STYLE_ID", product.style);
             } catch (_) {}
             if (window.updateSelectionSummary) window.updateSelectionSummary({ style: label });
        }
        */

        // Auto-open Style ONLY if still not set
        if (!window.currentStyleContext || !window.currentStyleContext.id) {
             // Small delay to allow UI to update
             /* DISABLED: Do not force style prompt after product selection.
             setTimeout(() => {
                 alert(`Selected: ${product.name}\n\nNow please select a Style.`);
             }, 100);
             */
        }
    });
  }
  if (window.initResetApp) {
    window.initResetApp();
  }

  initDropdowns();
  initOpsGuard();
  initRichTooltips();
  initSelectionSummaryRow();
  console.info("AlgoreitAI Virtual Renovations app loaded.");
});

// Re-render summary labels on language change
try {
  window.addEventListener("i18n:changed", () => renderSelectionSummary());
} catch (_) {}
