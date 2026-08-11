// OCR wrapper around the vendored Tesseract.js. All paths are local so this
// runs fully offline. To swap to a cloud OCR API later, replace `runOcr` with a
// fetch() to your endpoint that returns { text } — nothing else needs to change.

let _workerPromise = null;

// Local asset paths (see /vendor). These MUST be absolute URLs: Tesseract spins
// up a blob: Web Worker, and relative paths would resolve against the blob URL
// (which is invalid) instead of the app origin. We derive them from this
// module's own URL so it works whether the app is served at "/" or a subpath.
const VENDOR = new URL("../vendor/", import.meta.url); // .../vendor/
const OPTS = {
  workerPath: new URL("worker.min.js", VENDOR).href,
  corePath: VENDOR.href,                 // folder; Tesseract picks the core file
  langPath: new URL("tessdata", VENDOR).href,
  gzip: true,
};

function getWorker(onStatus) {
  if (_workerPromise) return _workerPromise;
  _workerPromise = (async () => {
    if (typeof Tesseract === "undefined") {
      throw new Error("OCR engine failed to load. Reload the app.");
    }
    const worker = await Tesseract.createWorker("eng", 1, {
      ...OPTS,
      logger: (m) => {
        if (onStatus && m && typeof m.progress === "number") {
          onStatus(m.status, m.progress);
        }
      },
    });
    return worker;
  })();
  return _workerPromise;
}

/**
 * Run OCR on an image source (File, Blob, data URL, <img>, or canvas).
 * @param {*} image
 * @param {(status:string, progress:number)=>void} onStatus
 * @returns {Promise<string>} raw recognized text
 */
export async function runOcr(image, onStatus) {
  const worker = await getWorker(onStatus);
  const { data } = await worker.recognize(image);
  return data.text || "";
}

// Warm the engine up in the background so the first scan is faster.
export function preloadOcr() {
  try { getWorker(); } catch (_) { /* ignore */ }
}
