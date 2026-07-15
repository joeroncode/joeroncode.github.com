"use strict";

const $ = (id) => document.getElementById(id);
const files = new Map();        // filename -> File
const bitmaps = new Map();      // filename -> HTMLImageElement (loaded)

const dropEl = $("drop");
const inputEl = $("file-input");
const analyzeBtn = $("analyze");
const renderBtn = $("render");

// ---- backend health ---------------------------------------------------
fetch("/health").then(r => r.json()).then(d => {
  $("backend-text").textContent = d.detector_detail || d.detector_backend;
  $("foot-note").textContent = "detector · " + (d.detector_backend || "");
}).catch(() => {
  const b = $("backend"); b.classList.add("err");
  $("backend-text").textContent = "backend offline";
});

// ---- file intake ------------------------------------------------------
function addFiles(list) {
  let added = false;
  for (const f of list) {
    if (!f.type.startsWith("image/")) continue;
    if (!files.has(f.name)) { files.set(f.name, f); added = true; }
  }
  if (added) maybeShowConsent();
  renderTray();
  syncButtons();
}

// One-time "by uploading you agree" notice, shown on first upload.
function consentGiven() {
  try { return localStorage.getItem("reel-consent") === "1"; }
  catch (e) { return false; }
}
function acknowledgeConsent() {
  try { localStorage.setItem("reel-consent", "1"); } catch (e) {}
  const el = $("consent"); if (el) el.hidden = true;
}
function maybeShowConsent() {
  if (!consentGiven()) $("consent").hidden = false;
}
$("consent-ok").addEventListener("click", acknowledgeConsent);

function removeFile(name) {
  files.delete(name); bitmaps.delete(name);
  renderTray(); syncButtons();
}

function clearFiles() {
  files.clear(); bitmaps.clear();
  renderTray(); syncButtons();
}

function syncButtons() {
  const has = files.size > 0;
  analyzeBtn.disabled = !has;
  renderBtn.disabled = !has;
  $("hint").textContent = has
    ? `${files.size} photo${files.size > 1 ? "s" : ""} ready.`
    : "Add photos to begin.";
}

function renderTray() {
  if (files.size === 0) {
    dropEl.classList.remove("has-thumbs");
    dropEl.innerHTML = `
      <input id="file-input" type="file" accept="image/*" multiple hidden>
      <span class="drop-ico" aria-hidden="true"></span>
      <span class="drop-title">Drop photos here</span>
      <span class="drop-sub">or click to browse — JPG / PNG / WebP</span>`;
    wireInput();
    return;
  }
  dropEl.classList.add("has-thumbs");
  const tiles = [...files.values()].map(f => {
    const url = URL.createObjectURL(f);
    return `<div class="tile"><img src="${url}" alt="${esc(f.name)}">
      <button class="x" data-name="${esc(f.name)}" title="Remove" aria-label="Remove ${esc(f.name)}">×</button></div>`;
  }).join("");
  dropEl.innerHTML = `
    <input id="file-input" type="file" accept="image/*" multiple hidden>
    <div class="tray-head"><b>${files.size} photo${files.size > 1 ? "s" : ""}</b>
      <button class="clear" id="clear-btn">clear all</button></div>
    <div class="tray">${tiles}
      <label for="file-input" class="tile" style="display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--faint);font-size:22px">+</label>
    </div>`;
  wireInput();
  $("clear-btn").addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearFiles(); });
  dropEl.querySelectorAll(".x").forEach(b =>
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); removeFile(b.dataset.name); }));
}

function wireInput() {
  const el = $("file-input");
  el.addEventListener("change", () => { addFiles(el.files); });
}

dropEl.addEventListener("click", (e) => {
  if (e.target.closest(".x") || e.target.closest("#clear-btn") || e.target.tagName === "LABEL") return;
  $("file-input").click();
});
dropEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file-input").click(); }
});
["dragenter", "dragover"].forEach(ev =>
  dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev =>
  dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove("drag"); }));
dropEl.addEventListener("drop", (e) => { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
wireInput();

// ---- helpers ----------------------------------------------------------
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function band(v) { return v >= 0.6 ? "good" : v >= 0.4 ? "warn" : "low"; }
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 4200);
}
function formData() {
  const fd = new FormData();
  for (const f of files.values()) fd.append("images", f, f.name);
  return fd;
}
function settings() {
  const [w, h] = $("res").value.split("x");
  return { width: w, height: h, fps: $("fps").value, seconds_per_photo: $("secs").value };
}

