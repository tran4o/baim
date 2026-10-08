import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { assetManifest } from "../src/content/art/assetManifest.js";
import { sceneLayerGeometry } from "../src/content/chapter1/sceneLayers.generated.js";

const ROOT = resolve(".");
const DOCS = join(ROOT, "docs");
const METADATA_PATH = join(ROOT, "assets_src", "chapter1", "animation-library-metadata.json");
const CSS_PATH = join(ROOT, "src", "styles.css");
const MAIN_SELECTION = join(ROOT, "assets_src", "characters", "bai_mitko", "external_animation_v1", "external-animation-selection.json");
const args = new Set(process.argv.slice(2));
const outputs = {
  index: { html: join(DOCS, "animation-library-index.html"), pdf: join(DOCS, "animation-library-index.pdf") },
  npc: { html: join(DOCS, "chapter1-npc-animation-catalog.html"), pdf: join(DOCS, "chapter1-npc-animation-catalog.pdf") },
  world: { html: join(DOCS, "chapter1-world-motion-catalog.html"), pdf: join(DOCS, "chapter1-world-motion-catalog.pdf") }
};

const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function titleize(value) {
  return String(value).replace(/^npc\.|^layer\.|^effect\.|^ui\./, "").replaceAll(/[._-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function loadAnimationPilots(path) {
  if (!path) return [];
  const absolutePath = join(ROOT, path);
  if (!existsSync(absolutePath)) throw new Error(`Animation pilot manifest is missing: ${path}`);
  const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  return Object.entries(manifest.animations || {}).map(([id, animation]) => ({
    id,
    slot: animation.slot,
    status: animation.status,
    use: Boolean(animation.use),
    candidateStatus: animation.review?.candidateStatus,
    runtimeAsset: animation.import?.runtime?.asset || null,
    sceneId: manifest.scope?.sceneId,
    manifestPath: path,
    generationEvidenceUnavailable: Boolean(animation.generation?.unavailableEvidenceReason),
    timing: animation.import?.runtime?.durationMs != null ? `${animation.import.runtime.frames} frames x ${animation.import.runtime.frameDurationMs} ms = ${animation.import.runtime.durationMs} ms (native export)` : null,
    schedule: animation.scheduling ? `Every ${animation.scheduling.intervalMinMs / 1000}-${animation.scheduling.intervalMaxMs / 1000} seconds of eligible quiet time; ${animation.scheduling.menuBehavior}; ${animation.scheduling.conversationOrSceneExit}` : null,
    provenanceComplete: Boolean(
      animation.generation?.prompt
      && animation.generation?.model
      && animation.generation?.settings
      && animation.generation?.resultId
      && Number.isFinite(animation.generation?.creditsSpent)
      && animation.source?.exportFilename
      && animation.source?.sourceZipSha256
      && animation.review?.decision
      && animation.review?.reviewer
      && animation.review?.approvedAt
    )
  }));
}

function placeholder(label, kind = "Future-ready") {
  const safe = esc(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#23184f"/><stop offset="1" stop-color="#4d318f"/></linearGradient></defs><rect width="640" height="420" rx="30" fill="url(#g)"/><circle cx="320" cy="175" r="82" fill="none" stroke="#8cbcff" stroke-width="10" stroke-dasharray="18 12"/><path d="M285 175h70M320 140v70" stroke="#fff" stroke-width="12" stroke-linecap="round"/><text x="320" y="300" fill="#fff" font-family="Arial" font-size="28" text-anchor="middle">${safe}</text><text x="320" y="337" fill="#c9c1e8" font-family="Arial" font-size="18" text-anchor="middle">${esc(kind)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function imageData(path, label, kind) {
  if (!path || !existsSync(join(ROOT, path))) return placeholder(label, kind);
  const buffer = await sharp(join(ROOT, path)).resize({ width: 520, height: 370, fit: "contain", background: { r: 246, g: 244, b: 238, alpha: 1 } }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function scenesForAsset(path) {
  if (!path) return [];
  return Object.entries(assetManifest.scenes).filter(([, assets]) => Object.values(assets).includes(path)).map(([scene]) => scene);
}

function layerAssetPath(sceneId, alias) {
  return assetManifest.scenes[sceneId]?.[alias] || null;
}

async function buildNpcEntries() {
  const entries = [];
  const knownSources = new Set();
  for (const npc of metadata.npcs) {
    if (npc.source) knownSources.add(npc.source);
    const pilots = loadAnimationPilots(npc.animationPilot);
    for (const pilot of pilots) if (pilot.runtimeAsset) knownSources.add(pilot.runtimeAsset);
    const pilotSlots = new Set(pilots.map((pilot) => pilot.slot));
    entries.push({
      ...npc,
      category: "NPC",
      status: pilots.some((pilot) => pilot.use && pilot.candidateStatus !== "runtime_approved")
        ? "Runtime review"
        : pilots.some((pilot) => pilot.candidateStatus === "runtime_approved") ? "Runtime approved" : pilots.length ? "Pilot planned" : "Static only",
      scenes: scenesForAsset(npc.source),
      source: npc.source || "Baked into scene background",
      slots: [
        ...pilots.map((pilot) => `${pilot.slot} pilot - ${titleize(pilot.status)}`),
        ...["Idle", "Talk", "Reaction", "Action"].filter((slot) => !pilotSlots.has(slot))
      ],
      pilots,
      review: false,
      image: await imageData(npc.source, npc.label, "No animation registered")
    });
  }

  for (const [sceneId, assets] of Object.entries(assetManifest.scenes)) {
    for (const path of Object.values(assets)) {
      if (!path.includes("/characters/") || knownSources.has(path)) continue;
      knownSources.add(path);
      const label = titleize(path.split("/").at(-2));
      entries.push({
        id: `discovered.${path.split("/").at(-2)}`,
        label,
        description: "Automatically discovered character art. Add reviewed metadata before animation production.",
        category: "NPC",
        status: "Static only",
        scenes: scenesForAsset(path),
        source: path,
        slots: ["Idle", "Talk", "Reaction", "Action"],
        review: true,
        image: await imageData(path, label, "Discovered static art")
      });
    }
  }
  return entries;
}

function conditionalKeys(layer) {
  return ["visibleDuringAction", "visibleWhenFlag", "hiddenWhenFlag", "visibleWhenTargetId", "hiddenWhenState", "hiddenWhenItemOwned", "requirements"].filter((key) => layer[key] !== undefined);
}

async function buildWorldEntries(npcEntries) {
  const entries = [];
  const css = readFileSync(CSS_PATH, "utf8");
  const npcSources = new Set(npcEntries.map((entry) => entry.source).filter((source) => String(source).startsWith("assets/")));

  const fountain = metadata.world["effect.fountain_water_stream"];
  entries.push({ id: "effect.fountain_water_stream", ...fountain, category: "Procedural effect", status: "Live", trigger: "flag: fountainRepaired", image: await imageData(fountain.previewAsset, fountain.label, "Procedural canvas effect") });

  for (const name of [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1])) {
    entries.push({
      id: `css.${name}`,
      label: titleize(name),
      description: `Live CSS keyframe animation used by the ${name.startsWith("speech-") ? "speech bubble interface" : "Chapter 1 interface"}.`,
      category: "UI keyframe",
      status: "Live",
      scene: "Global UI",
      trigger: `CSS animation: ${name}`,
      source: "src/styles.css",
      image: placeholder(titleize(name), "Live CSS keyframe")
    });
  }

  const transitions = metadata.world["ui.interface_transitions"];
  const transitionCount = (css.match(/\btransition\s*:/g) || []).length;
  entries.push({ id: "ui.interface_transitions", ...transitions, category: "UI transition", status: "Live", trigger: `${transitionCount} CSS transition declarations`, image: placeholder(transitions.label, "Live CSS transitions") });

  for (const [sceneId, scene] of Object.entries(sceneLayerGeometry)) {
    for (const layer of scene.foregroundLayers || []) {
      const conditions = conditionalKeys(layer);
      if (!conditions.length) continue;
      const asset = layerAssetPath(sceneId, layer.asset);
      if (npcSources.has(asset)) continue;
      const timed = Boolean(layer.visibleDuringAction);
      entries.push({
        id: layer.id,
        label: titleize(layer.id),
        description: timed
          ? `A scene layer is revealed on a configured action frame, synchronized with ${layer.visibleDuringAction.actionName}.`
          : "A static scene layer changes visibility when gameplay state changes; no interpolated animation is registered yet.",
        category: timed ? "Action-timed layer" : "Static state change",
        status: timed ? "Live" : "Static only",
        scene: sceneId,
        trigger: conditions.map((key) => `${key}: ${JSON.stringify(layer[key])}`).join("; "),
        source: asset || `asset alias: ${layer.asset}`,
        image: await imageData(asset, titleize(layer.id), timed ? "Action-timed layer" : "Static state change")
      });
    }
  }
  return entries;
}

const style = `:root{--ink:#252237;--muted:#69657b;--paper:#f6f4ee;--panel:#fff;--purple:#6841d9;--green:#17875d;--amber:#a35b00;--blue:#2669ad}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,Segoe UI,sans-serif}header{padding:48px clamp(24px,6vw,90px) 34px;background:linear-gradient(135deg,#17133b,#3f247d 62%,#235c9a);color:#fff}header h1{margin:0 0 9px;font-size:clamp(34px,6vw,62px);line-height:1}header p{max-width:900px;color:#ddd8f5;font-size:17px}.summary{display:flex;gap:28px;margin-top:24px;flex-wrap:wrap}.summary strong{display:block;font-size:28px}.summary span{color:#cbc5e5}.controls{position:sticky;top:0;z-index:4;display:flex;gap:9px;flex-wrap:wrap;padding:14px clamp(24px,6vw,90px);background:#f6f4eef2;border-bottom:1px solid #ddd8cb}.controls button{border:1px solid #c9c2dc;border-radius:999px;background:#fff;padding:8px 13px}.controls button.active{background:var(--purple);color:#fff}main{padding:28px clamp(20px,5vw,72px) 60px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:20px}.card{display:grid;grid-template-columns:40% 1fr;min-height:360px;background:var(--panel);border:1px solid #e2ded3;border-radius:18px;overflow:hidden;box-shadow:0 7px 24px #28203812}.media{display:flex;align-items:center;justify-content:center;background:#eeebe4;padding:14px}.media img{width:100%;height:100%;max-height:350px;object-fit:contain}.body{padding:22px}.eyebrow{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.badge{border-radius:999px;padding:4px 9px;font-weight:700;white-space:nowrap}.live{background:#d8f4e8;color:var(--green)}.static{background:#fff0d7;color:var(--amber)}.ready{background:#dcecff;color:var(--blue)}h2{margin:13px 0 2px;font-size:24px;line-height:1.1}.body>code{color:var(--purple);font-size:11px}.description{min-height:52px}.detail{font-size:12px;color:var(--muted);margin:7px 0}.slots{display:flex;gap:5px;flex-wrap:wrap;margin:14px 0}.slot{font-size:10px;padding:4px 7px;border-radius:6px;background:#eeeaf7;color:#594598}.review{color:var(--amber);font-weight:700}.empty{padding:28px;border:2px dashed #c9c2dc;border-radius:16px;background:#fff;text-align:center}.index-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.index-card{display:block;padding:28px;background:#fff;border:1px solid #e2ded3;border-radius:18px;color:inherit;text-decoration:none}.index-card:hover{border-color:var(--purple);transform:translateY(-2px)}.index-card h2{font-size:27px}.metric{font-size:40px;font-weight:800;color:var(--purple)}footer{text-align:center;padding:24px;color:var(--muted)}@media(max-width:650px){.card{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.media{height:300px}}@media print{body{background:#fff;font-size:10px}header{padding:14mm;background:#24175f!important;-webkit-print-color-adjust:exact}header h1{font-size:28px}.controls,footer{display:none}main{padding:7mm 9mm}.grid{display:block}.card{height:87mm;min-height:0;margin-bottom:6mm;border-radius:8px;box-shadow:none;break-inside:avoid}.card:nth-child(2n){break-after:page}.card.multiple-pilots{height:auto;min-height:87mm}.body{padding:5mm}.media{padding:4mm}.media img{max-height:76mm}h2{font-size:18px}.description{min-height:0}.detail{font-size:9px}.index-grid{grid-template-columns:repeat(2,1fr)}.index-card{min-height:62mm;break-inside:avoid}.metric{font-size:28px}}`;

function statusClass(status) {
  return status === "Live" ? "live" : status === "Static only" ? "static" : "ready";
}

function catalogHtml({ title, intro, entries, emptyMessage }) {
  const live = entries.filter((entry) => entry.status === "Live" || entry.pilots?.some((pilot) => pilot.use)).length;
  const staticCount = entries.filter((entry) => entry.status === "Static only").length;
  const categories = [...new Set(entries.map((entry) => entry.category))];
  const cards = entries.map((entry) => `<article class="card${entry.pilots?.length > 1 ? " multiple-pilots" : ""}" data-entry-id="${esc(entry.id)}" data-category="${esc(entry.category)}" data-status="${esc(entry.status)}"><div class="media"><img src="${entry.image}" alt="${esc(entry.label)} reference"></div><div class="body"><div class="eyebrow"><span class="badge ${statusClass(entry.status)}">${esc(entry.status)}</span><span>${esc(entry.category)}</span></div><h2>${esc(entry.label)}</h2><code>${esc(entry.id)}</code><p class="description">${esc(entry.description)}</p>${entry.review ? '<p class="review">Needs metadata review</p>' : ""}${entry.slots ? `<div class="slots">${entry.slots.map((slot) => `<span class="slot">${entry.pilots?.some((pilot) => `${pilot.slot} pilot - ${titleize(pilot.status)}` === slot) ? "" : "Future "}${esc(slot)}</span>`).join("")}</div>` : ""}${(entry.pilots || []).map((pilot) => `<p class="detail"><b>Pilot:</b> ${esc(pilot.id)} - ${esc(titleize(pilot.status))}; scene: ${esc(pilot.sceneId)}; candidate: ${esc(titleize(pilot.candidateStatus))}</p><p class="detail"><b>Pilot manifest:</b> ${esc(pilot.manifestPath)}</p>${pilot.runtimeAsset ? `<p class="detail"><b>Runtime candidate:</b> ${esc(pilot.runtimeAsset)}</p>` : ""}${pilot.timing ? `<p class="detail"><b>Timing:</b> ${esc(pilot.timing)}</p>` : ""}${pilot.schedule ? `<p class="detail"><b>Schedule:</b> ${esc(pilot.schedule)}</p>` : ""}<p class="detail"><b>Provenance:</b> ${pilot.candidateStatus === "rejected" ? "Rejected by owner; preserved for provenance, not used in gameplay" : pilot.provenanceComplete ? "Complete" : (pilot.candidateStatus === "runtime_approved" ? "Runtime approved; generation evidence incomplete (see manifest)" : pilot.generationEvidenceUnavailable ? "Generation identifier unavailable (see manifest); awaiting human runtime review" : "Awaiting generated-source details and human review")}</p>`).join("")}<p class="detail"><b>Scene:</b> ${esc((entry.scenes || [entry.scene]).filter(Boolean).join(", ") || "No scene registration")}</p>${entry.trigger ? `<p class="detail"><b>Trigger:</b> ${esc(entry.trigger)}</p>` : ""}<p class="detail"><b>Source:</b> ${esc(entry.source)}</p></div></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${style}</style></head><body><header><p>BAIM / CHAPTER 1 ANIMATION LIBRARY</p><h1>${esc(title)}</h1><p>${esc(intro)}</p><div class="summary"><div><strong>${entries.length}</strong><span>catalog entries</span></div><div><strong>${live}</strong><span>live motion</span></div><div><strong>${staticCount}</strong><span>static / future-ready</span></div></div></header><nav class="controls"><button class="active" data-filter="all">All</button>${categories.map((category) => `<button data-filter="${esc(category)}">${esc(category)}</button>`).join("")}<button data-filter="Static only">Static only</button></nav><main>${entries.length ? `<div class="grid">${cards}</div>` : `<div class="empty">${esc(emptyMessage)}</div>`}</main><footer>Generated by npm run build:animation-catalogs. Do not edit this file by hand.</footer><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.classList.remove('active'));button.classList.add('active');const filter=button.dataset.filter;document.querySelectorAll('.card').forEach(card=>card.hidden=filter!=='all'&&card.dataset.category!==filter&&card.dataset.status!==filter)}))</script></body></html>`;
}

function indexHtml(npcs, world) {
  const selection = JSON.parse(readFileSync(MAIN_SELECTION, "utf8"));
  const mainCount = Object.values(selection.animations || {}).filter((entry) => entry.use).length;
  const liveWorld = world.filter((entry) => entry.status === "Live").length;
  const cards = [
    { title: "Bai Mitko", metric: mainCount, label: "enabled source animations", href: "bai-mitko-animation-catalog.html", note: "Detailed main-character movement, idles, dialogue, reactions, and actions." },
    { title: "Chapter 1 NPCs", metric: npcs.length, label: "tracked characters", href: "chapter1-npc-animation-catalog.html", note: "Current static poses and future animation slots for supporting characters." },
    { title: "World Motion", metric: world.length, label: `${liveWorld} live motion entries`, href: "chapter1-world-motion-catalog.html", note: "Procedural effects, UI keyframes, timed layers, and static state transitions." }
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BAIM Animation Library</title><style>${style}</style></head><body><header><p>BAIM / GENERATED REFERENCE</p><h1>Chapter 1 Animation Library</h1><p>One generated entry point for character animation, world motion, and future-ready static assets. Empty animation slots remain visible so production gaps do not disappear.</p><div class="summary"><div><strong>${mainCount}</strong><span>Bai Mitko sources</span></div><div><strong>${npcs.length}</strong><span>supporting characters</span></div><div><strong>${world.length}</strong><span>world-motion entries</span></div></div></header><main><div class="index-grid">${cards.map((card) => `<a class="index-card" href="${card.href}"><p class="eyebrow">CATALOG</p><h2>${esc(card.title)}</h2><div class="metric">${card.metric}</div><p><b>${esc(card.label)}</b></p><p>${esc(card.note)}</p></a>`).join("")}</div><section class="empty" style="margin-top:24px"><h2>Workflow</h2><p>Add or register an animation in the runtime sources, then run <b>npm run build:animation-catalogs</b>. New discoveries appear automatically; unknown entries are flagged for review. CI runs the matching freshness check.</p></section></main><footer>Generated documentation - Chapter 1</footer></body></html>`;
}

async function renderPdf(htmlPath, pdfPath) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${pathToFileURL(htmlPath).href}?print=1`, { waitUntil: "networkidle" });
    await page.pdf({ path: pdfPath, format: "A4", landscape: true, printBackground: true, margin: { top: "8mm", right: "7mm", bottom: "8mm", left: "7mm" } });
  } finally { await browser.close(); }
}

async function main() {
  const npcs = await buildNpcEntries();
  const world = await buildWorldEntries(npcs);
  const documents = [
    [outputs.npc, catalogHtml({ title: "Chapter 1 NPC Animation Catalog", intro: "Supporting-character inventory with current visual state, scene usage, and explicit future animation slots. Static art is never mislabeled as animation.", entries: npcs, emptyMessage: "No Chapter 1 NPC assets are registered yet. The animation workflow is ready for the first character." })],
    [outputs.world, catalogHtml({ title: "Chapter 1 World Motion Catalog", intro: "Procedural effects, interface motion, action-timed layers, and static state changes that may become animated later.", entries: world, emptyMessage: "No world-motion entries are registered yet. The workflow is ready for the first effect or animated prop." })],
    [outputs.index, indexHtml(npcs, world)]
  ];

  if (args.has("--check")) {
    let stale = false;
    for (const [paths, html] of documents) {
      if (!existsSync(paths.html) || readFileSync(paths.html, "utf8") !== html) { console.error(`Animation library document is stale: ${paths.html}`); stale = true; }
    }
    if (stale) process.exitCode = 1;
    else console.log(`Animation library is current (${npcs.length} NPCs, ${world.length} world entries).`);
    return;
  }

  for (const [paths, html] of documents) writeFileSync(paths.html, html);
  if (!args.has("--html-only")) for (const [paths] of documents) await renderPdf(paths.html, paths.pdf);
  console.log(`Built animation library: ${npcs.length} NPCs, ${world.length} world entries.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
