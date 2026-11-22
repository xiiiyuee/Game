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
  const sample = (lv, n) => {
    const c = {};
    for (let i = 0; i < n; i++) {
      const k = S.rollRarity({ level: lv }).key;
      c[k] = (c[k] || 0) + 1;
    }
    const pct = (k) => (c[k] || 0) / n * 100;
    return { epic: pct("epic"), legend: pct("legend"), high: pct("epic") + pct("legend") };
  };
  const weightHigh = (lv) => {
    const l = S.rarityWeights({ level: lv });
    const t = l.reduce((a, b) => a + b.w, 0);
    const h = l.filter((x) => x.r.key === "epic" || x.r.key === "legend").reduce((a, b) => a + b.w, 0);
    return h / t * 100;
  };
  return {
    early: sample(1, 20000),
    mid: sample(10, 20000),
    late: sample(30, 20000),
    curve: [1, 8, 16, 24].map(weightHigh),
  };
});

await browser.close();

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info !== undefined ? " :: " + JSON.stringify(info) : "")); }
};

ok("1 级紫色及以上低于 8%", r.early.high < 8, r.early);
ok("1 级传说低于 1.5%", r.early.legend < 1.5, r.early);
ok("10 级紫色及以上约 15%~18%", r.mid.high > 15 && r.mid.high < 18, r.mid);
ok("30 级紫色及以上高于 22%", r.late.high > 22, r.late);
ok("30 级传说高于 5%", r.late.legend > 5, r.late);
ok("后期概率明显高于前期", r.late.high > r.early.high * 3, { early: r.early.high, late: r.late.high });
ok("概率随等级单调提升", r.curve[0] < r.curve[1] && r.curve[1] < r.curve[2] && r.curve[2] < r.curve[3], r.curve);
ok("无页面报错", errors.length === 0, errors);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
