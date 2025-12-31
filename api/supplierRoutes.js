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

const requireSupplier = (req, res, next) => {
    const supplier = db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(404).json({ error: "Register as a supplier first" });
    req.supplier = supplier;
    next();
};

const requireApprovedSupplier = (req, res, next) => {
    const supplier = req.supplier || db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(404).json({ error: "Register as a supplier first" });
    if (supplier.status !== "approved") {
        return res.status(403).json({ error: "Supplier is not approved yet", status: supplier.status });
    }
    req.supplier = supplier;
    next();
};

// --- Supplier Profile Routes ---

// Get current supplier profile
router.get('/me', requireAuth, (req, res) => {
    const supplier = db.suppliers.getByUserId(req.userId);
    if (!supplier) {
        return res.status(404).json({ error: "Supplier profile not found" });
    }
    res.json(supplier);
});

// Register as a supplier
router.post('/register', requireAuth, (req, res) => {
    try {
        const { companyName, contactEmail, description, categories } = req.body;
        
        if (!companyName) return res.status(400).json({ error: "Company name is required" });

        const supplier = db.suppliers.create({
            userId: req.userId,
            companyName,
            contactEmail: contactEmail || "",
            description: description || "",
            categories: categories || [],
            logoUrl: req.body.logoUrl || null
        });

        res.status(201).json(supplier);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Update supplier profile
router.put('/me', requireAuth, (req, res) => {
    try {
        // Supplier cannot self-approve or change status fields
        const { status, statusUpdatedAt, statusReason, ...safeUpdates } = req.body || {};
        const updated = db.suppliers.update(req.userId, safeUpdates);
        if (!updated) return res.status(404).json({ error: "Supplier not found" });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- Product Routes ---

// List my products
router.get('/products', requireAuth, requireSupplier, requireApprovedSupplier, (req, res) => {
    const products = db.products.getBySupplierId(req.supplier.id);
    res.json(products);
});

// Add a product
router.post('/products', requireAuth, requireSupplier, requireApprovedSupplier, (req, res) => {
    const supplier = req.supplier;

    const { name, description, price, category, style, imageUrl, purchaseLink } = req.body;

    if (!name || !imageUrl) {
        return res.status(400).json({ error: "Name and Image are required" });
    }

    const product = db.products.create({
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
});

// Delete a product
router.delete('/products/:id', requireAuth, requireSupplier, requireApprovedSupplier, (req, res) => {
    const supplier = req.supplier;

    const success = db.products.delete(req.params.id, supplier.id);
    if (!success) return res.status(404).json({ error: "Product not found or not owned by you" });

    res.json({ success: true });
});

// Public: List all products (for the renovation tool integration)
router.get('/public/catalog', (req, res) => {
    const suppliers = db.suppliers.getAll();
    const approvedIds = new Set(suppliers.filter((s) => s.status === "approved").map((s) => s.id));
    const allProducts = db.products.getAll().filter((p) => approvedIds.has(p.supplierId));
    res.json(allProducts);
});

// --- Admin Routes ---

router.get('/admin/suppliers', requireAuth, requireAdmin, (req, res) => {
    const status = req.query && req.query.status;
    let suppliers = db.suppliers.getAll();
    if (status) suppliers = suppliers.filter((s) => s.status === status);
    suppliers.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json(suppliers);
});

router.post('/admin/suppliers/:id/approve', requireAuth, requireAdmin, (req, res) => {
    const supplier = db.suppliers.updateById(req.params.id, {
        status: "approved",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "",
    });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
});

router.post('/admin/suppliers/:id/reject', requireAuth, requireAdmin, (req, res) => {
    const reason = (req.body && req.body.reason) ? String(req.body.reason) : "";
    const supplier = db.suppliers.updateById(req.params.id, {
        status: "rejected",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: reason,
    });
    if (!supplier) return res.status(404).json({ error: "Supplier not found" });
    res.json(supplier);
});

module.exports = router;

