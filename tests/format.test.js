import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, shiftMonth, monthOf } from "../js/format.js";
import { categorize } from "../js/categorize.js";

test("parseAmount handles common receipt number styles", () => {
  assert.equal(parseAmount("AED 12.50"), 12.5);
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("1.234,50"), 1234.5);
  assert.equal(parseAmount("12,50"), 12.5);
  assert.equal(parseAmount("1,234"), 1234);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc"), null);
});

test("shiftMonth crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(monthOf("2026-08-11"), "2026-08");
});

test("categorize: longer keywords win, then merchant hints, then Other", () => {
  assert.equal(categorize("Chocolate ice cream"), "Groceries");
  assert.equal(categorize("Mystery item", { merchant: "ADNOC Station" }), "Transport");
  assert.equal(categorize("Mystery item"), "Other");
});
