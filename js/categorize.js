// Assigns a category to a line item. Priority:
//   1. Learned overrides (things the user corrected before)
//   2. Keyword rules (rules.js)
//   3. Merchant hint (store type)
//   4. "Other"
import { CATEGORY_RULES, MERCHANT_HINTS } from "./rules.js";

// Pre-flatten rules into [keyword, category] pairs sorted longest-first so more
// specific keywords win.
let _pairs = null;
function pairs() {
  if (_pairs) return _pairs;
  const list = [];
  for (const [cat, words] of Object.entries(CATEGORY_RULES)) {
    for (const w of words) list.push([w.toLowerCase().trim(), cat]);
  }
  list.sort((a, b) => b[0].length - a[0].length);
  _pairs = list;
  return _pairs;
}

// Build a normalized lookup key from a description (used for overrides).
export function overrideKey(description) {
  return String(description || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * @param {string} description  line item text
 * @param {object} opts { overrides:{}, merchant:"" }
 * @returns {string} category
 */
export function categorize(description, opts = {}) {
  const { overrides = {}, merchant = "" } = opts;
  const desc = String(description || "").toLowerCase();

  // 1. Exact learned override for this description
  const key = overrideKey(description);
  if (key && overrides[key]) return overrides[key];

  // 1b. Partial override: any remembered keyword contained in the description
  for (const ok of Object.keys(overrides)) {
    if (ok.length >= 3 && desc.includes(ok)) return overrides[ok];
  }

  // 2. Keyword rules
  for (const [kw, cat] of pairs()) {
    if (kw && desc.includes(kw)) return cat;
  }

  // 3. Merchant hint
  for (const h of MERCHANT_HINTS) {
    if (h.match.test(merchant)) return h.category;
  }

  // 4. Fallback
  return "Other";
}
