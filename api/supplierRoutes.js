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
        const updated = db.suppliers.update(req.userId, req.body);
        if (!updated) return res.status(404).json({ error: "Supplier not found" });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- Product Routes ---

// List my products
router.get('/products', requireAuth, (req, res) => {
    const supplier = db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(404).json({ error: "Register as a supplier first" });

    const products = db.products.getBySupplierId(supplier.id);
    res.json(products);
});

// Add a product
router.post('/products', requireAuth, (req, res) => {
    const supplier = db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(403).json({ error: "Only registered suppliers can add products" });

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
router.delete('/products/:id', requireAuth, (req, res) => {
    const supplier = db.suppliers.getByUserId(req.userId);
    if (!supplier) return res.status(403).json({ error: "Access denied" });

    const success = db.products.delete(req.params.id, supplier.id);
    if (!success) return res.status(404).json({ error: "Product not found or not owned by you" });

    res.json({ success: true });
});

// Public: List all products (for the renovation tool integration)
router.get('/public/catalog', (req, res) => {
    const allProducts = db.products.getAll();
    res.json(allProducts);
});

module.exports = router;

