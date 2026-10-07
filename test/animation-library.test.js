import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { assetManifest } from "../src/content/art/assetManifest.js";

const npcHtml = readFileSync("docs/chapter1-npc-animation-catalog.html", "utf8");
const tonyPilot = JSON.parse(readFileSync("assets_src/characters/tony_fridge/external_animation_v1/animation-pilot.json", "utf8"));
const worldHtml = readFileSync("docs/chapter1-world-motion-catalog.html", "utf8");
const indexHtml = readFileSync("docs/animation-library-index.html", "utf8");

test("animation library publishes index, NPC, and world catalogs in HTML and PDF", () => {
  for (const name of ["animation-library-index", "chapter1-npc-animation-catalog", "chapter1-world-motion-catalog"]) {
    assert.ok(existsSync(`docs/${name}.html`));
    assert.ok(existsSync(`docs/${name}.pdf`));
  }
  assert.match(indexHtml, /Bai Mitko/);
  assert.match(indexHtml, /Chapter 1 NPCs/);
  assert.match(indexHtml, /World Motion/);
});

test("every Chapter 1 character asset is represented in the NPC catalog", () => {
  const characterAssets = new Set();
  for (const assets of Object.values(assetManifest.scenes)) {
    for (const path of Object.values(assets)) if (path.includes("\/characters\/")) characterAssets.add(path);
  }
  for (const path of characterAssets) assert.ok(npcHtml.includes(path), `NPC catalog is missing ${path}`);
  assert.match(npcHtml, /Static only/);
  assert.match(npcHtml, /Future Idle/);
});

test("Tony's seated idle pilot records runtime approval after local review", () => {
  const pilot = tonyPilot.animations.tony_idle_seated_1;
  assert.equal(tonyPilot.characterId, "npc.tony_fridge");
  assert.equal(tonyPilot.scope.sceneId, "scene.chapter1.mehana");
  assert.deepEqual(tonyPilot.scope.canvas, { width: 1280, height: 720 });
  assert.deepEqual(tonyPilot.scope.placement, { left: 861, top: 310, height: 244, zIndex: 35 });
  assert.equal(tonyPilot.scope.fallbackAsset, "assets/chapter1/characters/tony_fridge/seated-v1.png");
  assert.deepEqual(tonyPilot.scope.excludedScenes, ["scene.chapter1.election_booth"]);
  assert.equal(pilot.slot, "Idle");
  assert.equal(pilot.status, "runtime_approved");
  assert.equal(pilot.use, true);
  assert.equal(pilot.loop, true);
  assert.equal(pilot.source.exportFilename, "sprite-384px-frames-25-rows-5-cols-5.zip");
  assert.equal(pilot.source.sourceZipSha256, "070458b291740af5fc75213e9c8f0106e7d54c03e0b3ba1ddd683a8a8dbc966c");
  assert.equal(pilot.generation.creditsSpent, 15);
  assert.equal(pilot.review.candidateStatus, "runtime_approved");
  assert.equal(pilot.review.decision, "approved_for_runtime");
  assert.equal(pilot.review.approvedAt, "2026-09-30");
  assert.equal(pilot.import.runtime.asset, "assets/chapter1/characters/tony_fridge/idle-seated-v1.webp");
  assert.equal(pilot.import.derivedOutputHashes[pilot.import.runtime.asset], "1cca1e9231c9401f01625f16913e124c0ac3728c2d10f05b862e2836f6e2fd7e");
  assert.equal(pilot.source.references[0].sha256, "b1d088b7d120490bcf5a4dcabcbab9531462a36e467661cff7242ae2c911bde8");
  assert.match(npcHtml, /tony_idle_seated_1/);
  assert.match(npcHtml, /Runtime approved/);
  assert.match(npcHtml, /Runtime Approved/);
  assert.match(npcHtml, /assets\/chapter1\/characters\/tony_fridge\/idle-seated-v1\.webp/);
  // Other reactions may legitimately await review; only the approved idle is asserted here.
  const idleDetails = npcHtml.match(/<p class="detail"><b>Pilot:<\/b> tony_idle_seated_1\b[\s\S]*?(?=<p class="detail"><b>(?:Pilot|Scene):<\/b>)/)?.[0];
  assert.ok(idleDetails, 'Approved idle details must exist');
  assert.match(idleDetails, /candidate: Runtime Approved/);
  assert.doesNotMatch(idleDetails, /Awaiting generated-source details and human review/);
});

test('a pending Tony reaction does not invalidate an already approved idle', () => {
  const anger = tonyPilot.animations.tony_slow_anger_seated_1;
  assert.ok(anger, 'Integrated slow-anger candidate must remain cataloged');
  assert.equal(anger.review.candidateStatus, anger.status);
  assert.match(npcHtml, /tony_slow_anger_seated_1/);
  assert.equal(tonyPilot.animations.tony_idle_seated_1.status, 'runtime_approved');
  if (anger.status === 'runtime_review') assert.match(npcHtml, /data-entry-id="npc.tony_fridge"[^>]*data-status="Runtime review"/);
});

test("world catalog includes procedural, CSS, and static-state categories", () => {
  assert.match(worldHtml, /effect\.fountain_water_stream/);
  assert.match(worldHtml, /UI keyframe/);
  assert.match(worldHtml, /Static state change/);
});

test("approved NPC motion is counted without claiming missing evidence needs approval", () => {
  assert.match(npcHtml, /<strong>3<\/strong><span>live motion<\/span>/);
  const kiro = JSON.parse(readFileSync("assets_src/characters/mehana_waiter/external_animation_v1/animation-pilot.json", "utf8"));
  assert.equal(kiro.animations.kiro_polishing_idle_web_c01.review.candidateStatus, "runtime_approved");
  assert.equal(kiro.animations.kiro_polishing_idle_web_c01.review.publicationApproved, false);
  assert.match(npcHtml, /kiro-polishing-idle-web-c01\.png/);
  assert.match(npcHtml, /Runtime approved; generation evidence incomplete \(see manifest\)/);
});
