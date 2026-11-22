import puppeteer from "puppeteer-core";

const CHROME = "/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome";
const URL = "file:///tmp/qa/sstest/index.html";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction("window.__SS__", { timeout: 10000 });
await page.evaluate(() => window.__SS__.startGame("pulse"));
await new Promise((r) => setTimeout(r, 1500));
const after = await page.evaluate(() => ({
  state: window.__SS__.state,
  enemies: window.__SS__.enemies.length,
}));
await browser.close();
console.log(JSON.stringify({ after, errors }));
const ok = after.state === "playing" && after.enemies > 0 && errors.length === 0;
console.log(ok ? "SMOKE PASS" : "SMOKE FAIL");
process.exit(ok ? 0 : 1);
