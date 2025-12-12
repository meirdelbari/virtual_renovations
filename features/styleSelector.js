// Independent feature: Style selector (Action 5 - "Style")
// - Provides a dropdown of design styles (Modern, Traditional, etc.).
// - Stores the selected style in a shared context for future features.
// - Updates the button label to show the active style.

(function () {
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
      return `
        <button
          type="button"
          class="style-selector-item${isActive ? " style-selector-item-active" : ""}"
          data-style-id="${style.id}"
        >
          ${escapeHtml(style.label)}
        </button>
      `;
    }).join("");

    panel.innerHTML = `
      <div class="style-selector-header">
        <div class="style-selector-title">Choose style</div>
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

        window.currentStyleContext = {
          id: style.id,
          label: style.label,
        };

        // Explicitly set global ID for other modules
        window.currentStyleId = style.id;
        if (window.setFlowLock) {
          window.setFlowLock(null);
        }

        updateButtonLabel(button);
        panel.parentNode.removeChild(panel);
        
        // Note: We do NOT auto-trigger Gemini here anymore.
        // The user must click "Renovate" or the Gemini button to apply changes.
      });
    });
  }

  function updateButtonLabel(button) {
    // Always keep the button label static as per user request
      button.textContent = "Style ▾";
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



