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

const checks = [];
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra });

/* ===== 威胁等级 ===== */
const threat = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.threat = 0;
  const at0 = {
    spawn: S.threatSpawnMul(),
    bullet: S.threatBulletMul(),
    speed: S.threatSpeedMul(),
    elite: S.threatEliteChance(),
  };
  S.threat = 5;
  const at5 = {
    spawn: S.threatSpawnMul(),
    bullet: S.threatBulletMul(),
    speed: S.threatSpeedMul(),
    elite: S.threatEliteChance(),
  };
  S.threat = 9.99;
  S.updateThreat(10);
  return { at0, at5, capped: S.threat, max: S.CFG.THREAT.MAX };
});
ok("威胁 0 级不产生加成", threat.at0.spawn === 1 && threat.at0.bullet === 1 &&
  threat.at0.speed === 1 && threat.at0.elite === 0, threat.at0);
ok("威胁 5 级全面提升刷怪/弹速/移速/精英率",
  threat.at5.spawn > 1.2 && threat.at5.bullet > 1.15 && threat.at5.speed > 1.05 && threat.at5.elite > 0.05,
  threat.at5);
ok("威胁等级封顶", threat.capped === threat.max, threat);

const threatBullet = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.threat = 0;
  const a = S.fireEnemyBullet(0, 0, 0, 120, 5, "#fff", 4);
  S.threat = S.CFG.THREAT.MAX;
  const b = S.fireEnemyBullet(0, 0, 0, 120, 5, "#fff", 4);
  return { a: Math.hypot(a.vx, a.vy), b: Math.hypot(b.vx, b.vy) };
});
ok("高威胁时敌弹速度更快", threatBullet.b > threatBullet.a * 1.2, threatBullet);

/* ===== 场地灾害 ===== */
const hazard = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.threat = 0;
  S.hazards = [];
  S.spawnHazard();
  const first = S.hazards[0];
  return {
    count: S.hazards.length,
    type: first && first.type,
    warn: first && first.warn,
    ghost: first && !!first.ghost,
    hasList: !!(first && first.list),
  };
});
ok("可生成陨石/激光灾害且有预警", hazard.count === 1 &&
  (hazard.type === "meteor" || hazard.type === "beam") && hazard.warn > 0, hazard);

const meteor = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.hp = 100; p.hpMax = 100; p.shield = 0; p.invuln = 0;
  S.hazards = [{
    type: "meteor", warn: 0.01, maxWarn: 1.15, life: 0,
    list: [{ x: p.x, y: p.y, r: 62 }],
  }];
  S.updateHazards(0.02);
  return { hp: p.hp, count: S.hazards.length };
});
ok("陨石落地对范围内玩家造成伤害", meteor.hp < 100, meteor);

const beam = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.hp = 100; p.hpMax = 100; p.shield = 0; p.invuln = 0;
  S.hazards = [{ type: "beam", axis: "h", pos: p.y, warn: 0.01, maxWarn: 1.1, active: 0.45, life: 0 }];
  S.updateHazards(0.02);
  return { hp: p.hp };
});
ok("激光扫射对路径上的玩家造成伤害", beam.hp < 100, beam);

const ghost = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.hp = 100; p.hpMax = 100; p.shield = 0; p.invuln = 0;
  S.hazards = [{
    type: "meteor", warn: 0.01, maxWarn: 1.15, life: 0, ghost: true,
    list: [{ x: p.x, y: p.y, r: 62 }],
  }];
  S.updateHazards(0.02);
  return { hp: p.hp, removed: S.hazards.length };
});
ok("客机的灾害表现不结算伤害", ghost.hp === 100, ghost);

/* ===== 追猎者 ===== */
const hunter = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.boss = null;
  const def = S.CFG.ENEMIES.hunter;
  const e = S.spawnEnemy("hunter");
  const p = S.getLocalPlayer();
  const d0 = Math.hypot(e.x - p.x, e.y - p.y);
  const ang0 = e.angle;
  for (let i = 0; i < 20; i++) S.updateEnemies(0.05, 1 + i * 0.05);
  const d1 = Math.hypot(e.x - p.x, e.y - p.y);
  return {
    exists: !!def,
    weight: def && def.weight,
    type: e.type,
    huntT: e.huntT,
    closer: d1 < d0,
    ang0,
  };
});
ok("追猎者不会进入随机刷怪池", hunter.exists && hunter.weight === 0, hunter);
ok("追猎者持续追击玩家且累积追击时长", hunter.type === "hunter" &&
  hunter.huntT > 0.8 && hunter.closer, hunter);

console.log("");
let pass = 0;
for (const c of checks) {
  if (c.pass) pass++;
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.pass ? "" : "  " + JSON.stringify(c.extra)}`);
}
console.log(`\n${pass}/${checks.length} PASS`);
if (errors.length) {
  console.log("页面错误:", errors);
}
await browser.close();
process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
