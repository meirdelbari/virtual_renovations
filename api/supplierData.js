const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SUPPLIERS_FILE = path.join(DATA_DIR, 'suppliers.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize files if they don't exist
function initFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}

initFile(SUPPLIERS_FILE, []);
initFile(PRODUCTS_FILE, []);

// Helpers
function readJSON(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return [];
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

const db = {
  suppliers: {
    getAll: () => readJSON(SUPPLIERS_FILE),
    getByUserId: (userId) => readJSON(SUPPLIERS_FILE).find(s => s.userId === userId),
    create: (supplierData) => {
      const suppliers = readJSON(SUPPLIERS_FILE);
      if (suppliers.find(s => s.userId === supplierData.userId)) {
        throw new Error("Supplier already exists for this user");
      }
      const newSupplier = {
        id: 'sup_' + Date.now(),
        createdAt: new Date().toISOString(),
        ...supplierData
      };
      suppliers.push(newSupplier);
      writeJSON(SUPPLIERS_FILE, suppliers);
      return newSupplier;
    },
    update: (userId, updates) => {
      const suppliers = readJSON(SUPPLIERS_FILE);
      const index = suppliers.findIndex(s => s.userId === userId);
      if (index === -1) return null;
      
      suppliers[index] = { ...suppliers[index], ...updates };
      writeJSON(SUPPLIERS_FILE, suppliers);
      return suppliers[index];
    }
  },
  products: {
    getAll: () => readJSON(PRODUCTS_FILE),
    getBySupplierId: (supplierId) => readJSON(PRODUCTS_FILE).filter(p => p.supplierId === supplierId),
    create: (productData) => {
      const products = readJSON(PRODUCTS_FILE);
      const newProduct = {
        id: 'prod_' + Date.now(),
        createdAt: new Date().toISOString(),
        ...productData
      };
      products.push(newProduct);
      writeJSON(PRODUCTS_FILE, products);
      return newProduct;
    },
    delete: (productId, supplierId) => {
        const products = readJSON(PRODUCTS_FILE);
        const filtered = products.filter(p => !(p.id === productId && p.supplierId === supplierId));
        if (filtered.length === products.length) return false;
        writeJSON(PRODUCTS_FILE, filtered);
        return true;
    }
  }
};

module.exports = db;

