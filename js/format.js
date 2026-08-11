// Formatting helpers: currency + ISO dates. Currency is configurable via settings.

export function fmtMoney(n, currency = "AED") {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `${currency} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Plain number with 2 decimals (for inputs/tables, no currency prefix).
export function fmtNum(n) {
  const v = Number(n);
  if (!isFinite(v)) return "";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return `${v.toFixed(0)}%`;
}

// Local "today" as yyyy-mm-dd (not UTC, so it matches the user's calendar day).
export function todayISO() {
  const d = new Date();
  return toISO(d);
}

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// yyyy-mm from an ISO date string.
export function monthOf(iso) {
  return (iso || "").slice(0, 7);
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

// "2026-08" -> "August 2026"
export function monthLabel(ym) {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym || "";
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shiftMonth(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Parse a possibly-messy numeric string ("1,234.50", "AED 12.00", "12·50") -> number|null
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, ""); // strip currency words/symbols
  if (!s) return null;
  // If both separators present, assume the last one is the decimal.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // comma only: treat as decimal if it looks like ",dd", else thousands
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
