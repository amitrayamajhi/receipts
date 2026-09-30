// What a receipt actually cost, split by category. Pure functions, no DOM.
//
// Many receipts list item prices before VAT and add VAT (and charges like
// delivery or rounding) at the bottom. Summing the items alone then
// under-reports what was paid, so any amount the total has on top of the
// items is added as one extra "VAT & other charges" line under Fees.
import { round2 } from "./format.js";

export const UNITEMISED_LABEL = "VAT & other charges";

export function itemsSum(items) {
  return round2((items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0));
}

/**
 * Line items to count as spending for one receipt.
 * @param {object} r receipt
 * @returns {{description:string, amount:number, category:string}[]}
 */
export function spendingItems(r) {
  const items = r.items || [];
  const total = Number(r.total) || 0;
  if (!items.length) {
    return [{ description: "(no items)", amount: total, category: "Other" }];
  }
  const extra = round2(total - itemsSum(items));
  if (extra >= 0.01) {
    return [...items, { description: UNITEMISED_LABEL, amount: extra, category: "Fees" }];
  }
  return items;
}

/**
 * New receipt total after its items change, keeping whatever the total had on
 * top of the items (VAT, charges) unchanged.
 */
export function totalAfterItemEdit(receipt, previousItemsSum) {
  const base = Number(receipt.total) || previousItemsSum;
  return round2(base + itemsSum(receipt.items) - previousItemsSum);
}
