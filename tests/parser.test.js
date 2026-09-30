import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "../js/parser.js";

const LULU = `LULU HYPERMARKET
Al Barsha, Dubai
TRN 100012345600003
TAX INVOICE No: 45123
Date: 11/08/2026 Time: 18:42
Banana Robusta 1kg 4.25
Almarai Fresh Milk 2L 2 x 5.50 11.00
Dettol Soap 3pk 12.75
Colgate Toothpaste 8.95
Plastic Bag Charge 0.25
SUB TOTAL 35.48
VAT 5% 1.77
TOTAL VAT 1.77
GRAND TOTAL 37.25
MasterCard ****3366 37.25
Happiness Points Earned 37
Thank you for shopping`;

const CAFE = `Costa Coffee
Dubai Mall
Receipt #A-00991
12-AUG-26 09:15
1 Cappuccino Medium 18.00
1 Croissant 12.00
Total 30.00
Cash 50.00
Change 20.00`;

test("supermarket receipt: header fields", () => {
  const r = parseReceipt(LULU, { today: "2026-09-30" });
  assert.equal(r.merchant, "LULU HYPERMARKET");
  assert.equal(r.date, "2026-08-11");
  assert.equal(r.receiptNumber, "45123");
  assert.equal(r.paymentMethod, "Mastercard ••••3366");
  assert.equal(r.subtotal, 35.48);
  assert.equal(r.vatAmount, 1.77);
  assert.equal(r.loyaltyPoints, 37);
});

test("GRAND TOTAL wins over an earlier TOTAL VAT line", () => {
  const r = parseReceipt(LULU);
  assert.equal(r.total, 37.25);
  assert.equal(r.flags.total, false);
});

test("card payment line is not treated as a purchased item", () => {
  const r = parseReceipt(LULU);
  assert.deepEqual(
    r.items.map((i) => [i.description, i.qty, i.amount, i.category]),
    [
      ["Banana Robusta 1kg", 1, 4.25, "Groceries"],
      ["Almarai Fresh Milk 2L", 2, 11, "Groceries"],
      ["Dettol Soap 3pk", 1, 12.75, "Household"],
      ["Colgate Toothpaste", 1, 8.95, "Personal Care"],
      ["Plastic Bag Charge", 1, 0.25, "Fees"],
    ],
  );
});

test("payment lines are skipped whatever the card is called", () => {
  for (const line of [
    "MasterCard ****1234 20.00",
    "MASTER CARD XXXX 1234 20.00",
    "Apple Pay •••• 1234 20.00",
    "Visa ****1234 20.00",
  ]) {
    const r = parseReceipt(`Shop\nWidget 20.00\nTotal 20.00\n${line}`);
    assert.deepEqual(r.items.map((i) => i.description), ["Widget"], line);
  }
});

test("cafe receipt: cash handed over does not make the total look wrong", () => {
  const r = parseReceipt(CAFE, { today: "2026-09-30" });
  assert.equal(r.merchant, "Costa Coffee");
  assert.equal(r.date, "2026-08-12");
  assert.equal(r.receiptNumber, "A-00991");
  assert.equal(r.paymentMethod, "Cash");
  assert.equal(r.total, 30);
  assert.equal(r.flags.total, false);
});

test("leading quantity is removed from the item name", () => {
  const r = parseReceipt(CAFE);
  assert.deepEqual(r.items.map((i) => [i.description, i.amount, i.category]), [
    ["Cappuccino Medium", 18, "Dining"],
    ["Croissant", 12, "Dining"],
  ]);
});

test("a bare TOTAL is used when there is no more explicit label", () => {
  const r = parseReceipt("Corner Shop\nBread 3.00\nMilk 6.50\nTOTAL 9.50");
  assert.equal(r.total, 9.5);
});

test("OCR that dropped the decimal point reads as cents", () => {
  const r = parseReceipt("Shop\nBanana 425\nTotal 4.25");
  assert.equal(r.items[0].amount, 4.25);
});

test("date formats", () => {
  const cases = {
    "Date 2026-08-11": "2026-08-11",
    "Date 11/08/2026": "2026-08-11",
    "Date 08/25/2026": "2026-08-25", // month-first when the day can't be a month
    "11 Aug 2026": "2026-08-11",
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(parseReceipt(`Shop\n${text}\nTotal 1.00`).date, expected, text);
  }
});

test("missing fields fall back and are flagged for review", () => {
  const r = parseReceipt("", { today: "2026-09-30" });
  assert.equal(r.date, "2026-09-30");
  assert.equal(r.total, null);
  assert.equal(r.flags.date, true);
  assert.equal(r.flags.total, true);
  assert.equal(r.flags.items, true);
});

test("learned overrides change the category", () => {
  const r = parseReceipt("Shop\nMystery Box 10.00\nTotal 10.00", {
    overrides: { "mystery box": "Entertainment" },
  });
  assert.equal(r.items[0].category, "Entertainment");
});
