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

/* ===== Boss 二阶段：属性 + 陨星召唤 ===== */
const bossStats = await page.evaluate(() => {
  const B = window.__SS__.CFG.BOSS;
  return { hp: B.hp, dmg: B.dmg, p2: B.PHASE2, p3: B.PHASE3, meteorCd: B.METEOR_CD, p3Cd: B.METEOR_CD_P3 };
});
ok("Boss 基础属性与阶段阈值已强化", bossStats.hp >= 2800 && bossStats.dmg >= 30 &&
  bossStats.p2 > 0.66 && bossStats.p3 > 0.33 && bossStats.p3Cd < bossStats.meteorCd, bossStats);

const bossPhase = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.bossSpawned = false;
  S.spawnBoss();
  const b = S.boss;
  b.hp = b.maxHp * 0.5;
  S.updateBoss(b, 0.02, 1);
  const p2 = b.phase;
  b.hp = b.maxHp * 0.2;
  S.updateBoss(b, 0.02, 1);
  return { p2, p3: b.phase, label: document.getElementById("ui-boss-name").textContent };
});
ok("Boss 按血量进入二 / 三阶段", bossPhase.p2 === 2 && bossPhase.p3 === 3 &&
  bossPhase.label.includes("阶段 III"), bossPhase);

const bossMeteor = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.bossSpawned = false;
  S.spawnBoss();
  const b = S.boss;
  const p = S.getLocalPlayer();
  b.hp = b.maxHp * 0.6;
  S.updateBoss(b, 0.02, 1);      // 进入二阶段
  S.hazards = [];
  b.meteorCd = 0;
  S.updateBoss(b, 0.02, 1);      // 触发陨星
  const list = S.hazards.filter((h) => h.boss && h.type === "meteor");
  const h = list[0];
  const m0 = h && h.list[0];
  return {
    count: list.length,
    rocks: h ? h.list.length : 0,
    dist: m0 ? Math.hypot(m0.x - p.x, m0.y - p.y) : 999,
    warn: h && h.warn,
    stagger: h ? h.list[1].t > h.list[0].t : false,
    ghost: h && !!h.ghost,
  };
});
ok("二阶段召唤陨星并锁定玩家位置", bossMeteor.count === 1 && bossMeteor.rocks >= 2 &&
  bossMeteor.dist < 1 && bossMeteor.warn > 0.5 && bossMeteor.stagger && !bossMeteor.ghost, bossMeteor);

const bossBurn = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.hp = 200; p.hpMax = 200; p.shield = 0; p.invuln = 0;
  S.hazards = [{
    type: "meteor", warn: 0.01, maxWarn: 1.15, life: 0,
    boss: true, dmg: 22, burn: 2.6, burnTick: 4, burnCd: 0, burnLeft: 0,
    list: [{ x: p.x, y: p.y, r: 68 }],
  }];
  S.updateHazards(0.02);
  const afterImpact = p.hp;
  S.updateHazards(0.02);
  const burning = S.hazards[0] && S.hazards[0].burnLeft > 0;
  p.invuln = 0;
  S.updateHazards(0.7);
  return { afterImpact, afterBurn: p.hp, burning };
});
ok("陨星落地造成范围伤害并留下灼烧地面", bossBurn.afterImpact < 200 &&
  bossBurn.burning && bossBurn.afterBurn < bossBurn.afterImpact, bossBurn);

/* ===== 后期压迫：DPS 适应与威胁上限 ===== */
const latePower = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.chapter = 6;
  S.waveNum = 9;
  const s = S.stats;
  s.damage = 80; s.fireInterval = 0.1; s.bulletCount = 3; s.crit = 0.4; s.critMult = 2;
  const strongMul = S.playerPowerMul();
  const strongEnemy = S.spawnEnemy("tri", 400, 400);
  s.damage = 10; s.fireInterval = 0.34; s.bulletCount = 1; s.crit = 0.08;
  const weakMul = S.playerPowerMul();
  const weakEnemy = S.spawnEnemy("tri", 400, 400);
  return {
    hpStrong: strongEnemy.hp, hpWeak: weakEnemy.hp,
    strongMul, weakMul, cap: S.CFG.RUN.POWER_CAP,
  };
});
ok("后期敌人生命随玩家 DPS 适应性提升", latePower.hpStrong > latePower.hpWeak * 2.5 &&
  latePower.strongMul > 2 && latePower.strongMul <= latePower.cap, latePower);

