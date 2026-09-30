import { test } from "node:test";
import assert from "node:assert/strict";
import { toRows, receiptsFromCsv } from "../js/exporter.js";

const csvEscape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (receipts) =>
  ["Date,Merchant,Category,Item/Description,Amount (AED),VAT (AED),Payment Method,Receipt #,Loyalty Points,Notes,Receipt Total (AED)"]
    .concat(toRows(receipts).map((r) => r.map(csvEscape).join(",")))
    .join("\r\n");

const RECEIPT = {
  date: "2026-08-11", merchant: "Lulu, Al Barsha", receiptNumber: "45123",
  paymentMethod: "Visa ••••1234", vatAmount: 1.85, loyaltyPoints: 38,
  notes: 'said "thanks"', total: 38.8,
  items: [
    { description: "Banana", qty: 1, amount: 4.25, category: "Groceries" },
    { description: "Soap", qty: 1, amount: 32.7, category: "Household" },
  ],
};

test("export adds a row for VAT not listed as an item", () => {
  const rows = toRows([RECEIPT]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2].slice(2, 5), ["Fees", "VAT & other charges", 1.85]);
  assert.equal(rows.reduce((s, r) => s + r[4], 0).toFixed(2), "38.80");
});

test("receipt-level fields are only on the first row", () => {
  const rows = toRows([RECEIPT]);
  assert.deepEqual([rows[0][5], rows[0][8], rows[0][10]], [1.85, 38, 38.8]);
  assert.deepEqual([rows[1][5], rows[1][8], rows[1][10]], ["", "", ""]);
});

test("CSV export then import keeps the receipt intact", () => {
  const [back] = receiptsFromCsv(toCsv([RECEIPT]));
  assert.equal(back.merchant, "Lulu, Al Barsha");
  assert.equal(back.notes, 'said "thanks"');
  assert.equal(back.total, 38.8);
  assert.equal(back.vatAmount, 1.85);
  assert.equal(back.loyaltyPoints, 38);
  assert.equal(back.items.length, 3);
  // Exporting the imported copy again gives the same rows.
  assert.deepEqual(toRows([back]), toRows([RECEIPT]));
});

test("CSVs from before the total column still import", () => {
  const old = [
    "Date,Merchant,Category,Item/Description,Amount (AED),VAT (AED),Payment Method,Receipt #,Loyalty Points,Notes",
    "2026-08-11,Shop,Groceries,Milk,10,0.5,Cash,1,,",
  ].join("\n");
  const [r] = receiptsFromCsv(old);
  assert.equal(r.total, 10.5);
});
