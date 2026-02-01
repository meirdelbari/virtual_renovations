// Product Selector Integration
// Fetches supplier products and allows user to select them for renovation

window.productSelector = (function() {
    let allProducts = [];
    let selectedProduct = null;
    let modal = null;

    function tr(key, vars, fallback) {
        try {
            if (typeof window.t === "function") return window.t(key, vars, { defaultValue: fallback });
        } catch (_) {}
        return fallback || key;
    }

<<<<<<< HEAD
=======
    function escapeHtml(str) {
        if (typeof str !== "string") return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function isRtlText(text) {
        if (typeof text !== "string") return false;
        return /[\u0590-\u08FF]/.test(text);
    }

>>>>>>> 5b2bbbb (Restore repo)
    const PRODUCT_STYLES = [
        { id: "modern", label: "Modern" },
        { id: "contemporary", label: "Contemporary" },
        { id: "farmhouse", label: "Farmhouse" },
        { id: "coastal", label: "Coastal" },
        { id: "minimalist", label: "Minimalist" },
        { id: "scandinavian", label: "Scandinavian" },
        { id: "bohemian", label: "Boho" },
        { id: "industrial", label: "Industrial" },
        { id: "mid_century_modern", label: "Mid-Century Modern" },
        { id: "traditional", label: "Traditional" },
        { id: "transitional", label: "Transitional" }
    ];

    const SUB_CATEGORIES = {
        Flooring: [
            { id: "Hardwood", label: "Hardwood" },
            { id: "Laminate", label: "Laminate" },
            { id: "Ceramics", label: "Ceramics" },
            { id: "Tiles", label: "Tiles" },
            { id: "Vinyl", label: "Vinyl" },
            { id: "Carpet", label: "Carpet" }
        ],
        Furniture: [
            { id: "Sofa", label: "Sofa" },
            { id: "Chair", label: "Chair" },
            { id: "Table", label: "Table" },
            { id: "Bed", label: "Bed" },
            { id: "Wardrobe", label: "Wardrobe" },
            { id: "Cabinet", label: "Cabinet" },
            { id: "Dining Set", label: "Dining Set" },
            { id: "Rug", label: "Rug" }
        ],
        Lighting: [
            { id: "Chandelier", label: "Chandelier" },
            { id: "Pendant", label: "Pendant" },
            { id: "Ceiling", label: "Ceiling Light" },
            { id: "Wall Sconce", label: "Wall Sconce" },
            { id: "Table Lamp", label: "Table Lamp" },
            { id: "Floor Lamp", label: "Floor Lamp" },
            { id: "Recessed", label: "Recessed" },
            { id: "Track", label: "Track Lighting" },
            { id: "Outdoor", label: "Outdoor" },
            { id: "Smart", label: "Smart Lighting" }
        ]
    };

    function getStyleLabel(styleId) {
        if (!styleId) return "";
        const hit = PRODUCT_STYLES.find(s => s.id === styleId);
        return hit ? tr(`styles.${hit.id}`, null, hit.label) : String(styleId);
    }

    async function init() {
        // Create modal container
        if (!document.getElementById('product-selector-modal')) {
            createModal();
        }
        await fetchProducts();
    }

    async function fetchProducts() {
        try {
            // Add timestamp to prevent caching
            const params = new URLSearchParams();
            params.set('t', String(Date.now()));
            const context = window.VR_SUPPLIER_CONTEXT || {};
            if (context.supplierId) {
                params.set('supplierId', String(context.supplierId));
            } else if (context.supplierHost) {
                params.set('supplierHost', String(context.supplierHost));
            }
            const res = await fetch(getApiUrl('/api/suppliers/public/catalog?' + params.toString()));
            if (res.ok) {
                allProducts = await res.json();
            }
        } catch (e) {
            console.error("Failed to fetch supplier products:", e);
        }
    }

    function renderCategoryDropdown(catName) {
        const subs = SUB_CATEGORIES[catName] || [];
        const label = tr(`productSelector.categories.${catName.toLowerCase()}`, null, catName);
        
        return `
            <div class="relative group inline-block">
                <button onclick="window.productSelector.filter('${catName}')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn flex items-center whitespace-nowrap" data-cat="${catName}">
                    <span class="btn-text">${label}</span> <span class="ml-1 text-xs">▼</span>
                </button>
                <div class="absolute left-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 hidden group-hover:block z-50 border border-gray-100">
                    <button onclick="window.productSelector.filter('${catName}')" class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">All ${catName}</button>
                    ${subs.map(s => `
                        <button onclick="window.productSelector.filter('${catName} - ${s.id}')" class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">${s.label}</button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function createModal() {
        const div = document.createElement('div');
        div.id = 'product-selector-modal';
        div.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center';
        div.innerHTML = `
            <div class="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col p-6 m-4">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">${tr("productSelector.title", null, "Select a Product")}</h2>
                    <button onclick="window.productSelector.close()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="flex flex-col gap-4 mb-4">
                    <!-- Filter Bar -->
                    <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-1 rounded-lg">
                        <!-- Category Filters -->
                        <div class="flex flex-wrap gap-2 ps-category-row w-full md:w-auto">
                            <!-- All -->
                            <button onclick="window.productSelector.filter('All')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn active" data-cat="All">
                                <span class="btn-text">${tr("productSelector.categories.all", null, "All")}</span>
                            </button>

                            <!-- Dropdowns -->
                            ${renderCategoryDropdown("Flooring")}
                            ${renderCategoryDropdown("Furniture")}
                            ${renderCategoryDropdown("Lighting")}

                            <!-- Paint -->
                            <button onclick="window.productSelector.filter('Paint')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Paint">
                                <span class="btn-text">${tr("productSelector.categories.paint", null, "Paint")}</span>
                            </button>
                            
                            <!-- Decor -->
                            <button onclick="window.productSelector.filter('Decor')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Decor">
                                <span class="btn-text">Decor</span>
                            </button>
                        </div>

                        <!-- Style Filters -->
                        <div class="w-full md:w-48 ps-style-row">
                            <select onchange="window.productSelector.filterStyle(this.value)" id="ps-style-select" class="block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500">
                                <option value="all">${tr("productSelector.allStyles", null, "All Styles")}</option>
                                ${PRODUCT_STYLES.map(s => `
                                    <option value="${s.id}">${tr(`styles.${s.id}`, null, s.label)}</option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <div id="ps-grid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto p-2">
                    <!-- Products -->
                </div>
                
                <div class="mt-4 pt-4 border-t flex justify-between items-center hidden" id="ps-selection-bar">
                   <div class="flex items-center">
                       <span class="text-sm text-gray-500 ps-selected-label">${tr("productSelector.selectedLabel", null, "Selected")}:</span>
                       <span id="ps-selected-name" class="font-bold ml-1">${tr("productSelector.none", null, "None")}</span>
                       <span id="ps-selected-style" class="ml-3 text-xs font-medium px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 hidden"></span>
                   </div>
                   <button id="ps-use-product-btn" onclick="window.productSelector.confirm()" class="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700">${tr("productSelector.useProduct", null, "Use This Product")}</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        modal = div;
    }

    function renderProducts(category = 'All', style = null) {
        const grid = document.getElementById('ps-grid');
        grid.innerHTML = '';

        let filtered = allProducts;
        
        // Filter by Category
        if (category !== 'All') {
            // Allow prefix matching (e.g. "Flooring" matches "Flooring - Hardwood")
            filtered = filtered.filter(p => {
                if (!p.category) return false;
                const cat = category.toLowerCase();
                const pCat = p.category.toLowerCase();
                // Check for exact match, prefix match with separator, or exact word match start
                // e.g. "flooring" should match "flooring", "flooring-hardwood", "flooring - hardwood"
                return pCat === cat || 
                       pCat.startsWith(cat + '-') || 
                       pCat.startsWith(cat + ' -') || 
                       pCat.startsWith(cat + ' ');
            });
        }
        
        // Filter by Style (if provided)
        if (style) {
            // Strict-ish matching on normalized style IDs (e.g. "modern", "scandinavian")
            // Don't show generic/null style items when a specific style is requested.
            const wanted = String(style).toLowerCase();
            filtered = filtered.filter(p => {
                if (!p.style) return false;
                return String(p.style).toLowerCase().includes(wanted);
            });
        }

        if (filtered.length === 0) {
            const styleMsg = style ? tr("productSelector.emptyStyleMatch", { style: getStyleLabel(style) }, ` matching '${getStyleLabel(style)}' style`) : '';
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">${tr("productSelector.empty", null, "No products found in this category")}${styleMsg}. <br><span class="text-xs text-indigo-500 cursor-pointer" onclick="window.productSelector.clearStyleFilter()">${tr("productSelector.showAllStyles", null, "Show all styles")}</span></div>`;
            return;
        }

        filtered.forEach(p => {
            const el = document.createElement('div');
            el.className = `border rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition ${selectedProduct?.id === p.id ? 'ring-2 ring-indigo-600' : ''}`;
            el.dataset.prodId = String(p.id || "");
            el.addEventListener("click", () => select(p, el));
<<<<<<< HEAD
=======
            const infoRows = [];
            if (p.catalogNo) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.catalogNo", null, "Catalog No.")}:</span> ${escapeHtml(p.catalogNo)}</div>`);
            if (p.category) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.category", null, "Category")}:</span> ${escapeHtml(p.category)}</div>`);
            if (p.style) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.style", null, "Style")}:</span> ${escapeHtml(p.style)}</div>`);
            if (p.description) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.description", null, "Description")}:</span> ${escapeHtml(p.description)}</div>`);
            if (p.supplierName) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.supplier", null, "Supplier")}:</span> ${escapeHtml(p.supplierName)}</div>`);
            if (p.price || p.price === 0) infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.price", null, "Price")}:</span> $${escapeHtml(String(p.price))}</div>`);
            if (p.purchaseLink) {
                infoRows.push(`<div><span class="font-semibold">${tr("productSelector.labels.purchase", null, "Purchase")}:</span> <a href="${p.purchaseLink}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline">${escapeHtml(p.purchaseLink)}</a></div>`);
            }
            const infoText = [
                p.catalogNo,
                p.category,
                p.style,
                p.description,
                p.supplierName,
                p.purchaseLink,
                p.price
            ].filter(Boolean).join(" ");
            const infoDir = isRtlText(infoText) ? "rtl" : "ltr";
            const infoAlign = infoDir === "rtl" ? "right" : "left";

>>>>>>> 5b2bbbb (Restore repo)
            el.innerHTML = `
                <div class="h-32 bg-gray-200">
                    <img src="${p.imageUrl}" class="w-full h-full object-cover">
                </div>
                <div class="p-3">
                    <h3 class="font-bold text-sm truncate">${p.name}</h3>
                    <div class="flex justify-between items-center mt-1">
                        <p class="text-xs text-gray-500 truncate max-w-[60%]">${p.supplierName || tr("productSelector.supplierFallback", null, "Supplier")}</p>
                        <span class="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate">${p.style || tr("productSelector.anyStyleShort", null, "Any")}</span>
                    </div>
                    <p class="text-indigo-600 font-bold text-sm mt-1">$${p.price}</p>
<<<<<<< HEAD
=======
                    <div class="mt-2 text-[11px] text-gray-600 space-y-1" dir="${infoDir}" style="text-align: ${infoAlign};">
                        ${infoRows.join("") || `<div class="text-gray-400">${tr("productSelector.labels.noDetails", null, "No additional details.")}</div>`}
                    </div>
>>>>>>> 5b2bbbb (Restore repo)
                </div>
            `;
            grid.appendChild(el);
        });
    }

    function select(product, el = null) {
        selectedProduct = product;
        // Update ring highlight without re-rendering (prevents flaky selection / extra clicks)
        try {
            document.querySelectorAll('#ps-grid > div').forEach(card => {
                card.classList.remove('ring-2', 'ring-indigo-600');
            });
            if (el) {
                el.classList.add('ring-2', 'ring-indigo-600');
            } else if (product && product.id) {
                const hit = document.querySelector(`#ps-grid > div[data-prod-id="${CSS.escape(String(product.id))}"]`);
                if (hit) hit.classList.add('ring-2', 'ring-indigo-600');
            }
        } catch (_) {}
        
        document.getElementById('ps-selection-bar').classList.remove('hidden');
        document.getElementById('ps-selected-name').textContent = product.name;
        
        const styleBadge = document.getElementById('ps-selected-style');
        if (product.style) {
            styleBadge.textContent = product.style;
            styleBadge.classList.remove('hidden');
        } else {
            styleBadge.classList.add('hidden');
        }
<<<<<<< HEAD
=======

>>>>>>> 5b2bbbb (Restore repo)
    }

    function open(initialCategory, initialStyle) {
        if(!modal) {
            init().then(() => {
                fetchProducts().then(() => {
                    setupView(initialCategory, initialStyle);
                    modal.classList.remove('hidden');
                });
            });
        } else {
            fetchProducts().then(() => {
                setupView(initialCategory, initialStyle);
                modal.classList.remove('hidden');
            });
        }
    }
    
    function setupView(cat, style) {
        window.currentStyleFilter = style;
        // Update Filter UI
        document.querySelectorAll('.filter-btn').forEach(b => {
            const btnCat = b.dataset.cat;
            let isActive = false;
            const targetCat = cat || 'All';

            if (btnCat === targetCat) {
                isActive = true;
            } else if (targetCat.startsWith('Flooring') && btnCat === 'Flooring') {
                isActive = true;
            } else if (targetCat.startsWith('Furniture') && btnCat === 'Furniture') {
                isActive = true;
            } else if (targetCat.startsWith('Lighting') && btnCat === 'Lighting') {
                isActive = true;
            }

            if(isActive) {
                b.classList.remove('bg-gray-100', 'text-black');
                b.classList.add('bg-indigo-600', 'text-white');
                b.classList.add('active');
            } else {
                b.classList.add('bg-gray-100', 'text-black');
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.remove('active');
            }
        });

        // Update Style Select UI
        const select = document.getElementById("ps-style-select");
        if (select) {
            select.value = style || 'all';
        }
        
        const header = modal.querySelector('h2');
        header.innerHTML = tr("productSelector.title", null, "Select a Product");
        applyTranslations();
        
        renderProducts(cat || 'All', style);
    }

    function applyTranslations() {
        if (!modal) return;
        // removed ps-category-label and ps-style-label
        const selectedLabel = modal.querySelector(".ps-selected-label");
        if (selectedLabel) selectedLabel.textContent = `${tr("productSelector.selectedLabel", null, "Selected")}:`;
        const useProductBtn = modal.querySelector("#ps-use-product-btn");
        if (useProductBtn) useProductBtn.textContent = tr("productSelector.useProduct", null, "Use This Product");

        const categoryTextMap = {
            All: tr("productSelector.categories.all", null, "All"),
            Flooring: tr("productSelector.categories.flooring", null, "Flooring"),
            Paint: tr("productSelector.categories.paint", null, "Paint"),
            Furniture: tr("productSelector.categories.furniture", null, "Furniture"),
            Lighting: tr("productSelector.categories.lighting", null, "Lighting"),
            Decor: "Decor"
        };
        modal.querySelectorAll(".filter-btn").forEach((btn) => {
            const key = btn.dataset.cat;
            if (key && categoryTextMap[key]) {
                const span = btn.querySelector('.btn-text');
                if (span) span.textContent = categoryTextMap[key];
            }
        });

        modal.querySelectorAll(".style-btn").forEach((btn) => {
            const styleId = btn.dataset.style;
            if (styleId === "all") {
                btn.textContent = tr("productSelector.anyStyle", null, "Any Style");
            } else if (styleId) {
                const hit = PRODUCT_STYLES.find((s) => s.id === styleId);
                const fallback = hit ? hit.label : styleId;
                btn.textContent = tr(`styles.${styleId}`, null, fallback);
            }
        });

        // Update Select options
        const select = modal.querySelector("#ps-style-select");
        if (select) {
             const opts = select.options;
             for (let i = 0; i < opts.length; i++) {
                 const opt = opts[i];
                 if (opt.value === 'all') {
                     opt.text = tr("productSelector.allStyles", null, "All Styles");
                 } else {
                     const hit = PRODUCT_STYLES.find(s => s.id === opt.value);
                     if (hit) opt.text = tr(`styles.${hit.id}`, null, hit.label);
                 }
             }
        }
    }

    function clearStyleFilter() {
        window.productSelector.filterStyle(null);
    }

    function close() {
        modal.classList.add('hidden');
    }

    function confirm() {
        if (selectedProduct) {
            // Dispatch event for other components to listen to
            const event = new CustomEvent('productSelected', { detail: selectedProduct });
            window.dispatchEvent(event);
            
            close();
        }
    }

    function filter(cat) {
        // UI update
        document.querySelectorAll('.filter-btn').forEach(b => {
            const btnCat = b.dataset.cat;
            let isActive = false;

            if (btnCat === cat) {
                isActive = true;
            } else if (cat.startsWith('Flooring') && btnCat === 'Flooring') {
                isActive = true;
            } else if (cat.startsWith('Furniture') && btnCat === 'Furniture') {
                isActive = true;
            } else if (cat.startsWith('Lighting') && btnCat === 'Lighting') {
                isActive = true;
            }

            if(isActive) {
                b.classList.remove('bg-gray-100', 'text-black');
                b.classList.add('bg-indigo-600', 'text-white');
                b.classList.add('active');
            } else {
                b.classList.add('bg-gray-100', 'text-black');
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.remove('active');
            }
        });
        renderProducts(cat, window.currentStyleFilter);
    }

    function filterStyle(style) {
        // If "all" string is passed from select, treat as null
        if (style === 'all') style = null;

        window.currentStyleFilter = style;
        
        // Update Select UI
        const select = document.getElementById("ps-style-select");
        if (select) {
            select.value = style || 'all';
        }

        // Get current category
        const activeCatBtn = document.querySelector('.filter-btn.active');
        const currentCat = activeCatBtn ? activeCatBtn.dataset.cat : 'All';
        
        renderProducts(currentCat, style);
    }

    function getSelected() {
        return selectedProduct;
    }

    return {
        init,
        open,
        close,
        filter,
        filterStyle,
        confirm,
        getSelected,
        clearStyleFilter
    };
})();


