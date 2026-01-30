// Independent feature: Furniture selector ("Furniture ▾" button)
// - Provides furniture options (Remove, Stage).
// - Remove: Clears all furniture (uses existing logic).
// - Stage: Stages the room with furniture according to the selected style.
// - Supports switching between "AI Default" and "Suppliers" mode.

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  // Helper to trigger product selector
  function openProductSelectorForFurniture() {
      if (window.productSelector) {
          // Open selector filtered to 'Furniture' or 'Staging'
          // Use current global style if available, otherwise pass null
          const style = (window.currentStyleContext && window.currentStyleContext.id)
                        ? window.currentStyleContext.id
                        : null;
          
          window.productSelector.open('Furniture', style);
          
          // We need to tell the system we are in a furniture supplier flow
          // If we select a product, it will trigger 'productSelected'
          // We might want to set a flag or renovation ID
          window.currentRenovationId = "furniture_stage_room"; // Context
          window.currentRenovationLabel = "Stage Room";
      } else {
          alert("Product selector not loaded");
      }
  }

  function hydrateStyleFromStorage() {
      try {
          if (window.currentStyleContext && window.currentStyleContext.id) return true;
          // Use session storage first
          let id = window.sessionStorage ? window.sessionStorage.getItem('VR_SELECTED_STYLE_ID') : null;
          // Fallback to local
          if (!id && window.localStorage) {
               id = window.localStorage.getItem('VR_SELECTED_STYLE_ID');
               // Consume legacy local storage
               window.localStorage.removeItem('VR_SELECTED_STYLE_ID');
          }
          
          if (!id) return false;
          window.currentStyleContext = { id, label: String(id) };
          window.currentStyleId = id;
          if (window.updateSelectionSummary) {
              window.updateSelectionSummary({ style: String(id) });
          }
          // Consume session storage
          if (window.sessionStorage) window.sessionStorage.removeItem('VR_SELECTED_STYLE_ID');
          
          return true;
      } catch (_) {
          return false;
      }
  }

  // --- Header Toggle Logic (copied/adapted from RenovateSelector) ---
  let currentMode = 'AI'; // 'AI' or 'Supplier'

  function updateToggleUI(panel) {
      const btnAI = panel.querySelector('.mode-toggle-ai');
      const btnSupplier = panel.querySelector('.mode-toggle-supplier');
      
      // Tailwind classes for active vs inactive states
      const activeClasses = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-indigo-600 text-white shadow-sm";
      const inactiveClasses = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-gray-500 hover:text-gray-900";
      
      if(currentMode === 'AI') {
          btnAI.className = `mode-toggle-btn mode-toggle-ai ${activeClasses}`;
          btnSupplier.className = `mode-toggle-btn mode-toggle-supplier ${inactiveClasses}`;
      } else {
          btnAI.className = `mode-toggle-btn mode-toggle-ai ${inactiveClasses}`;
          btnSupplier.className = `mode-toggle-btn mode-toggle-supplier ${activeClasses}`;
      }
  }

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

    // If Style selection was triggered as part of a pending Supplier flow,
    // styleSelector dispatches `continueSupplierFlow`. We handle the furniture-stage case here.
    window.addEventListener("continueSupplierFlow", (e) => {
      try {
        const pending = e && e.detail ? e.detail : null;
        if (!pending) return;
        if (pending.groupId === "furniture" && pending.optId === "stage") {
          openProductSelectorForFurniture();
        }
      } catch (_) {}
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
    
    const itemsHtml = FURNITURE_OPTIONS.map(opt => {
      const label = tr(`furniture.options.${opt.id}.label`, null, opt.label);
      const desc = tr(`furniture.options.${opt.id}.desc`, null, opt.description);
      return `
        <div class="renovate-category">
            <button 
              type="button" 
              class="renovate-category-toggle furniture-option-btn" 
              data-furniture-id="${opt.id}"
              style="width: 100%; text-align: left; padding: 12px; font-weight: 600; background: #fff; border: none; border-bottom: 1px solid #e5e7eb; color: #374151; cursor: pointer; display: flex; align-items: center; gap: 10px;"
            >
              <span style="font-size: 1.2em;">${opt.icon}</span>
              <div>
                  <div>${label}</div>
                  <div style="font-size: 0.8em; color: #6b7280; font-weight: 400;">${desc}</div>
              </div>
            </button>
        </div>
      `;
    }).join("");

    // Add Toggle Header
    panel.innerHTML = `
      <div class="renovate-selector-header" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="renovate-selector-title">${tr("furniture.title", null, "Furniture Actions")}</div>
        <div class="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-full" style="display: flex;">
             <button type="button" class="mode-toggle-btn mode-toggle-ai" style="flex:1;">✨ AI</button>
             <button type="button" class="mode-toggle-btn mode-toggle-supplier" style="flex:1;">🛍️ Suppliers</button>
        </div>
      </div>
      <div class="renovate-selector-body">
        ${itemsHtml}
      </div>
    `;

    container.appendChild(panel);
    
    // Bind Toggle Events
    const btnAI = panel.querySelector('.mode-toggle-ai');
    const btnSupplier = panel.querySelector('.mode-toggle-supplier');
    
    updateToggleUI(panel); // Set initial state
    
    btnAI.onclick = (e) => {
        e.stopPropagation();
        currentMode = 'AI';
        updateToggleUI(panel);
    };
    
    btnSupplier.onclick = (e) => {
        e.stopPropagation();
        currentMode = 'Supplier';
        updateToggleUI(panel);
    };

    // Calculate position relative to document body
    const rect = button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    panel.style.left = `${rect.left + scrollX}px`;
    panel.style.top = `${rect.bottom + scrollY + 8}px`;

    // Add click handlers for options
    panel.querySelectorAll(".furniture-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const furnitureId = btn.getAttribute("data-furniture-id");
        
        // Check mode only for "stage" (Remove is always AI/Clear)
        if (furnitureId === 'stage' && currentMode === 'Supplier') {
             // Supplier Flow
             // No need to prompt for Style here.
             // If Supplier Portal already selected a style, hydrate it silently for better filtering.
             hydrateStyleFromStorage();

             // Always open Products. If style exists, the Product Selector will pre-filter by it.
             openProductSelectorForFurniture();
        } else {
             // AI Default Flow (or Remove)
             if (currentMode === 'AI' || furnitureId === 'remove') {
                 // Clear any product selection if AI mode
                 if (window.setProductSelection) window.setProductSelection(null); 
                 else window.currentProductSelection = null;
             }
             
             handleFurnitureSelection(furnitureId);
        }
        
        // Close panel
        if (panel.parentNode) {
            panel.parentNode.removeChild(panel);
        }
      });
    });
  }

  function handleFurnitureSelection(furnitureId) {
      console.log("[FurnitureSelector] Selected:", furnitureId);
      
      // Clear conflicting modes
      window.enhanceSelected = false;
      window.customPromptPending = false;

      const selected = FURNITURE_OPTIONS.find((opt) => opt.id === furnitureId);
      window.currentFurnitureSelection = selected
        ? { id: selected.id, label: tr(`furniture.options.${selected.id}.label`, null, selected.label) }
        : null;
      
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

      if (window.updateSelectionSummary) {
        window.updateSelectionSummary({
          furniture: selected ? tr(`furniture.options.${selected.id}.label`, null, selected.label) : null,
        });
      }

      // Visual feedback on the Gemini button
      const geminiBtn = document.querySelector('[data-role="gemini-ai"]');
      if (geminiBtn) {
        geminiBtn.classList.add('pulse-animation');
        geminiBtn.textContent = tr("ops.clickToProcess", null, "✨ Click to Process");
        setTimeout(() => {
            geminiBtn.classList.remove('pulse-animation');
            geminiBtn.innerHTML = tr(
              "ops.algoreit",
              null,
              '<span class="algoreit-emoji">✨</span><span>AlgoreitAI</span>'
            );
        }, 3000);
      }
  }

})();
