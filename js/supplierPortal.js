// Initialize Clerk
let clerk;
let currentUser = null;
let currentSupplier = null;
let allProducts = []; // Store all products for client-side filtering
let currentCategory = 'All'; // Track active category filter

function setLoadingError(message, details = "") {
    const el = document.getElementById('loading');
    if (!el) return;
    el.innerHTML = `
      <div class="text-center text-red-600">
        <p class="font-semibold">${message}</p>
        ${details ? `<p class="mt-2 text-sm text-gray-600">${details}</p>` : ""}
        <button onclick="location.reload()" class="mt-4 text-indigo-600 underline">Reload</button>
      </div>
    `;
}

function hideAllViews() {
    const ids = ['loading', 'registration-view', 'blocked-view', 'dashboard-view'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
    });
}

function showStatusBanner(message) {
    const banner = document.getElementById('status-banner');
    const text = document.getElementById('status-banner-text');
    if (!banner || !text) return;
    text.textContent = message;
    banner.classList.remove('hidden');
}

function hideStatusBanner() {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    banner.classList.add('hidden');
}

// Expose for inline onclick in HTML
window.hideStatusBanner = hideStatusBanner;

async function ensureClerkScriptLoaded(publishableKey) {
    if (window.Clerk && typeof window.Clerk.load === 'function') return;

    await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-clerk-publishable-key]');
        if (existing) {
            // Script tag exists but Clerk might still be loading
            if (window.Clerk && typeof window.Clerk.load === 'function') return resolve();
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        // Clerk JS expects the publishable key to be provided via data attribute in vanilla usage
        script.setAttribute('data-clerk-publishable-key', publishableKey);

        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Clerk script"));
        document.head.appendChild(script);
    });

    if (!window.Clerk || typeof window.Clerk.load !== 'function') {
        throw new Error("Clerk SDK did not initialize on window");
    }
}

async function init() {
    // Fetch Clerk key first to ensure consistency with the main app
    try {
        const res = await fetch('/api/auth-config');
        if (!res.ok) throw new Error("Failed to fetch auth config");
        const config = await res.json();
        
        if (!config.publishableKey) {
            console.error("No publishableKey found in config");
            setLoadingError("Configuration Error: No Auth Key found.", "The server did not return a Clerk publishable key.");
            return;
        }

        await startClerk(config.publishableKey);
    } catch (e) {
        console.error("Failed to load auth config", e);
        setLoadingError("Error connecting to server.", e?.message || "Is the backend running?");
    }
}

async function startClerk(pubKey) {
    // Local dev bypass
    if (!pubKey && window.location.hostname === 'localhost') {
        console.warn("No Publishable Key found. Entering Local Dev Mode.");
        activateDevMode();
        return;
    }
    if (!pubKey) {
        setLoadingError("Authentication configuration missing.", "No Clerk publishable key was provided.");
        return;
    }

    try {
        // Ensure Clerk is loaded only AFTER we have a key (prevents 'Missing publishableKey' crash)
        await ensureClerkScriptLoaded(pubKey);

        clerk = window.Clerk;

        console.log("Starting Clerk load sequence...");
        await clerk.load({ publishableKey: pubKey });
        
        console.log("Clerk loaded in Supplier Portal");
        
        // Wait for user to be populated if just loaded
        if (!clerk.user && clerk.client && clerk.client.sessions.length > 0) {
             console.log("Waiting for user session hydration...");
             // Sometimes there's a delay between load() and user availability
             await new Promise(r => setTimeout(r, 1500));
        }

        // FOR LOCAL DEVELOPMENT: If Clerk is not active/fails, mock a user
        if (!clerk.user && window.location.hostname === 'localhost') {
            activateDevMode();
            return;
        }

        if (clerk.user) {
            currentUser = clerk.user;
            console.log("User found:", currentUser.id);
            mountUserButton();
            checkSupplierStatus();
        } else {
            console.log("No user found, showing login.");
            // User is not logged in.
            hideAllViews();
            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('loading').innerHTML = `
                <div class="text-center">
                    <p class="mb-4 text-gray-600">Please sign in to access the Supplier Portal.</p>
                    <button id="login-btn" class="btn-primary">Sign In / Sign Up</button>
                </div>
            `;
            document.getElementById('login-btn').addEventListener('click', () => {
                clerk.openSignIn({
                    afterSignInUrl: window.location.href,
                    afterSignUpUrl: window.location.href
                });
            });
        }
    } catch (err) {
        console.error("Clerk load error:", err);
        
        // Fallback for Localhost if Clerk fails entirely (e.g. invalid key)
        if (window.location.hostname === 'localhost') {
             console.warn("Clerk failed, but bypassing for Local Dev Mode");
             activateDevMode();
             return;
        }

        // Fallback: If load fails, it might be because it's already loaded or config issue.
        // Try to proceed if user exists on the object anyway
        if (clerk && clerk.user) {
             currentUser = clerk.user;
             mountUserButton();
             checkSupplierStatus();
        } else {
             setLoadingError("Authentication Failed", err?.message || String(err));
        }
    }
}