const lateThreat = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.chapter = 6;
  const max = S.threatMax();
  const floor = S.threatFloor();
  S.threat = 0;
  S.updateThreat(10);
  return { max, floor, base: S.CFG.THREAT.MAX, risen: S.threat };
});
ok("威胁上限随章节提高且低威胁快速回温", lateThreat.max > lateThreat.base + 4 &&
  lateThreat.floor > 5 && lateThreat.risen > 1, lateThreat);

/* ===== 敌方激光：穿透 / 无视护甲 ===== */
const lancer = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const e = S.spawnEnemy("lancer", 400, 400);
  const h = S.startEnemyLaser({ x: 300, y: 300, angle: 0, laserAng: 0, dmg: 20 });
  return {
    type: e && e.type, minWave: S.CFG.ENEMIES.lancer.minWave,
    hasCd: !!e && typeof e.laserCd === "number",
    hazard: h && h.type, warn: h && h.warn, pierce: h && h.pierceArmor,
    width: h && h.width,
  };
});
ok("灼光者后期刷出并生成带预警的穿透激光", lancer.type === "lancer" &&
  lancer.minWave >= 20 && lancer.hasCd && lancer.hazard === "laser" &&
  lancer.warn > 0.5 && lancer.pierce === true && lancer.width > 0, lancer);

const lancerAi = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.chapter = 5;
  S.waveNum = 8;
  S.hazards = [];
  const p = S.player;
  p.invuln = 5;
  const e = S.spawnEnemy("lancer", p.x + 220, p.y);
  e.laserCd = 0;
  let h = null;
  for (let i = 0; i < 30 && !h; i++) {
    S.updateEnemies(0.05, 1 + i * 0.05);
    h = S.hazards.find((z) => z.type === "laser");
  }
  return { found: !!h, warn: h && h.warn, ang: h && h.ang, cd: e.laserCd };
});
ok("灼光者会实际蓄力发射激光", lancerAi.found && lancerAi.warn > 0.5 &&
  typeof lancerAi.ang === "number" && lancerAi.cd > 0, lancerAi);

const laserHit = await page.evaluate(() => {
  const S = window.__SS__;
  const L = S.CFG.ENEMY_LASER;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.player;
  const mk = () => ({
    type: "laser", x: p.x - 200, y: p.y, ang: 0, len: 1000, width: 18,
    warn: 0.01, maxWarn: 0.01, active: L.ACTIVE, life: 0, dmg: 20, pierceArmor: true,
  });
  p.hp = 200; p.hpMax = 200; p.shield = 0; p.invuln = 0; p.stats.armor = 0.5;
  S.hazards = [mk()];
  S.updateHazards(0.02);
  const armored = p.hp;
  p.invuln = 0; p.hp = 200; p.stats.armor = 0;
  S.hazards = [mk()];
  S.updateHazards(0.02);
  const bare = p.hp;
  p.invuln = 0; p.hp = 200;
  const off = mk(); off.y = p.y + 200;
  S.hazards = [off];
  S.updateHazards(0.02);
  const missed = p.hp;
  const tick = Math.min(20 * L.TICK_DMG, 200 * L.TICK_CAP);
  return { armored, bare, missed, tick };
});
ok("激光无视护甲减伤且只命中光束范围", Math.abs(laserHit.armored - (200 - laserHit.tick)) < 0.01 &&
  Math.abs(laserHit.bare - (200 - laserHit.tick)) < 0.01 && laserHit.missed === 200, laserHit);

/* ===== 激光公平性：持续灼烧 / 单跳上限 / 打断 / 受击反馈 ===== */
const laserFair = await page.evaluate(() => {
  const S = window.__SS__;
  const L = S.CFG.ENEMY_LASER;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.player;
  p.hp = 200; p.hpMax = 200; p.shield = 0; p.invuln = 0; p.stats.armor = 0.5;
  S.hazards = [{
    type: "laser", x: p.x - 200, y: p.y, ang: 0, len: 1000, width: 18,
    warn: 0.01, maxWarn: 0.01, active: L.ACTIVE, life: 0, dmg: 999, pierceArmor: true,
  }];
  S.updateHazards(0.02);
  const first = p.hp;
  for (let i = 0; i < 5; i++) S.updateHazards(0.1);
  const sustained = p.hp;
  return {
    first, sustained, left: S.hazards.filter((h) => h.type === "laser").length,
    dirT: p.hitDirT, warn: L.WARN, cap: L.TICK_CAP,
    tickCap: 200 * L.TICK_CAP,
  };
});
ok("激光持续灼烧、单跳伤害封顶且光柱结束后消失", Math.abs(laserFair.first - (200 - laserFair.tickCap)) < 0.01 &&
  laserFair.sustained < laserFair.first && laserFair.left === 0 && laserFair.dirT > 0 &&
  laserFair.warn >= 1.05 && laserFair.cap > 0 && laserFair.cap < 1, laserFair);

