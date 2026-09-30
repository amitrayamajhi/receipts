// Review form: shows parsed fields (low-confidence ones highlighted), lets the
// user edit everything, then saves. Category overrides are remembered.
import { CATEGORIES } from "../rules.js";
import { categorize, overrideKey } from "../categorize.js";
import { saveReceipt, updateReceipt, getOverrides, rememberOverride } from "../db.js";
import { navigate, takePending, toast, getCurrency, getMonth, setMonth } from "../store.js";
import { round2, fmtNum, monthOf, monthLabel } from "../format.js";

let R = null;          // working copy of the receipt being reviewed
let editingId = null;  // set when editing an existing saved receipt
let originalCats = {}; // description -> original auto category (to detect overrides)

export function startEdit(receipt) {
  // Used by the Log screen to edit an existing receipt.
  R = deepCopy(receipt);
  R.flags = R.flags || {};
  editingId = receipt.id;
  navigate("review");
}

export async function renderReview(view) {
  if (!R) {
    const p = takePending();
    if (p) { R = p; editingId = null; }
  }
  if (!R) {
    view.innerHTML = `<div class="empty"><div class="big">🧾</div><p>Nothing to review.</p>
      <button class="btn primary" id="goScan">Scan a receipt</button></div>`;
    view.querySelector("#goScan").addEventListener("click", () => navigate("scan"));
    return;
  }
  R.items = R.items || [];
  R.flags = R.flags || {};
  originalCats = {};
  R.items.forEach((it) => { originalCats[overrideKey(it.description)] = it.category; });

  const cur = getCurrency();
  const f = R.flags;
  const flagCls = (k) => (f[k] ? " flagged" : "");
  const anyFlags = Object.values(f).some(Boolean);

  view.innerHTML = `
    <h1 class="screen-title">${editingId ? "Edit receipt" : "Review & save"}</h1>

    ${anyFlags ? `<div class="card" style="border-color:var(--accent)">
      <b style="color:var(--accent)">⚠ Please check the highlighted fields.</b>
      <div class="muted" style="margin-top:4px;font-size:.85rem">We weren't fully sure about these — nothing is saved until you tap Save.</div>
    </div>` : ""}

    <div class="card">
      <div class="row">
        <label class="field${flagCls("merchant")}">Merchant
          <input id="f_merchant" value="${attr(R.merchant)}" placeholder="Store name" />
          <div class="flag-note">Couldn't read the store name.</div>
        </label>
        <label class="field${flagCls("date")}">Date
          <input id="f_date" type="date" value="${attr(R.date)}" />
          <div class="flag-note">Date not found — using today.</div>
        </label>
      </div>
      <div class="row">
        <label class="field${flagCls("receiptNumber")}">Receipt #
          <input id="f_receiptNumber" value="${attr(R.receiptNumber)}" placeholder="e.g. 000123" />
          <div class="flag-note">Not detected.</div>
        </label>
        <label class="field${flagCls("paymentMethod")}">Payment method
          <input id="f_paymentMethod" value="${attr(R.paymentMethod)}" placeholder="Cash / Visa ••••1234" />
          <div class="flag-note">Not detected.</div>
        </label>
      </div>
    </div>

    <div class="card">
      <h3>Line items</h3>
      <div class="table-scroll" style="border:none">
        <table class="items-table" id="itemsTable">
          <thead><tr><th>Description</th><th style="width:52px">Qty</th><th style="width:92px">Amount</th><th style="width:120px">Category</th><th class="rm"></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <button class="link-btn" id="addItem">＋ Add item</button>
      <div class="muted" style="text-align:right;font-size:.85rem">Items total: <b id="itemsSum">${fmtNum(itemsTotal())}</b> ${cur}</div>
    </div>

    <div class="card">
      <div class="row">
        <label class="field${flagCls("subtotal")}">Subtotal
          <input id="f_subtotal" inputmode="decimal" value="${numAttr(R.subtotal)}" placeholder="0.00" />
        </label>
        <label class="field${flagCls("vatAmount")}">VAT
          <input id="f_vatAmount" inputmode="decimal" value="${numAttr(R.vatAmount)}" placeholder="0.00" />
          <div class="flag-note">VAT line not found.</div>
        </label>
        <label class="field${flagCls("total")}">Total
          <input id="f_total" inputmode="decimal" value="${numAttr(R.total)}" placeholder="0.00" />
          <div class="flag-note">Check this total.</div>
        </label>
      </div>
      <button class="link-btn" id="useItemsTotal">Set total from items${R._meta ? ` (${fmtNum(R._meta.itemsSum)})` : ""}</button>
      <div class="row">
        <label class="field${flagCls("loyaltyPoints")}">Loyalty points earned
          <input id="f_loyaltyPoints" inputmode="numeric" value="${R.loyaltyPoints != null ? R.loyaltyPoints : ""}" placeholder="0" />
          <div class="flag-note">No points line found.</div>
        </label>
      </div>
      <label class="field">Notes
        <textarea id="f_notes" placeholder="Optional">${text(R.notes)}</textarea>
      </label>
    </div>

    ${R.rawText ? `<details class="card"><summary class="muted">View raw OCR text</summary>
      <pre style="white-space:pre-wrap;font-size:.78rem;color:var(--muted);margin-top:10px">${text(R.rawText)}</pre></details>` : ""}

    <div class="row" style="margin-bottom:24px">
      <button class="btn ghost" id="cancelBtn">Cancel</button>
      <button class="btn primary" id="saveBtn" style="flex:2">💾 ${editingId ? "Update" : "Save receipt"}</button>
    </div>
  `;

  renderItems(view);

  // Field bindings
  bind(view, "#f_merchant", (v) => R.merchant = v);
  bind(view, "#f_date", (v) => R.date = v);
  bind(view, "#f_receiptNumber", (v) => R.receiptNumber = v);
  bind(view, "#f_paymentMethod", (v) => R.paymentMethod = v);
  bind(view, "#f_notes", (v) => R.notes = v);
  bindNum(view, "#f_subtotal", (v) => R.subtotal = v);
  bindNum(view, "#f_vatAmount", (v) => R.vatAmount = v);
  bindNum(view, "#f_total", (v) => R.total = v);
  bind(view, "#f_loyaltyPoints", (v) => R.loyaltyPoints = v === "" ? null : (parseInt(v, 10) || 0));

  view.querySelector("#addItem").addEventListener("click", () => {
    R.items.push({ description: "", qty: 1, amount: 0, category: "Other" });
    renderItems(view);
  });
  view.querySelector("#useItemsTotal").addEventListener("click", () => {
    R.total = itemsTotal();
    view.querySelector("#f_total").value = fmtNum(R.total);
    view.querySelector("#f_total").closest(".field").classList.remove("flagged");
    toast("Total set from items.");
  });
  view.querySelector("#cancelBtn").addEventListener("click", () => {
    const back = editingId ? "log" : "scan";
    R = null; editingId = null;
    navigate(back);
  });
  view.querySelector("#saveBtn").addEventListener("click", () => onSave(view));
}

