// Receipt text parser: messy OCR text -> structured receipt.
// Pure functions, no DOM, so it can be unit-tested in isolation (see tests/).
import { parseAmount, todayISO, round2 } from "./format.js";
import { categorize } from "./categorize.js";

// A money token: 12.50 / 1,234.50 / 12,50 / AED 9.00 (we grab the numeric part).
const MONEY = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\b|\d+[.,]\d{2}\b/g;

// Lines we never treat as purchasable line items.
const NON_ITEM = /\b(sub\s*-?\s*total|total|vat|tax|change|balance|cash|card|visa|master\s*card|master|maestro|amex|credit|debit|tender|amount\s*due|paid|round|points?|happiness|thank|welcome|invoice|receipt|bill\s*no|tel|phone|fax|trn|trn\s*no|date|time|cashier|counter|qty|description|item)\b/i;

// A masked card number ("****3366", "XXXX 3366", "•••• 3366") marks a
// payment line, whatever the card brand is called on it.
const MASKED_CARD = /[*x•·]{3,}\s*\d{4}\b/i;

// Money on these lines is what the customer handed over or got back, not
// what the receipt cost, so it must not win the "largest value" cross-check.
const TENDER_LINE = /\b(cash|change|tender(?:ed)?|paid|received|balance\s*due|card|visa|master\s*card|mastercard|amex)\b/i;

// Extract all monetary values from a line, in order.
function moneyTokens(line) {
  const out = [];
  const m = line.match(MONEY);
  if (m) for (const t of m) {
    const v = parseAmount(t);
    if (v != null) out.push(v);
  }
  return out;
}

// Last money value on a line (typically the price / amount column).
function lastMoney(line) {
  const t = moneyTokens(line);
  return t.length ? t[t.length - 1] : null;
}

