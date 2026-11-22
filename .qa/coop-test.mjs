import puppeteer from "puppeteer-core";

const CHROME = "/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome";
const URL = "file:///tmp/qa/sstest/index.html";

let pass = 0, fail = 0;
const lines = [];
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push("PASS " + name); }
  else { fail++; lines.push("FAIL " + name + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); }
}

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

const r = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse");
  const out = {};
  const px = S.player.x, py = S.player.y;

  // 远程队友受伤：不触发本地红屏/震屏/断连杀
  const remote = S.coopAddRemote("REMOTE1", px, py);
  out.remoteCreated = !!remote;
  S.player.combo = 7;
  S.combo = 7;
  S.hurtFlash = 0;
  S.shake = 0;
  remote.invuln = 0;
  S.damagePlayer(10, remote);
  out.remoteNoFlash = S.hurtFlash === 0;
  out.remoteNoShake = S.shake === 0;
  out.remoteKeepsCombo = S.player.combo === 7 && S.combo === 7;

  // 本地玩家受伤：仍然有完整反馈
  S.hurtFlash = 0;
  S.shake = 0;
  S.player.invuln = 0;
  S.damagePlayer(10, S.player);
  out.localFlash = S.hurtFlash === 1;
  out.localShake = S.shake > 0;

  // 客户端同步怪插值
  S.state = "playing";
  S.enemies.length = 0;
  const e = S.spawnEnemy("tri", px + 200, py + 200);
  e.synced = true;
  e.speed = 0;
  e.tx = px + 300;
  e.ty = py + 200;
  const x0 = e.x;
  S.updateEnemies(0.016, 0);
  out.interpMoved = e.x > x0 && e.x < e.tx;
  out.interpPartial = e.x - x0 < 100;

  // 大包降频：轻包不含掉落物/环境物字段
  const light = S.coopEnemyPacket(px, py, 700, false);
  const full = S.coopEnemyPacket(px, py, 700, true);
  out.lightNoDrops = light.gm === undefined && light.cd === undefined && light.ch === undefined && light.as === undefined;
  out.lightKeepsEnemies = Array.isArray(light.list);
  out.fullHasDrops = Array.isArray(full.gm) && Array.isArray(full.cd) && Array.isArray(full.ch) && Array.isArray(full.as);
  out.lightKeepsTrader = light.tr !== undefined;

  return out;
});

ok("远程队友对象创建成功", r.remoteCreated === true);
ok("队友受伤不触发本地红屏", r.remoteNoFlash === true);
ok("队友受伤不触发本地震屏", r.remoteNoShake === true);
ok("队友受伤不打断本地连杀", r.remoteKeepsCombo === true, r.remoteKeepsCombo);
ok("本地受伤仍然红屏", r.localFlash === true);
ok("本地受伤仍然震屏", r.localShake === true);
ok("同步怪向快照目标插值", r.interpMoved === true);
ok("插值是平滑推进而非瞬移", r.interpPartial === true);
ok("轻包不含掉落物字段", r.lightNoDrops === true);
ok("轻包保留敌人列表", r.lightKeepsEnemies === true);
ok("全量包包含掉落物字段", r.fullHasDrops === true);
ok("轻包保留游商状态", r.lightKeepsTrader === true);
ok("无页面报错", errors.length === 0, errors);

await browser.close();
for (const l of lines) console.log(l);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
