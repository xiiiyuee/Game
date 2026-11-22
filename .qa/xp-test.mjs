import puppeteer from "puppeteer-core";

const CHROME = "/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome";
const URL = "file:///tmp/qa/sstest/index.html";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction("window.__SS__", { timeout: 10000 });
await page.evaluate(() => window.__SS__.startGame("pulse"));

const r = await page.evaluate(() => {
  const S = window.__SS__;
  S.state = "paused";
  const p = S.player;
  const reset = () => {
    p.level = 1;
    p.xp = 0;
    p.xpNeed = S.CFG.XP.BASE;
    p.pendingLevels = 0;
  };
  reset();
  const base = p.xpNeed;
  S.gainXpFor(p, 60);
  const after60 = { level: p.level, xp: p.xp, need: p.xpNeed, pending: p.pendingLevels };
  reset();
  S.gainXpFor(p, 100);
  const after100 = { level: p.level, xp: p.xp, need: p.xpNeed, pending: p.pendingLevels };
  reset();
  S.gainXpFor(p, 300);
  const after300 = { level: p.level, xp: p.xp, need: p.xpNeed, pending: p.pendingLevels };
  let need = base;
  for (let i = 1; i < 20; i++) need = Math.round(need * S.CFG.XP.GROWTH);
  return { base, growth: S.CFG.XP.GROWTH, after60, after100, after300, level20Need: need };
});

await browser.close();

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info ? " :: " + JSON.stringify(info) : "")); }
};

ok("1 级需求为 16", r.base === 16, r.base);
ok("60 经验只到 3 级", r.after60.level === 3, r.after60);
ok("100 经验只到 5 级", r.after100.level === 5, r.after100);
ok("300 经验只到 8 级", r.after300.level === 8, r.after300);
ok("升级需求递增", r.after100.need > r.after60.need && r.after60.need > r.base, r);
ok("20 级需求接近原曲线（<5400）", r.level20Need < 5400, r.level20Need);
ok("无页面报错", errors.length === 0, errors);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
