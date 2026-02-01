const express = require('express');
const router = express.Router();
const db = require('./supplierData');
const { scrapeProductsFromWebsite } = require("./productImporter");

// Middleware to simulate authentication check
// In a real app, this would verify the Clerk session token
const requireAuth = (req, res, next) => {
    const userId = req.headers['x-user-id']; // Client must send this header
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized: Missing User ID" });
    }
    req.userId = userId;
    next();
};

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const requireAdmin = (req, res, next) => {
    const allowlist = (process.env.SUPPLIER_ADMIN_USER_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const adminKeyHeader = req.headers["x-admin-key"];
    const adminKeyEnv = process.env.SUPPLIER_ADMIN_KEY;

    const byUserId = allowlist.length > 0 && allowlist.includes(req.userId);
    const byKey = !!adminKeyEnv && !!adminKeyHeader && adminKeyHeader === adminKeyEnv;

    // Local dev bypass:
    // If running locally (NODE_ENV !== "production") and the operator did not configure
    // any admin allowlist/key, allow access so the admin UI is usable on localhost.
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    const hasAnyAdminConfig = allowlist.length > 0 || !!adminKeyEnv;
    const devBypass = !isProd && !hasAnyAdminConfig;

    if (!byUserId && !byKey && !devBypass) {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

const getSupplierForRequest = async (req, res) => {
    const supplierId =
        (req.headers && req.headers["x-supplier-id"]) ||
        (req.query && req.query.supplierId) ||
        "";
    if (supplierId) {
        const supplier = await db.suppliers.getById(String(supplierId));
        if (!supplier || supplier.userId !== req.userId) {
            res.status(404).json({ error: "Supplier not found for this user" });
            return null;
        }
        return supplier;
    }

    const suppliers = await db.suppliers.getByUserIdAll(req.userId);
    if (!suppliers || suppliers.length === 0) {
        res.status(404).json({ error: "Register as a supplier first" });
        return null;
    }
    if (suppliers.length > 1) {
        res.status(400).json({
            error: "Multiple suppliers found. Select a supplier.",
            suppliers: suppliers.map((s) => ({ id: s.id, companyName: s.companyName || "" })),
        });
        return null;
    }
    return suppliers[0];
};

const requireSupplier = asyncHandler(async (req, res, next) => {
    const supplier = await getSupplierForRequest(req, res);
    if (!supplier) return;
    req.supplier = supplier;
    next();
});

const requireNotBlockedSupplier = asyncHandler(async (req, res, next) => {
    const supplier = req.supplier || (await getSupplierForRequest(req, res));
    if (!supplier) return;
    if (supplier.status === "blocked") {
        return res.status(403).json({ error: "Supplier account is blocked" });
    }
    req.supplier = supplier;
    next();
});

function normalizeHost(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
        const host = new URL(withScheme).hostname || "";
        return host.replace(/^www\./i, "").toLowerCase();
    } catch (_) {
        return raw.replace(/^www\./i, "").toLowerCase();
    }
}

function getDisplayOrder(product) {
    const n = Number(product && product.displayOrder);
    return Number.isFinite(n) ? n : null;
}

function sortByDisplayOrder(a, b) {
    const ao = getDisplayOrder(a);
    const bo = getDisplayOrder(b);
    if (ao !== null && bo !== null) return ao - bo;
    if (ao !== null) return -1;
    if (bo !== null) return 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
}

// --- Supplier Profile Routes ---

// Get current supplier profile
router.get('/me', requireAuth, requireSupplier, asyncHandler(async (req, res) => {
    res.json(req.supplier);
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
    const suppliers = await db.suppliers.getByUserIdAll(req.userId);
    res.json(suppliers);
}));

router.delete('/mine/:id', requireAuth, asyncHandler(async (req, res) => {
    const supplierId = String(req.params.id || "");
    const confirm = (req.body && String(req.body.confirm || "")).trim().toUpperCase();
    if (confirm !== "DELETE") {
        return res.status(400).json({ error: "Confirmation required. Send { confirm: \"DELETE\" }." });
    }

    const supplier = await db.suppliers.getById(supplierId);
    if (!supplier || supplier.userId !== req.userId) {
        return res.status(404).json({ error: "Supplier not found for this user" });
    }

    const removedProducts = await db.products.deleteAllBySupplierId(supplierId);
    const removedSupplier = await db.suppliers.deleteById(supplierId);
    if (!removedSupplier) return res.status(404).json({ error: "Supplier not found" });

    res.json({ success: true, removedProducts: removedProducts.removed || 0 });
}));

// Register as a supplier
router.post('/register', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { companyName, contactPerson, contactEmail, phone, website, address, categories } = req.body;
        
        if (!companyName) return res.status(400).json({ error: "Company name is required" });
        if (!contactPerson) return res.status(400).json({ error: "Contact person is required" });
        if (!contactEmail) return res.status(400).json({ error: "Contact email is required" });
        if (!phone) return res.status(400).json({ error: "Phone is required" });
        if (!website) return res.status(400).json({ error: "Website is required" });
        if (!address) return res.status(400).json({ error: "Address is required" });
        if (!Array.isArray(categories) || categories.filter(Boolean).length === 0) {
            return res.status(400).json({ error: "At least one category is required" });
        }

        const supplier = await db.suppliers.create({
            userId: req.userId,
            companyName,
            contactPerson,
            contactEmail,
            phone,
            website,
            address,
            categories: categories.filter(Boolean),
            logoUrl: req.body.logoUrl || null
        });

        res.status(201).json(supplier);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}));

