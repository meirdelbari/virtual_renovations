// Independent feature: Style selector (Action 5 - "Style")
// - Provides a dropdown of design styles (Modern, Traditional, etc.).
// - Stores the selected style in a shared context for future features.
// - Updates the button label to show the active style.

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  const STYLES = [
    { id: "modern", label: "Modern" },
    { id: "contemporary", label: "Contemporary" },
    { id: "farmhouse", label: "Farmhouse" },
    { id: "coastal", label: "Coastal" },
    { id: "minimalist", label: "Minimalist" },
    { id: "scandinavian", label: "Scandinavian" },
    { id: "bohemian", label: "Boho (Bohemian)" },
    { id: "industrial", label: "Industrial" },
    { id: "mid_century_modern", label: "Mid-Century Modern" },
    { id: "traditional", label: "Traditional" },
    { id: "transitional", label: "Transitional" },
  ];

  window.currentStyleContext =
    window.currentStyleContext || { id: null, label: null };

  const STYLE_STORAGE_KEY = "VR_SELECTED_STYLE_ID";

  function hydrateStyleFromStorage() {
    try {
      if (window.currentStyleContext && window.currentStyleContext.id) return;
      
      // Check sessionStorage first (preferred new way)
      let stored = window.sessionStorage ? window.sessionStorage.getItem(STYLE_STORAGE_KEY) : null;
      
      // Fallback to localStorage (legacy migration)
      if (!stored && window.localStorage) {
         stored = window.localStorage.getItem(STYLE_STORAGE_KEY);
         // Migrate to session if found? Or just read. Let's just read and maybe clean up?
         // window.localStorage.removeItem(STYLE_STORAGE_KEY); 
      }

      if (!stored) return;
      const style = STYLES.find((s) => s.id === stored) || null;
      const label = style ? tr(`styles.${style.id}`, null, style.label) : String(stored);
      window.currentStyleContext = { id: stored, label };
      window.currentStyleId = stored;
      if (window.updateSelectionSummary) {
        window.updateSelectionSummary({ style: label });
      }
      
      // Consume the token so it doesn't persist on Reload/Refresh
      if (window.sessionStorage) window.sessionStorage.removeItem(STYLE_STORAGE_KEY);
      if (window.localStorage) window.localStorage.removeItem(STYLE_STORAGE_KEY);
    } catch (_) {}
  }

  function initStyleSelector() {
    const button = document.querySelector('[data-role="style-selector"]');
    const operationsBar = document.querySelector(".operations-bar");

    if (!button || !operationsBar) {
      console.warn(
        "[StyleSelector] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("style-selector-panel");
      if (existing) {
        existing.parentNode.removeChild(existing);
        return;
      }
      openPanel(button, document.body);
    });

    document.addEventListener("click", (event) => {
      const panel = document.getElementById("style-selector-panel");
      if (!panel) return;
      if (
        !panel.contains(event.target) &&
        !button.contains(event.target)
      ) {
        panel.parentNode.removeChild(panel);
      }
    });

    // If Supplier Portal selected a style, auto-hydrate it here so flows don't re-prompt.
    hydrateStyleFromStorage();
    updateButtonLabel(button);
  }

  window.initStyleSelector = initStyleSelector;

  function openPanel(button, container) {
    const panel = document.createElement("div");
    panel.id = "style-selector-panel";
    panel.className = "style-selector-panel";

    // Override class styles for dropdown behavior
    panel.style.position = "absolute";
    panel.style.minWidth = "200px";
    panel.style.zIndex = "2000";
    panel.style.right = "auto";

    const itemsHtml = STYLES.map((style) => {
      const isActive = window.currentStyleContext.id === style.id;
      const label = tr(`styles.${style.id}`, null, style.label);
      return `
        <button
          type="button"
          class="style-selector-item${isActive ? " style-selector-item-active" : ""}"
          data-style-id="${style.id}"
        >
          ${escapeHtml(label)}
        </button>
      `;
    }).join("");

    panel.innerHTML = `
      <div class="style-selector-header">
        <div class="style-selector-title">${escapeHtml(tr("style.title", null, "Choose style"))}</div>
      </div>
      <div class="style-selector-body">
        ${itemsHtml}
      </div>
    `;

    container.appendChild(panel);

    // Calculate position relative to document body
    const rect = button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    panel.style.left = `${rect.left + scrollX}px`;
    panel.style.top = `${rect.bottom + scrollY + 8}px`;

    panel.querySelectorAll(".style-selector-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const styleId = btn.getAttribute("data-style-id");
        const style = STYLES.find((s) => s.id === styleId);
        if (!style) return;

        const label = tr(`styles.${style.id}`, null, style.label);
        window.currentStyleContext = {
          id: style.id,
          label,
        };

        // Explicitly set global ID for other modules
        window.currentStyleId = style.id;
        try {
          // We do NOT persist style to storage anymore (per user request: Refresh should clean up).
          // We only consume it if it came from Supplier Portal.
          // So if user manually selects here, we actually want to ensure storage is clear
          // so that a subsequent refresh doesn't accidentally pick up an old supplier value.
          if (window.sessionStorage) window.sessionStorage.removeItem(STYLE_STORAGE_KEY);
          if (window.localStorage) window.localStorage.removeItem(STYLE_STORAGE_KEY);
        } catch (_) {}
        if (window.setFlowLock) {
          window.setFlowLock(null);
        }

        if (window.updateSelectionSummary) {
          window.updateSelectionSummary({ style: label });
        }

        updateButtonLabel(button);
        panel.parentNode.removeChild(panel);
        
        // Note: We do NOT auto-trigger Gemini here anymore.
        // The user must click "Renovate" or the Gemini button to apply changes.
        
        // NEW: Check if there was a pending supplier renovation waiting for style
        if (window.pendingRenovationForSupplier) {
            const pending = window.pendingRenovationForSupplier;
            window.pendingRenovationForSupplier = null; // Clear it
            
            // We can't easily import the function from renovateSelector since it's IIFE, 
            // but we can expose it or use a global event.
            // Or better, just dispatch an event that renovateSelector listens to?
            // Actually, renovateSelector logic was local.
            // Let's assume renovateSelector exposes a global helper or we dispatched an event.
            
            // Simpler Hack: If we knew the renovateSelector logic, we could call it.
            // Let's use a custom event on window to trigger the product selector opening.
            const event = new CustomEvent('continueSupplierFlow', { detail: pending });
            window.dispatchEvent(event);
        }
      });
    });
  }

  function updateButtonLabel(button) {
    // Keep label translated (index.html also sets it, but some flows call this)
    const base = tr("ops.style", null, "Style");
    const hasStyle = window.currentStyleContext && window.currentStyleContext.id;
    if (hasStyle) {
      const label = window.currentStyleContext.label || window.currentStyleContext.id;
      button.textContent = `${base}: ${label} ▾`;
      return;
    }
    button.textContent = `${base} ▾`;
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