// ---- scoring lab ------------------------------------------------------
const WK = ["content", "sharpness", "exposure", "contrast", "colorfulness"];
const DEFAULT_W = { content: 35, sharpness: 25, exposure: 15, contrast: 15, colorfulness: 10, conf: 25 };

function weightFields() {
  const f = {};
  for (const k of WK) f[k] = $("w-" + k).value;
  f.conf = ($("w-conf").value / 100).toFixed(2);
  return f;
}

function refreshPercents() {
  const total = WK.reduce((s, k) => s + Number($("w-" + k).value), 0) || 1;
  for (const k of WK) {
    $("pct-" + k).textContent = Math.round(($("w-" + k).value / total) * 100) + "%";
  }
  $("pct-conf").textContent = ($("w-conf").value / 100).toFixed(2);
}

let liveTimer = null;
function scheduleLiveRescore() {
  if (!$("live").checked || files.size === 0) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    const data = await run(analyzeBtn, "/score", weightFields());
    if (data) await showResults(data.ranking, null);
  }, 350);
}

WK.concat(["conf"]).forEach(k => {
  $("w-" + k).addEventListener("input", () => { refreshPercents(); scheduleLiveRescore(); });
});
$("reset-weights").addEventListener("click", () => {
  for (const [k, v] of Object.entries(DEFAULT_W)) $("w-" + k).value = v;
  refreshPercents(); scheduleLiveRescore();
});
$("live").addEventListener("change", scheduleLiveRescore);
refreshPercents();
function loadImage(file) {
  if (bitmaps.has(file.name)) return Promise.resolve(bitmaps.get(file.name));
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { bitmaps.set(file.name, img); res(img); };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}

// ---- rendering results ------------------------------------------------
async function drawCard(entry, selected) {
  const name = entry.path;
  const inVideo = selected && selected.includes(name);
  const card = document.createElement("article");
  card.className = "card" + (inVideo ? " in-video" : "");

  const subs = [
    ["Content", entry.content_score],
    ["Sharpness", entry.metrics.sharpness_score],
    ["Exposure", entry.metrics.exposure_score],
    ["Contrast", entry.metrics.contrast_score],
    ["Color", entry.metrics.colorfulness_score],
  ].map(([l, v]) =>
    `<div class="sub"><span class="sub-l">${l}</span>
      <span class="track"><span class="fill ${band(v)}" style="width:${(v * 100).toFixed(0)}%"></span></span>
      <span class="sub-v">${v.toFixed(2)}</span></div>`).join("");

  const chips = (entry.labels && entry.labels.length)
    ? entry.labels.map(l => `<span class="chip">${esc(l)}</span>`).join("")
    : `<span class="chip empty">no subject</span>`;

  card.innerHTML = `
    <div class="thumbwrap">
      <canvas></canvas>
      <span class="rank">#${entry.rank}</span>
      ${inVideo ? '<span class="invid">▶ in video</span>' : ""}
    </div>
    <div class="cbody">
      <div class="crow"><span class="fname">${esc(name)}</span>
        <span class="dims">${entry.width}×${entry.height}</span></div>
      <div class="score">
        <span class="score-track"><span class="score-fill ${band(entry.score)}" style="width:${(entry.score * 100).toFixed(0)}%"></span></span>
        <span class="score-num ${band(entry.score)}">${entry.score.toFixed(3)}</span></div>
      <div class="subs">${subs}</div>
      <div class="chips">${chips}</div>
    </div>`;

  // Draw the photo + detection boxes onto the canvas.
  const canvas = card.querySelector("canvas");
  const file = files.get(name);
  const img = file ? await loadImage(file) : null;
  if (img) paintDetections(canvas, img, entry);
  return card;
}