// Update supplier profile
router.put('/me', requireAuth, requireSupplier, asyncHandler(async (req, res) => {
    try {
        // Supplier cannot self-approve or change status fields
        const { status, statusUpdatedAt, statusReason, ...safeUpdates } = req.body || {};
        const updated = await db.suppliers.updateById(req.supplier.id, safeUpdates);
        if (!updated) return res.status(404).json({ error: "Supplier not found" });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}));


// --- Product Routes ---

// List my products
router.get('/products', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const products = await db.products.getBySupplierId(req.supplier.id);
    res.json(products);
}));

// Add a product
router.post('/products', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;

<<<<<<< HEAD
    const { name, description, price, category, style, imageUrl, purchaseLink } = req.body;
=======
    const { name, description, price, category, style, imageUrl, purchaseLink, catalogNo } = req.body;
>>>>>>> 5b2bbbb (Restore repo)

    if (!name || !imageUrl) {
        return res.status(400).json({ error: "Name and Image are required" });
    }

    const product = await db.products.create({
        supplierId: supplier.id,
        supplierName: supplier.companyName,
        name,
<<<<<<< HEAD
=======
        catalogNo,
>>>>>>> 5b2bbbb (Restore repo)
        description,
        price,
        category,
        style: style || 'modern', // Default to modern if missing
        imageUrl, // Expecting base64 or URL
        purchaseLink
    });

    res.status(201).json(product);
}));

