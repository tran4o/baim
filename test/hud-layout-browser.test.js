import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { browserAvailable } from './helpers/browser-availability.js';
import { chooseHudLanguage, chooseHudVerb, inventoryItem } from './helpers/hud-ui.js';

test('HUD keeps all actions, one language switch and accessible upward three-by-three inventory', { timeout: 180000 }, async t => {
  if (!browserAvailable(t, chromium.executablePath())) return;
  let server, browser;
  let origin = process.env.BAIM_HUD_REVIEW_URL;
  const report = { cases: [], errors: [], privateStorage: true };
  const out = process.env.BAIM_HUD_REVIEW_DIR || 'target/hud-layout-review';
  mkdirSync(out, { recursive: true });
  try {
    if (!origin) {
      const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
      origin = `http://127.0.0.1:${port}`;
      server = spawn(process.execPath, ['tools/dev-server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true });
      for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin + '/?play=1&testHarness=1');
    await page.waitForFunction(() => window.__comradeCandidateTest?.game?.inputBound);
    await page.evaluate(() => { const g = window.__comradeCandidateTest.game; g.menuOpen = false; g.paused = false; g.state.flags.chapter1OpeningHeard = true; g.dialogue.close(); g.renderUi(); });
    const ids = await page.evaluate(() => Object.keys(window.__comradeCandidateTest.game.content.items));
    assert.equal(ids.length, 18);
    const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (const language of ['bg', 'en']) {
      await chooseHudLanguage(page, language);
      assert.equal(await page.locator('.top-bar-right button').count(), 1);
      for (const verb of ['look', 'talk', 'use', 'take']) {
        await chooseHudVerb(page, verb);
        assert.equal(await page.locator('.hud-verb-icon').getAttribute('data-cursor-art'), { look: 'LOOK-A', talk: 'SPEAK-A', use: 'USE-I', take: 'TAKE-A' }[verb]);
      }
      for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 800, height: 600 }, { width: 720, height: 480 }, { width: 860, height: 600 }]) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(({ width, height }) => Math.abs(document.querySelector('#app').getBoundingClientRect().width - Math.min(width / 1280, height / 720) * 1280) < 1, viewport);
        for (const count of [0, 1, 3, 6, 9, 10, 18]) {
          await page.evaluate(({ ids, count }) => { const g = window.__comradeCandidateTest.game; g.closeItemInspection(); g.clearInventoryInteraction(); g.state.inventory = ids.slice(0, count); g.inventoryExpanded = false; g.inventoryScrollTop = 0; g.renderUi(); }, { ids, count });
          assert.equal(await page.locator('.inventory-dock > .inventory-item').count(), 3);
          assert.equal(await page.locator('.inventory-slot-empty').count(), Math.max(0, 3 - count));
          const collapsed = await page.locator('.inventory-dock-panel').boundingBox();
          await page.locator('.inventory-toggle').click();
          const expanded = await page.locator('.inventory-dock-panel').boundingBox();
          const corner = await page.locator('.inventory-toggle').boundingBox();
          assert.ok(corner.y < expanded.y, 'small tab joins the upper-right edge');
          assert.ok(corner.x > expanded.x + expanded.width * .75 && corner.x + corner.width <= expanded.x + expanded.width);
          assert.ok(corner.y >= 0 && corner.x + corner.width <= viewport.width);
          assert.equal(await page.locator('.inventory-toggle svg').count(), 1);
          if (count) assert.ok(await page.locator('.inventory-item img').evaluateAll(images => images.every(image => parseFloat(getComputedStyle(image).paddingLeft) >= 6 && parseFloat(getComputedStyle(image).paddingTop) >= 6)), 'thumbnail artwork has breathing room');
          assert.ok(expanded.y < collapsed.y);
          assert.ok(Math.abs(expanded.y + expanded.height - collapsed.y - collapsed.height) < 1);
          assert.equal(await page.locator('.inventory-dock > .inventory-item').count(), Math.max(9, Math.ceil(count / 3) * 3));
          const geometry = await page.locator('.inventory-dock').evaluate(d => {
            const box = d.getBoundingClientRect();
            const visible = [...d.children].filter(e => { const r = e.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; });
            const scale = box.width / d.offsetWidth; const columnsFullyVisible = [...d.children].every(e => { const r = e.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.left + d.clientWidth * scale + 1; }); return { columnsFullyVisible, visible: visible.length, noHorizontalScroll: d.scrollWidth <= d.clientWidth, scrolls: d.scrollHeight > d.clientHeight, scrollTop: d.scrollTop };
          });
          assert.equal(geometry.visible, 9);
          assert.equal(geometry.columnsFullyVisible, true);
          assert.equal(geometry.noHorizontalScroll, true);
          assert.equal(geometry.scrolls, count > 9);
          const meters = await page.locator('.hud-meters').boundingBox(), action = await page.locator('.hud-verb').boundingBox();
          assert.equal(overlap(meters, expanded), false); assert.equal(overlap(action, expanded), false); assert.equal(overlap(action, meters), false);
          if (count) {
            const last = await inventoryItem(page, ids[count - 1]); await last.hover();
            assert.equal(await page.locator('.inventory-hover-label').isVisible(), true);
            await last.click();
            assert.equal(await page.locator('.inventory-item-actions').isVisible(), true);
            const before = await page.locator('.inventory-dock').evaluate(e => e.scrollTop);
            await page.locator('.hud-language-toggle').click();
            await page.waitForTimeout(20);
            assert.ok(Math.abs(await page.locator('.inventory-dock').evaluate(e => e.scrollTop) - before) < 1);
            assert.equal(await page.locator('.inventory-toggle').getAttribute('aria-expanded'), 'true');
            await chooseHudLanguage(page, language);
          }
          report.cases.push({ language, viewport, count, ...geometry, pass: true });
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    const last = await inventoryItem(page, ids.at(-1)); await last.click();
    const selected = await page.evaluate(() => window.__comradeCandidateTest.game.selectedInventoryItemId);
    if (!selected) await (await inventoryItem(page, ids.at(-1))).click();
    const inspect = await page.evaluate(() => window.__comradeCandidateTest.game.t('ui.inventory.inspect'));
    const scrollBefore = await page.locator('.inventory-dock').evaluate(e => e.scrollTop);
    await page.locator('.inventory-item-actions').getByRole('button', { name: inspect, exact: true }).click();
    await page.locator('.item-model-viewer[data-model-state=ready]').waitFor();
    const viewer = page.locator('.item-model-viewer'), canvas = viewer.locator('canvas'), box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width, box.y + box.height, { steps: 4 }); await page.mouse.up();
    assert.ok(Math.abs(Number(await viewer.getAttribute('data-pitch'))) <= Math.PI / 12 + .0001);
    await canvas.hover(); await page.mouse.wheel(0, -2000); await page.waitForTimeout(50); assert.ok(Number(await viewer.getAttribute('data-zoom')) <= 1.5);
    await page.locator('.received-item-screen > button:last-child').click();
    assert.ok(Math.abs(await page.locator('.inventory-dock').evaluate(e => e.scrollTop) - scrollBefore) < 1);
    await (await inventoryItem(page, ids.at(-1))).click();
    const use = await page.evaluate(() => window.__comradeCandidateTest.game.t('ui.inventory.use'));
    await page.locator('.inventory-item-actions').getByRole('button', { name: use, exact: true }).click();
    await page.mouse.move(600, 300); await page.waitForTimeout(30);
    assert.equal(await page.locator('.inventory-item-cursor').evaluate(e => e.style.transform), 'rotate(-8deg)');
    await page.locator('#game').click({ button: 'right', position: { x: 600, y: 300 } });
    assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventoryUseItemId), null);
    await page.locator('.inventory-toggle').click(); assert.equal(await page.locator('.inventory-dock > .inventory-item').count(), 3);
    assert.deepEqual(report.errors, []); report.pass = true; report.inspectionAndUseFromLastRow = true;
  } finally { await browser?.close(); server?.kill(); report.privateBrowserClosed = true; writeFileSync(out + '/results.json', JSON.stringify(report, null, 2)); }
});
