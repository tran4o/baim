import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { browserAvailable } from "./helpers/browser-availability.js";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { observeImageRequests, waitForLoadedImage } from "./helpers/browser-image-readiness.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("browser completes the required Chapter 1 path and restores the ending after reload", { timeout: 60_000 }, async (t) => {
  if (!browserAvailable(t, chromium.executablePath())) return;

  const port = await availablePort();
  const server = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: "block"
    });
    const page = await context.newPage();
    const url = `http://127.0.0.1:${port}/?play=1&testHarness=1`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.__comradeCandidateTest.ready);

    const initial = await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      return {
        sceneId: game.currentScene.id,
        inventory: [...game.state.inventory],
        completedQuests: [...game.state.completedQuests],
        chapter1Completed: game.state.chapter1Completed
      };
    });
    assert.deepEqual(initial, {
      sceneId: "scene.chapter1.apartment",
      inventory: [],
      completedQuests: [],
      chapter1Completed: false
    });

    await t.test("square menu stays readable and can be closed in both languages at different viewport sizes", async () => {
      for (const viewport of [{ width: 1280, height: 720 }, { width: 640, height: 360 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const language of ["bg", "en"]) {
          await page.evaluate(async (language) => {
            const { game } = window.__comradeCandidateTest;
            await game.changeScene("scene.chapter1.village_square");
            game.localization.setLanguage(language);
            game.useTarget(game.currentScene.interactables.find((entry) => entry.id === "hotspot.square.mehana_menu"));
            game.renderUi();
          }, language);
          const close = page.locator(".dialogue-choice-list button");
          const panelBounds = await page.locator(".dialogue-panel").boundingBox();
          const closeBounds = await close.boundingBox();
          assert.ok(closeBounds.y >= panelBounds.y);
          assert.ok(closeBounds.y + closeBounds.height <= panelBounds.y + panelBounds.height);
          await page.locator(".dialogue-menu-entries p").last().scrollIntoViewIfNeeded();
          await close.click({ timeout: 2000 });
          assert.equal(await page.locator(".dialogue-panel").count(), 0);
          assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.dialogue.current), null);
          assert.equal(await page.locator(".game-hud").count(), 1);
        }
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(async () => {
        await window.__comradeCandidateTest.game.changeScene("scene.chapter1.apartment");
      });
    });

    await t.test("Docheva's inline dialogue keeps every choice reachable in both languages", async () => {
      for (const viewport of [{ width: 1280, height: 720 }, { width: 640, height: 360 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const language of ["bg", "en"]) {
          await page.evaluate(async language => {
            const { game } = window.__comradeCandidateTest;
            await game.changeScene("scene.chapter1.village_square");
            game.setLanguage(language);
            game.inventory.add("item.unpaid_bills");
            game.dialogue.start("dialogue.penka_kiosk");
            game.renderUi();
          }, language);
          const requirement = await page.evaluate(() => window.__comradeCandidateTest.game.t("campaign.kiosk.choice.requirements"));
          await page.getByRole("button", { name: requirement, exact: true }).click();
          const choices = page.locator(".dialogue-choice-list button");
          assert.equal(await choices.count(), 3);
          for (let index = 0; index < await choices.count(); index++) {
            await choices.nth(index).scrollIntoViewIfNeeded();
            const panel = await page.locator(".dialogue-panel").boundingBox();
            const bounds = await choices.nth(index).boundingBox();
            assert.ok(bounds.y >= panel.y && bounds.y + bounds.height <= panel.y + panel.height,
              `clipped Docheva choice ${index} at ${viewport.width}, ${language}`);
          }
          const leave = await page.evaluate(() => window.__comradeCandidateTest.game.t("campaign.kiosk.choice.leave"));
          await page.getByRole("button", { name: leave, exact: true }).click();
          assert.equal(await page.locator(".dialogue-panel").count(), 0);
          await page.evaluate(() => window.__comradeCandidateTest.game.inventory.remove("item.unpaid_bills"));
        }
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(() => window.__comradeCandidateTest.game.changeScene("scene.chapter1.apartment"));
    });

    const beforeInterview = await page.evaluate(async () => {
      const { game } = window.__comradeCandidateTest;
      const find = (entries, id) => entries.find((entry) => entry.id === id);

      game.takeTarget(find(game.currentScene.interactables, "hotspot.apartment.unpaid_bills"));
      await game.changeScene("scene.chapter1.village_square");
      game.takeTarget(find(game.currentScene.interactables, "hotspot.square.empty_envelope"));
      game.useInventoryItemOnItem("item.unpaid_bills", "item.empty_envelope");

      const choose = (dialogueId, key) => {
        const choice = game.content.dialogues[dialogueId].nodes.start.choices.find(c => c.textKey === key);
        game.applyContentEffect(choice.effect);
      };
      choose("dialogue.penka_kiosk", "campaign.kiosk.choice.pamphlets");
      game.useInventoryItemOnTarget("item.campaign_pamphlets", find(game.currentScene.interactables, "hotspot.square.poster_board"));
      choose("dialogue.journalist", "registration.ask_evidence");
      await game.changeScene("scene.chapter1.mehana");
      choose("dialogue.mehana_waiter", "registration.kiro_receipt");
      await game.changeScene("scene.chapter1.village_square");
      game.useInventoryItemOnTarget("item.suspicious_receipt", find(game.currentScene.npcs, "npc.journalist"));
      await game.changeScene("scene.chapter1.municipality");
      game.useInventoryItemOnTarget("item.fake_diploma", find(game.currentScene.npcs, "npc.municipality_clerk"));
      await game.changeScene("scene.chapter1.mayor_office");
      game.applyContentEffect(game.content.dialogues["dialogue.mayor"].nodes.stack.choices[0].effect);
      await game.changeScene("scene.chapter1.municipality");
      game.useInventoryItemOnTarget("item.fake_diploma", find(game.currentScene.npcs, "npc.municipality_clerk"));
      await game.useTarget(find(game.currentScene.interactables, "hotspot.municipality.archive_cabinet"));
      game.inventory.add("item.accordion");
      const archiveTarget = id => find(game.currentScene.interactables, "hotspot.archive." + id);
      game.lookTarget(archiveTarget("handle"));
      game.useInventoryItemOnTarget("item.accordion", archiveTarget("handle"));
      game.lookTarget(archiveTarget("ledger"));
      game.takeTarget(archiveTarget("jar"));
      game.useInventoryItemOnTarget("item.pickle_jar", archiveTarget("ballot_box"));
      game.takeTarget(archiveTarget("ballot_box"));

      await game.changeScene("scene.chapter1.village_square");
      game.selectedVerb = "talk";
      game.performTargetAction(find(game.currentScene.npcs, "npc.journalist"));
      return {
        sceneId: game.currentScene.id,
        hasFakeDiploma: game.inventory.has("item.fake_diploma"),
        hasBallotBox: game.inventory.has("item.ballot_box"),
        completedQuests: [...game.state.completedQuests]
      };
    });
    assert.equal(beforeInterview.sceneId, "scene.chapter1.village_square");
    assert.equal(beforeInterview.hasFakeDiploma, true);
    assert.equal(beforeInterview.hasBallotBox, true);
    assert.ok(beforeInterview.completedQuests.includes("quest.chapter1.fake_diploma"));
    assert.ok(beforeInterview.completedQuests.includes("quest.chapter1.ballot_box"));

    const choices = page.locator(".dialogue-choice-list button");
    for (let step = 0; step < 4; step += 1) {
      await choices.first().click();
    }

    const gate = await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      const electionExit = game.currentScene.exits.find((entry) => entry.id === "exit.square.to_election_booth");
      return {
        journalistInterviewCompleted: game.state.journalistInterviewCompleted,
        journalistQuestCompleted: game.state.completedQuests.includes("quest.chapter1.journalist"),
        electionExitAvailable: game.targetAvailable(electionExit)
      };
    });
    assert.deepEqual(gate, {
      journalistInterviewCompleted: true,
      journalistQuestCompleted: true,
      electionExitAvailable: true
    });

    await page.evaluate(async () => {
      const { game } = window.__comradeCandidateTest;
      game.dialogue.close();
      await game.changeScene("scene.chapter1.election_booth");
      game.selectedVerb = "use";
      game.renderUi();
    });
    await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      const table = game.currentScene.interactables.find(
        (entry) => entry.id === "hotspot.election_booth.commission_table"
      );
      game.performTargetAction(table);
    });
    const electionChoice = async key => {
      const label = await page.evaluate(key => window.__comradeCandidateTest.game.t(key), key);
      await page.getByRole("button", { name: label, exact: true }).click();
    };
    await electionChoice("election.deliver");
    for (const objection of ["credentials", "evidence", "container"]) {
      await electionChoice("election.ask." + objection);
      await electionChoice("election.answer." + objection);
      await electionChoice("election.continue");
    }
    page.once("dialog", dialog => dialog.accept());
    await electionChoice("election.count");

    await page.locator('.ending-panel[data-ending-id="ending.chapter1.loss"]').waitFor();
    const saved = JSON.parse(await page.evaluate(() => (
      localStorage.getItem("comrade-candidate.save.v1")
    )));
    assert.equal(saved.chapter1Completed, true);
    assert.equal(saved.endingId, "ending.chapter1.loss");
    assert.equal(saved.currentSceneId, "scene.chapter1.election_booth");
    assert.equal(saved.ballotBoxDelivered, true);
    assert.equal(saved.inventory.includes("item.ballot_box"), false);
    assert.ok(saved.completedQuests.includes("quest.chapter1.main"));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.__comradeCandidateTest.ready);
    await page.locator('.ending-panel[data-ending-id="ending.chapter1.loss"]').waitFor();
    const restored = await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      return {
        sceneId: game.currentScene.id,
        endingId: game.state.endingId,
        chapter1Completed: game.state.chapter1Completed,
        ballotBoxDelivered: game.state.ballotBoxDelivered
      };
    });
    assert.deepEqual(restored, {
      sceneId: "scene.chapter1.election_booth",
      endingId: "ending.chapter1.loss",
      chapter1Completed: true,
      ballotBoxDelivered: true
    });
  } catch (error) {
    error.message += `\nDev server output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill("SIGTERM");
    await new Promise((resolve) => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
});

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

test("fresh Chapter 1 journeys reach all three endings through real clicks in Bulgarian and English", { timeout: 600_000 }, async (t) => {
  if (!browserAvailable(t, chromium.executablePath())) return;
  const port = await availablePort();
  const server = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: projectRoot, env: { ...process.env, PORT: String(port) }, stdio: "ignore"
  });
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    browser = await chromium.launch({ headless: true });
    for (const language of ["bg", "en"]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const imageNetwork = observeImageRequests(page);
      await page.goto(`http://127.0.0.1:${port}/?play=1&testHarness=1`);
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      // Language is setup; all progression below uses normal mouse input.
      await page.evaluate(language => window.__comradeCandidateTest.game.setLanguage(language), language);
      const waitFor = (predicate) => page.waitForFunction(predicate, undefined, { timeout: 25_000 });
      const verb = name => selectVerb(page, name);
      const clickTarget = id => clickSceneTarget(page, id);
      await clickTarget("hotspot.apartment.tv");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.chapter1OpeningHeard);
      await verb("take");
      await clickTarget("hotspot.apartment.unpaid_bills");
      await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.unpaid_bills"));
      await waitFor(() => !window.__comradeCandidateTest.game.player.actionSequence);
      await clickTarget("hotspot.apartment.accordion");
      await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.accordion"));
      await waitFor(() => !window.__comradeCandidateTest.game.player.actionSequence);
      await clickTarget("exit.apartment.to_square");
      await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.village_square");
      await verb("talk");
      await clickTarget("hotspot.square.kiosk");
      await page.locator(".dialogue-panel").waitFor({ timeout: 25_000 });
      const handover = await page.evaluate(() => window.__comradeCandidateTest.game.t("campaign.kiosk.choice.give_bills"));
      await page.getByRole("button", { name: handover, exact: true }).click();
      await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.campaign_pamphlets"));
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventory.has("item.unpaid_bills")), false);
      const pamphletIcon = page.locator('[data-item-id="item.campaign_pamphlets"] img');
      await waitForLoadedImage(page, '[data-item-id="item.campaign_pamphlets"] img', { network: imageNetwork });
      assert.equal(await pamphletIcon.isVisible(), true);
      assert.equal(await pamphletIcon.evaluate(image => image.complete && image.naturalWidth > 0), true);
      await page.mouse.move(0, 0);
      const posterBefore = await page.screenshot({ clip: { x: 1090, y: 255, width: 85, height: 160 } });
      await page.locator('[data-item-id="item.campaign_pamphlets"]').click();
      const use = await page.evaluate(() => window.__comradeCandidateTest.game.t("ui.inventory.use"));
      await page.locator(".inventory-item-actions").getByRole("button", { name: use, exact: true }).click();
      await clickTarget("hotspot.square.poster_board");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.campaignPosted);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.flags.campaignPosted), true);
      await page.mouse.move(0, 0);
      assert.notDeepEqual(await page.screenshot({ clip: { x: 1090, y: 255, width: 85, height: 160 } }), posterBefore);

      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventory.has("item.campaign_pamphlets")), false);
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventory.has("item.fake_diploma")), true);
      await verb("look");
      await clickTarget("hotspot.square.poster_board");
      await waitFor(() => {
        const { game } = window.__comradeCandidateTest;
        return game.message === game.t("campaign.poster.posted");
      });
      const choice = async key => {
        await page.locator(".dialogue-panel").waitFor({ timeout: 25_000 });
        const label = await page.evaluate(key => window.__comradeCandidateTest.game.t(key), key);
        await page.getByRole("button", { name: label, exact: true }).click();
      };
      const talk = async id => { await verb("talk"); await clickTarget(id); };
      const go = async (id, destination) => {
        await clickTarget(id);
        await page.waitForFunction(id => window.__comradeCandidateTest.game.currentScene.id === id, destination);
      };
      await talk("npc.journalist");
      await choice("registration.ask_evidence");
      await choice("registration.leave");
      await go("exit.square.to_mehana", "scene.chapter1.mehana");
      await talk("npc.mehana_waiter");
      await choice("registration.kiro_receipt");
      await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.suspicious_receipt"));
      await go("exit.mehana.to_square", "scene.chapter1.village_square");
      await talk("npc.journalist");
      await choice("registration.give_receipt");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.journalistInOffice);
      await page.reload();
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      await go("exit.square.to_municipality", "scene.chapter1.municipality");
      await talk("npc.municipality_clerk");
      await choice("registration.present");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.municipalityCredentialsAccepted);
      await go("exit.municipality.to_mayor_office", "scene.chapter1.mayor_office");
      assert.equal(await page.evaluate(() => {
        const g = window.__comradeCandidateTest.game;
        return g.targetAvailable(g.currentScene.npcs.find(n => n.id === "npc.journalist"));
      }), true);
      await talk("npc.mayor");
      for (const key of ["registration.confront", "registration.listen", "registration.stay_candidate", "registration.watch_stamp"]) await choice(key);
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.mayorDiplomaStamped);
      assert.equal(await page.evaluate(() => Boolean(window.__comradeCandidateTest.game.state.flags.candidateRegistrationStamped)), false);
      await choice("registration.leave");
      await page.reload();
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      await go("exit.mayor_office.to_municipality", "scene.chapter1.municipality");
      await talk("npc.municipality_clerk");
      await choice("registration.present");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.candidateRegistrationStamped);
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.completedQuests.includes("quest.chapter1.fake_diploma")), true);

      await talk("npc.municipality_clerk");
      await page.locator(".dialogue-panel").waitFor({ timeout: 25_000 });
      assert.ok((await page.locator(".dialogue-speech-bubble").textContent()).includes(
        await page.evaluate(() => window.__comradeCandidateTest.game.t("archive.clerk_location"))));
      await choice("registration.leave");
      await verb("use");
      await clickTarget("hotspot.municipality.archive_cabinet");
      await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.archive");
      await verb("look");
      await clickTarget("hotspot.archive.handle");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.archiveHandleInspected);
      const useItem = async id => {
        await page.locator('[data-item-id="' + id + '"]').click();
        await page.locator(".inventory-item-actions").getByRole("button", { name: use, exact: true }).click();
      };
      await useItem("item.accordion");
      await clickTarget("hotspot.archive.handle");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.archiveOpened);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      await verb("take");
      await clickTarget("hotspot.archive.ballot_box");
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.inventory.has("item.ballot_box")), false);
      await verb("look");
      await clickTarget("hotspot.archive.ledger");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.archiveLedgerRead);
      await verb("take");
      await clickTarget("hotspot.archive.jar");
      await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.pickle_jar"));
      await useItem("item.pickle_jar");
      await clickTarget("hotspot.archive.ballot_box");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.archiveJarPlaced);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      await verb("take");
      await clickTarget("hotspot.archive.ballot_box");
      await waitFor(() => window.__comradeCandidateTest.game.state.flags.ballotBoxRecovered);
      assert.deepEqual(await page.evaluate(() => {
        const { game } = window.__comradeCandidateTest;
        return [game.inventory.has("item.ballot_box"), game.inventory.has("item.pickle_jar"), game.inventory.has("item.accordion"),
          game.state.completedQuests.includes("quest.chapter1.ballot_box")];
      }), [true, false, true, true]);
      const back = await page.evaluate(() => window.__comradeCandidateTest.game.t("archive.back"));
      assert.equal(await page.getByRole("button", { name: back, exact: true }).count(), 0);
      await clickTarget("exit.archive.to_municipality");
      await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.municipality");
      await go("exit.municipality.to_square", "scene.chapter1.village_square");
      await talk("npc.journalist");
      for (let step = 0; step < 4; step++) await page.locator(".dialogue-choice-list button").first().click();
      await waitFor(() => window.__comradeCandidateTest.game.state.journalistInterviewCompleted);
      await choice("dialogue.journalist.choice.leave");
      await go("exit.square.to_election_booth", "scene.chapter1.election_booth");
      await verb("use");
      await clickTarget("hotspot.election_booth.commission_table");
      await choice("election.deliver");
      for (const objection of ["container", "credentials", "evidence"]) {
        await choice("election.ask." + objection);
        await choice("election.answer." + objection);
        await choice("election.continue");
      }
      // Cancel final commitment, reload the completed objections, and leave freely.
      page.once("dialog", dialog => dialog.dismiss());
      await choice("election.count");
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.chapter1Completed), false);
      await page.reload();
      await page.evaluate(() => window.__comradeCandidateTest.ready);
      assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.flags.electionContainerAnswered), true);
      const finish = async expected => {
        await verb("use");
        await clickTarget("hotspot.election_booth.commission_table");
        page.once("dialog", dialog => dialog.accept());
        await choice("election.count");
        await page.locator('.ending-panel[data-ending-id="ending.chapter1.' + expected + '"]').waitFor();
        await page.reload();
        await page.evaluate(() => window.__comradeCandidateTest.ready);
        await page.locator('.ending-panel[data-ending-id="ending.chapter1.' + expected + '"]').waitFor();
        await choiceEndingContinue(page);
        await choiceEndingContinue(page);
        assert.ok((await page.locator(".ending-epilogue").textContent()).includes(
          await page.evaluate(() => window.__comradeCandidateTest.game.t("election.epilogue.creditors"))));
      };
      if (language === "bg") {
        await finish("loss");
      } else {
        await go("exit.election_booth.to_square", "scene.chapter1.village_square");
        await talk("npc.baba_stoyanka");
        await choice("dialogue.baba.choice.ask_vote");
        await choice("dialogue.baba.choice.leave");
        await verb("look");
        await clickTarget("hotspot.square.fountain");
        await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainDiagnosed);
        await go("exit.square.to_mehana", "scene.chapter1.mehana");
        await verb("take");
        await clickTarget("hotspot.mehana.oil");
        await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.sunflower_oil"));
    await page.locator(".received-item-screen > button:last-child").click();
        await go("exit.mehana.to_square", "scene.chapter1.village_square");
        await useItem("item.sunflower_oil");
        await clickTarget("hotspot.square.fountain");
        await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainValveOiled);
        await verb("use");
        await clickTarget("hotspot.square.fountain");
        await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainRepaired);
        await talk("npc.baba_stoyanka");
        await choice("fountain.baba.choice.report");
        await waitFor(() => window.__comradeCandidateTest.game.state.babaStoyankaVote);
        await go("exit.square.to_election_booth", "scene.chapter1.election_booth");
        // Branch from an actually earned save; no quest/meter injection.
        const oneSupporterSave = await page.evaluate(() => localStorage.getItem("comrade-candidate.save.v1"));
        await finish("narrow_win");
        await page.evaluate(raw => localStorage.setItem("comrade-candidate.save.v1", raw), oneSupporterSave);
        await page.reload();
        await page.evaluate(() => window.__comradeCandidateTest.ready);
        await go("exit.election_booth.to_square", "scene.chapter1.village_square");
        await go("exit.square.to_mehana", "scene.chapter1.mehana");
        await talk("npc.tony_fridge");
        for (const key of ["dialogue.tony.choice.challenge", "dialogue.tony.choice.accept", "dialogue.tony.choice.prepare"]) await choice(key);
        await verb("take");
        await clickTarget("hotspot.mehana.water_jug");
        await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.glass_of_water"));
        await useItem("item.accordion");
        await clickTarget("npc.tony_fridge");
        await waitFor(() => window.__comradeCandidateTest.game.state.flags.tonyDistracted);
        await useItem("item.glass_of_water");
        await clickTarget("hotspot.mehana.bai_mitko_rakia_glass");
        await waitFor(() => window.__comradeCandidateTest.game.state.swappedOwnRakiaWithWater);
        await talk("npc.tony_fridge");
        await choice("dialogue.tony.choice.finish_challenge");
        await choice("dialogue.tony.choice.leave");
        await go("exit.mehana.to_square", "scene.chapter1.village_square");
        await go("exit.square.to_election_booth", "scene.chapter1.election_booth");
        await finish("convincing_win");
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill("SIGTERM");
    await new Promise(resolve => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
});

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test("fountain repair supports real clicks, consumed-oil recovery and mid-puzzle reloads", { timeout: 120_000 }, async (t) => {
  if (!browserAvailable(t, chromium.executablePath())) return;
  const port = await availablePort();
  const server = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: projectRoot, env: { ...process.env, PORT: String(port) }, stdio: "ignore"
  });
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}/`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
    await page.goto(`http://127.0.0.1:${port}/?play=1&testHarness=1`);
    await page.evaluate(() => window.__comradeCandidateTest.ready);
    const waitFor = predicate => page.waitForFunction(predicate, undefined, { timeout: 25_000 });
    const click = id => clickSceneTarget(page, id);
    const verb = name => selectVerb(page, name);
    const choice = async key => {
      const label = await page.evaluate(key => window.__comradeCandidateTest.game.t(key), key);
      await page.locator(".dialogue-choice-list").getByRole("button", { name: label, exact: true }).click();
    };
    const oilAction = async key => {
      await page.locator('[data-item-id="item.sunflower_oil"]').click();
      const label = await page.evaluate(key => window.__comradeCandidateTest.game.t(key), key);
      await page.locator(".inventory-item-actions").getByRole("button", { name: label, exact: true }).click();
    };
    await click("exit.apartment.to_square");
    await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.village_square");
    await verb("talk");
    await click("npc.baba_stoyanka");
    await choice("dialogue.baba.choice.ask_vote");
    await choice("dialogue.baba.choice.leave");
    await verb("look");
    await click("hotspot.square.fountain");
    await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainDiagnosed);
    await verb("talk");
    await click("hotspot.square.old_men_bench");
    await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainOilClue);
    await click("exit.square.to_mehana");
    await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.mehana");
    await verb("take");
    await click("hotspot.mehana.oil");
    await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.sunflower_oil"));
    await page.locator(".received-item-screen > button:last-child").click();
    await oilAction("ui.inventory.use_on_self");
    await waitFor(() => !window.__comradeCandidateTest.game.inventory.has("item.sunflower_oil"));
    await verb("talk");
    await click("npc.mehana_waiter");
    await choice("fountain.kiro.choice.refill");
    await waitFor(() => window.__comradeCandidateTest.game.inventory.has("item.sunflower_oil"));
    await page.locator(".received-item-screen > button:last-child").click();
    await click("exit.mehana.to_square");
    await waitFor(() => window.__comradeCandidateTest.game.currentScene.id === "scene.chapter1.village_square");
    await oilAction("ui.inventory.use");
    await click("hotspot.square.fountain");
    await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainValveOiled);
    await page.reload();
    await page.evaluate(() => window.__comradeCandidateTest.ready);
    assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.flags.fountainValveOiled), true);
    assert.equal(await page.evaluate(() => window.__comradeCandidateTest.game.state.babaStoyankaVote), false);
    const waterClip = { x: 670, y: 166, width: 45, height: 85 };
    const before = await page.screenshot({ clip: waterClip });
    await verb("use");
    await click("hotspot.square.fountain");
    await waitFor(() => window.__comradeCandidateTest.game.state.flags.fountainRepaired);
    // A new animation frame makes the restored/stateful water effect observable.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const visible = await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      return game.renderer.sceneLayerVisible(game.currentScene.effects[0]);
    });
    assert.equal(visible, true);
    assert.notDeepEqual(await page.screenshot({ clip: waterClip }), before);
    await verb("talk");
    await click("npc.baba_stoyanka");
    await choice("fountain.baba.choice.report");
    await waitFor(() => window.__comradeCandidateTest.game.state.babaStoyankaVote);
    await page.reload();
    await page.evaluate(() => window.__comradeCandidateTest.ready);
    const saved = await page.evaluate(() => {
      const { game } = window.__comradeCandidateTest;
      return { repaired: game.state.flags.fountainRepaired, vote: game.state.babaStoyankaVote,
        influence: game.state.influence, completed: game.state.completedQuests.includes("quest.chapter1.baba_vote") };
    });
    assert.deepEqual(saved, { repaired: true, vote: true, influence: 15, completed: true });
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill("SIGTERM");
    await new Promise(resolve => {
      if (server.exitCode !== null) resolve();
      else server.once("exit", resolve);
    });
  }
});