function cleanLines(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/* ---------- Field extractors ---------- */

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

function extractDate(lines) {
  const joined = lines.join("  ");
  // 1) 2026-08-11 or 2026/08/11
  let m = joined.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // 2) 11/08/2026 or 11-08-26  (assume day-first, common in UAE)
  m = joined.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    let [_, a, b, y] = m; a = +a; b = +b; y = +y;
    if (y < 100) y += 2000;
    let day = a, mon = b;
    if (a > 12 && b <= 12) { day = a; mon = b; }
    else if (b > 12 && a <= 12) { day = b; mon = a; } // month-first fallback
    return iso(y, mon, day);
  }
  // 3) 11 Aug 2026 / 11-AUG-26
  m = joined.match(/\b(\d{1,2})[-\s]*([A-Za-z]{3,})[-\s]*(20\d{2}|\d{2})\b/);
  if (m && MONTHS[m[2].slice(0,3).toLowerCase()]) {
    let y = +m[3]; if (y < 100) y += 2000;
    return iso(y, MONTHS[m[2].slice(0,3).toLowerCase()], +m[1]);
  }
  return null;
}
function iso(y, mo, d) {
  if (!y || !mo || !d || mo > 12 || d > 31) return null;
  return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

// Find the value on the first line matching any keyword; returns the last money token.
function findLabeled(lines, keywordRe, { avoid } = {}) {
  for (const line of lines) {
    if (avoid && avoid.test(line)) continue;
    if (keywordRe.test(line)) {
      const v = lastMoney(line);
      if (v != null) return { value: v, line };
    }
  }
  return null;
}

// "Total" lines that are NOT the amount paid: subtotals, the VAT total,
// item counts, savings.
const NOT_GRAND_TOTAL = /\b(sub\s*-?\s*total|vat|tax|items?|qty|quantity|sav(?:ed|ings?)|discount|points?)\b/i;

function extractTotal(lines) {
  // Try the most explicit labels first, so "GRAND TOTAL" beats an earlier
  // "TOTAL VAT" line; a bare "total" is the last resort.
  const strong =
    findLabeled(lines, /\b(grand\s*total|amount\s*due|net\s*total|total\s*payable|total\s*amount|net\s*amount)\b/i,
      { avoid: /\bsub\s*-?\s*total\b/i }) ||
    findLabeled(lines, /\btotal\b/i, { avoid: NOT_GRAND_TOTAL });
  // Cross-check: the largest money value in the bottom 60% of the receipt,
  // ignoring cash handed over / change given.
  const bottom = lines.slice(Math.floor(lines.length * 0.4));
  let maxVal = 0;
  for (const l of bottom) {
    if (TENDER_LINE.test(l)) continue;
    for (const v of moneyTokens(l)) if (v > maxVal) maxVal = v;
  }

  if (strong) {
    const mismatch = maxVal > 0 && Math.abs(maxVal - strong.value) > Math.max(0.5, strong.value * 0.02) && maxVal > strong.value;
    return { value: round2(strong.value), confident: !mismatch, crossCheck: maxVal };
  }
  if (maxVal > 0) return { value: round2(maxVal), confident: false, crossCheck: maxVal };
  return { value: null, confident: false, crossCheck: maxVal };
}

function extractVat(lines) {
  const r = findLabeled(lines, /\b(vat|v\.a\.t|tax|output\s*tax|5\s*%)\b/i);
  return r ? round2(r.value) : null;
}

function extractSubtotal(lines) {
  const r = findLabeled(lines, /\bsub\s*-?\s*total\b/i);
  return r ? round2(r.value) : null;
}

function extractLoyalty(lines) {
  for (const line of lines) {
    if (/\b(happiness\s*points?|reward\s*points?|points?\s*earned|points?\s*balance|loyalt|points?)\b/i.test(line)) {
      // grab an integer that is NOT a monetary value (no decimals)
      const ints = line.match(/\b\d{1,6}\b/g);
      if (ints) {
        // prefer the last integer that isn't part of a decimal money token
        const candidates = ints.map(Number).filter((n) => n > 0 && n < 1000000);
        if (candidates.length) return candidates[candidates.length - 1];
      }
    }
  }
  return null;
}

function extractReceiptNumber(lines) {
  for (const line of lines) {
    const m = line.match(/\b(?:tax\s*invoice|invoice|receipt|bill|trans(?:action)?|order|ref|pos)\s*(?:no\.?|number|#|:)?\s*[:#]?\s*([A-Za-z0-9\-\/]{3,})/i);
    if (m && /\d/.test(m[1])) return m[1].replace(/[:#]+$/, "");
  }
  // Fallback: a line that is just "#12345"
  for (const line of lines) {
    const m = line.match(/^#\s*([A-Za-z0-9\-]{4,})$/);
    if (m) return m[1];
  }
  return null;
}

function extractPayment(lines) {
  const joined = lines.join("  ");
  // Masked card, e.g. "MasterCard ****3366" / "•••• 3366"
  let m = joined.match(/\b(visa|mastercard|master\s*card|amex|american\s*express|maestro|credit|debit)\b[^\d]{0,12}(?:[*x•·]{2,}\s*)?(\d{3,4})\b/i);
  if (m) {
    const brand = m[1].replace(/\s+/g, "").replace(/mastercard/i, "Mastercard").replace(/^visa$/i, "Visa");
    return `${cap(brand)} ••••${m[2]}`;
  }
  m = joined.match(/\b(visa|mastercard|master\s*card|amex|american\s*express|maestro)\b/i);
  if (m) return cap(m[1].replace(/\s+/g, ""));
  if (/\bcash\b/i.test(joined)) return "Cash";
  if (/\b(card|credit|debit|pos)\b/i.test(joined)) return "Card";
  return null;
}
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function extractMerchant(lines) {
  // Look at the top few lines for the first line that reads like a name:
  // has letters, not mostly digits, not a labelled field.
  for (const line of lines.slice(0, 6)) {
    const letters = (line.match(/[A-Za-z؀-ۿ]/g) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    if (letters >= 3 && letters >= digits &&
        !/\b(tel|phone|fax|trn|vat|invoice|receipt|date|time|www\.|http|@|p\.?o\.?\s*box|address)\b/i.test(line) &&
        !MONEY.test(line)) {
      MONEY.lastIndex = 0;
      return line.replace(/\s{2,}/g, " ").trim().slice(0, 60);
    }
    MONEY.lastIndex = 0;
  }
  return null;
}

/* ---------- Line items ---------- */

function extractItems(lines, merchant, overrides) {
  const items = [];
  for (const raw of lines) {
    if (NON_ITEM.test(raw) || MASKED_CARD.test(raw)) continue;

    const tokens = moneyTokens(raw);
    let amount = tokens.length ? tokens[tokens.length - 1] : null;
    let impliedRaw = null; // the trailing-integer string we consumed as a price

    // Fallback: OCR frequently drops the decimal point ("4.25" -> "425").
    // If there's no proper money token but the line ends in a 3-4 digit integer,
    // read it as an implied-cents price (425 -> 4.25). Kept conservative (3-4
    // digits, not a longer barcode) and the user can still fix it in review.
    if (amount == null) {
      const im = raw.match(/(?:^|\s)(\d{3,4})\s*$/);
      if (im) { impliedRaw = im[1]; amount = parseInt(im[1], 10) / 100; }
    }
    if (!(amount > 0)) continue;

    // Description = line with the trailing money / implied-price token removed.
    let desc = raw;
    if (tokens.length) {
      const mm = raw.match(MONEY);
      MONEY.lastIndex = 0;
      if (mm) {
        const last = mm[mm.length - 1];
        const idx = desc.lastIndexOf(last);
        if (idx >= 0) desc = desc.slice(0, idx);
      }
    } else if (impliedRaw) {
      const idx = desc.lastIndexOf(impliedRaw);
      if (idx >= 0) desc = desc.slice(0, idx);
    }

    // qty detection: "2 x 3.50", "2X", "2 @", or leading integer, or "x2"
    let qty = 1;
    let qm = desc.match(/\b(\d{1,3})\s*[x×@]\s*/i) || desc.match(/^\s*(\d{1,3})\s+(?=[A-Za-z])/) || desc.match(/[x×]\s*(\d{1,3})\b/i);
    if (qm) { const q = parseInt(qm[1], 10); if (q > 0 && q < 1000) qty = q; }

    // strip qty markers, barcodes (>=6 digit runs), stray codes, leftover money
    desc = desc
      .replace(/\b\d{6,}\b/g, " ")               // barcodes / product codes
      .replace(/^\s*\d{1,3}\s+(?=[A-Za-z])/, " ")  // leading qty: "1 Cappuccino"
      .replace(/\b\d{1,3}\s*[x×@]\s*[\d.,]*/gi, " ") // "2 x 3.50"
      .replace(/[x×]\s*\d{1,3}\b/gi, " ")
      .replace(MONEY, " ")
      .replace(/[|*#=_]{2,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s\-.:]+|[\s\-.:]+$/g, "")
      .trim();
    MONEY.lastIndex = 0;

    const letters = (desc.match(/[A-Za-z؀-ۿ]/g) || []).length;
    if (letters < 2) continue;          // skip barcode-only / numeric rows
    if (desc.length < 2) continue;

    items.push({
      description: desc.slice(0, 80),
      qty,
      amount: round2(amount),
      category: categorize(desc, { overrides, merchant: merchant || "" }),
    });
  }
  return items;
}

/* ---------- Public API ---------- */

/**
 * @param {string} rawText
 * @param {object} opts { overrides:{}, today:"yyyy-mm-dd" }
 * @returns parsed receipt with a `flags` object marking low-confidence fields.
 */
export function parseReceipt(rawText, opts = {}) {
  const overrides = opts.overrides || {};
  const lines = cleanLines(rawText);

  const dateFound = extractDate(lines);
  const merchant = extractMerchant(lines);
  const totalR = extractTotal(lines);
  const vat = extractVat(lines);
  const subtotal = extractSubtotal(lines);
  const loyalty = extractLoyalty(lines);
  const receiptNumber = extractReceiptNumber(lines);
  const paymentMethod = extractPayment(lines);
  const items = extractItems(lines, merchant, overrides);

  const itemsSum = round2(items.reduce((s, it) => s + (it.amount || 0), 0));

  const receipt = {
    date: dateFound || (opts.today || todayISO()),
    merchant: merchant || "",
    receiptNumber: receiptNumber || "",
    paymentMethod: paymentMethod || "",
    subtotal: subtotal != null ? subtotal : null,
    vatAmount: vat != null ? vat : null,
    total: totalR.value != null ? totalR.value : null,
    loyaltyPoints: loyalty != null ? loyalty : null,
    notes: "",
    items,
    rawText: String(rawText || ""),
  };

  // Confidence flags: true = show highlighted / needs a human look.
  receipt.flags = {
    date: !dateFound,
    merchant: !merchant,
    total: receipt.total == null || !totalR.confident,
    subtotal: subtotal == null,
    vatAmount: vat == null,
    receiptNumber: !receiptNumber,
    paymentMethod: !paymentMethod,
    loyaltyPoints: loyalty == null,
    items: items.length === 0,
  };
  receipt._meta = { itemsSum, totalCrossCheck: totalR.crossCheck, lineCount: lines.length };
  return receipt;
}
