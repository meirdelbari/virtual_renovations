const store = require("./kvStore");

const db = {
  suppliers: {
    // Backward compatible: older suppliers.json may not have status fields.
    getAll: async () =>
      (await store.getSuppliers()).map((s) => ({
        status: "approved",
        statusUpdatedAt: s.createdAt || new Date().toISOString(),
        statusReason: "",
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
        status: "pending",
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
    getAll: async () => await store.getProducts(),
    getBySupplierId: async (supplierId) => (await store.getProducts()).filter(p => p.supplierId === supplierId),
    create: async (productData) => {
      const products = await store.getProducts();
      const newProduct = {
        id: 'prod_' + Date.now(),
        createdAt: new Date().toISOString(),
        ...productData
      };
      products.push(newProduct);
      await store.setProducts(products);
      return newProduct;
    },
    delete: async (productId, supplierId) => {
      const products = await store.getProducts();
      const filtered = products.filter(p => !(p.id === productId && p.supplierId === supplierId));
      if (filtered.length === products.length) return false;
      await store.setProducts(filtered);
      return true;
    }
  }
};

module.exports = db;