// Import products from supplier website (MVP)
// Body:
// - websiteUrl?: string (defaults to supplier.profile.website)
// - maxProducts?: number (default 30)
// - downloadImages?: boolean (default true) -> copies images into our storage as data URLs when possible
router.post('/products/import', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;

    const websiteUrl = (req.body && req.body.websiteUrl) ? String(req.body.websiteUrl).trim() : (supplier.website || "");
    const maxProducts = (req.body && req.body.maxProducts !== undefined) ? Number(req.body.maxProducts) : 30;
    const downloadImages = (req.body && req.body.downloadImages !== undefined) ? !!req.body.downloadImages : true;
    const deepScan = (req.body && req.body.deepScan !== undefined) ? !!req.body.deepScan : true;
    const replaceExisting = (req.body && req.body.replaceExisting !== undefined) ? !!req.body.replaceExisting : false;
    // Default to updating existing items (safe, no deletions). This avoids the common
    // "Imported 0, Skipped N" confusion when a supplier re-imports the same catalog.
    const updateExisting = (req.body && req.body.updateExisting !== undefined) ? !!req.body.updateExisting : true;

    if (!websiteUrl) return res.status(400).json({ error: "websiteUrl is required (or set it in your supplier profile)" });

    // Optional: remove previously imported items for this supplier (so repeated imports refresh the catalog)
    let removed = 0;
    if (replaceExisting) {
        const result = await db.products.deleteImportedBySupplierId(supplier.id, { websiteUrl });
        removed = result.removed || 0;
    }

    // Scrape
    const scrape = await scrapeProductsFromWebsite(websiteUrl, {
        // Import limit is enforced below after de-dupe. We over-scan candidates so "new" items aren't missed.
        maxProducts,
        // If not replacing, scan a large window to find newly added items that may appear later in the catalog pages.
        maxCandidates: replaceExisting ? maxProducts : 2000,
        maxPerPageHeuristic: replaceExisting ? 120 : 500,
        downloadImages,
        crawlSitemap: deepScan,
        maxScanPages: deepScan ? 200 : 0,
        concurrency: 3,
    });

    // De-dupe against existing supplier products (by purchaseLink, then by name+imageUrl)
    const existing = await db.products.getBySupplierId(supplier.id);
    const byLink = new Set(existing.map(p => (p.purchaseLink || "").trim()).filter(Boolean));
    const byLinkToProduct = new Map(existing.map(p => [(p.purchaseLink || "").trim(), p]).filter(([k]) => !!k));
    const byNameImage = new Set(existing.map(p => `${(p.name || "").trim().toLowerCase()}|${(p.imageUrl || "").trim()}`));

    const imported = [];
    const skipped = [];
    const updated = [];

    for (const p of scrape.products) {
        if (imported.length >= maxProducts) break;
        const link = (p.productUrl || "").trim();
        const key2 = `${(p.name || "").trim().toLowerCase()}|${(p.imageUrl || "").trim()}`;

        if (link && byLink.has(link)) {
            if (updateExisting) {
                const existingProduct = byLinkToProduct.get(link);
                if (existingProduct) {
                    const updatedProduct = await db.products.updateById(existingProduct.id, {
                        // Refresh key fields from scrape (keep supplier ownership intact)
                        name: p.name || existingProduct.name,
                        imageUrl: p.imageUrl || existingProduct.imageUrl,
                        description: p.description || existingProduct.description,
                        price: p.price || existingProduct.price,
                        importMeta: {
                            ...(existingProduct.importMeta || {}),
                            websiteUrl: scrape.websiteUrl,
                            source: p.source || (existingProduct.importMeta && existingProduct.importMeta.source) || "unknown",
                            discoveredFrom: p.discoveredFrom || (existingProduct.importMeta && existingProduct.importMeta.discoveredFrom) || "",
                            imageCopied: !!p.imageCopied,
                            imageError: p.imageError || "",
                            refreshedAt: new Date().toISOString(),
                        },
                    });
                    updated.push(updatedProduct);
                }
            } else {
                skipped.push({ name: p.name, reason: "duplicate_link", productUrl: link });
            }
            continue;
        }
        if (byNameImage.has(key2)) {
            skipped.push({ name: p.name, reason: "duplicate_name_image" });
            continue;
        }

        const product = await db.products.create({
            supplierId: supplier.id,
            supplierName: supplier.companyName,
            name: p.name,
            description: p.description || "",
            price: p.price || "",
            category: (Array.isArray(supplier.categories) && supplier.categories[0]) ? supplier.categories[0] : "Furniture",
            style: "modern",
            imageUrl: p.imageUrl || "",
            purchaseLink: p.productUrl || "",
            // Keep pending so admin can approve if desired
            status: "pending",
            statusUpdatedAt: new Date().toISOString(),
            statusReason: "",
            importMeta: {
                websiteUrl: scrape.websiteUrl,
                source: p.source || "unknown",
                discoveredFrom: p.discoveredFrom || "",
                imageCopied: !!p.imageCopied,
                imageError: p.imageError || "",
                importedAt: new Date().toISOString(),
            }
        });

        imported.push(product);
        if (link) byLink.add(link);
        if (link) byLinkToProduct.set(link, product);
        byNameImage.add(key2);
    }

    res.json({
        supplierId: supplier.id,
        websiteUrl: scrape.websiteUrl,
        requested: scrape.importedCandidates,
        importLimit: maxProducts,
        removedExistingImported: removed,
        importedCount: imported.length,
        updatedCount: updated.length,
        skippedCount: skipped.length,
        skipped,
        note: scrape.notes,
        debug: scrape.debug || null,
        // Return a small preview to avoid huge payloads
        importedPreview: imported.slice(0, 5),
        updatedPreview: updated.slice(0, 5),
    });
}));

// Update a product (New)
router.put('/products/:id', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;
    const productId = req.params.id;
    const updates = req.body;

    // Verify ownership
    const products = await db.products.getBySupplierId(supplier.id);
    const existing = products.find(p => p.id === productId);
    
    if (!existing) {
        return res.status(404).json({ error: "Product not found or not owned by you" });
    }

    // Prepare safe updates
    const safeUpdates = {
        name: updates.name,
<<<<<<< HEAD
=======
        catalogNo: updates.catalogNo,
>>>>>>> 5b2bbbb (Restore repo)
        description: updates.description,
        price: updates.price,
        category: updates.category,
        style: updates.style,
        imageUrl: updates.imageUrl,
        purchaseLink: updates.purchaseLink,
        // Reset status to pending on significant edits if desired, or keep as is?
        // Let's reset to pending to ensure re-approval if critical info changes.
        // Actually, let's reset status only if image or name changes. 
        // For now, let's keep it simple: Resetting status to 'pending' is safer.
        status: "pending", 
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "" // clear previous rejections
    };

    // Remove undefined keys
    Object.keys(safeUpdates).forEach(key => safeUpdates[key] === undefined && delete safeUpdates[key]);

    const updatedProduct = await db.products.updateById(productId, safeUpdates);
    res.json(updatedProduct);
}));

