// Expense log: one row per line item for the active month. Filter by category,
// sort by any column, inline-edit description/amount/category, delete, or edit
// the whole receipt.
import { receiptsInMonth, allReceipts, deleteReceipt, updateReceipt } from "../db.js";
import { CATEGORIES } from "../rules.js";
import { getMonth, getCurrency, toast, navigate } from "../store.js";
import { fmtNum, monthLabel, round2 } from "../format.js";
import { startEdit } from "./review.js";

let sortKey = "date";
let sortDir = "desc";
let filterCat = "All";
let scope = "month"; // "month" | "all"

export async function renderLog(view) {
  const ym = getMonth();
  const cur = getCurrency();
  const receipts = scope === "all" ? await allReceipts() : await receiptsInMonth(ym);

  // Flatten to item rows carrying receipt context.
  let rows = [];
  for (const r of receipts) {
    const items = (r.items && r.items.length) ? r.items : [{ description: "(no items)", amount: r.total || 0, category: "Other" }];
    items.forEach((it, idx) => rows.push({
      receiptId: r.id, itemIndex: idx, date: r.date, merchant: r.merchant,
      category: it.category || "Other", description: it.description, amount: Number(it.amount) || 0,
      payment: r.paymentMethod, receiptNo: r.receiptNumber, loyalty: r.loyaltyPoints, _receipt: r,
    }));
  }
  if (filterCat !== "All") rows = rows.filter((r) => r.category === filterCat);
  rows.sort(cmp);

  const totalAmt = round2(rows.reduce((s, r) => s + r.amount, 0));

  view.innerHTML = `
    <h1 class="screen-title">Expense log</h1>
    <div class="log-tools">
      <select id="scopeSel">
        <option value="month"${scope === "month" ? " selected" : ""}>${monthLabel(ym)}</option>
        <option value="all"${scope === "all" ? " selected" : ""}>All months</option>
      </select>
      <select id="catFilter">
        <option value="All">All categories</option>
        ${CATEGORIES.map((c) => `<option value="${c}"${c === filterCat ? " selected" : ""}>${c}</option>`).join("")}
      </select>
      <span class="muted" style="margin-left:auto">${rows.length} item${rows.length === 1 ? "" : "s"} · <b>${cur} ${fmtNum(totalAmt)}</b></span>
    </div>

    ${rows.length === 0 ? `<div class="empty"><div class="big">📋</div><p>No expenses ${scope === "all" ? "yet" : "for " + monthLabel(ym)}.</p>
      <button class="btn primary" id="goScan">Scan your first receipt</button></div>`
      : `<div class="table-scroll"><table class="log">
      <thead><tr>
        ${th("date", "Date")}${th("merchant", "Merchant")}${th("category", "Category")}
        ${th("description", "Item")}${thNum("amount", "Amount")}${th("payment", "Payment")}
        ${th("receiptNo", "Receipt #")}<th></th>
      </tr></thead>
      <tbody>
        ${rows.map(rowHtml).join("")}
      </tbody>
    </table></div>`}
  `;

  const go = view.querySelector("#goScan");
  if (go) go.addEventListener("click", () => navigate("scan"));

  view.querySelector("#scopeSel").addEventListener("change", (e) => { scope = e.target.value; renderLog(view); });
  view.querySelector("#catFilter").addEventListener("change", (e) => { filterCat = e.target.value; renderLog(view); });

  view.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.sort;
    if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortKey = k; sortDir = k === "amount" || k === "date" ? "desc" : "asc"; }
    renderLog(view);
  }));

  // Inline edits + actions
  view.querySelectorAll("tr[data-rid]").forEach((tr) => {
    const rid = Number(tr.dataset.rid);
    const idx = Number(tr.dataset.idx);

    tr.querySelector('[data-edit="description"]')?.addEventListener("blur", (e) =>
      patchItem(rid, idx, { description: e.target.textContent.trim() }, view, false));
    tr.querySelector('[data-edit="amount"]')?.addEventListener("blur", (e) =>
      patchItem(rid, idx, { amount: parseFloat(e.target.textContent.replace(/[^\d.-]/g, "")) || 0 }, view, true));
    tr.querySelector('select[data-edit="category"]')?.addEventListener("change", (e) =>
      patchItem(rid, idx, { category: e.target.value }, view, false));
    tr.querySelector(".editReceipt")?.addEventListener("click", () => {
      const r = rows.find((x) => x.receiptId === rid)?._receipt;
      if (r) startEdit(r);
    });
    tr.querySelector(".del-x")?.addEventListener("click", () => onDelete(rid, idx, view));
  });
}

function rowHtml(r) {
  return `<tr data-rid="${r.receiptId}" data-idx="${r.itemIndex}">
    <td>${escapeHtml(r.date)}</td>
    <td>${escapeHtml(r.merchant || "—")}</td>
    <td><select data-edit="category" style="border:none;background:transparent;color:var(--text);font-weight:600">
      ${CATEGORIES.map((c) => `<option${c === r.category ? " selected" : ""}>${c}</option>`).join("")}
    </select></td>
    <td contenteditable="true" data-edit="description">${escapeHtml(r.description || "")}</td>
    <td class="num" contenteditable="true" data-edit="amount">${fmtNum(r.amount)}</td>
    <td>${escapeHtml(r.payment || "—")}</td>
    <td>${escapeHtml(r.receiptNo || "—")}</td>
    <td style="white-space:nowrap">
      <button class="link-btn editReceipt" title="Edit whole receipt">✎</button>
      <button class="del-x" title="Delete item">🗑</button>
    </td>
  </tr>`;
}

async function patchItem(rid, idx, patch, view, reRender) {
  const receipts = await allReceipts();
  const r = receipts.find((x) => x.id === rid);
  if (!r || !r.items || !r.items[idx]) return;
  Object.assign(r.items[idx], patch);
  r.total = round2(r.items.reduce((s, it) => s + (Number(it.amount) || 0), 0) + (r.vatAmount || 0));
  await updateReceipt(r);
  if (reRender) renderLog(view);
}

async function onDelete(rid, idx, view) {
  const receipts = await allReceipts();
  const r = receipts.find((x) => x.id === rid);
  if (!r) return;
  if (r.items && r.items.length > 1) {
    if (!confirm("Delete this item from the receipt?")) return;
    r.items.splice(idx, 1);
    r.total = round2(r.items.reduce((s, it) => s + (Number(it.amount) || 0), 0) + (r.vatAmount || 0));
    await updateReceipt(r);
  } else {
    if (!confirm("Delete this whole receipt?")) return;
    await deleteReceipt(rid);
  }
  toast("Deleted.");
  renderLog(view);
}

function cmp(a, b) {
  let av = a[sortKey], bv = b[sortKey];
  if (sortKey === "amount") { av = a.amount; bv = b.amount; }
  else { av = String(av ?? "").toLowerCase(); bv = String(bv ?? "").toLowerCase(); }
  let r = av < bv ? -1 : av > bv ? 1 : 0;
  return sortDir === "asc" ? r : -r;
}

function th(key, label) {
  const cls = sortKey === key ? ` class="sorted ${sortDir === "desc" ? "desc" : ""}"` : "";
  return `<th data-sort="${key}"${cls}>${label}</th>`;
}
function thNum(key, label) {
  const cls = sortKey === key ? ` sorted ${sortDir === "desc" ? "desc" : ""}` : "";
  return `<th data-sort="${key}" class="${cls}" style="text-align:right">${label}</th>`;
}
function escapeHtml(s) { return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
