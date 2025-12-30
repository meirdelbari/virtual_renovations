// Product Selector Integration
// Fetches supplier products and allows user to select them for renovation

window.productSelector = (function() {
    let allProducts = [];
    let selectedProduct = null;
    let modal = null;

    const PRODUCT_STYLES = [
        { id: "modern", label: "Modern" },
        { id: "traditional", label: "Traditional" },
        { id: "industrial", label: "Industrial" },
        { id: "minimalist", label: "Minimalist" },
        { id: "scandinavian", label: "Scandinavian" },
        { id: "bohemian", label: "Bohemian" },
        { id: "mid_century_modern", label: "Mid-Century Modern" },
    ];

    function getStyleLabel(styleId) {
        if (!styleId) return "";
        const hit = PRODUCT_STYLES.find(s => s.id === styleId);
        return hit ? hit.label : String(styleId);
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
            const res = await fetch(getApiUrl('/api/suppliers/public/catalog?t=' + Date.now()));
            if (res.ok) {
                allProducts = await res.json();
            }
        } catch (e) {
            console.error("Failed to fetch supplier products:", e);
        }
    }

    function createModal() {
        const div = document.createElement('div');
        div.id = 'product-selector-modal';
        div.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center';
        div.innerHTML = `
            <div class="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col p-6 m-4">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">Select a Product</h2>
                    <button onclick="window.productSelector.close()" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div class="flex flex-col gap-2 mb-4">
                    <!-- Category Filters -->
                    <div class="flex space-x-2 overflow-x-auto pb-1 ps-category-row">
                        <span class="text-xs font-semibold text-gray-500 uppercase self-center mr-2">Category:</span>
                        <button onclick="window.productSelector.filter('All')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn active" data-cat="All">All</button>
                        <button onclick="window.productSelector.filter('Flooring')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Flooring">Flooring</button>
                        <button onclick="window.productSelector.filter('Paint')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Paint">Paint</button>
                        <button onclick="window.productSelector.filter('Furniture')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Furniture">Furniture</button>
                        <button onclick="window.productSelector.filter('Lighting')" class="px-4 py-2 bg-gray-100 rounded-full hover:bg-gray-200 focus:bg-indigo-600 focus:text-white transition filter-btn" data-cat="Lighting">Lighting</button>
                    </div>

                    <!-- Style Filters -->
                    <div class="flex space-x-2 overflow-x-auto pb-1 items-center ps-style-row">
                        <span class="text-xs font-semibold text-gray-500 uppercase self-center mr-2">Style:</span>
                        <button onclick="window.productSelector.filterStyle(null)" class="px-3 py-1.5 text-sm bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition style-btn active" data-style="all">Any Style</button>
                        ${PRODUCT_STYLES.map(s => `
                            <button onclick="window.productSelector.filterStyle('${s.id}')" class="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition style-btn" data-style="${s.id}">${s.label}</button>
                        `).join('')}
                    </div>
                </div>

                <div id="ps-grid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto p-2">
                    <!-- Products -->
                </div>
                
                <div class="mt-4 pt-4 border-t flex justify-between items-center hidden" id="ps-selection-bar">
                   <div class="flex items-center">
                       <span class="text-sm text-gray-500">Selected:</span>
                       <span id="ps-selected-name" class="font-bold ml-1">None</span>
                       <span id="ps-selected-style" class="ml-3 text-xs font-medium px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 hidden"></span>
                   </div>
                   <button onclick="window.productSelector.confirm()" class="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700">Use This Product</button>
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
            const styleMsg = style ? ` matching '${getStyleLabel(style)}' style` : '';
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">No products found in this category${styleMsg}. <br><span class="text-xs text-indigo-500 cursor-pointer" onclick="window.productSelector.clearStyleFilter()">Show all styles</span></div>`;
            return;
        }

        filtered.forEach(p => {
            const el = document.createElement('div');
            el.className = `border rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition ${selectedProduct?.id === p.id ? 'ring-2 ring-indigo-600' : ''}`;
            el.onclick = () => select(p);
            el.innerHTML = `
                <div class="h-32 bg-gray-200">
                    <img src="${p.imageUrl}" class="w-full h-full object-cover">
                </div>
                <div class="p-3">
                    <h3 class="font-bold text-sm truncate">${p.name}</h3>
                    <div class="flex justify-between items-center mt-1">
                        <p class="text-xs text-gray-500 truncate max-w-[60%]">${p.supplierName || 'Supplier'}</p>
                        <span class="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate">${p.style || 'Any'}</span>
                    </div>
                    <p class="text-indigo-600 font-bold text-sm mt-1">$${p.price}</p>
                </div>
            `;
            grid.appendChild(el);
        });
    }

    function select(product) {
        selectedProduct = product;
        // Re-render to show selection ring, preserving current filters
        const activeCatBtn = document.querySelector('.filter-btn.bg-indigo-600');
        const currentCat = activeCatBtn ? activeCatBtn.dataset.cat : 'All';
        renderProducts(currentCat, window.currentStyleFilter); 
        
        document.getElementById('ps-selection-bar').classList.remove('hidden');
        document.getElementById('ps-selected-name').textContent = product.name;
        
        const styleBadge = document.getElementById('ps-selected-style');
        if (product.style) {
            styleBadge.textContent = product.style;
            styleBadge.classList.remove('hidden');
        } else {
            styleBadge.classList.add('hidden');
        }
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
            const isMatch = (cat && b.dataset.cat === cat) || (!cat && b.dataset.cat === 'All');
            if(isMatch) {
                b.classList.remove('bg-gray-100', 'text-black');
                b.classList.add('bg-indigo-600', 'text-white');
                b.classList.add('active');
            } else {
                b.classList.add('bg-gray-100', 'text-black');
                b.classList.remove('bg-indigo-600', 'text-white');
                b.classList.remove('active');
            }
        });

        // Update Style Buttons UI
        document.querySelectorAll('.style-btn').forEach(b => {
            const isMatch = (style && b.dataset.style === style) || (!style && b.dataset.style === 'all');
            if(isMatch) {
                b.classList.remove('bg-white', 'border-gray-200', 'text-gray-700');
                b.classList.add('bg-indigo-100', 'border-indigo-300', 'text-indigo-800', 'font-medium');
                b.classList.add('active');
            } else {
                b.classList.add('bg-white', 'border-gray-200', 'text-gray-700');
                b.classList.remove('bg-indigo-100', 'border-indigo-300', 'text-indigo-800', 'font-medium');
                b.classList.remove('active');
            }
        });
        
        const header = modal.querySelector('h2');
        header.innerHTML = `Select a Product`;
        
        renderProducts(cat || 'All', style);
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
            if(b.dataset.cat === cat) {
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
        window.currentStyleFilter = style;
        
        // UI Update
        document.querySelectorAll('.style-btn').forEach(b => {
            const isMatch = (style && b.dataset.style === style) || (!style && b.dataset.style === 'all');
            if(isMatch) {
                b.classList.remove('bg-white', 'border-gray-200', 'text-gray-700');
                b.classList.add('bg-indigo-100', 'border-indigo-300', 'text-indigo-800', 'font-medium');
                b.classList.add('active');
            } else {
                b.classList.add('bg-white', 'border-gray-200', 'text-gray-700');
                b.classList.remove('bg-indigo-100', 'border-indigo-300', 'text-indigo-800', 'font-medium');
                b.classList.remove('active');
            }
        });

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


