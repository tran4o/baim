import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { browserAvailable } from './helpers/browser-availability.js';
import { inventoryItem, chooseHudLanguage, useSelectedItemOnSelf } from './helpers/hud-ui.js';

test('icon ears slide behind stable slots, dismiss outside, stay visible at edge columns and retain View/Use/self-use', { timeout: 180000 }, async t => {
  if (!browserAvailable(t, chromium.executablePath())) return;
  let browser, server, origin = process.env.BAIM_EARS_REVIEW_URL;
  const out = process.env.BAIM_EARS_REVIEW_DIR || 'target/inventory-ears-review';
  mkdirSync(out, { recursive: true });
  const report = { cases: [], errors: [], privateStorage: true };
  try {
    if (!origin) {
      const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
      origin = 'http://127.0.0.1:' + port;
      server = spawn(process.execPath, ['tools/dev-server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true });
      for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin + '/?play=1&testHarness=1');
    await page.waitForFunction(() => window.__comradeCandidateTest?.game?.inputBound);
    const ids = await page.evaluate(() => { const g = window.__comradeCandidateTest.game; g.menuOpen = false; g.paused = false; g.state.flags.chapter1OpeningHeard = true; g.dialogue.close(); const ids = Object.keys(g.content.items); g.state.inventory = ids; g.inventoryExpanded = true; g.renderUi(); window.__earTransitions = []; document.addEventListener('transitionrun', e => { if (e.target.classList.contains('inventory-ear') && e.propertyName === 'transform') window.__earTransitions.push(e.target.className); }); return ids; });
    for (const language of ['bg', 'en']) {
      await chooseHudLanguage(page, language);
      for (const viewport of [{ width: 1280, height: 720 }, { width: 720, height: 480 }]) {
        await page.setViewportSize(viewport);
        for (const index of [0, 1, 2, 9, 17]) {
          const item = await inventoryItem(page, ids[index]);
          const before = await item.boundingBox();
          await item.click();
          const actions = page.locator('.inventory-item-actions');
          assert.equal(await actions.getByRole('button').count(), 2);
          assert.equal(await actions.textContent(), '');
          await page.waitForFunction(() => [...document.querySelectorAll('.inventory-item-actions .inventory-ear')].every(b => Math.abs(Math.abs(new DOMMatrixReadOnly(getComputedStyle(b).transform).m41) - 36) < .01));
          for (const button of await actions.getByRole('button').all()) {
            const box = await button.boundingBox();
            assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.y >= 0 && box.y + box.height <= viewport.height + 1, 'ears remain on screen');
          }
          const after = await item.boundingBox();
          assert.ok(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1, 'the selected slot stays still');
          await page.locator('#game').click({ position: { x: 600, y: 100 } });
          assert.equal(await page.locator('.inventory-item-actions').count(), 0);
          await page.locator('.inventory-ears-retiring').waitFor({ state: 'detached' });
          report.cases.push({ language, viewport, index, pass: true });
        }
      }
    }
    assert.ok(await page.evaluate(() => window.__earTransitions.length >= 4), 'opening/retraction use actual transform transitions');
    await page.setViewportSize({ width: 1280, height: 720 });
    await (await inventoryItem(page, 'item.mitko_child_photo')).click();
    const inspect = await page.evaluate(() => window.__comradeCandidateTest.game.t('ui.inventory.inspect'));
    await page.locator('.inventory-item-actions').getByRole('button', { name: inspect, exact: true }).click();
    await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();
    await page.locator('.received-item-screen > button:last-child').click();
    await (await inventoryItem(page, 'item.sunflower_oil')).click();
    const use = await page.evaluate(() => window.__comradeCandidateTest.game.t('ui.inventory.use'));
    await page.locator('.inventory-item-actions').getByRole('button', { name: use, exact: true }).click();
    const feet = await page.evaluate(() => ({ ...window.__comradeCandidateTest.game.player.position }));
    await useSelectedItemOnSelf(page);
    assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventory.has('item.sunflower_oil')), true);
    assert.deepEqual(await page.evaluate(() => ({ ...window.__comradeCandidateTest.game.player.position })), feet);
    await page.locator('#game').click({ button: 'right', position: { x: 600, y: 300 } });
    assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventoryUseItemId), null);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await (await inventoryItem(page, ids[2])).click();
    assert.equal(await page.locator('.inventory-ear').first().evaluate(b => getComputedStyle(b).transitionDuration), '0s');
    assert.deepEqual(report.errors, []);
    report.pass = true; report.ViewNativeModel = true; report.UseSelfWithoutMovement = true; report.rightCancel = true; report.reducedMotion = true;
  } finally { await browser?.close(); server?.kill(); report.privateBrowserClosed = true; writeFileSync(out + '/results.json', JSON.stringify(report, null, 2)); }
});
