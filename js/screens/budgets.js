// Budgets: editable monthly budget per category, with live progress bars for the
// active month. Over-budget categories are shown in red.
import { getBudgets, setBudgets, receiptsInMonth } from "../db.js";
import { CATEGORIES } from "../rules.js";
import { categoryColor } from "../charts.js";
import { getMonth, getCurrency, toast } from "../store.js";
import { fmtMoney, fmtPct, monthLabel, round2 } from "../format.js";
import { spendingItems } from "../spending.js";

export async function renderBudgets(view) {
  const ym = getMonth();
  const cur = getCurrency();
  const [budgets, receipts] = await Promise.all([getBudgets(), receiptsInMonth(ym)]);

  const spent = {};
  for (const r of receipts) {
    for (const it of spendingItems(r)) spent[it.category || "Other"] = (spent[it.category || "Other"] || 0) + (Number(it.amount) || 0);
  }

  const totalBudget = round2(CATEGORIES.reduce((s, c) => s + (Number(budgets[c]) || 0), 0));
  const totalSpent = round2(Object.values(spent).reduce((s, v) => s + v, 0));

  view.innerHTML = `
    <h1 class="screen-title">Budgets</h1>
    <div class="card">
      <div class="muted" style="margin-bottom:6px">${monthLabel(ym)}</div>
      <div style="display:flex;justify-content:space-between;font-weight:700">
        <span>Spent ${fmtMoney(totalSpent, cur)}</span>
        <span class="muted">of ${fmtMoney(totalBudget, cur)}</span>
      </div>
    </div>
    <div class="card">
      ${CATEGORIES.map((c) => budRow(c, Number(budgets[c]) || 0, round2(spent[c] || 0), cur)).join("")}
    </div>
    <p class="muted" style="text-align:center;font-size:.82rem">Type a monthly limit for each category. Changes save automatically.</p>
  `;

  view.querySelectorAll("input.bud-input").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const cat = inp.dataset.cat;
      const val = parseFloat(inp.value) || 0;
      const b = await getBudgets();
      b[cat] = val;
      await setBudgets(b);
      toast(`${cat} budget saved.`);
      renderBudgets(view);
    });
  });
}

function budRow(cat, budget, spent, cur) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const over = budget > 0 && spent > budget;
  const remaining = round2(budget - spent);
  const color = over ? "var(--danger)" : categoryColor(cat);
  return `
    <div class="bud-row">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="chip" style="background:${categoryColor(cat)}">${cat}</span>
      </div>
      <input class="bud-input" data-cat="${cat}" inputmode="decimal" value="${budget || ""}" placeholder="0" />
      <div class="bar"><i style="width:${pct}%;background:${color}"></i></div>
      <div class="bud-meta">
        <span>${fmtMoney(spent, cur)} spent</span>
        <span class="${over ? "over" : ""}">${budget > 0 ? (over ? `Over by ${fmtMoney(-remaining, cur)}` : `${fmtMoney(remaining, cur)} left · ${fmtPct(pct)}`) : "No budget set"}</span>
      </div>
    </div>`;
}