function renderItems(view) {
  const tbody = view.querySelector("#itemsTable tbody");
  tbody.innerHTML = "";
  R.items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="description" value="${attr(it.description)}" placeholder="Item" /></td>
      <td class="num"><input data-k="qty" inputmode="numeric" value="${it.qty ?? 1}" /></td>
      <td class="num"><input data-k="amount" inputmode="decimal" value="${numAttr(it.amount)}" /></td>
      <td>${catSelect(it.category)}</td>
      <td class="rm"><button class="del-x" title="Remove">✕</button></td>
    `;
    tr.querySelector('[data-k="description"]').addEventListener("input", (e) => {
      it.description = e.target.value;
    });
    tr.querySelector('[data-k="description"]').addEventListener("blur", (e) => {
      // re-guess category if user hasn't manually chosen one for a blank/Other item
      if (it.category === "Other" || !it.category) {
        const guess = categorize(e.target.value, { merchant: R.merchant });
        it.category = guess;
        tr.querySelector('[data-k="category"]').value = guess;
      }
    });
    tr.querySelector('[data-k="qty"]').addEventListener("input", (e) => it.qty = parseInt(e.target.value, 10) || 1);
    tr.querySelector('[data-k="amount"]').addEventListener("input", (e) => {
      it.amount = parseFloat(e.target.value) || 0; updateSum(view);
    });
    tr.querySelector('[data-k="category"]').addEventListener("change", (e) => it.category = e.target.value);
    tr.querySelector(".del-x").addEventListener("click", () => { R.items.splice(i, 1); renderItems(view); });
    tbody.appendChild(tr);
  });
  updateSum(view);
}

function updateSum(view) {
  const el = view.querySelector("#itemsSum");
  if (el) el.textContent = fmtNum(itemsTotal());
}

async function onSave(view) {
  if (!R.date) { toast("Please set a date.", "err"); return; }
  const total = Number(R.total);
  if (!(total > 0) && itemsTotal() <= 0) { toast("Enter a total or at least one item.", "err"); return; }
  if (!(total > 0)) R.total = itemsTotal();

  // Remember any category overrides so future guesses improve.
  const prevOverrides = await getOverrides();
  for (const it of R.items) {
    const key = overrideKey(it.description);
    if (!key) continue;
    const auto = originalCats[key];
    // If the user's chosen category differs from what we'd auto-pick, learn it.
    const autoGuess = auto != null ? auto : categorize(it.description, { overrides: prevOverrides, merchant: R.merchant });
    if (it.category && it.category !== autoGuess) {
      await rememberOverride(key, it.category);
    }
  }

  // Clean the record before persisting.
  const rec = deepCopy(R);
  rec.total = round2(rec.total);
  rec.subtotal = rec.subtotal != null ? round2(rec.subtotal) : null;
  rec.vatAmount = rec.vatAmount != null ? round2(rec.vatAmount) : null;
  rec.items = rec.items
    .filter((it) => (it.description || "").trim() || it.amount > 0)
    .map((it) => ({ description: (it.description || "").trim(), qty: it.qty || 1, amount: round2(it.amount || 0), category: it.category || "Other" }));
  delete rec.flags; delete rec._meta;

  try {
    if (editingId) { rec.id = editingId; await updateReceipt(rec); }
    else { await saveReceipt(rec); }
    R = null;
    // Show the month the receipt was filed under, otherwise a receipt from
    // an earlier month seems to vanish after saving.
    const savedMonth = monthOf(rec.date);
    const where = savedMonth !== getMonth() ? ` under ${monthLabel(savedMonth)}` : "";
    toast(`Receipt ${editingId ? "updated" : "saved"}${where}.`, "ok");
    editingId = null;
    if (savedMonth) setMonth(savedMonth);
    navigate("log");
  } catch (e) {
    console.error(e);
    toast("Could not save — " + (e.message || e), "err");
  }
}

/* ---- helpers ---- */
function itemsTotal() { return round2((R.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0)); }
function catSelect(sel) {
  return `<select data-k="category">${CATEGORIES.map((c) =>
    `<option value="${c}"${c === sel ? " selected" : ""}>${c}</option>`).join("")}</select>`;
}
function bind(view, sel, fn) { const e = view.querySelector(sel); if (e) e.addEventListener("input", (ev) => fn(ev.target.value)); }
function bindNum(view, sel, fn) { const e = view.querySelector(sel); if (e) e.addEventListener("input", (ev) => fn(ev.target.value === "" ? null : (parseFloat(ev.target.value) || 0))); }
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function attr(s) { return String(s ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function numAttr(n) { return n == null || n === "" ? "" : fmtNum(n); }
function text(s) { return String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