function activateDevMode() {
    console.warn("Activating Dev Mode...");
    currentUser = { id: "user_mock_local_dev", firstName: "Local", lastName: "Dev" };
    const btn = document.getElementById("user-button");
    if(btn) btn.innerHTML = "<div class='bg-gray-200 px-3 py-1 rounded text-sm font-bold'>Dev User</div>";
    checkSupplierStatus();
}

function mountUserButton() {
    const userButtonDiv = document.getElementById("user-button");
    if(clerk && clerk.mountUserButton) {
        clerk.mountUserButton(userButtonDiv);
    }
}

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json',
        // Pass user ID strictly for the prototype's simulated auth check
        'x-user-id': currentUser ? currentUser.id : ''
    };
    
    // Allow GET /me to fail (404) without throwing "Not authenticated" if user just logged in
    // But currentUser must be set for any operation.
    if (!currentUser) {
         console.warn("apiCall: No currentUser set");
         // Wait a moment in case it's a race condition
         await new Promise(r => setTimeout(r, 500));
         if (!currentUser) throw new Error("Not authenticated");
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    console.log(`API Call: ${method} ${endpoint}`); // Debug logging

    const res = await fetch(`/api/suppliers${endpoint}`, options);
    
    // Check if response is JSON
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        // This handles 404s for endpoints that might not be mounted correctly
        const text = await res.text();
        console.error("API Error (Non-JSON):", text);
        throw new Error("Server returned non-JSON response. Is the backend running?");
    }

    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || `API Error ${res.status}`);
    return data;
}

// Check if user is already a supplier
async function checkSupplierStatus() {
    // Don't show loading if we are already showing it, just update text
    // showLoading(); 
    
    try {
        console.log("Checking supplier status for:", currentUser.id);
        currentSupplier = await apiCall('/me');
        console.log("Supplier found:", currentSupplier);
        if (currentSupplier.status === 'blocked') {
            showBlocked(currentSupplier.statusReason);
        } else {
            showDashboard();
        }
    } catch (err) {
        console.warn("Supplier check result:", err.message);
        // If 404, they are not a supplier yet -> show registration
        if (err.message.includes('not found') || err.message.includes('404')) {
            showRegistration();
        } else {
            console.error("Profile check failed:", err);
            // Don't show alert loop, just log
            document.getElementById('loading').innerHTML = `
                <div class="text-center text-red-600">
                    <p>Failed to load profile.</p>
                    <p class="text-sm">${err.message}</p>
                    <button onclick="location.reload()" class="underline">Retry</button>
                </div>
            `;
        }
    }
}

// Views Management
function showLoading() {
    hideAllViews();
    document.getElementById('loading').classList.remove('hidden');
}

function showRegistration() {
    hideAllViews();
    document.getElementById('registration-view').classList.remove('hidden');
}

function showBlocked(reason) {
    hideAllViews();
    document.getElementById('blocked-view').classList.remove('hidden');
    const el = document.getElementById('blocked-reason');
    if (el) el.textContent = reason ? `Reason: ${reason}` : "";
}

function showDashboard() {
    hideAllViews();
    document.getElementById('dashboard-view').classList.remove('hidden');
    
    document.getElementById('company-name-display').textContent = currentSupplier.companyName;
    loadProducts();
}

// Registration Logic
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        companyName: formData.get('companyName'),
        contactEmail: formData.get('contactEmail'),
        description: formData.get('description'),
        categories: formData.get('categories').split(',').map(s => s.trim())
    };

    try {
        const res = await apiCall('/register', 'POST', data);
        currentSupplier = res;
        // Supplier account does not require admin approval
        showDashboard();
    } catch (err) {
        alert("Registration failed: " + err.message);
    }
});

// Product Management
async function loadProducts() {
    try {
        // Add timestamp to prevent caching
        const products = await apiCall('/products?t=' + Date.now());
        allProducts = products; // Store globally
        
        applyFilters(); // Apply current filters
        
        document.getElementById('stat-products').textContent = products.length;
    } catch (err) {
        console.error(err);
    }
}

// Filtering Logic
function filterProducts(category) {
    if (category) {
        currentCategory = category;
        
        // Update UI buttons
        // Logic: if category starts with "Flooring", highlight the Flooring button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            const btnCat = btn.dataset.cat;
            let isActive = false;
            
            if (btnCat === category) {
                isActive = true;
            } else if (category.startsWith('Flooring') && btnCat === 'Flooring') {
                isActive = true;
            } else if (category.startsWith('Furniture') && btnCat === 'Furniture') {
                isActive = true;
            } else if (category.startsWith('Lighting') && btnCat === 'Lighting') {
                isActive = true;
            }
            
            if (isActive) {
                btn.classList.remove('bg-gray-100', 'text-gray-700');
                btn.classList.add('bg-indigo-600', 'text-white');
            } else {
                btn.classList.add('bg-gray-100', 'text-gray-700');
                btn.classList.remove('bg-indigo-600', 'text-white');
            }
        });
    }

    applyFilters();
}

