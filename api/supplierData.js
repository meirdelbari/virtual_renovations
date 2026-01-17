const store = require("./kvStore");

const db = {
  suppliers: {
    // Supplier status:
    // - active (default)
    // - blocked (admin-only)
    //
    // Backward compatible: previous versions used supplier approval statuses.
    getAll: async () =>
      (await store.getSuppliers()).map((s) => ({
        // Normalize old statuses to new model
        status: s.status === "blocked" ? "blocked" : "active",
        statusUpdatedAt: s.statusUpdatedAt || s.createdAt || new Date().toISOString(),
        statusReason: s.statusReason || "",
        updatedAt: s.createdAt || new Date().toISOString(),
        ...s,
      })),
    getById: async (id) => (await db.suppliers.getAll()).find((s) => s.id === id),
    getByUserId: async (userId) => (await db.suppliers.getAll()).find((s) => s.userId === userId),
    create: async (supplierData) => {
      const suppliers = await db.suppliers.getAll();
      if (suppliers.find((s) => s.userId === supplierData.userId)) {
        throw new Error("Supplier already exists for this user");
      }
      const newSupplier = {
        id: 'sup_' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "",
        ...supplierData
      };
      suppliers.push(newSupplier);
      await store.setSuppliers(suppliers);
      return newSupplier;
    },
    update: async (userId, updates) => {
      const suppliers = await db.suppliers.getAll();
      const index = suppliers.findIndex(s => s.userId === userId);
      if (index === -1) return null;
      
      suppliers[index] = { ...suppliers[index], ...updates, updatedAt: new Date().toISOString() };
      await store.setSuppliers(suppliers);
      return suppliers[index];
    },
    updateById: async (id, updates) => {
      const suppliers = await db.suppliers.getAll();
      const index = suppliers.findIndex((s) => s.id === id);
      if (index === -1) return null;
      suppliers[index] = { ...suppliers[index], ...updates, updatedAt: new Date().toISOString() };
      await store.setSuppliers(suppliers);
      return suppliers[index];
    }
  },
  products: {
    // Product status:
    // - pending (default on supplier submit)
    // - approved (admin)
    // - rejected (admin)
    getAll: async () =>
      (await store.getProducts()).map((p) => ({
        status: "approved",
        statusUpdatedAt: p.createdAt || new Date().toISOString(),
        statusReason: "",
        updatedAt: p.createdAt || new Date().toISOString(),
        ...p,
      })),
    getBySupplierId: async (supplierId) =>
      (await db.products.getAll()).filter((p) => p.supplierId === supplierId),
    create: async (productData) => {
      const products = await db.products.getAll();
      const newProduct = {
        id: 'prod_' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
        statusUpdatedAt: new Date().toISOString(),
        statusReason: "",
        ...productData
      };
      products.push(newProduct);
      await store.setProducts(products);
      return newProduct;
    },
    delete: async (productId, supplierId) => {
      const products = await db.products.getAll();
      const filtered = products.filter(p => !(p.id === productId && p.supplierId === supplierId));
      if (filtered.length === products.length) return false;
      await store.setProducts(filtered);
      return true;
    }
    ,
    deleteAllBySupplierId: async (supplierId) => {
      const products = await db.products.getAll();
      const filtered = products.filter((p) => p.supplierId !== supplierId);
      const removed = products.length - filtered.length;
      if (removed > 0) await store.setProducts(filtered);
      return { removed };
    },
    deleteImportedBySupplierId: async (supplierId, opts = {}) => {
      const websiteUrl = opts.websiteUrl ? String(opts.websiteUrl) : "";
      const products = await db.products.getAll();
      const filtered = products.filter((p) => {
        if (p.supplierId !== supplierId) return true;
        const meta = p.importMeta || null;
        if (!meta) return true; // keep manually added products
        if (websiteUrl) {
          return String(meta.websiteUrl || "") !== websiteUrl;
        }
        return false; // remove all imported products for this supplier
      });
      const removed = products.length - filtered.length;
      if (removed > 0) await store.setProducts(filtered);
      return { removed };
    },
    updateById: async (id, updates) => {
      const products = await db.products.getAll();
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) return null;
      products[index] = { ...products[index], ...updates, updatedAt: new Date().toISOString() };
      await store.setProducts(products);
      return products[index];
    },
    getById: async (id) => (await db.products.getAll()).find((p) => p.id === id),
  }
};

module.exports = db;

