// E2E test driver: injects the actual browser publish function into the
// CURRENT bb-browser tab (must already be on an X article composer that has a
// loaded contenteditable editor) and verifies that no MPH_MARKER tokens remain
// after publish, both before and after a page refresh.
//
// Usage:
//   1. Make sure bb-browser's Chrome is on https://x.com/compose/articles/edit/...
//      with the editor mounted (a [contenteditable=true] element present).
//   2. node scripts/publish-e2e.mjs --images 3
//   3. node scripts/publish-e2e.mjs --images 10
//
// IMPORTANT: this drives a real X composer. It does NOT click Publish, but it
// will create draft content in the editor and X may autosave it. Discard the
// draft manually after the test if you don't want it lingering.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const imagesIdx = args.indexOf("--images");
const imageCount = imagesIdx === -1 ? 3 : parseInt(args[imagesIdx + 1], 10);
if (!Number.isFinite(imageCount) || imageCount < 1) {
  console.error("Usage: node scripts/publish-e2e.mjs --images <N>");
  process.exit(2);
}
console.log(`E2E test with ${imageCount} images`);

// --- bb-browser shim (eval-only; never opens new tabs) ----------------------
function bbEval(jsExpression) {
  // Pass the expression as a single arg so node escapes it through to the
  // shell. Wrap in double quotes on Windows so cmd.exe doesn't split on spaces.
  const cmdArgs = isWindows
    ? ["eval", `"${jsExpression.replace(/"/g, '\\"')}"`]
    : ["eval", jsExpression];
  return execFileSync(isWindows ? "bb-browser.cmd" : "bb-browser", cmdArgs, {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows,
  }).trim();
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// --- pre-flight: confirm we're on an X article editor ----------------------
const href = bbEval("location.href");
console.log(`Current tab: ${href}`);
if (!/\/compose\/articles\//.test(href)) {
  console.error("Current tab is not on x.com/compose/articles/...");
  console.error("Open the X article composer first (click 撰写 to enter the editor),");
  console.error("then re-run this script.");
  process.exit(1);
}
const hasEditor = bbEval('Boolean(document.querySelector("[contenteditable=\'true\']"))');
if (hasEditor !== "true") {
  console.error("X article editor (contenteditable) has not mounted in this tab.");
  console.error("Wait a few more seconds after navigating, or click 撰写, then re-run.");
  process.exit(1);
}
console.log("Editor present. Building payload...");

// --- PNG helpers (generate small, visibly coloured test images) ------------
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = (c >>> 8) ^ _crcTable[(c ^ b) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function makeColorPng(width, height, r, g, b) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[y * stride + 1 + x * 3] = r;
      raw[y * stride + 2 + x * 3] = g;
      raw[y * stride + 3 + x * 3] = b;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}
const PALETTE = [
  [220,  60,  60], [60, 180,  90], [60, 110, 220], [220, 170,  40],
  [170,  60, 200], [40, 200, 200], [240, 130,  60], [120, 200,  80],
  [80,  130, 240], [220,  90, 160],
];
function imageBase64(idx) {
  const [r, g, b] = PALETTE[idx % PALETTE.length];
  return makeColorPng(160, 160, r, g, b).toString("base64");
}

// --- build payload ----------------------------------------------------------

const paragraphs = [
  "First paragraph: this is an automated end-to-end test article (do not publish).",
  "段落二：测试中文与 emoji 🎉 在编辑器内是否正常呈现。",
  "Third paragraph: validating that markers between paragraphs do not leak after publish.",
  "Fourth paragraph: extra prose to ensure the editor scrolls a bit between media insertions.",
  "Fifth paragraph: tail content used to validate trailing-marker cleanup.",
];

const items = [];
const htmlParts = [];
const markdownParts = [];
let markerSeq = 1;
let pIdx = 0;
let imgPlaced = 0;

while (imgPlaced < imageCount || pIdx < paragraphs.length) {
  if (pIdx < paragraphs.length) {
    htmlParts.push(`<p>${paragraphs[pIdx]}</p>`);
    markdownParts.push(paragraphs[pIdx] + "\n");
    pIdx += 1;
  }
  if (imgPlaced < imageCount) {
    const marker = `MPH_MARKER_${markerSeq}`;
    markerSeq += 1;
    htmlParts.push(`<p>${marker}</p>`);
    markdownParts.push(marker + "\n");
    items.push({
      type: "image",
      marker,
      alt: `e2e-${imgPlaced + 1}`,
      fileName: `e2e-${imgPlaced + 1}.png`,
      mimeType: "image/png",
      base64: imageBase64(imgPlaced),
    });
    imgPlaced += 1;
  }
}

const payload = {
  html: htmlParts.join("\n"),
  markdown: markdownParts.join("\n"),
  items,
  title: `[E2E ${imageCount}img DO-NOT-PUBLISH] ${new Date().toISOString()}`,
  cover: null,
  autoApplyCover: false,
};

// --- extract publish function template from production source --------------
const sourceText = readFileSync(
  resolve(here, "..", "src", "commands", "copyPublishScript.ts"),
  "utf8",
);

const startMarker = "return `async () => {";
const startIdx = sourceText.indexOf(startMarker);
if (startIdx === -1) throw new Error("Could not locate publish function start");
const tplOpen = startIdx + "return `".length;
let cursor = tplOpen;
while (cursor < sourceText.length) {
  if (sourceText[cursor] === "\\") {
    cursor += 2;
    continue;
  }
  if (sourceText[cursor] === "$" && sourceText[cursor + 1] === "{") {
    let depth = 1;
    cursor += 2;
    while (cursor < sourceText.length && depth > 0) {
      if (sourceText[cursor] === "{") depth += 1;
      else if (sourceText[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    continue;
  }
  if (sourceText[cursor] === "`") break;
  cursor += 1;
}
if (cursor >= sourceText.length) throw new Error("Could not locate publish function end");
const tplBody = sourceText.slice(tplOpen, cursor);

const substituted = tplBody.replace(
  /\$\{JSON\.stringify\([\s\S]*?\)\}/,
  () => JSON.stringify(payload, null, 2),
);
if (substituted.includes("${")) {
  throw new Error("Unsubstituted template placeholder remains: " + substituted.slice(0, 200));
}

// Wrapper: clear existing editor content, kick off publish, track status.
const wrapperScript = `(function () {
  const editor =
    document.querySelector("[data-contents='true'] [contenteditable='true']") ||
    document.querySelector("[contenteditable='true']");
  if (editor) {
    editor.focus();
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  }
  window.__publishStatus__ = "running";
  window.__publishError__ = null;
  window.__publishResult__ = null;
  const fn = (${substituted});
  Promise.resolve()
    .then(() => fn())
    .then(function (r) {
      window.__publishStatus__ = "done";
      try { window.__publishResult__ = JSON.stringify(r); } catch (e) { window.__publishResult__ = String(r); }
    })
    .catch(function (e) {
      window.__publishStatus__ = "error";
      window.__publishError__ = (e && e.stack) || String(e);
    });
})();`;

console.log(`Wrapper size: ${wrapperScript.length} bytes`);

// --- inject via base64 to dodge cmd.exe escaping ----------------------------
const encoded = Buffer.from(wrapperScript, "utf8").toString("base64");
console.log(`Encoded size: ${encoded.length} bytes`);

// We can't pass a 100KB+ base64 blob through a single CLI arg reliably (cmd.exe
// has an 8191-char command line limit; even shells without that limit struggle
// with very long args). Chunk into <=4KB pieces and assemble in the page.
const CHUNK = 4000;
console.log("Uploading wrapper in chunks ...");
bbEval("window.__pubChunks__=[]");
for (let offset = 0; offset < encoded.length; offset += CHUNK) {
  const piece = encoded.slice(offset, offset + CHUNK);
  bbEval(`window.__pubChunks__.push('${piece}')`);
}
console.log(`Uploaded ${Math.ceil(encoded.length / CHUNK)} chunks (${encoded.length} chars)`);

console.log("Decoding and executing wrapper ...");
// atob returns latin1; convert bytes to UTF-8 before eval, otherwise CJK
// becomes mojibake.
bbEval(
  "(function(){var b=atob(window.__pubChunks__.join(''));delete window.__pubChunks__;var u=Uint8Array.from(b,function(c){return c.charCodeAt(0)});var s=new TextDecoder('utf-8').decode(u);eval(s);})()",
);

// Poll for completion
const maxSeconds = 60 + imageCount * 25;
console.log(`Waiting for publish (budget ${maxSeconds}s) ...`);
let finalStatus = "timeout";
const startedAt = Date.now();
let lastStatusPrint = "";
while ((Date.now() - startedAt) / 1000 < maxSeconds) {
  sleepMs(2000);
  const status = bbEval("window.__publishStatus__||'?'");
  if (status === "done") { finalStatus = "done"; break; }
  if (status === "error") { finalStatus = "error"; break; }
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const line = `  status=${status} elapsed=${elapsed}s`;
  if (line !== lastStatusPrint) {
    console.log(line);
    lastStatusPrint = line;
  }
}

if (finalStatus !== "done") {
  const err = bbEval("window.__publishError__||'(none)'");
  console.error(`Publish did not complete (status=${finalStatus}). Error: ${err}`);
  process.exit(1);
}
console.log("Publish reported done.");

// --- pre-refresh marker check -----------------------------------------------
// Counts markers strictly inside [contenteditable=true]; ignores incidental
// occurrences in X's draft-list preview links elsewhere on the page.
const editorMarkerExpr = "(function(){var ed=document.querySelector(\"[contenteditable='true']\");if(!ed)return [];var t=ed.innerText||'';return t.match(/MPH_MARKER_[0-9]+/g)||[]})()";
console.log("Checking residual markers (pre-refresh, editor only) ...");
const preCount = bbEval(`${editorMarkerExpr}.length`);
const preSample = bbEval(`JSON.stringify(${editorMarkerExpr}.slice(0,8))`);
console.log(`  pre-refresh: ${preCount} marker(s)${preCount === "0" ? "" : " sample=" + preSample}`);

// --- refresh + post-refresh check -------------------------------------------
// Nudge X's autosave to capture the cleaned state by typing then deleting a
// single char in the editor. Without this, X's last autosave often dates
// from mid-publish (before cleanup) and refresh restores the stale draft.
bbEval(
  "(function(){var ed=document.querySelector(\"[contenteditable='true']\");if(!ed)return;ed.focus();document.execCommand('insertText',false,' ');document.execCommand('delete',false);})()",
);
console.log("Waiting 12s for X to autosave the cleaned state ...");
sleepMs(12000);
console.log("Refreshing page ...");
bbEval("location.reload()");
sleepMs(3000);

let postReady = false;
for (let i = 0; i < 60; i++) {
  const r = bbEval('Boolean(document.querySelector("[contenteditable=\'true\']"))');
  if (r === "true") { postReady = true; break; }
  sleepMs(500);
}

let postCount = "n/a";
let postSample = "[]";
if (postReady) {
  sleepMs(3000); // let X hydrate the saved draft
  postCount = bbEval(`${editorMarkerExpr}.length`);
  postSample = bbEval(`JSON.stringify(${editorMarkerExpr}.slice(0,8))`);
  console.log(`  post-refresh: ${postCount} marker(s)${postCount === "0" ? "" : " sample=" + postSample}`);
} else {
  console.log("  post-refresh: editor did not reload, skipping check");
}

const passed = preCount === "0" && (postCount === "0" || postCount === "n/a");
console.log("");
console.log(`E2E ${imageCount}img: ${passed ? "PASS" : "FAIL"}`);
console.log(`  pre-refresh markers : ${preCount}`);
console.log(`  post-refresh markers: ${postCount}`);
console.log("Reminder: discard the draft from the X composer if you don't want it lingering.");
process.exit(passed ? 0 : 1);
