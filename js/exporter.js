// Export / import. Uses the vendored SheetJS (global `XLSX`) for .xlsx.
// Column order (per spec):
//   Date, Merchant, Category, Item/Description, Amount (AED), VAT (AED),
//   Payment Method, Receipt #, Loyalty Points, Notes
import { round2, currentMonth, monthLabel } from "./format.js";
import { CATEGORIES } from "./rules.js";

const HEADERS = [
  "Date", "Merchant", "Category", "Item/Description", "Amount (AED)",
  "VAT (AED)", "Payment Method", "Receipt #", "Loyalty Points", "Notes",
];

// Flatten receipts -> one row per line item. VAT and Loyalty go on the first
// row of each receipt only, so column sums don't double-count.
function toRows(receipts) {
  const rows = [];
  for (const r of receipts) {
    const items = (r.items && r.items.length) ? r.items
      : [{ description: "(no items)", amount: r.total || 0, category: "Other" }];
    items.forEach((it, i) => {
      rows.push([
        r.date || "",
        r.merchant || "",
        it.category || "Other",
        it.description || "",
        round2(it.amount || 0),
        // VAT & Loyalty are numeric receipt-level totals — first row only, so
        // column sums and the Dashboard formulas don't double-count.
        i === 0 ? (r.vatAmount != null ? round2(r.vatAmount) : "") : "",
        // Payment & Receipt # are identifiers — repeated on every row so an
        // import can reliably regroup a receipt's line items.
        r.paymentMethod || "",
        r.receiptNumber || "",
        i === 0 ? (r.loyaltyPoints != null ? r.loyaltyPoints : "") : "",
        i === 0 ? (r.notes || "") : "",
      ]);
    });
  }
  return rows;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ---------------- CSV ---------------- */

export function exportCsv(receipts) {
  const rows = toRows(receipts);
  const lines = [HEADERS.join(",")].concat(rows.map((r) => r.map(csvEscape).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `receipts-${currentMonth()}.csv`);
}

// Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// CSV rows -> receipts (groups item rows back together by Date+Merchant+Receipt#).
export function receiptsFromCsv(text) {
  const rows = parseCsv(text).filter((r) => r.length && r.some((c) => String(c).trim() !== ""));
  if (!rows.length) return [];
  // detect header
  const start = /date/i.test(rows[0][0]) ? 1 : 0;
  const groups = new Map();
  for (let i = start; i < rows.length; i++) {
    const c = rows[i];
    const rec = {
      date: (c[0] || "").trim(),
      merchant: (c[1] || "").trim(),
      category: (c[2] || "Other").trim(),
      description: (c[3] || "").trim(),
      amount: Number(c[4]) || 0,
      vat: c[5] === "" ? null : Number(c[5]),
      payment: (c[6] || "").trim(),
      receiptNo: (c[7] || "").trim(),
      loyalty: c[8] === "" ? null : Number(c[8]),
      notes: (c[9] || "").trim(),
    };
    const key = `${rec.date}|${rec.merchant}|${rec.receiptNo}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date: rec.date, merchant: rec.merchant, receiptNumber: rec.receiptNo,
        paymentMethod: rec.payment, vatAmount: null, loyaltyPoints: null,
        notes: rec.notes, items: [], subtotal: null, total: 0,
      });
    }
    const g = groups.get(key);
    if (rec.vat != null && !isNaN(rec.vat)) g.vatAmount = rec.vat;
    if (rec.loyalty != null && !isNaN(rec.loyalty)) g.loyaltyPoints = rec.loyalty;
    if (rec.payment) g.paymentMethod = g.paymentMethod || rec.payment;
    if (rec.description && rec.description !== "(no items)") {
      g.items.push({ description: rec.description, qty: 1, amount: rec.amount, category: rec.category });
    }
  }
  const out = [];
  for (const g of groups.values()) {
    g.total = round2(g.items.reduce((s, it) => s + (it.amount || 0), 0) + (g.vatAmount || 0));
    out.push(g);
  }
  return out;
}

/* ---------------- XLSX (3 sheets) ---------------- */

export function exportXlsx(receipts, { budgets = {}, income = 0, month = currentMonth(), currency = "AED", loyaltyRate = 0.01 } = {}) {
  if (typeof XLSX === "undefined") throw new Error("Spreadsheet engine not loaded.");
  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: Expense Log ----
  const rows = toRows(receipts);
  const logAoa = [HEADERS, ...rows];
  const logWs = XLSX.utils.aoa_to_sheet(logAoa);
  logWs["!cols"] = [12, 20, 14, 30, 12, 10, 18, 14, 12, 20].map((w) => ({ wch: w }));
  logWs["!autofilter"] = { ref: `A1:J${logAoa.length}` };
  XLSX.utils.book_append_sheet(wb, logWs, "Expense Log");

  // ---- Sheet 2: Dashboard (live formulas over Expense Log) ----
  const nData = rows.length;
  const lastRow = nData + 1; // header is row 1
  const logCat = `'Expense Log'!$C$2:$C$${Math.max(lastRow, 2)}`;
  const logAmt = `'Expense Log'!$E$2:$E$${Math.max(lastRow, 2)}`;
  const logVat = `'Expense Log'!$F$2:$F$${Math.max(lastRow, 2)}`;
  const logPts = `'Expense Log'!$I$2:$I$${Math.max(lastRow, 2)}`;

  const dash = [];
  dash.push([`Monthly Dashboard — ${monthLabel(month)}`]);
  dash.push([]);
  dash.push(["Category", "Budget", "Actual", "Remaining", "% Used"]);
  const catStartRow = dash.length + 1; // 1-based row of first category
  CATEGORIES.forEach((cat) => {
    dash.push([cat, Number(budgets[cat] || 0), null, null, null]);
  });
  const catEndRow = dash.length;
  dash.push(["TOTAL",
    { f: `SUM(B${catStartRow}:B${catEndRow})` },
    { f: `SUM(C${catStartRow}:C${catEndRow})` },
    { f: `SUM(D${catStartRow}:D${catEndRow})` },
    null]);
  dash.push([]);
  const sumRow = dash.length + 1;
  dash.push(["Monthly Income", Number(income || 0)]);
  dash.push(["Total Spending", { f: `SUM(${logAmt})` }]);
  dash.push(["Total VAT", { f: `SUM(${logVat})` }]);
  dash.push(["Net Savings", { f: `B${sumRow}-B${sumRow + 1}` }]);
  dash.push(["Savings Rate", { f: `IF(B${sumRow}=0,"",(B${sumRow}-B${sumRow + 1})/B${sumRow})` }]);
  dash.push([]);
  const loyRow = dash.length + 1;
  dash.push(["Loyalty Points (total)", { f: `SUM(${logPts})` }]);
  dash.push(["Point Value (AED each)", Number(loyaltyRate || 0.01)]);
  dash.push(["Loyalty Cash Value", { f: `B${loyRow}*B${loyRow + 1}` }]);

  const dashWs = XLSX.utils.aoa_to_sheet(dash);
  // Fill category Actual/Remaining/% formulas (SUMIF into Expense Log)
  for (let i = 0; i < CATEGORIES.length; i++) {
    const r = catStartRow + i; // 1-based
    dashWs[`C${r}`] = { t: "n", f: `SUMIF(${logCat},A${r},${logAmt})` };
    dashWs[`D${r}`] = { t: "n", f: `B${r}-C${r}` };
    dashWs[`E${r}`] = { t: "n", f: `IF(B${r}=0,"",C${r}/B${r})` };
  }
  dashWs["!cols"] = [24, 12, 12, 12, 10].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, dashWs, "Dashboard");

  // ---- Sheet 3: How to Use ----
  const help = [
    ["Receipt Tracker — How to Use"],
    [],
    ["1. The 'Expense Log' sheet has one row per receipt line item."],
    ["   Columns: " + HEADERS.join(", ")],
    ["   VAT, Payment, Receipt #, Loyalty & Notes are filled on the FIRST row of each receipt only."],
    [],
    ["2. The 'Dashboard' sheet is LIVE — its totals use formulas (SUMIF/SUM),"],
    ["   so if you edit amounts in the Expense Log, the Dashboard updates automatically."],
    [],
    ["3. Budgets and Monthly Income were exported from the app. Edit them in column B"],
    ["   of the Dashboard to see Remaining, % Used, Net Savings and Savings Rate recalculate."],
    [],
    ["4. To bring data back into the app, use 'Import CSV' in Settings (export CSV first as a template)."],
    [],
    [`Currency: ${currency}   |   Exported: ${new Date().toISOString().slice(0, 10)}`],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, helpWs, "How to Use");

  XLSX.writeFile(wb, `receipts-${month}.xlsx`, { compression: true });
}
