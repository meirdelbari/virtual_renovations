const express = require('express');
const router = express.Router();
const db = require('./supplierData');

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

    if (!byUserId && !byKey) {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

const requireSupplier = asyncHandler(async (req, res, next) => {
    const supplier = await db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(404).json({ error: "Register as a supplier first" });
    req.supplier = supplier;
    next();
});

const requireNotBlockedSupplier = asyncHandler(async (req, res, next) => {
    const supplier = req.supplier || (await db.suppliers.getByUserId(req.userId));
    if (!supplier) return res.status(404).json({ error: "Register as a supplier first" });
    if (supplier.status === "blocked") {
        return res.status(403).json({ error: "Supplier account is blocked" });
    }
    req.supplier = supplier;
    next();
});

// --- Supplier Profile Routes ---

// Get current supplier profile
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const supplier = await db.suppliers.getByUserId(req.userId);
    if (!supplier) {
        return res.status(404).json({ error: "Supplier profile not found" });
    }
    res.json(supplier);
}));

// Register as a supplier
router.post('/register', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { companyName, contactPerson, contactEmail, phone, website, address, categories } = req.body;
        
        if (!companyName) return res.status(400).json({ error: "Company name is required" });
        if (!contactPerson) return res.status(400).json({ error: "Contact person is required" });

        const supplier = await db.suppliers.create({
            userId: req.userId,
            companyName,
            contactPerson,
            contactEmail: contactEmail || "",
            phone: phone || "",
            website: website || "",
            address: address || "",
            categories: categories || [],
            logoUrl: req.body.logoUrl || null
        });

        res.status(201).json(supplier);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}));

// Update supplier profile
router.put('/me', requireAuth, asyncHandler(async (req, res) => {
    try {
        // Supplier cannot self-approve or change status fields
        const { status, statusUpdatedAt, statusReason, ...safeUpdates } = req.body || {};
        const updated = await db.suppliers.update(req.userId, safeUpdates);
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

    const { name, description, price, category, style, imageUrl, purchaseLink } = req.body;

    if (!name || !imageUrl) {
        return res.status(400).json({ error: "Name and Image are required" });
    }

    const product = await db.products.create({
        supplierId: supplier.id,
        supplierName: supplier.companyName,
        name,
        description,
        price,
        category,
        style: style || 'modern', // Default to modern if missing
        imageUrl, // Expecting base64 or URL
        purchaseLink
    });

    res.status(201).json(product);
}));

// Delete a product
router.delete('/products/:id', requireAuth, requireSupplier, requireNotBlockedSupplier, asyncHandler(async (req, res) => {
    const supplier = req.supplier;

    const success = await db.products.delete(req.params.id, supplier.id);
    if (!success) return res.status(404).json({ error: "Product not found or not owned by you" });

    res.json({ success: true });
}));

// Public: List all products (for the renovation tool integration)
router.get('/public/catalog', asyncHandler(async (req, res) => {
    const suppliers = await db.suppliers.getAll();
    const activeSupplierIds = new Set(suppliers.filter((s) => s.status !== "blocked").map((s) => s.id));
    const allProducts = (await db.products.getAll()).filter(
        (p) => activeSupplierIds.has(p.supplierId) && p.status === "approved"
    );
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
    products.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json(products);
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

