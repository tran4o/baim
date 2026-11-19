import assert from 'node:assert/strict';

export async function chooseHudVerb(page, verb) {
  const label = await page.evaluate(verb => window.__comradeCandidateTest.game.t(`verb.${verb}`), verb);
  for (let step = 0; step < 4; step++) {
    if (await page.locator('.hud-verb-text').textContent() === label) return;
    await page.locator('.hud-verb').click();
  }
  assert.fail(`Bottom HUD could not select ${verb}`);
}

export async function chooseHudLanguage(page, language) {
  const toggle = page.locator('.hud-language-toggle');
  if ((await toggle.textContent()).toLowerCase() !== language) await toggle.click();
  assert.equal((await toggle.textContent()).toLowerCase(), language);
}

export async function expandInventory(page) {
  const toggle = page.locator('.inventory-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

export async function inventoryItem(page, id) {
  await expandInventory(page);
  const item = page.locator(`button.inventory-item[data-item-id="${id}"]`);
  await item.scrollIntoViewIfNeeded();
  return item;
}

export async function collapseInventory(page) {
  const toggle = page.locator('.inventory-toggle');
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
}
