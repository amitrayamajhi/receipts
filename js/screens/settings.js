// Settings: currency, loyalty rate, export (xlsx/csv), import (csv), and data reset.
import { getSettings, setSettings, getBudgets, getIncome, allReceipts, addReceipts, replaceAllReceipts } from "../db.js";
import { exportXlsx, exportCsv, receiptsFromCsv } from "../exporter.js";
import { getMonth, refreshSettings, toast } from "../store.js";
import { monthLabel } from "../format.js";

export async function renderSettings(view) {
  const ym = getMonth();
  const settings = await getSettings();
  const receipts = await allReceipts();

  view.innerHTML = `
    <h1 class="screen-title">Settings</h1>

    <div class="card">
      <h3>Preferences</h3>
      <div class="row">
        <label class="field">Currency
          <input id="currency" value="${String(settings.currency).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" maxlength="6" />
        </label>
        <label class="field">Loyalty point value
          <input id="loyaltyRate" inputmode="decimal" value="${settings.loyaltyRate}" />
        </label>
      </div>
      <p class="muted" style="font-size:.8rem;margin:0">Point value is the cash worth of 1 loyalty point (default 0.01).</p>
    </div>

    <div class="card">
      <h3>Export</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">${receipts.length} receipt${receipts.length === 1 ? "" : "s"} stored.</p>
      <div class="row">
        <button class="btn primary block" id="xlsxBtn">📊 Export .xlsx</button>
        <button class="btn block" id="csvBtn">📄 Export .csv</button>
      </div>
      <p class="muted" style="font-size:.8rem;margin-bottom:0">The .xlsx has three sheets: Expense Log, a live-formula Dashboard, and How to Use. Exports use the active month (${monthLabel(ym)}) for the Dashboard sheet.</p>
    </div>

    <div class="card">
      <h3>Import CSV</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">Bring receipts back in from a CSV exported by this app.</p>
      <input id="csvFile" type="file" accept=".csv,text/csv" hidden />
      <div class="row">
        <label class="field" style="flex:2">Mode
          <select id="importMode">
            <option value="append">Add to existing</option>
            <option value="replace">Replace everything</option>
          </select>
        </label>
        <button class="btn block" id="importBtn" style="align-self:end;margin-bottom:12px">📥 Choose CSV…</button>
      </div>
    </div>

    <div class="card">
      <h3>Data</h3>
      <p class="muted" style="margin-top:0;font-size:.85rem">All data is stored only on this device (IndexedDB). Export first to back up.</p>
      <button class="btn danger block" id="wipeBtn">🗑 Delete all data</button>
    </div>

    <p class="muted" style="text-align:center;font-size:.78rem">Receipt Tracker · offline · no account needed</p>
  `;

  // Preferences (save on change)
  view.querySelector("#currency").addEventListener("change", async (e) => {
    await setSettings({ currency: (e.target.value || "AED").trim() || "AED" });
    await refreshSettings(); toast("Currency saved.");
  });
  view.querySelector("#loyaltyRate").addEventListener("change", async (e) => {
    await setSettings({ loyaltyRate: parseFloat(e.target.value) || 0.01 });
    await refreshSettings(); toast("Loyalty rate saved.");
  });

  // Export
  view.querySelector("#xlsxBtn").addEventListener("click", async () => {
    try {
      const [budgets, income, s] = await Promise.all([getBudgets(), getIncome(ym), getSettings()]);
      exportXlsx(receipts, { budgets, income, month: ym, currency: s.currency, loyaltyRate: s.loyaltyRate });
      toast("Excel file exported.", "ok");
    } catch (err) { console.error(err); toast(err.message || "Export failed.", "err"); }
  });
  view.querySelector("#csvBtn").addEventListener("click", () => {
    try { exportCsv(receipts); toast("CSV exported.", "ok"); }
    catch (err) { console.error(err); toast("Export failed.", "err"); }
  });

  // Import
  const csvFile = view.querySelector("#csvFile");
  view.querySelector("#importBtn").addEventListener("click", () => csvFile.click());
  csvFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const recs = receiptsFromCsv(text);
      if (!recs.length) { toast("No rows found in that CSV.", "err"); return; }
      const mode = view.querySelector("#importMode").value;
      if (mode === "replace") {
        if (!confirm(`Replace ALL current data with ${recs.length} receipts from the file?`)) return;
        await replaceAllReceipts(recs);
      } else {
        await addReceipts(recs);
      }
      toast(`Imported ${recs.length} receipts.`, "ok");
      renderSettings(view);
    } catch (err) { console.error(err); toast("Import failed — " + (err.message || err), "err"); }
    finally { csvFile.value = ""; }
  });

  // Wipe
  view.querySelector("#wipeBtn").addEventListener("click", async () => {
    if (!confirm("Delete ALL receipts, budgets and settings on this device? This cannot be undone.")) return;
    if (!confirm("Really delete everything? Make sure you've exported a backup.")) return;
    indexedDB.deleteDatabase("receipt-tracker");
    toast("All data deleted. Reloading…", "ok");
    setTimeout(() => location.reload(), 900);
  });
}