const laserBreak = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.player;
  p.invuln = 5;
  const e = S.spawnEnemy("lancer", p.x + 200, p.y);
  e.laserAng = 0;
  const h = S.startEnemyLaser(e);
  S.killEnemy(e);
  S.hazards = [h];
  S.updateHazards(0.02);
  return { owner: h.ownerId, left: S.hazards.filter((z) => z.type === "laser").length };
});
ok("蓄力期击杀灼光者会打断激光", laserBreak.owner !== undefined && laserBreak.left === 0, laserBreak);

const shieldBreak = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.player;
  p.hp = 100; p.shield = 5; p.invuln = 0;
  S.damagePlayer(6, p, { src: { x: p.x - 60, y: p.y } });
  return { shield: p.shield, hp: p.hp, flash: p.shieldBreak, dirT: p.hitDirT, dir: p.hitDir };
});
ok("护盾破碎有反馈并记录来向", shieldBreak.shield === 0 && shieldBreak.hp === 99 &&
  shieldBreak.flash > 0 && shieldBreak.dirT > 0 && Math.abs(shieldBreak.dir) < 0.1, shieldBreak);

const bossShard = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.hp = 200; p.hpMax = 200; p.invuln = 0;
  S.ebullets.length = 0;
  S.hazards = [{
    type: "meteor", warn: 0.01, maxWarn: 1.15, life: 0, boss: true,
    dmg: 22, burn: 2.2, burnTick: 4, shards: 6, shardDmg: 9,
    list: [{ x: p.x + 260, y: p.y, r: 66 }],
  }];
  S.updateHazards(0.02);
  return { bullets: S.ebullets.length };
});
ok("陨石落地炸裂碎片弹", bossShard.bullets >= 6, bossShard);

const bossMeteor3 = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.bossSpawned = false;
  S.spawnBoss();
  const b = S.boss;
  b.hp = b.maxHp * 0.2;
  S.updateBoss(b, 0.02, 1);      // 进入三阶段
  S.hazards = [];
  b.meteorCd = 0;
  S.updateBoss(b, 0.02, 1);
  const h = S.hazards.filter((x) => x.boss && x.type === "meteor")[0];
  return { rocks: h ? h.list.length : 0, players: S.playersCount ? 1 : 1 };
});
ok("三阶段陨星数量加倍", bossMeteor3.rocks >= 2, bossMeteor3);

/* ===== 章节高潮与敌方编队 ===== */
const climax = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.threat = 0;
  S.waveNum = 1;
  const early = { f: S.climaxFactor(), hz: S.hazardInterval() };
  S.waveNum = 10;
  const late = { f: S.climaxFactor(), hz: S.hazardInterval() };
  return { early, late, start: S.CFG.RUN.CHAPTER_WAVES - S.CFG.RUN.CLIMAX_WAVES + 1 };
});
ok("章节最后阶段进入高潮并收紧刷怪与灾害", climax.early.f === 0 && climax.late.f === 1 &&
  climax.late.hz < climax.early.hz * 0.85, climax);

const squad = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.chapter = 1;
  S.waveNum = 6;
  S.enemies.length = 0;
  S.spawnSquad();
  const list = S.enemies.filter((e) => e.squad);
  const cds = list.map((e) => e.shotCd);
  return {
    count: list.length,
    spread: cds.length ? Math.max(...cds) - Math.min(...cds) : 99,
    types: Array.from(new Set(list.map((e) => e.type))),
    salvo: list.every((e) => e.salvo > 0),
  };
});
ok("敌方编队成组入场并同步开火", squad.count === 3 && squad.types.length === 1 &&
  squad.spread < 0.15 && squad.salvo, squad);

/* ===== 输出 ===== */
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
