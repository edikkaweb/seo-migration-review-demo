import { chromium, firefox } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const base =
  process.env.TEST_URL || "http://127.0.0.1:4190/seo-migration-review-demo/";
const evidence = {
  date: new Date().toISOString(),
  os: os.platform() + " " + os.release(),
  node: process.version,
  url: base,
  engines: [],
};
await fs.mkdir("evidence", { recursive: true });
const waitResult = (p) => p.locator("#results").waitFor({ state: "visible" });
const upload = async (p, selector, name, text) =>
  p
    .locator(selector)
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
for (const [name, type, options] of [
  ["chromium", chromium, process.env.CI ? {} : { channel: "chrome" }],
  ["firefox", firefox, {}],
].filter(([n]) => !process.env.ENGINE || process.env.ENGINE === n)) {
  let browser;
  const receipt = {
    name,
    checks: [],
    errors: [],
    network: [],
    screenshots: [],
  };
  evidence.engines.push(receipt);
  try {
    browser = await type.launch({ headless: true, ...options });
    receipt.version = browser.version();
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      acceptDownloads: true,
    });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => receipt.errors.push(e.message));
    await p.goto(base, { waitUntil: "domcontentloaded" }).catch(async (e) => {
      if (!e.message.includes("interrupted by another navigation")) throw e;
      await p.waitForURL(base);
    });
    await p.locator("#example").waitFor({ state: "visible" });
    await p.waitForFunction(() => !document.querySelector("#example").disabled);
    await p.screenshot({
      path: `evidence/${name}-initial.png`,
      fullPage: true,
    });
    receipt.screenshots.push(`${name}-initial.png`);
    await p.locator("#example").click();
    await waitResult(p);
    assert.match(await p.locator("#metrics").innerText(), /86 %/);
    assert.match(await p.locator("#metrics").innerText(), /31 %/);
    assert.equal(await p.locator("#result-body tr").count(), 14);
    assert.match(await p.locator("#result-body tr").first().innerText(), /500/);
    receipt.checks.push("example 86/14/31, priority order");
    await p.locator("#search").fill("page-100");
    await p.waitForFunction(
      () => document.querySelectorAll("#result-body tr").length === 1,
    );
    assert.match(await p.locator("#metrics").innerText(), /86 %/);
    await p.locator("#search").fill("");
    await p.locator("#complete").click();
    await waitResult(p);
    await p.waitForFunction(() =>
      document.querySelector("#metrics").textContent.includes("100 %"),
    );
    assert.match(await p.locator("#result-body").innerText(), /Aucun résultat/);
    receipt.checks.push("filters independent of totals; completed corpus");
    await p.locator("#anomalies").click();
    await waitResult(p);
    await p.waitForFunction(() =>
      document.querySelector("#active-files").textContent.includes("anomalies"),
    );
    await p.locator("#table-view").selectOption("findings");
    await p.locator("#search").fill("GRAPH_CYCLE");
    await p.waitForFunction(() =>
      document
        .querySelector("#result-body")
        .textContent.includes("GRAPH_CYCLE"),
    );
    receipt.checks.push("anomaly corpus");
    await p.locator("#personal").click();
    await p.waitForFunction(() =>
      document.querySelector("#startup").textContent.includes("Importez"),
    );
    await p.locator("#analyze").click();
    assert.equal(
      await p.locator("#errors").evaluate((e) => document.activeElement === e),
      true,
    );
    receipt.checks.push("missing plan error summary focused");
    const allRequests = [];
    p.on("request", (req) => allRequests.push(req.url()));
    const sentinelPlan =
      'old;new;note;note\r\nhttps://sentinel.invalid/a;https://new.sentinel.invalid/a;"<img src=""https://leak.invalid/pixel"">";"=HYPERLINK(""https://leak.invalid"")"\r\nhttps://sentinel.invalid/b;https://new.sentinel.invalid/b;normal;normal';
    const sentinelInventory =
      "Pages;Clics\nhttps://sentinel.invalid/a;10\nhttps://sentinel.invalid/b;20\nhttps://sentinel.invalid/missing;70";
    async function personalRun(offline = false) {
      await upload(p, "#plan-file", "plan-sentinelle.csv", sentinelPlan);
      await p.locator("#plan-source_url").waitFor();
      await p.locator("#plan-source_url").selectOption("0");
      await p.locator("#plan-target_url").selectOption("1");
      await p.locator("#plan-confirmed").check();
      await upload(
        p,
        "#inventory-file",
        "inventaire-sentinelle.csv",
        sentinelInventory,
      );
      await p.locator("#inventory-url").waitFor();
      await p.locator("#inventory-confirmed").check();
      await p.locator("#analyze").click();
      await waitResult(p);
      await p.waitForFunction(() =>
        document
          .querySelector("#active-files")
          .textContent.includes("plan-sentinelle"),
      );
      assert.match(await p.locator("#metrics").innerText(), /66,67 %/);
      assert.match(await p.locator("#metrics").innerText(), /70 %/);
      assert.equal(await p.locator("img").count(), 0);
      assert.equal(await p.locator('a[href*="sentinel"]').count(), 0);
      for (const kind of ["plan", "unresolved", "manifest"]) {
        const dp = p.waitForEvent("download");
        await p.locator("#export-" + kind).click();
        const d = await dp;
        const target = `evidence/${name}-${offline ? "offline-" : ""}${d.suggestedFilename()}`;
        await d.saveAs(target);
        const text = await fs.readFile(target, "utf8");
        if (kind === "plan") {
          assert(text.includes("'=HYPERLINK"));
          assert(text.includes("<img src="));
        }
        if (kind === "unresolved")
          assert(text.includes("sentinel.invalid/missing"));
      }
      const storage = await p.evaluate(async () => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
        databases: await indexedDB.databases(),
        serviceWorkers: (await navigator.serviceWorker.getRegistrations())
          .length,
      }));
      assert.deepEqual(storage, {
        local: [],
        session: [],
        databases: [],
        serviceWorkers: 0,
      });
      assert.deepEqual(await ctx.cookies(), []);
      receipt.checks.push(
        offline
          ? "offline import, mapping, analysis, 3 exports, no persistent storage"
          : "online sentinel import, mapping, analysis, 3 exports, no injected HTML or persistent storage",
      );
    }
    await personalRun();
    assert.equal(allRequests.length, 0);
    await p
      .locator("#plan-file")
      .setInputFiles({
        name: "nouveau.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "source_url;decision\nhttps://sentinel.invalid/a;keep",
        ),
      });
    await p.waitForFunction(
      () => document.querySelector("#stale").hidden === false,
    );
    assert.equal(await p.locator("#results").isVisible(), false);
    receipt.checks.push("changed input invalidates report");
    await ctx.setOffline(true);
    await personalRun(true);
    assert.equal(allRequests.length, 0);
    receipt.network = allRequests;
    await p.locator("#reset").click();
    await p.waitForFunction(() =>
      document.querySelector("#startup").textContent.includes("Réinitialisé"),
    );
    assert.equal(await p.locator("#results").isVisible(), false);
    assert.equal(await p.locator("#plan-file").inputValue(), "");
    assert.equal(await p.locator("body").textContent().then(t=>t.includes("sentinel.invalid")), false);
    assert.equal(await p.locator("#active-files").textContent(), "");
    receipt.checks.push("reset clears inputs/report without request");
    await ctx.setOffline(false);
    await p.locator("#example").click();
    await waitResult(p);
    const axe = await new AxeBuilder({ page: p })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    receipt.axe = {
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
      incomplete: axe.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
      passes: axe.passes.length,
    };
    assert.equal(axe.violations.length, 0);
    await p.screenshot({
      path: `evidence/${name}-results.png`,
      fullPage: true,
    });
    receipt.screenshots.push(`${name}-results.png`);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.screenshot({ path: `evidence/${name}-mobile.png`, fullPage: true });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.setViewportSize({ width: 320, height: 800 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    receipt.checks.push("390 and 320 CSS px no document overflow");
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.locator("#complete").click();
    await waitResult(p);
    receipt.checks.push("reduced motion path");
    const nj = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 1280, height: 900 },
    });
    const np = await nj.newPage();
    await np.goto(base);
    assert.match(await np.locator("#intro-example").innerText(), /86 %/);
    assert.match(
      await np.locator("noscript").innerText(),
      /nécessitent JavaScript/,
    );
    for (const a of await np.locator("a[download]").all()) {
      const url = new URL(await a.getAttribute("href"), base).href;
      const response = await np.request.get(url);
      assert.equal(response.status(), 200);
    }
    receipt.checks.push(
      "no-JS initial numbers and 6 downloads under subdirectory",
    );
    await nj.close();
    assert.deepEqual(receipt.errors, []);
    receipt.result = "passed";
  } catch (e) {
    receipt.result = "failed";
    receipt.failure = e.stack;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await fs.writeFile(
      "evidence/browser.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(
      name,
      receipt.result,
      receipt.failure?.split("\n").slice(0, 4).join("\n") ||
        receipt.checks.length + " checks",
    );
  }
}
