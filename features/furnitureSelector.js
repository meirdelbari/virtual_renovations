// Independent feature: Furniture selector ("Furniture ▾" button)
// - Provides furniture options (Remove, Stage).
// - Remove: Clears all furniture (uses existing logic).
// - Stage: Stages the room with furniture according to the selected style.

(function () {
  const FURNITURE_OPTIONS = [
    {
      id: "remove",
      label: "Remove",
      description: "Clear all furniture and decor",
      icon: "🧹"
    },
    {
      id: "stage",
      label: "Stage",
      description: "Furnish empty room based on style",
      icon: "🛋️"
    }
  ];

  function initFurnitureSelector() {
    const button = document.querySelector('[data-role="furniture-selector"]');
    const operationsBar = document.querySelector(".operations-bar");

    if (!button || !operationsBar) {
      console.warn(
        "[FurnitureSelector] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent immediate close
      const existing = document.getElementById("furniture-selector-panel");
      if (existing) {
        existing.parentNode.removeChild(existing);
        return;
      }
      openPanel(button, document.body); // Append to body to ensure correct positioning
    });

    document.addEventListener("click", (event) => {
      const panel = document.getElementById("furniture-selector-panel");
      if (!panel) return;
      if (!panel.contains(event.target) && !button.contains(event.target)) {
        panel.parentNode.removeChild(panel);
      }
    });
  }

  window.initFurnitureSelector = initFurnitureSelector;

  function openPanel(button, container) {
    const panel = document.createElement("div");
    panel.id = "furniture-selector-panel";
    panel.className = "renovate-selector-panel"; 
    
    // Override class styles for dropdown behavior
    panel.style.position = "absolute";
    panel.style.minWidth = "220px";
    panel.style.zIndex = "2000"; // Ensure it's on top of everything
    panel.style.right = "auto"; // Unset right from class
    
    const itemsHtml = FURNITURE_OPTIONS.map(opt => `
        <div class="renovate-category">
            <button 
              type="button" 
              class="renovate-category-toggle furniture-option-btn" 
              data-furniture-id="${opt.id}"
              style="width: 100%; text-align: left; padding: 12px; font-weight: 600; background: #fff; border: none; border-bottom: 1px solid #e5e7eb; color: #374151; cursor: pointer; display: flex; align-items: center; gap: 10px;"
            >
              <span style="font-size: 1.2em;">${opt.icon}</span>
              <div>
                  <div>${opt.label}</div>
                  <div style="font-size: 0.8em; color: #6b7280; font-weight: 400;">${opt.description}</div>
              </div>
            </button>
        </div>
    `).join("");

    panel.innerHTML = `
      <div class="renovate-selector-header">
        <div class="renovate-selector-title">Furniture Actions</div>
      </div>
      <div class="renovate-selector-body">
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

    // Add click handlers
    panel.querySelectorAll(".furniture-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const furnitureId = btn.getAttribute("data-furniture-id");
        handleFurnitureSelection(furnitureId);
        
        // Close panel
        if (panel.parentNode) {
            panel.parentNode.removeChild(panel);
        }
      });
    });
  }

  function handleFurnitureSelection(furnitureId) {
      console.log("[FurnitureSelector] Selected:", furnitureId);
      
      // Update global state
      if (furnitureId === "remove") {
          window.currentRenovationId = "furniture_clear_remove";
      } else if (furnitureId === "stage") {
          window.currentRenovationId = "furniture_stage_room";
          if (window.setFlowLock) {
            window.setFlowLock("stage");
          }
      } else {
          if (window.setFlowLock) {
            window.setFlowLock(null);
          }
      }

      // Visual feedback on the Gemini button
      const geminiBtn = document.querySelector('[data-role="gemini-ai"]');
      if (geminiBtn) {
        geminiBtn.classList.add('pulse-animation');
        geminiBtn.textContent = "✨ Click to Process";
        setTimeout(() => {
            geminiBtn.classList.remove('pulse-animation');
            geminiBtn.textContent = "✨ AlgoreitAI";
        }, 3000);
      }
  }

})();
