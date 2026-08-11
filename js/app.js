// App entry: router, month picker, tab bar, service-worker registration.
import { subscribe, getState, navigate, setMonth, getMonth, refreshSettings } from "./store.js";
import { currentMonth, shiftMonth } from "./format.js";
import { renderScan } from "./screens/scan.js";
import { renderReview } from "./screens/review.js";
import { renderLog } from "./screens/log.js";
import { renderDashboard } from "./screens/dashboard.js";
import { renderBudgets } from "./screens/budgets.js";
import { renderSettings } from "./screens/settings.js";

const ROUTES = {
  scan: renderScan,
  review: renderReview,
  log: renderLog,
  dashboard: renderDashboard,
  budgets: renderBudgets,
  settings: renderSettings,
};

// Which tab is highlighted for a given route (review has no tab of its own).
const TAB_FOR = { scan: "scan", review: "scan", log: "log", dashboard: "dashboard", budgets: "budgets", settings: "settings" };

const view = document.getElementById("view");
const monthInput = document.getElementById("monthInput");

function render() {
  const { route } = getState();
  const fn = ROUTES[route] || renderScan;
  // Highlight the active tab.
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.route === TAB_FOR[route]));
  // Keep month picker in sync.
  if (monthInput.value !== getMonth()) monthInput.value = getMonth();
  view.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  Promise.resolve(fn(view)).catch((err) => {
    console.error("Render error:", err);
    view.innerHTML = `<div class="empty"><div class="big">⚠️</div><p>Something went wrong on this screen.</p>
      <pre class="muted" style="white-space:pre-wrap;text-align:left">${String(err && err.message || err)}</pre></div>`;
  });
}

function wireChrome() {
  // Tab bar
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => navigate(t.dataset.route)));

  // Month picker
  monthInput.value = getMonth();
  monthInput.addEventListener("change", () => { if (monthInput.value) setMonth(monthInput.value); });
  document.getElementById("monthPrev").addEventListener("click", () => setMonth(shiftMonth(getMonth(), -1)));
  document.getElementById("monthNext").addEventListener("click", () => setMonth(shiftMonth(getMonth(), +1)));
}

async function main() {
  await refreshSettings();
  wireChrome();
  subscribe(render);
  navigate("scan");
  render();

  // Register the service worker for offline use (ignored on file://).
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  }
}

main();
