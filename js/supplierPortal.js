// Initialize Clerk
let clerk;
let currentUser = null;
let currentSupplier = null;
let allProducts = []; // Store all products for client-side filtering
let currentCategory = 'All'; // Track active category filter

async function init() {
    // Fetch Clerk key first to ensure consistency with the main app
    try {
        const res = await fetch('/api/auth-config');
        if (!res.ok) throw new Error("Failed to fetch auth config");
        const config = await res.json();
        
        if (config.publishableKey) {
            // Check if Clerk is already loaded (e.g. from cache or main app)
            if (window.Clerk) {
                startClerk(config.publishableKey);
            } else {
                 const script = document.createElement('script');
                 script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@4/dist/clerk.browser.js';
                 script.onload = () => startClerk(config.publishableKey);
                 script.onerror = () => {
                     console.error("Failed to load Clerk script");
                     document.getElementById('loading').textContent = "Error loading authentication script.";
                 };
                 document.head.appendChild(script);
            }
        } else {
            console.error("No publishableKey found in config");
            document.getElementById('loading').textContent = "Configuration Error: No Auth Key found.";
        }
    } catch (e) {
        console.error("Failed to load auth config", e);
        document.getElementById('loading').textContent = "Error connecting to server. Is it running?";
    }
}

async function startClerk(pubKey) {
    // 1. Immediate Bypass for Localhost if Key is missing (prevents crash)
    if (!pubKey && window.location.hostname === 'localhost') {
         console.warn("No Publishable Key found. Entering Local Dev Mode.");
         activateDevMode();
         return;
    }

    if (!window.Clerk) {
        console.error("Clerk SDK not found on window");
        
        // Immediate Bypass for Localhost if SDK is missing entirely
        if (window.location.hostname === 'localhost') {
             console.warn("Clerk SDK missing, entering Local Dev Mode directly");
             activateDevMode();
        }
        return;
    }
    
    // Check if instance already exists
    if (window.Clerk.version) {
        clerk = window.Clerk;
    } else {
        // If it's the class constructor
        try {
            if (!pubKey) throw new Error("Missing Publishable Key");
            clerk = new window.Clerk(pubKey);
        } catch (e) {
            console.error("Clerk Constructor Error:", e);
            if (window.location.hostname === 'localhost') {
                activateDevMode();
                return;
            }
            // Sometimes window.Clerk is already the instance
            clerk = window.Clerk;
        }
    }

    try {
        console.log("Starting Clerk load sequence...");
        // Only load if not already loaded
        if (!clerk.isReady && !clerk.user) {
             console.log("Calling clerk.load()...");
             await clerk.load({
                publishableKey: pubKey
            });
            console.log("clerk.load() returned.");
        } else {
             console.log("Clerk was already ready.");
        }
        
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
        if (clerk.user) {
             currentUser = clerk.user;
             mountUserButton();
             checkSupplierStatus();
        } else {
             document.getElementById('loading').innerHTML = `
                <div class="text-center text-red-500">
                   <p>Authentication Failed</p>
                   <p class="text-xs text-gray-600">${err.message}</p>
                   <button onclick="location.reload()" class="mt-2 text-blue-600 underline">Retry</button>
                </div>
             `;
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
        showDashboard();
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
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('registration-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

function showRegistration() {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('registration-view').classList.remove('hidden');
}

function showDashboard() {
    document.getElementById('loading').classList.add('hidden');
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