function paintDetections(canvas, img, entry) {
  const maxW = 620;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const cw = Math.round(img.naturalWidth * scale);
  const ch = Math.round(img.naturalHeight * scale);
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, cw, ch);
  // response boxes are in original image pixels -> scale to canvas
  const sx = cw / entry.width, sy = ch / entry.height;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#46e07a";
  ctx.lineWidth = Math.max(2, Math.round(cw / 220));
  ctx.font = `600 ${Math.max(11, Math.round(cw / 42))}px ui-monospace, monospace`;
  for (const d of (entry.detections || [])) {
    const [x1, y1, x2, y2] = d.box;
    const bx = x1 * sx, by = y1 * sy, bw = (x2 - x1) * sx, bh = (y2 - y1) * sy;
    ctx.strokeStyle = accent; ctx.fillStyle = accent;
    ctx.strokeRect(bx, by, bw, bh);
    const tag = `${d.label} ${d.confidence.toFixed(2)}`;
    const tw = ctx.measureText(tag).width + 8;
    const thh = Math.max(15, Math.round(cw / 34));
    ctx.fillRect(bx, Math.max(0, by - thh), tw, thh);
    ctx.fillStyle = "#07130c";
    ctx.fillText(tag, bx + 4, Math.max(thh - 4, by - 4));
  }
}

async function showResults(ranking, selected) {
  const box = $("results");
  box.innerHTML = "";
  $("empty").hidden = true;
  $("count").textContent = `${ranking.length} scored` + (selected ? ` · ${selected.length} in video` : "");
  ranking.forEach((e, i) => { e.rank = i + 1; });
  const cards = await Promise.all(ranking.map(e => drawCard(e, selected)));
  cards.forEach(c => box.appendChild(c));
}

function showVideo(job) {
  const sec = $("video-section");
  sec.hidden = false;
  const v = $("video");
  v.src = job.download_url;
  const m = job.render;
  $("video-meta").innerHTML = `
    <div class="mrow"><span class="mk">resolution</span><span class="mv">${m.resolution[0]}×${m.resolution[1]}</span></div>
    <div class="mrow"><span class="mk">frame rate</span><span class="mv">${m.fps} fps</span></div>
    <div class="mrow"><span class="mk">frames</span><span class="mv">${m.frames}</span></div>
    <div class="mrow"><span class="mk">duration</span><span class="mv">${m.duration_seconds} s</span></div>
    <div class="mrow"><span class="mk">photos</span><span class="mv">${m.num_photos}</span></div>
    <div class="mrow"><span class="mk">size</span><span class="mv">${(m.bytes / 1024).toFixed(0)} KB</span></div>
    <a class="btn primary dl" href="${job.download_url}" download>Download MP4</a>`;
  sec.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- actions ----------------------------------------------------------
async function run(btn, url, extra) {
  if (files.size === 0) return;
  acknowledgeConsent();  // proceeding implies agreement to the policy
  btn.classList.add("busy"); analyzeBtn.disabled = renderBtn.disabled = true;
  try {
    const fd = formData();
    if (extra) for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const res = await fetch(url, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    toast("Request failed: " + e.message);
    return null;
  } finally {
    btn.classList.remove("busy"); syncButtons();
  }
}

analyzeBtn.addEventListener("click", async () => {
  const data = await run(analyzeBtn, "/score", weightFields());
  if (data) await showResults(data.ranking, null);
});

const tryBtn = $("try-samples");
async function fetchAsFile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const name = decodeURIComponent(url.split("/").pop());
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
tryBtn.addEventListener("click", async () => {
  tryBtn.disabled = true;
  const prev = tryBtn.textContent;
  tryBtn.textContent = "Loading sample photos…";
  try {
    const res = await fetch("/samples");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    clearFiles();
    const loaded = await Promise.all(data.images.map(fetchAsFile));
    addFiles(loaded);
    tryBtn.textContent = prev;
    tryBtn.disabled = false;
    // Score them straight away so the demo is one click.
    const scored = await run(analyzeBtn, "/score", weightFields());
    if (scored) await showResults(scored.ranking, null);
  } catch (e) {
    toast("Couldn't load samples: " + e.message);
    tryBtn.textContent = prev;
    tryBtn.disabled = false;
  }
});

renderBtn.addEventListener("click", async () => {
  const s = settings();
  const data = await run(renderBtn, "/pipeline",
    { top_k: $("topk").value, ...s, ...weightFields() });
  if (data) { await showResults(data.ranking, data.selected); showVideo(data); }
});

// Register the service worker so Reel is installable (PWA / Play TWA).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