// Delete a product
router.delete('/products/:id', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;

    const success = await db.products.delete(req.params.id, supplier.id);
    if (!success) return res.status(404).json({ error: "Product not found or not owned by you" });

    res.json({ success: true });
}));

// Delete ALL my products (dangerous; requires explicit confirmation)
router.delete('/products', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;
    const confirm = String((req.query && req.query.confirm) || "").toLowerCase();
    if (confirm !== "true" && confirm !== "1" && confirm !== "yes") {
        return res.status(400).json({
            error: "Confirmation required. Re-send with ?confirm=true to delete all products for this supplier.",
        });
    }
    const result = await db.products.deleteAllBySupplierId(supplier.id);
    res.json({ success: true, removed: result.removed || 0 });
}));

// Public: List all products (for the renovation tool integration)
router.get('/public/catalog', asyncHandler(async (req, res) => {
    const suppliers = await db.suppliers.getAll();
    const activeSupplierIds = new Set(suppliers.filter((s) => s.status !== "blocked").map((s) => s.id));
    const supplierId = req.query && req.query.supplierId ? String(req.query.supplierId) : "";
    const supplierHost = req.query && req.query.supplierHost ? String(req.query.supplierHost) : "";
    let requestedSupplierId = supplierId;
    if (!requestedSupplierId && supplierHost) {
        const wantedHost = normalizeHost(supplierHost);
        const hit = suppliers.find((s) => normalizeHost(s.website) === wantedHost);
        if (hit && hit.id) requestedSupplierId = hit.id;
    }

    let allProducts = (await db.products.getAll()).filter(
        (p) => activeSupplierIds.has(p.supplierId) && p.status === "approved"
    );
    if (requestedSupplierId) {
        allProducts = allProducts.filter((p) => p.supplierId === requestedSupplierId);
    }
    allProducts.sort(sortByDisplayOrder);
    res.json(allProducts);
}));

// --- Admin Routes ---

router.get('/admin/suppliers', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const status = req.query && req.query.status;
    let suppliers = await db.suppliers.getAll();
    if (status) suppliers = suppliers.filter((s) => s.status === status);
    suppliers.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json(suppliers);
}));

router.post('/admin/suppliers/:id/block', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const reason = (req.body && req.body.reason) ? String(req.body.reason) : "";
    const supplier = await db.suppliers.updateById(req.params.id, {
        status: "blocked",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: reason,
    });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
}));

router.post('/admin/suppliers/:id/unblock', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const supplier = await db.suppliers.updateById(req.params.id, {
        status: "active",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "",
    });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
}));

// Products awaiting approval
router.get('/admin/products', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const status = req.query && req.query.status;
    let products = await db.products.getAll();
    if (status) products = products.filter((p) => p.status === status);
    products.sort(sortByDisplayOrder);
    res.json(products);
}));

router.post('/admin/products/:id/order', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const raw = req.body && req.body.displayOrder;
    let displayOrder = null;
    if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            return res.status(400).json({ error: "displayOrder must be a number" });
        }
        displayOrder = parsed;
    }
    const product = await db.products.updateById(req.params.id, {
        displayOrder,
        updatedAt: new Date().toISOString(),
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
}));

router.post('/admin/products/:id/approve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const product = await db.products.updateById(req.params.id, {
        status: "approved",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "",
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
}));

router.post('/admin/products/:id/reject', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const reason = (req.body && req.body.reason) ? String(req.body.reason) : "";
    const product = await db.products.updateById(req.params.id, {
        status: "rejected",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: reason,
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
}));

// Admin: inspect supplier details + their products (for "view supplier portal" behavior)
router.get('/admin/suppliers/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const supplier = await db.suppliers.getById(req.params.id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
}));

router.get('/admin/suppliers/:id/products', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const supplier = await db.suppliers.getById(req.params.id);
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    const products = await db.products.getBySupplierId(req.params.id);
    res.json(products);
}));

module.exports = router;
