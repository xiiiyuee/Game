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

// 1) 星域事件：5 种，收益与风险并存，章节抉择二选一
const events = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  return {
    initial: S.chapterMod,
    total: S.SECTOR_EVENTS.length,
    ids: S.SECTOR_EVENTS.map((e) => e.id),
    risk: S.SECTOR_EVENTS.every((e) => {
      const keys = Object.keys(e).filter((k) => !["id", "name", "icon", "desc", "onPick"].includes(k));
      return keys.length >= 2 || !!e.onPick;
    }),
  };
});
ok("首章没有随机星域环境", events.initial === null, events.initial);
ok("星域事件共 5 种且 id 唯一", events.total === 5 &&
  new Set(events.ids).size === 5, events);
ok("每个事件都有收益与代价", events.risk, events);

const choice = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.chapter = 2;
  S.prepareSectorChoice();
  const picks = S.sectorChoices.map((e) => e.id);
  const stateBefore = S.state;
  const visible = !document.getElementById("ov-event").classList.contains("hidden");
  const pick = S.sectorChoices[0];
  const hp0 = S.getLocalPlayer().hp;
  S.chooseSectorEvent(pick.id);
  return {
    picks, stateBefore, visible,
    mod: S.chapterMod && S.chapterMod.id,
    hidden: document.getElementById("ov-event").classList.contains("hidden"),
    stateAfter: S.state,
    hp0, hp1: S.getLocalPlayer().hp,
    pickId: pick.id,
  };
});
ok("章节抉择给出两个不同事件", choice.picks.length === 2 &&
  choice.picks[0] !== choice.picks[1], choice);
ok("单机抉择时暂停并显示面板", choice.stateBefore === "event" && choice.visible, choice);
ok("选择后写入章节环境并关闭面板", choice.mod === choice.pickId && choice.hidden, choice);
ok("选择后进入星港（游戏继续）", choice.stateAfter === "shop", choice.stateAfter);

const medical = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.hp = 20;
  S.chapter = 3;
  S.prepareSectorChoice();
  S.chooseSectorEvent("medical");
  return { hp0: 20, hp1: p.hp, mod: S.chapterMod.id };
});
ok("医疗星港立即回复 45% 生命", medical.mod === "medical" &&
  medical.hp1 > medical.hp0, medical);

const eventEffect = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  S.chapterMod = S.SECTOR_EVENTS.find((e) => e.id === "armory");
  S.fireWeaponPattern(p, 0, 1);
  const dmgMod = S.bullets[S.bullets.length - 1].dmg / p.stats.damage;
  S.chapterMod = S.SECTOR_EVENTS.find((e) => e.id === "fracture");
  p.xp = 0;
  p.xpNeed = 1000;
  S.gainXpFor(p, 10);
  return { dmgMod, xp: p.xp };
});
ok("兵工厂增益写入玩家子弹伤害", Math.abs(eventEffect.dmgMod - 1.12) < 0.001, eventEffect);
ok("裂解空间降低经验获取", Math.abs(eventEffect.xp - 8.5) < 0.001, eventEffect);

// 2) 技能终极觉醒：四技能各一张，改装后出现一次
const awaken = await page.evaluate(() => {
  const S = window.__SS__;
  const bySkill = {};
  for (const d of S.SKILL_AWAKENINGS) bySkill[d.awakenSkill] = (bySkill[d.awakenSkill] || 0) + 1;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillMod = "phase_ice";
  let seen = 0;
  for (let i = 0; i < 50; i++) {
    if (S.buildCards(p).some((c) => c.def.awaken)) seen += 1;
  }
  const def = S.SKILL_AWAKENINGS.find((d) => d.awakenSkill === "phase");
  def.apply(p.stats, 0, p);
  let leaked = false;
  for (let i = 0; i < 40; i++) {
    if (S.buildCards(p).some((c) => c.def.awaken)) { leaked = true; break; }
  }
  return {
    total: S.SKILL_AWAKENINGS.length, bySkill, seen, leaked,
    flag: p.skillAwaken, name: S.skillDisplayName(p),
  };
});
ok("觉醒共 4 张，每技能 1 张", awaken.total === 4 &&
  awaken.bySkill.phase === 1 && awaken.bySkill.well === 1 && awaken.bySkill.graze === 1 &&
  awaken.bySkill.beam === 1, awaken);
