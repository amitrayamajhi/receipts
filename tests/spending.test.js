import { test } from "node:test";
import assert from "node:assert/strict";
import { spendingItems, totalAfterItemEdit, itemsSum, UNITEMISED_LABEL } from "../js/spending.js";

const item = (amount, category = "Groceries") => ({ description: "x", amount, category });

test("VAT added on top of the items becomes a Fees line", () => {
  const out = spendingItems({ total: 38.8, items: [item(20), item(16.95)] });
  assert.equal(out.length, 3);
  assert.deepEqual(out[2], { description: UNITEMISED_LABEL, amount: 1.85, category: "Fees" });
  assert.equal(itemsSum(out), 38.8);
});

test("items that already add up to the total are left alone", () => {
  const items = [item(10), item(20)];
  assert.equal(spendingItems({ total: 30, items }), items);
});

test("a total below the items (e.g. a discount) adds nothing", () => {
  assert.equal(spendingItems({ total: 25, items: [item(30)] }).length, 1);
});

test("a receipt with no items counts its total as Other", () => {
  assert.deepEqual(spendingItems({ total: 12.5, items: [] }), [
    { description: "(no items)", amount: 12.5, category: "Other" },
  ]);
});

test("editing an item keeps VAT on top of the items", () => {
  const r = { total: 105, vatAmount: 5, items: [item(60), item(40)] };
  const before = itemsSum(r.items);
  r.items[0].amount = 70;
  assert.equal(totalAfterItemEdit(r, before), 115);
});

test("editing an item on a VAT-inclusive receipt does not add VAT again", () => {
  const r = { total: 100, vatAmount: 4.76, items: [item(60), item(40)] };
  const before = itemsSum(r.items);
  r.items.pop();
  assert.equal(totalAfterItemEdit(r, before), 60);
});
