// IndexedDB data layer. Stores:
//   receipts : one record per receipt (with a line-items array)
//   meta     : key/value store for settings, budgets, monthly income, learned overrides
//
// No login, no cloud — everything lives in the browser on this device.

const DB_NAME = "receipt-tracker";
const DB_VERSION = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("receipts")) {
        const s = db.createObjectStore("receipts", { keyPath: "id", autoIncrement: true });
        s.createIndex("month", "month", { unique: false });
        s.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = "readonly") {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------------- Receipts ---------------- */

export async function saveReceipt(receipt) {
  const rec = { ...receipt };
  rec.month = (rec.date || "").slice(0, 7);
  if (!rec.createdAt) rec.createdAt = Date.now();
  const store = await tx("receipts", "readwrite");
  const id = await reqPromise(store.add(rec));
  return id;
}

export async function updateReceipt(receipt) {
  const rec = { ...receipt };
  rec.month = (rec.date || "").slice(0, 7);
  const store = await tx("receipts", "readwrite");
  await reqPromise(store.put(rec));
  return rec.id;
}

export async function deleteReceipt(id) {
  const store = await tx("receipts", "readwrite");
  await reqPromise(store.delete(id));
}

export async function getReceipt(id) {
  const store = await tx("receipts");
  return reqPromise(store.get(id));
}

export async function allReceipts() {
  const store = await tx("receipts");
  const list = await reqPromise(store.getAll());
  // newest first
  return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id - a.id));
}

export async function receiptsInMonth(ym) {
  const list = await allReceipts();
  return list.filter((r) => (r.month || (r.date || "").slice(0, 7)) === ym);
}

/* ---------------- Meta (settings / budgets / income / overrides) ---------------- */

async function metaGet(key, fallback) {
  const store = await tx("meta");
  const row = await reqPromise(store.get(key));
  return row ? row.value : fallback;
}

async function metaSet(key, value) {
  const store = await tx("meta", "readwrite");
  await reqPromise(store.put({ key, value }));
  return value;
}

const DEFAULT_SETTINGS = {
  currency: "AED",
  loyaltyRate: 0.01, // 1 point = AED 0.01
};

export async function getSettings() {
  const s = await metaGet("settings", {});
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function setSettings(patch) {
  const cur = await getSettings();
  return metaSet("settings", { ...cur, ...patch });
}

// Budgets: { [category]: number }
export async function getBudgets() {
  return metaGet("budgets", {});
}
export async function setBudgets(budgets) {
  return metaSet("budgets", budgets);
}

// Monthly income keyed by "yyyy-mm": { "2026-08": 12000 }
export async function getIncome(ym) {
  const all = await metaGet("income", {});
  return Number(all[ym] || 0);
}
export async function setIncome(ym, amount) {
  const all = await metaGet("income", {});
  all[ym] = Number(amount) || 0;
  return metaSet("income", all);
}

// Learned category overrides: keyword (lowercased description token) -> category
export async function getOverrides() {
  return metaGet("overrides", {});
}
export async function rememberOverride(descriptionKey, category) {
  const key = String(descriptionKey || "").trim().toLowerCase();
  if (!key) return;
  const map = await getOverrides();
  map[key] = category;
  return metaSet("overrides", map);
}

/* ---------------- Bulk import/export helpers ---------------- */

export async function replaceAllReceipts(records) {
  const store = await tx("receipts", "readwrite");
  await reqPromise(store.clear());
  for (const r of records) {
    const rec = { ...r };
    delete rec.id; // let store assign fresh ids
    rec.month = (rec.date || "").slice(0, 7);
    if (!rec.createdAt) rec.createdAt = Date.now();
    await reqPromise(store.add(rec));
  }
}

export async function addReceipts(records) {
  const store = await tx("receipts", "readwrite");
  for (const r of records) {
    const rec = { ...r };
    delete rec.id;
    rec.month = (rec.date || "").slice(0, 7);
    if (!rec.createdAt) rec.createdAt = Date.now();
    await reqPromise(store.add(rec));
  }
}
