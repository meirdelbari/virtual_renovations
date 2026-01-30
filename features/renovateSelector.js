// Independent feature: Renovate selector ("Renovate ▾" button)
// - Provides renovation options (Wood Floor, Carpet, Tiles, Paint, Kitchen, Bathroom).
// - Uses the currently selected style and last room photo to generate a
//   "renovated" photo (visual filter) and replace it on screen.
// - Downloads the renovated image so the user can save it locally.

(function () {
  function tr(key, vars, fallback) {
    try {
      if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
    } catch (_) {}
    return fallback || key;
  }

  // API base helper (supports file:// fallback to http://localhost:4000)
  function getApiUrl(path) {
    if (typeof window.getApiUrl === "function") {
      return window.getApiUrl(path);
    }
    const base = window.location.protocol === "file:" ? "http://localhost:4000" : "";
    const p = String(path || "");
    return base + (p.startsWith("/") ? p : "/" + p);
  }

  const RENOVATIONS = [
    {
      id: "room",
      label: "Room",
      groups: [
        {
          label: "Floor",
          id: "room_floor",
          options: [
            { id: "hardwood", label: "Hardwood" },
            { id: "laminate", label: "Laminate" },
            { id: "ceramics", label: "Ceramics" },
            { id: "tiles", label: "Tiles" },
            { id: "vinyl", label: "Vinyl" },
            { id: "carpet", label: "Carpet" },
          ],
        },
        {
          label: "Walls",
          id: "room_walls",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Ceiling",
          id: "room_ceiling",
          options: [{ id: "painting", label: "Painting" }],
        },
        {
          label: "Windows",
          id: "room_windows",
          options: [
            { id: "painting", label: "Painting" },
            { id: "aluminum", label: "Aluminum" },
          ],
        },
        {
          label: "Doors",
          id: "room_doors",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Lighting",
          id: "room_lighting",
          options: [
            { id: "add", label: "Add" },
            { id: "replace", label: "Replace" },
          ],
        },
        {
          label: "Frameheads",
          id: "room_frameheads",
          options: [
            { id: "painting", label: "Painting" },
            { id: "replace", label: "Replace" },
          ],
        },
      ],
    },
    {
      id: "bathroom",
      label: "Bathroom",
      groups: [
        {
          label: "Floor",
          id: "bathroom_floor",
          options: [
            { id: "tiles", label: "Tiles" },
            { id: "hardwood", label: "Hardwood" },
          ],
        },
        {
          label: "Walls",
          id: "bathroom_walls",
          options: [
            { id: "tiles", label: "Tiles" },
            { id: "painting", label: "Painting" },
          ],
        },
        {
          label: "Vanity",
          id: "bathroom_vanity",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Toilet",
          id: "bathroom_toilet",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Shower",
          id: "bathroom_shower",
          options: [{ id: "replace", label: "Replace" }],
        },
        {
          label: "Bathtub",
          id: "bathroom_bathtub",
          options: [{ id: "replace", label: "Replace" }],
        },
      ],
    },
    {
      id: "kitchen",
      label: "Kitchen",
      groups: [
        {
          label: "Floor",
          id: "kitchen_floor",
          options: [
            { id: "tiles", label: "Tiles" },
            { id: "hardwood", label: "Hardwood" },
          ],
        },
        {
          label: "Cabinets",
          id: "kitchen_cabinets",
          options: [
            { id: "replace", label: "Replace" },
            { id: "painting", label: "Painting" },
          ],
        },
        {
          label: "Countertop",
          id: "kitchen_countertop",
          options: [
            { id: "replace", label: "Replace" },
            { id: "quartz", label: "Quartz" },
            { id: "granite", label: "Granite" },
            { id: "marble", label: "Marble" },
          ],
        },
        {
          label: "Backsplash",
          id: "kitchen_backsplash",
          options: [
            { id: "tiles", label: "Tiles" },
            { id: "painting", label: "Painting" },
          ],
        },
      ],
    },
    {
      id: "garden",
      label: "Garden",
      groups: [
        {
          label: "Floor",
          id: "garden_floor",
          options: [
            { id: "deck", label: "Deck" },
            { id: "paving", label: "Paving" },
            { id: "grass", label: "Grass" },
          ],
        },
        {
          label: "Pool",
          id: "garden_pool",
          options: [
            { id: "add", label: "Add" },
            { id: "remove", label: "Remove" },
          ],
        },
        {
          label: "Landscaping",
          id: "garden_landscaping",
          options: [
            { id: "trees", label: "Trees" },
            { id: "plants", label: "Plants" },
          ],
        },
        {
          label: "Furniture",
          id: "garden_furniture",
          options: [
            { id: "add", label: "Add" },
            { id: "replace", label: "Replace" },
          ],
        },
      ],
    }
  ];

  function initRenovateSelector() {
    const button = document.querySelector('[data-role="renovate-selector"]');
    const operationsBar = document.querySelector(".operations-bar");

    if (!button || !operationsBar) {
      console.warn(
        "[RenovateSelector] Missing DOM elements; feature will not initialize."
      );
      return;
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("renovate-selector-panel");
      if (existing) {
        existing.parentNode.removeChild(existing);
        return;
      }
      openPanel(button, document.body);
    });

    document.addEventListener("click", (event) => {
      const panel = document.getElementById("renovate-selector-panel");
      if (!panel) return;
      if (!panel.contains(event.target) && !button.contains(event.target)) {
        panel.parentNode.removeChild(panel);
      }
    });
  }

  window.initRenovateSelector = initRenovateSelector;

  function openPanel(button, container) {
    const panel = document.createElement("div");
    panel.id = "renovate-selector-panel";
    panel.className = "renovate-selector-panel";

    // Header with Source Switcher
    const headerHtml = `
      <div class="renovate-selector-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #f3f4f6;">
        <div class="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm w-full" style="display: flex;">
            <button id="mode-ai" class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-indigo-600 text-white">✨ AI</button>
            <button id="mode-supplier" class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-gray-500 hover:text-gray-900">🛍️ Suppliers</button>
        </div>
      </div>
    `;

    const tabsHtml = RENOVATIONS.map((cat) => {
      return `<button class="renovate-tab-btn" data-target="${cat.id}">${tr(`renovate.categories.${cat.id}`, null, cat.label)}</button>`;
    }).join("");

    const contentHtml = RENOVATIONS.map((cat) => {
      const groupsHtml = cat.groups
        .map((group) => {
          const optionsHtml = group.options
            .map(
              (opt) =>
                `<button class="renovate-option-btn" data-group-id="${group.id}" data-opt-id="${opt.id}" data-opt-label="${opt.label}">${tr(`renovate.options.${opt.id}`, null, opt.label)}</button>`
            )
            .join("");

          return `
            <div class="renovate-category">
                <button class="renovate-category-toggle">
                    ${tr(`renovate.groups.${group.id}`, null, group.label)}
                    <span class="arrow">▼</span>
                </button>
                <div class="renovate-category-content">
                    ${optionsHtml}
                </div>
            </div>
        `;
        })
        .join("");

      return `<div id="renovate-content-${cat.id}" class="renovate-tab-content" style="display:none">${groupsHtml}</div>`;
    }).join("");

    panel.innerHTML = `
      ${headerHtml}
      <div class="renovate-tabs">
        ${tabsHtml}
      </div>
      <div class="renovate-selector-body">
        ${contentHtml}
      </div>
    `;

    container.appendChild(panel);

    // Positioning
    const rect = button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    panel.style.left = `${rect.left + scrollX}px`;
    panel.style.top = `${rect.bottom + scrollY + 8}px`;

    // State for this panel instance
    let currentMode = 'ai'; // 'ai' or 'supplier'

    // Mode Switcher Logic
    const btnAI = panel.querySelector('#mode-ai');
    const btnSupplier = panel.querySelector('#mode-supplier');

    function setMode(mode) {
        currentMode = mode;
        if (mode === 'ai') {
            btnAI.className = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-indigo-600 text-white shadow-sm";
            btnSupplier.className = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-gray-500 hover:text-gray-900";
        } else {
            btnSupplier.className = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-indigo-600 text-white shadow-sm";
            btnAI.className = "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors text-gray-500 hover:text-gray-900";
        }
    }

    btnAI.onclick = (e) => { e.stopPropagation(); setMode('ai'); };
    btnSupplier.onclick = (e) => { e.stopPropagation(); setMode('supplier'); };

    // Interaction Logic
    const tabs = panel.querySelectorAll(".renovate-tab-btn");
    const contents = panel.querySelectorAll(".renovate-tab-content");

    function activateTab(id) {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.target === id));
      contents.forEach((c) => (c.style.display = c.id === `renovate-content-${id}` ? "block" : "none"));
    }

    tabs.forEach((t) =>
      t.addEventListener("click", () => activateTab(t.dataset.target))
    );
    // Default active
    activateTab("room");

    // Accordion Logic
    panel.querySelectorAll(".renovate-category-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        toggle.classList.toggle("open");
        const content = toggle.nextElementSibling;
        content.style.display = content.style.display === "block" ? "none" : "block";
      });
    });

    // Selection Logic with Mode Check
    panel.querySelectorAll(".renovate-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const groupId = btn.dataset.groupId;
        const optId = btn.dataset.optId;
        const optLabel = btn.dataset.optLabel;
        const categoryLabel = btn.closest('.renovate-tab-content').querySelector('.renovate-category-toggle').innerText.trim();
        const fullLabel = `${categoryLabel} - ${optLabel}`;

        // Close Panel
        if (panel.parentNode) panel.parentNode.removeChild(panel);

        if (currentMode === 'ai') {
            // Option 1: Default (Existing Logic)
            // Clear any product selection first to ensure pure AI generation
            if (window.setProductSelection) window.setProductSelection(null); 
            else window.currentProductSelection = null;
            
            commitRenovationSelection(groupId, optId, fullLabel);
        } else {
            // Option 2: Supplier (Directly Open Products)
            // No need to force style selection first; user can filter in the modal.
            openProductSelectorForRenovation(groupId, optId, fullLabel);
        }
      });
    });
  }

  function openProductSelectorForRenovation(groupId, optId, label) {
        if (window.productSelector) {
            const categoryMap = {
                'room_floor': 'Flooring',
                'room_walls': 'Paint',
                'room_lighting': 'Lighting',
                'bathroom_floor': 'Flooring',
                'kitchen_floor': 'Flooring'
            };
            const categoryToFilter = categoryMap[groupId] || 'All';
            const styleToFilter = (window.currentStyleContext && window.currentStyleContext.id) 
                                  ? window.currentStyleContext.id 
                                  : null;
            
            if (window.productSelector.open) window.productSelector.open(categoryToFilter, styleToFilter);
            
            commitRenovationSelection(groupId, optId, label, true); 
        } else {
            alert("Product selector not loaded");
        }
  }

  // --- New Logic: Source Selection Modal ---
  function showSourceSelectionModal(groupId, optId, label) {
      // Create a simple modal
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[3000] flex items-center justify-center';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 class="text-lg font-bold mb-4">How do you want to renovate?</h3>
            <p class="mb-4 text-gray-600">You selected: <strong>${label}</strong></p>
            
            <div class="space-y-3">
                <button id="choice-default" class="w-full py-3 px-4 border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center gap-2">
                    <span>✨</span>
                    <div class="text-left">
                        <div class="font-bold">Use AI Default</div>
                        <div class="text-xs text-gray-500">Let Gemini suggest the style</div>
                    </div>
                </button>
                
                <button id="choice-supplier" class="w-full py-3 px-4 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 flex items-center justify-center gap-2">
                    <span>🛍️</span>
                    <div class="text-left">
                        <div class="font-bold text-indigo-700">Browse Suppliers</div>
                        <div class="text-xs text-indigo-600">Select real products from catalog</div>
                    </div>
                </button>
            </div>
            
            <button id="choice-cancel" class="mt-4 text-sm text-gray-500 underline w-full text-center">Cancel</button>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const closeModal = () => document.body.removeChild(modal);
      
      document.getElementById('choice-cancel').onclick = closeModal;
      
      // Option 1: Default (Existing Logic)
      document.getElementById('choice-default').onclick = () => {
          closeModal();
          // Clear any product selection first to ensure pure AI generation
          if (window.setProductSelection) window.setProductSelection(null); 
          else window.currentProductSelection = null;
          
          commitRenovationSelection(groupId, optId, label);
      };
      
      // Option 2: Supplier (Open Product Selector)
      document.getElementById('choice-supplier').onclick = () => {
          closeModal();
          
          // Force clear any previous renovation intent until product is picked?
          // No, we want to know we are in "room_floor" mode.
          // But we should clear the GENERIC prompt trigger until product is back.
          
            // Open Product Selector with Filter pre-set (mapping logic needed)
            if (window.productSelector) {
                const categoryMap = {
                    'room_floor': 'Flooring',
                    'room_walls': 'Paint',
                    'room_lighting': 'Lighting',
                    'bathroom_floor': 'Flooring',
                    'kitchen_floor': 'Flooring'
                };
                const categoryToFilter = categoryMap[groupId] || 'All';
                
                // Allow specific style filtering from renovation option (e.g. hardwood -> style?)
                // Or maybe the filter logic in productSelector handles "Flooring - Hardwood" if we pass "Flooring"?
                // The issue is productSelector.filter(cat) checks: p.category === cat || p.category.startsWith(cat + ' -')
                // "Flooring" matches "Flooring - Hardwood".
                // But wait, the user says they selected "Renovate-Flooring-Hardwood" (which is group=room_floor, opt=hardwood)
                // and didn't see "wood floor" (category="Flooring - Hardwood", style="scandinavian").
                // Ah, maybe the style filter is hiding it if the current style context doesn't match?
                // Or maybe the category logic is strict?
                
                window.productSelector.open();
                setTimeout(() => {
                    if(window.productSelector.filter) {
                        // Pass both category AND style if we want to be smart?
                        // For now just fix category. 
                        window.productSelector.filter(categoryToFilter);
                    }
                }, 500); 
              
              // We also need to set the renovation ID so the prompt knows context
              commitRenovationSelection(groupId, optId, label, true); 
          } else {
              alert("Product selector not loaded");
          }
      };
  }

  function commitRenovationSelection(groupId, optId, label, isSupplierFlow = false) {
      const fullId = `${groupId}_${optId}`; // e.g. room_floor_hardwood
      console.log("[RenovateSelector] Selected:", fullId);
      
      window.currentRenovationId = fullId;
      window.currentRenovationLabel = label;
      
      // Clear conflicting modes
      window.enhanceSelected = false;
      window.customPromptPending = false;

      if (window.updateSelectionSummary) {
        window.updateSelectionSummary({
          renovation: label,
        });
      }

      // Visual feedback
      const geminiBtn = document.querySelector('[data-role="gemini-ai"]');
      if (geminiBtn) {
        geminiBtn.classList.add("pulse-animation");
        geminiBtn.textContent = tr("ops.clickToProcess", null, "✨ Click to Process");
        setTimeout(() => {
          geminiBtn.classList.remove("pulse-animation");
          geminiBtn.innerHTML = tr(
            "ops.algoreit",
            null,
            '<span class="algoreit-emoji">✨</span><span>AlgoreitAI</span>'
          );
        }, 3000);
      }
      
      // If NOT supplier flow, we might trigger immediate action or wait for style
      // If Supplier flow, the user is now browsing products, so we wait.
      
      // Special handling for Furniture options (which map to specific renovation IDs)
      if (optId === 'remove') {
          window.currentRenovationId = "furniture_clear_remove";
          if(window.setFlowLock) window.setFlowLock(null);
      } else if (optId === 'stage') {
          window.currentRenovationId = "furniture_stage_room";
          if(window.setFlowLock) window.setFlowLock("stage");
      }
  }

  // Listen for the continuation event from StyleSelector
  window.addEventListener('continueSupplierFlow', (e) => {
      const { groupId, optId, label } = e.detail;
      console.log("Resuming supplier flow for:", label);
      openProductSelectorForRenovation(groupId, optId, label);
  });

  // --- End New Logic ---

})();
