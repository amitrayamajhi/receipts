// Scan screen: capture a photo (or upload), run OCR, parse, hand off to Review.
import { runOcr, preloadOcr } from "../ocr.js";
import { parseReceipt } from "../parser.js";
import { getOverrides } from "../db.js";
import { navigate, setPending, toast } from "../store.js";

export function renderScan(view) {
  view.innerHTML = `
    <h1 class="screen-title">Scan a receipt</h1>
    <div class="card scan-hero">
      <button id="scanBtn" class="scan-btn">
        <span class="big">📷</span>
        <span>Scan Receipt</span>
      </button>
      <div class="scan-sub">Take a photo, or tap to choose an image</div>
      <div style="margin-top:14px">
        <button id="uploadBtn" class="btn ghost">🖼️ Upload image instead</button>
      </div>
      <!-- camera capture on phones; falls back to file picker on desktop -->
      <input id="cameraInput" type="file" accept="image/*" capture="environment" hidden />
      <input id="fileInput" type="file" accept="image/*" hidden />
    </div>

    <div id="scanProgress" class="card" hidden>
      <img id="previewImg" class="preview" alt="Receipt preview" />
      <div class="progress-wrap">
        <div class="progress"><i id="progBar"></i></div>
        <div class="progress-label" id="progLabel">Preparing…</div>
      </div>
    </div>

    <div class="card">
      <h3>Tips for a clean scan</h3>
      <ul class="muted" style="margin:0; padding-left:18px; line-height:1.7">
        <li>Flatten the receipt and fill the frame.</li>
        <li>Good, even light — avoid shadows and glare.</li>
        <li>You can fix anything wrong on the next screen before saving.</li>
      </ul>
    </div>
  `;

  preloadOcr(); // warm the engine in the background

  const cameraInput = view.querySelector("#cameraInput");
  const fileInput = view.querySelector("#fileInput");

  // On phones/tablets, the big button should open the camera; on desktop
  // (no touch) `capture` is meaningless and can misbehave, so open a normal
  // file picker instead. Detect a real touch device.
  const isTouch = (matchMedia && matchMedia("(pointer: coarse)").matches) ||
    "ontouchstart" in window || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!isTouch) {
    // Desktop: no camera — frame the whole thing as "upload an image".
    cameraInput.removeAttribute("capture"); // plain file dialog
    const btn = view.querySelector("#scanBtn");
    btn.querySelector(".big").textContent = "🖼️";
    btn.querySelector("span:last-child").textContent = "Upload Receipt";
    view.querySelector(".scan-sub").textContent = "Click to choose a receipt image (PNG/JPG)";
    view.querySelector("#uploadBtn").hidden = true; // redundant on desktop
  }

  view.querySelector("#scanBtn").addEventListener("click", () => cameraInput.click());
  view.querySelector("#uploadBtn").addEventListener("click", () => fileInput.click());
  cameraInput.addEventListener("change", (e) => handleFile(e.target.files[0], view));
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0], view));
}

async function handleFile(file, view) {
  if (!file) return;
  const progWrap = view.querySelector("#scanProgress");
  const bar = view.querySelector("#progBar");
  const label = view.querySelector("#progLabel");
  const img = view.querySelector("#previewImg");
  progWrap.hidden = false;

  const url = URL.createObjectURL(file);
  img.src = url;

  const setProg = (status, p) => {
    const pct = Math.round((p || 0) * 100);
    if (/recogniz/i.test(status)) { bar.style.width = pct + "%"; label.textContent = `Reading text… ${pct}%`; }
    else if (/load|initial/i.test(status)) { bar.style.width = Math.min(15, pct) + "%"; label.textContent = "Loading engine…"; }
    else label.textContent = status || "Working…";
  };

  try {
    const text = await runOcr(file, setProg);
    bar.style.width = "100%";
    label.textContent = "Understanding the receipt…";
    const overrides = await getOverrides();
    const parsed = parseReceipt(text, { overrides });
    setPending(parsed);
    URL.revokeObjectURL(url);
    // Go straight into the editable review form (router renders it).
    navigate("review");
  } catch (err) {
    console.error(err);
    toast(err.message || "Could not read that image.", "err");
    label.textContent = "Failed — try another photo.";
  }
}
