// Tiny shared state + helpers (route, active month, settings, toast).
import { currentMonth } from "./format.js";
import { getSettings } from "./db.js";

const state = {
  route: "scan",
  month: currentMonth(),
  settings: { currency: "AED", loyaltyRate: 0.01 },
  // transient hand-off from Scan -> Review
  pending: null,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

export function getState() { return state; }
export function getMonth() { return state.month; }
export function getCurrency() { return state.settings.currency || "AED"; }

export function navigate(route) {
  if (state.route === route) { emit(); return; }
  state.route = route;
  emit();
}

export function setMonth(ym) {
  state.month = ym;
  emit();
}

export async function refreshSettings() {
  state.settings = await getSettings();
  return state.settings;
}

export function setPending(receipt) { state.pending = receipt; }
export function takePending() { const p = state.pending; state.pending = null; return p; }

/* ---- Toast ---- */
let toastTimer = null;
export function toast(msg, type = "") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// Small helper: set innerHTML and return the container element.
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function el(view, html) { view.innerHTML = html; return view; }