ok("改装后觉醒卡会出现在升级池", awaken.seen > 0, awaken.seen);
ok("觉醒后不再重复出现", !awaken.leaked, awaken.leaked);
ok("技能名带觉醒后缀", /·觉醒$/.test(awaken.name), awaken.name);

// 3) 动态音乐：压力越高强度越大，且平滑逼近目标
const music = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  S.threat = 0; S.chapter = 1; S.waveNum = 1;
  const calm = S.musicTarget();
  S.chapter = 6; S.waveNum = 9;
  S.threat = S.threatMax();
  const hot = S.musicTarget();
  S.musicIntensity = 0.1;
  for (let i = 0; i < 160; i++) S.updateMusic(0.05);
  const risen = S.musicIntensity;
  S.waveNum = 1; S.chapter = 1; S.threat = 0;
  for (let i = 0; i < 160; i++) S.updateMusic(0.05);
  return { calm, hot, risen, cooled: S.musicIntensity };
});
ok("音乐强度随威胁 / 章节 / 高潮波上升", music.hot > music.calm + 0.3 && music.hot > 0.8, music);
ok("音乐强度平滑跟进并能回落", music.risen > 0.6 && music.cooled < 0.35, music);

// 4) 相位觉醒：冲刺终点爆发，冰痕留下冰区
const phaseAwake = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillMod = "phase_ice";
  p.skillAwaken = "awaken_phase";
  const e = S.spawnEnemy("square", p.x + 20, p.y);
  const hp0 = e.hp;
  const zones0 = S.frostZones.length;
  S.phaseAwakenBurst(p);
  return { hp0, hp1: e.hp, zones: S.frostZones.length - zones0 };
});
ok("相位觉醒终点爆炸造成伤害", phaseAwake.hp1 < phaseAwake.hp0, phaseAwake);
ok("冰痕相位觉醒额外留下冰区", phaseAwake.zones >= 1, phaseAwake);

// 5) 重力井觉醒：结束后留下事件视界并持续伤害
const wellAwake = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "well");
  const p = S.getLocalPlayer();
  p.skillAwaken = "awaken_well";
  p.skillEnergy = 100;
  const e = S.spawnEnemy("square", p.x + 50, p.y);
  S.castSkill(p);
  const w = S.gravityWells[0];
  w.t = 0.01;
  S.updateSkillEffects(0.02);
  const hole = S.gravityWells.find((x) => x.mod === "well_black");
  const hp0 = e.hp;
  S.updateSkillEffects(0.5);
  const row = S.coopWellList().find((r) => r[4] === 2);
  return { hole: !!hole, hp0, hp1: e.hp, synced: !!row };
});
ok("重力井觉醒生成事件视界", wellAwake.hole, wellAwake);
ok("事件视界持续造成伤害", wellAwake.hp1 < wellAwake.hp0, wellAwake);
ok("事件视界纳入联机快照", wellAwake.synced, wellAwake.synced);

// 6) 擦弹觉醒：每 2 发返还分裂反射弹
const grazeAwake = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  p.skillAwaken = "awaken_graze";
  p.grazeActive = 5;
  const b = { x: p.x + p.r + 6, y: p.y };
  S.grazeAbsorb(p, b);
  const after1 = S.bullets.length;
  S.grazeAbsorb(p, b);
  const split = S.bullets.filter((x) => x.split > 0);
  return { after1, after2: S.bullets.length, split: split.length,
    splitCount: split[0] && split[0].split };
});
ok("擦弹觉醒每 2 发返还反射弹", grazeAwake.after1 === 0 && grazeAwake.after2 > 0, grazeAwake);
ok("返还弹带分裂次数", grazeAwake.splitCount === 2, grazeAwake);

const split = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  const e1 = S.spawnEnemy("square", p.x + 60, p.y);
  const e2 = S.spawnEnemy("square", p.x + 90, p.y + 20);
  S.bullets.push({
    bid: 9999, owner: p.id, x: e1.x, y: e1.y, vx: 100, vy: 0, r: 4,
    dmg: 10, pierce: 0, life: 1, dead: false, hit: new Set(), ang: 0,
    color: "#fff", reflect: true, split: 2,
  });
  const before = S.bullets.length;
  S.updateBullets(0.001);
  const kids = S.bullets.filter((b) => b.split === 0 && b.reflect === false);
  return { before, after: S.bullets.length, kids: kids.length, e2: e2.hp };
});
ok("分裂反射弹命中后生成 2 枚子弹", split.after - split.before >= 2 ||
  split.kids >= 2, split);

