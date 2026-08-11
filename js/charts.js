// Hand-rolled inline-SVG charts — zero dependencies, theme-aware (uses CSS vars),
// crisp on mobile. Colors come from the category CSS variables.

const CAT_VAR = {
  Groceries: "--c-Groceries", Household: "--c-Household", Dining: "--c-Dining",
  Transport: "--c-Transport", Utilities: "--c-Utilities", Health: "--c-Health",
  "Personal Care": "--c-PersonalCare", Clothing: "--c-Clothing",
  Entertainment: "--c-Entertainment", Education: "--c-Education",
  Fees: "--c-Fees", Other: "--c-Other",
};

export function categoryColor(cat) {
  const v = CAT_VAR[cat] || "--c-Other";
  return `var(${v})`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * Donut chart. data = [{label, value}], returns SVG string + legend.
 */
export function donut(data, { size = 200, thickness = 34 } = {}) {
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  const cx = size / 2, cy = size / 2, r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  if (total <= 0) {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="No data">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">No data</text></svg>`;
  }
  let offset = 0;
  const rings = items.map((d) => {
    const frac = d.value / total;
    const dash = frac * C;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${categoryColor(d.label)}" stroke-width="${thickness}"
      stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"><title>${esc(d.label)}: ${d.value.toFixed(2)}</title></circle>`;
    offset += dash;
    return seg;
  }).join("");
  const svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Spending by category">
    ${rings}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" style="fill:var(--text);font-weight:800;font-size:15px">${total.toFixed(0)}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" style="font-size:10px">total</text>
  </svg>`;
  const legend = `<div class="legend">${items.map((d) =>
    `<span class="li"><span class="dot" style="background:${categoryColor(d.label)}"></span>${esc(d.label)} <b>&nbsp;${Math.round(d.value / total * 100)}%</b></span>`
  ).join("")}</div>`;
  return svg + legend;
}

/**
 * Horizontal budget-vs-actual bars. rows = [{label, actual, budget}]
 */
export function budgetBars(rows, { width = 340 } = {}) {
  const items = rows.filter((r) => r.actual > 0 || r.budget > 0);
  if (!items.length) return `<p class="muted">No spending or budgets yet this month.</p>`;
  const rowH = 44, pad = 4;
  const h = items.length * rowH + pad * 2;
  const labelW = 96, barX = labelW + 6, barW = width - barX - 8;
  const maxVal = Math.max(...items.map((r) => Math.max(r.actual, r.budget, 1)));

  const body = items.map((r, i) => {
    const y = pad + i * rowH;
    const aW = Math.max(2, (r.actual / maxVal) * barW);
    const over = r.budget > 0 && r.actual > r.budget;
    const budgetX = r.budget > 0 ? barX + (r.budget / maxVal) * barW : null;
    return `
      <text x="0" y="${y + 15}" style="fill:var(--text);font-size:11px;font-weight:600">${esc(trim(r.label))}</text>
      <rect x="${barX}" y="${y + 6}" width="${barW}" height="12" rx="6" fill="var(--surface-2)"/>
      <rect x="${barX}" y="${y + 6}" width="${aW}" height="12" rx="6" fill="${over ? "var(--danger)" : categoryColor(r.label)}"/>
      ${budgetX != null ? `<line class="grid-line" x1="${budgetX}" y1="${y + 2}" x2="${budgetX}" y2="${y + 22}" stroke="var(--text)" stroke-dasharray="2 2"/>` : ""}
      <text x="${barX}" y="${y + 34}" style="font-size:10px">${r.actual.toFixed(0)}${r.budget > 0 ? ` / ${r.budget.toFixed(0)}` : ""}${over ? "  ⚠ over" : ""}</text>
    `;
  }).join("");
  return `<div class="table-scroll" style="border:none"><svg viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" role="img" aria-label="Budget vs actual">${body}</svg></div>`;
}

function trim(s) { s = String(s); return s.length > 13 ? s.slice(0, 12) + "…" : s; }