function applyFilters() {
    const style = document.getElementById('style-filter').value;

    // Persist selected style for the main app (so it can auto-use it without re-prompting)
    try {
        if (window.sessionStorage) {
            if (style) window.sessionStorage.setItem("VR_SELECTED_STYLE_ID", style);
            else window.sessionStorage.removeItem("VR_SELECTED_STYLE_ID");
        }
        // Also clear localStorage just in case we migrated
        if (window.localStorage) {
             window.localStorage.removeItem("VR_SELECTED_STYLE_ID");
        }
    } catch (_) {}
    
    let filtered = allProducts;
    
    // Filter by Category
    if (currentCategory !== 'All') {
         if (currentCategory === 'Flooring') {
             // Show all sub-floorings
             filtered = filtered.filter(p => p.category === 'Flooring' || p.category.startsWith('Flooring -'));
         } else if (currentCategory === 'Furniture') {
             // Show all sub-furniture
             filtered = filtered.filter(p => p.category === 'Furniture' || p.category.startsWith('Furniture -'));
         } else if (currentCategory === 'Lighting') {
             // Show all sub-lighting
             filtered = filtered.filter(p => p.category === 'Lighting' || p.category.startsWith('Lighting -'));
         } else {
             // Strict match or specific sub-category match
             // e.g. "Flooring - Carpet" should match exactly, OR prefix match if logic allows
             // But here we want exact filtering if the user selected a specific sub-item
             filtered = filtered.filter(p => p.category === currentCategory || p.category.startsWith(currentCategory + ' -'));
         }
    }
    
    // Filter by Style
    if (style) {
        filtered = filtered.filter(p => !p.style || p.style === style || (p.style && p.style.includes(style)));
    }
    
    renderProducts(filtered);
}


function renderProducts(products) {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';

    if (products.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">No products found matching filters.</div>`;
        return;
    }

    products.forEach(p => {
        const card = document.createElement('div');
        card.className = "card p-0 overflow-hidden flex flex-col";

        const status = (p.status || 'approved').toLowerCase();
        const statusBadgeClass =
            status === 'approved'
                ? 'bg-green-100 text-green-800'
                : status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800';

        card.innerHTML = `
            <div class="h-48 bg-gray-200 w-full relative">
                <img src="${p.imageUrl}" class="w-full h-full object-cover">
                <button onclick="deleteProduct('${p.id}')" class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-4 flex-grow">
                <div class="flex justify-between items-start">
                    <h3 class="font-bold text-lg">${p.name}</h3>
                    <span class="text-sm bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">${p.category}</span>
                </div>
                <div class="flex items-center gap-2 mt-2">
                    <span class="text-xs ${statusBadgeClass} px-2 py-0.5 rounded font-semibold capitalize">${status}</span>
                    ${status === 'rejected' && p.statusReason ? `<span class="text-xs text-gray-500">(${p.statusReason})</span>` : ''}
                </div>
                <div class="flex items-center mt-1">
                     <span class="text-xs text-gray-500 mr-2">Style:</span>
                     <span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">${p.style || 'Any'}</span>
                </div>
                <p class="text-gray-500 text-sm mt-2 line-clamp-2">${p.description}</p>
                <div class="mt-4 flex justify-between items-center">
                    <span class="font-bold text-gray-900">$${p.price || '0'}</span>
                    <a href="${p.purchaseLink || '#'}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-sm">View Link</a>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Upload Logic
function showUploadModal() {
    document.getElementById('upload-modal').classList.remove('hidden');
}

function hideUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('product-form').reset();
    document.getElementById('image-preview').classList.add('hidden');
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('image-preview');
            img.src = e.target.result;
            img.classList.remove('hidden');
        }
        reader.readAsDataURL(input.files[0]);
    }
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-prod-btn');
    btn.textContent = "Uploading...";
    btn.disabled = true;

    try {
        const fileInput = document.getElementById('prod-file');
        if (!fileInput.files[0]) throw new Error("Please select an image");

        // Convert image to base64
        const base64Img = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(fileInput.files[0]);
        });

        const data = {
            name: document.getElementById('prod-name').value,
            category: document.getElementById('prod-category').value,
            style: document.getElementById('prod-style').value,
            price: document.getElementById('prod-price').value,
            description: document.getElementById('prod-desc').value,
            imageUrl: base64Img,
            purchaseLink: document.getElementById('prod-link').value
        };

        await apiCall('/products', 'POST', data);
        
        hideUploadModal();
        loadProducts();
        showStatusBanner("Product submitted ✅ Waiting for admin approval before it appears in the app.");
        setTimeout(() => hideStatusBanner(), 8000);
    } catch (err) {
        alert("Upload failed: " + err.message);
    } finally {
        btn.textContent = "Upload Product";
        btn.disabled = false;
    }
});

async function deleteProduct(id) {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
        await apiCall(`/products/${id}`, 'DELETE');
        loadProducts();
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
}

// Start
init();
