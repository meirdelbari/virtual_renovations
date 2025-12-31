// Simple KV-backed storage with file fallback.
// In production on Vercel, the filesystem is ephemeral; KV provides persistence.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const SUPPLIERS_FILE = path.join(DATA_DIR, "suppliers.json");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SUPPLIERS_FILE)) fs.writeFileSync(SUPPLIERS_FILE, "[]");
  if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, "[]");
}

function tryLoadVercelKV() {
  // Vercel KV typically injects KV_REST_API_URL/KV_REST_API_TOKEN
  const hasKV =
    !!process.env.KV_REST_API_URL &&
    (!!process.env.KV_REST_API_TOKEN || !!process.env.KV_REST_API_READ_ONLY_TOKEN);
  if (!hasKV) return null;

  try {
    // eslint-disable-next-line global-require
    const { kv } = require("@vercel/kv");
    return kv;
  } catch (e) {
    console.warn("Vercel KV env vars set but @vercel/kv not installed:", e.message);
    return null;
  }
}

const kv = tryLoadVercelKV();

async function readFileJSON(filePath) {
  try {
    ensureDataDir();
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data || "[]");
  } catch (e) {
    console.error("Failed reading JSON file", filePath, e.message);
    return [];
  }
}

async function writeFileJSON(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function getJSON(key, filePath) {
  if (kv) {
    const val = await kv.get(key);
    return Array.isArray(val) ? val : val || [];
  }
  return await readFileJSON(filePath);
}

async function setJSON(key, filePath, value) {
  if (kv) {
    await kv.set(key, value);
    return;
  }
  await writeFileJSON(filePath, value);
}

module.exports = {
  hasKV: !!kv,
  getSuppliers: () => getJSON("vr:suppliers", SUPPLIERS_FILE),
  setSuppliers: (suppliers) => setJSON("vr:suppliers", SUPPLIERS_FILE, suppliers),
  getProducts: () => getJSON("vr:products", PRODUCTS_FILE),
  setProducts: (products) => setJSON("vr:products", PRODUCTS_FILE, products),
};