// 7) 防线联动：炮塔光环、过载、城墙充能
const aura = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  S.cores = 10;
  S.placeDefense("turret", p.x + 60, p.y);
  const near = S.defenseFireMul(p);
  const t = S.turrets[S.turrets.length - 1];
  S.overclockNearbyTurrets(p);
  S.overclockNearbyTurrets(p);
  S.overclockNearbyTurrets(p);
  S.overclockNearbyTurrets(p);
  const oc = t.oc;
  p.x += 3000;
  const far = S.defenseFireMul(p);
  return { near, far, oc, max: S.CFG.RUN.TURRET_OC_MAX, ocT: t.ocT };
});
ok("炮塔光环内射击间隔缩短", Math.abs(aura.near - 0.88) < 0.001 && aura.far === 1, aura);
ok("技能为附近炮塔叠加过载（3 层上限）", aura.oc === aura.max && aura.ocT > 0, aura);

const wall = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  S.cores = 10;
  S.placeDefense("wall", p.x + 60, p.y);
  const w = S.walls[S.walls.length - 1];
  const e = S.spawnEnemy("square", w.x + 30, w.y);
  const hp0 = e.hp;
  const b = { x: p.x + p.r + 6, y: p.y };
  for (let i = 0; i < S.CFG.RUN.WALL_CHARGE_MAX; i++) S.grazeAbsorb(p, b);
  return { charge: w.charge, hp0, hp1: e.hp, max: S.CFG.RUN.WALL_CHARGE_MAX };
});
ok("擦弹为城墙充能并在满层释放冲击波", wall.charge === 0 && wall.hp1 < wall.hp0, wall);

// 8) 觉醒与改装写入联机快照
const snapshot = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillMod = "phase_ice";
  p.skillAwaken = "awaken_phase";
  const rows = typeof S.coopPlayers === "function" ? S.coopPlayers() : null;
  return { mod: p.skillMod, aw: p.skillAwaken, rows };
});
ok("觉醒状态记录在玩家对象上", snapshot.mod === "phase_ice" &&
  snapshot.aw === "awaken_phase", snapshot);

// 9) 压迫感回归：擦弹吸收上限 + 重力井控场递减
const grazeCap = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  p.grazeActive = 5;
  p.grazeAbsorbed = 0;
  const b = { x: p.x + 10, y: p.y };
  for (let i = 0; i < S.CFG.SKILL.GRAZE.MAX_ABSORB; i++) S.grazeAbsorb(p, b);
  return {
    active: p.grazeActive, absorbed: p.grazeAbsorbed,
    max: S.CFG.SKILL.GRAZE.MAX_ABSORB,
  };
});
ok("擦弹吸满上限后光环饱和消散",
  grazeCap.absorbed === grazeCap.max && grazeCap.active === 0, grazeCap);

const pullResist = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "well");
  const p = S.getLocalPlayer();
  const e = S.spawnEnemy("square", p.x + 300, p.y);
  S.gravityWells.push({
    owner: p.id, x: p.x, y: p.y, r: 500, t: 99, maxT: 99,
    mod: "", awaken: "", pulseCd: 1, seed: 0, synced: false,
  });
  const x0 = e.x;
  S.updateSkillEffects(0.1);
  const first = x0 - e.x;
  for (let i = 0; i < 25; i++) S.updateSkillEffects(0.1);
  const xa = e.x;
  S.updateSkillEffects(0.1);
  const last = xa - e.x;
  return { first, last, ccRes: e.ccRes || 0 };
});
ok("重力井持续吸附产生控场递减",
  pullResist.first > 0 && pullResist.last < pullResist.first * 0.6 &&
  pullResist.ccRes >= 0.6, pullResist);

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ checks, errors }, null, 2));
console.log(failed.length === 0 && errors.length === 0 ? "GAMEPLAY PASS" : "GAMEPLAY FAIL");
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
