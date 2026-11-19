import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browserAvailable } from "./helpers/browser-availability.js";

test("available Chromium runs in local and strict environments without skipping", () => {
  for (const env of [{}, { CI: "true" }, { BAIM_REQUIRE_BROWSER_TESTS: "1" }]) {
    assert.equal(browserAvailable({ skip: () => assert.fail("unexpected skip") }, "/browser", { env, exists: () => true }), true);
  }
});
test("missing Chromium fails in CI or explicitly required mode without skipping", () => {
  for (const env of [{ CI: "true" }, { CI: "1" }, { BAIM_REQUIRE_BROWSER_TESTS: "1" }, { BAIM_REQUIRE_BROWSER_TESTS: "true" }]) {
    assert.throws(() => browserAvailable({ skip: () => assert.fail("unexpected skip") }, "/missing", { env, exists: () => false }), /Required browser tests cannot run/);
  }
});
test("optional local missing Chromium produces an explicit skip", () => {
  let reason;
  assert.equal(browserAvailable({ skip: value => { reason = value; } }, "/missing", { env: { CI: "false" }, exists: () => false }), false);
  assert.match(reason, /Playwright Chromium is not installed/);
});
test("CI pins the matching browser image, launches Chromium before tests, and retains strict guards", () => {
  const workflow = readFileSync(".github/workflows/test.yml", "utf8");
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.match(workflow, /node-version: 22/);
  const locked = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages['node_modules/playwright'].version;
  const image = workflow.match(/mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble@sha256:[a-f0-9]{64}/);
  assert.ok(image, 'official browser image must be digest-pinned');
  assert.equal(image[1], locked, 'container and package lock versions must match');
  assert.match(workflow, /options: --ipc=host/);
  assert.doesNotMatch(workflow, /playwright install --with-deps/);
  const launch = workflow.indexOf('await chromium.launch({ headless: true })');
  assert.ok(launch >= 0 && launch < workflow.indexOf('- run: npm test'));
  assert.match(workflow, /Playwright image\/package version mismatch/);
  assert.match(workflow, /BAIM_REQUIRE_BROWSER_TESTS: "1"/);
  const smoke = readFileSync("test/browser-smoke.test.js", "utf8");
  assert.equal((smoke.match(/if \(!browserAvailable\(t, chromium.executablePath\(\)\)\) return;/g) || []).length, 3);
  assert.doesNotMatch(smoke, /t\.skip\(/);
});