async function selectVerb(page, name) {
        const label = await page.evaluate(name => window.__comradeCandidateTest.game.t(`verb.${name}`), name);
        for (let step = 0; step < 4; step++) {
          if ((await page.locator(".hud-verb").textContent()) === label) return;
          await page.locator(".hud-verb").click();
        }
        assert.fail(`Could not select ${name}`);
}
async function clickSceneTarget(page, id) {
        // Inspect hit geometry to choose an unobstructed point; do not invoke actions.
        const point = await page.evaluate(async id => {
          const { game } = window.__comradeCandidateTest;
          const { findTargetAt } = await import("/src/engine/SceneGeometry.js");
          const candidates = [];
          for (let y = 80; y < (id === "exit.archive.to_municipality" ? 660 : 580); y += 8) {
            for (let x = 16; x < 1260; x += 8) {
              if (findTargetAt(game.currentScene, { x, y }, target => game.targetAvailable(target))?.id === id) candidates.push({ x, y });
            }
          }
          if (!candidates.length) throw new Error(`No exposed click target: ${id}`);
          return candidates[Math.floor(candidates.length / 2)];
        }, id);
        await page.locator("#game").click({ position: point });
}

async function choiceEndingContinue(page) {
  const label = await page.evaluate(() => window.__comradeCandidateTest.game.t("election.continue"));
  await page.locator(".ending-panel").getByRole("button", { name: label, exact: true }).click();
}
