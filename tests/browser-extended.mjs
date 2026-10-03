import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import AxeBuilder from "@axe-core/playwright";
const browser = await chromium.launch({ channel: "chrome" }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  }),
  page = await context.newPage();
const proof = {
  date: new Date().toISOString(),
  browser: browser.version(),
  checks: [],
};
try {
  await page.goto("http://127.0.0.1:4190/seo-migration-review-demo/");
  await page.waitForFunction(
    () => !document.querySelector("#example").disabled,
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "Aller à l’outil",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "example");
  await page.keyboard.press("Enter");
  await page.locator("#results").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "results-heading",
  );
  proof.checks.push("keyboard skip, example activation, result heading focus");
  await page.locator("#personal").click();
  await page.waitForFunction(() =>
    document.querySelector("#startup").textContent.includes("Importez"),
  );
  const upload = async (kind, text) => {
    await page
      .locator("#" + kind + "-file")
      .setInputFiles({
        name: kind + ".csv",
        mimeType: "text/csv",
        buffer: Buffer.from(text),
      });
    await page
      .locator("#" + kind + "-preview select")
      .first()
      .waitFor();
  };
  await upload("plan", "source_url;decision;target_url\n/a;redirect;/b");
  await page.locator("#source-base").fill("https://old.example/");
  await page.locator("#target-base").fill("https://new.example/");
  await page.locator("#resolve").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#resolved")
      .textContent.includes("https://old.example/a"),
  );
  assert.match(
    await page.locator("#resolved").innerText(),
    /https:\/\/new.example\/b/,
  );
  await page.locator("#plan-confirmed").check();
  await page.locator("#analyze").click();
  await page.locator("#results").waitFor({ state: "visible" });
  assert.match(await page.locator("#metrics").innerText(), /Plan seul/);
  proof.checks.push("relative bases preview and plan-only analysis");
  await upload("inventory", "url;clicks\n/a;0\n/a;50");
  await page.locator("#inventory-confirmed").check();
  await page.locator("#analyze").click();
  await page.locator("#results").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#metric-note").innerText(),
    /Non calculable/,
  );
  assert.equal(await page.locator("#partial").isVisible(), true);
  proof.checks.push("duplicate inventory blocks percentages");
  await page
    .locator("#plan-file")
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([0xc3, 0x28]),
    });
  await page.waitForFunction(() => !document.querySelector("#errors").hidden);
  assert.match(await page.locator("#errors").innerText(), /UTF-8/);
  assert.equal(await page.locator("#results").isVisible(), false);
  proof.checks.push("invalid encoding and stale report");
  await upload("plan", "source_url;decision\n/a;keep");
  await page.locator("#plan-confirmed").check();
  await upload("inventory", "url;clicks\n/a;0\n/b;inconnu");
  await page.locator("#inventory-confirmed").check();
  await page.locator("#analyze").click();
  await page.locator("#results").waitFor({ state: "visible" });
  assert.match(await page.locator("#metrics").innerText(), /50 %/);
  assert.match(await page.locator("#metrics").innerText(), /Non calculable/);
  proof.checks.push("zero denominator and unknown clicks");
  await upload("inventory", "url;clicks\n/a;1\n/b;2;extra");
  await page.locator("#inventory-confirmed").check();
  await page.locator("#analyze").click();
  await page.locator("#results").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#metric-note").innerText(),
    /Non calculable/,
  );
  assert.match(await page.locator("#inventory-preview").innerText(), /erreur/);
  proof.checks.push("parsing error retains preview and partial analysis");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  proof.importAxe = {
    violations: axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    incomplete: axe.incomplete.map((v) => v.id),
  };
  assert.equal(axe.violations.length, 0);
  const plan =
    "source_url;decision;target_url;planned_status;reason\n" +
    Array.from(
      { length: 50000 },
      (_, i) =>
        `https://volume.example/p${i};redirect;https://volume.example/p${i + 1};301;`,
    ).join("\n");
  const inv =
    "url;clicks\n" +
    Array.from(
      { length: 50000 },
      (_, i) => `https://volume.example/p${i};1`,
    ).join("\n");
  await page.evaluate(() => {
    window.__beats = [];
    window.__beat = setInterval(
      () => window.__beats.push(performance.now()),
      16,
    );
  });
  const t = performance.now();
  await upload("plan", plan);
  await page.locator("#plan-confirmed").check();
  await upload("inventory", inv);
  await page.locator("#inventory-confirmed").check();
  await page.locator("#analyze").click();
  await page.locator("#results").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() =>
    document.querySelector("#page-info").textContent.includes("résultat"),
  );
  const elapsed = performance.now() - t;
  const heartbeat = await page.evaluate(() => {
    clearInterval(window.__beat);
    const b = window.__beats;
    return {
      ticks: b.length,
      maxGap: Math.max(...b.slice(1).map((x, i) => x - b[i])),
    };
  });
  assert.match(await page.locator("#metrics").innerText(), /100 %/);
  proof.volume = {
    recordsPerFile: 50000,
    elapsedIncludingAutomationMs: elapsed,
    heartbeat,
  };
  proof.checks.push("browser 50k+50k, 50k-hop chain, interface heartbeat");
  await page.locator("#table-view").selectOption("plan");
  await page.waitForFunction(
    () =>
      document.querySelector("#page-info").textContent.includes("2 000") ||
      document.querySelector("#page-info").textContent.includes("2000"),
  );
  await page.locator("#next").click();
  await page.waitForFunction(() =>
    document.querySelector("#page-info").textContent.includes("page 2 /"),
  );
  proof.checks.push("pagination 50 000 rows");
  proof.result = "passed";
} catch (e) {
  proof.result = "failed";
  proof.failure = e.stack;
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    "evidence/browser-extended.json",
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
  await browser.close();
}
