// Monthly dashboard: summary stats, spending-by-category donut, budget-vs-actual
// bars, and a loyalty-points panel.
import { receiptsInMonth, getBudgets, getIncome, setIncome, getSettings } from "../db.js";
import { CATEGORIES } from "../rules.js";
import { donut, budgetBars } from "../charts.js";
import { getMonth, getCurrency, toast } from "../store.js";
import { fmtMoney, fmtNum, fmtPct, monthLabel, round2 } from "../format.js";

export async function renderDashboard(view) {
  const ym = getMonth();
  const cur = getCurrency();
  const [receipts, budgets, income, settings] = await Promise.all([
    receiptsInMonth(ym), getBudgets(), getIncome(ym), getSettings(),
  ]);

  // Aggregate by category.
  const byCat = {};
  let totalSpending = 0, totalVat = 0, totalPoints = 0;
  for (const r of receipts) {
    totalVat += Number(r.vatAmount) || 0;
    totalPoints += Number(r.loyaltyPoints) || 0;
    const items = (r.items && r.items.length) ? r.items : [{ amount: r.total || 0, category: "Other" }];
    for (const it of items) {
      const a = Number(it.amount) || 0;
      byCat[it.category || "Other"] = (byCat[it.category || "Other"] || 0) + a;
      totalSpending += a;
    }
  }
  totalSpending = round2(totalSpending);
  const netSavings = round2(income - totalSpending);
  const savingsRate = income > 0 ? (netSavings / income) * 100 : NaN;
  const pointRate = Number(settings.loyaltyRate || 0.01);
  const pointsValue = round2(totalPoints * pointRate);

  const donutData = CATEGORIES.map((c) => ({ label: c, value: round2(byCat[c] || 0) })).filter((d) => d.value > 0);
  const budgetRows = CATEGORIES.map((c) => ({ label: c, actual: round2(byCat[c] || 0), budget: Number(budgets[c] || 0) }));
  const overBudget = budgetRows.filter((r) => r.budget > 0 && r.actual > r.budget);

  view.innerHTML = `
    <h1 class="screen-title">${monthLabel(ym)}</h1>

    <div class="stat-grid" style="margin-bottom:14px">
      <div class="stat"><div class="k">Total spending</div><div class="v">${fmtMoney(totalSpending, cur)}</div></div>
      <div class="stat"><div class="k">Monthly income</div>
        <div class="v"><input id="incomeInput" inputmode="decimal" value="${income || ""}" placeholder="0"
          style="width:100%;border:none;background:transparent;font:inherit;font-weight:800;color:var(--text)"/></div></div>
      <div class="stat"><div class="k">Net savings</div>
        <div class="v ${netSavings >= 0 ? "good" : "bad"}">${fmtMoney(netSavings, cur)}</div></div>
      <div class="stat"><div class="k">Savings rate</div>
        <div class="v ${savingsRate >= 0 ? "good" : "bad"}">${isNaN(savingsRate) ? "—" : fmtPct(savingsRate)}</div></div>
    </div>

    <div class="card">
      <h3>Spending by category</h3>
      ${donutData.length ? `<div style="display:flex;flex-direction:column;align-items:center;gap:12px">${donut(donutData)}</div>`
        : `<p class="muted">No spending recorded this month yet.</p>`}
    </div>

    <div class="card">
      <h3>Budget vs actual</h3>
      ${overBudget.length ? `<p class="over" style="margin-top:-4px">⚠ Over budget: ${overBudget.map((r) => r.label).join(", ")}</p>` : ""}
      ${budgetBars(budgetRows)}
      <p class="muted" style="font-size:.78rem;margin-bottom:0">Dashed line = budget. Set budgets in the Budgets tab.</p>
    </div>

    <div class="card">
      <h3>Loyalty points</h3>
      <div class="stat-grid">
        <div class="stat"><div class="k">Points this month</div><div class="v">${fmtNum(totalPoints).replace(/\.00$/, "")}</div></div>
        <div class="stat"><div class="k">Est. cash value</div><div class="v good">${fmtMoney(pointsValue, cur)}</div></div>
      </div>
      <p class="muted" style="font-size:.78rem;margin:8px 0 0">At ${cur} ${pointRate} per point (change in Settings).</p>
    </div>

    <div class="card">
      <h3>This month at a glance</h3>
      <table class="log" style="white-space:normal">
        <tr><td>Receipts</td><td class="num">${receipts.length}</td></tr>
        <tr><td>Total VAT paid</td><td class="num">${fmtMoney(round2(totalVat), cur)}</td></tr>
        <tr><td>Biggest category</td><td class="num">${biggest(byCat) || "—"}</td></tr>
      </table>
    </div>
  `;

  const inc = view.querySelector("#incomeInput");
  inc.addEventListener("change", async () => {
    await setIncome(ym, parseFloat(inc.value) || 0);
    toast("Income updated.");
    renderDashboard(view);
  });
}

function biggest(byCat) {
  let best = null, max = 0;
  for (const [c, v] of Object.entries(byCat)) if (v > max) { max = v; best = c; }
  return best;
}
