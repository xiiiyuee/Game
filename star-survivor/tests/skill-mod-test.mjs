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

// 1) 六个改装，每个技能一对互斥分支
const defs = await page.evaluate(() => {
  const S = window.__SS__;
  const bySkill = {};
  for (const d of S.SKILL_MODS) bySkill[d.modSkill] = (bySkill[d.modSkill] || 0) + 1;
  return {
    total: S.SKILL_MODS.length,
    bySkill,
    inAll: S.SKILL_MODS.every((d) => !!S.ALL_DEFS.find((x) => x.id === d.id)),
  };
});
ok("改装共 6 个，每个技能 2 个", defs.total === 6 &&
  defs.bySkill.phase === 2 && defs.bySkill.well === 2 && defs.bySkill.graze === 2, defs);
ok("改装已纳入 ALL_DEFS（联机裁决可用）", defs.inAll, defs.inAll);

// 2) 改装互斥：已改装后不再出现该技能的改装卡
const gate = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  const mod = S.SKILL_MODS.find((d) => d.id === "mod_phase_ice");
  mod.apply(p.stats, 0, p);
  let leaked = false;
  for (let i = 0; i < 40; i++) {
    if (S.buildCards(p).some((c) => c.def.mod)) { leaked = true; break; }
  }
  return { skillMod: p.skillMod, leaked };
});
ok("改装卡应用后写入 skillMod", gate.skillMod === "phase_ice", gate.skillMod);
ok("同一技能改装后不再出现改装卡（互斥）", !gate.leaked, gate);

// 3) 冰痕：残影不射击，落点生成冰区并使敌人减速
const ice = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillMod = "phase_ice";
  S.spawnSkillShadow(p);
  const shadow = S.skillShadows[S.skillShadows.length - 1];
  const e = S.spawnEnemy("square", p.x, p.y);
  const hp0 = e.hp;
  S.updateSkillEffects(0.2);
  return {
    shadowMod: shadow && shadow.mod,
    zones: S.frostZones.length,
    frostT: e.frostT || 0,
    hp0,
    hp1: e.hp,
    bullets: S.bullets.length,
  };
});
ok("冰痕残影带改装标记并生成冰区", ice.shadowMod === "phase_ice" && ice.zones >= 1, ice);
ok("冰区使敌人进入减速状态", ice.frostT > 0, ice.frostT);
ok("冰痕残影不射击（不产生子弹）", ice.bullets === 0, ice.bullets);

// 4) 爆痕：延迟后范围爆炸造成伤害
const blast = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillMod = "phase_blast";
  const e = S.spawnEnemy("square", p.x + 10, p.y);
  const hp0 = e.hp;
  S.spawnSkillShadow(p);
  const shadow = S.skillShadows[S.skillShadows.length - 1];
  S.updateSkillEffects(0.2);
  const delayAfter = shadow.t;
  const beforeDelay = e.hp;
  S.updateSkillEffects(0.5);
  return { delay: delayAfter, mod: shadow.mod, hp0, beforeDelay, after: e.hp };
});
ok("爆痕残影延迟 0.5 秒并在延迟前不伤害", blast.mod === "phase_blast" &&
  Math.abs(blast.delay + 0.2 - 0.5) < 0.02 && blast.beforeDelay === blast.hp0, blast);
ok("爆痕残影延迟后造成范围伤害", blast.after < blast.hp0, blast);

// 5) 奇点：半径 -20%，吸附更强
const sing = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "well");
  const p = S.getLocalPlayer();
  p.skillMod = "well_singularity";
  p.skillEnergy = 100;
  const e = S.spawnEnemy("square", p.x + 60, p.y);
  S.castSkill(p);
  const w = S.gravityWells[0];
  const base = S.CFG.SKILL.WELL.RADIUS;
  return { mod: w && w.mod, radius: w ? w.r / S.view.scale : 0, base,
    ex: e.x, px: p.x };
});
ok("奇点改装生效且半径缩小 20%", sing.mod === "well_singularity" &&
  Math.abs(sing.radius - sing.base * 0.8) < 1, sing);

// 6) 脉冲井：持续延长、取消内爆、周期伤害
const pulse = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "well");
  const p = S.getLocalPlayer();
  p.skillMod = "well_pulse";
  p.skillEnergy = 100;
  const e = S.spawnEnemy("square", p.x + 50, p.y);
  S.castSkill(p);
  const w = S.gravityWells[0];
  const dur = w.t;
  const hp0 = e.hp;
  S.updateSkillEffects(0.7);
  const hp1 = e.hp;
  w.t = 0.01;
  S.updateSkillEffects(0.05);
  return { mod: w.mod, dur, base: S.CFG.SKILL.WELL.TIME, hp0, hp1, alive: S.gravityWells.length };
});
ok("脉冲井持续延长 40%", pulse.mod === "well_pulse" &&
  Math.abs(pulse.dur - pulse.base * 1.4) < 0.05, pulse);
ok("脉冲井造成周期伤害", pulse.hp1 < pulse.hp0, pulse);
ok("脉冲井结束时不内爆（无残留）", pulse.alive === 0, pulse.alive);

// 7) 反射装甲：每 3 发吸收返还一发强化弹
const reflect = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("scatter", "graze");
  const p = S.getLocalPlayer();
  p.skillMod = "graze_reflect";
  p.grazeActive = 5;
  p.skillEnergy = 0;
  S.spawnEnemy("square", p.x + 120, p.y);
  const before = S.bullets.length;
  for (let i = 0; i < 3; i++) {
    S.ebullets.push({
      x: p.x + p.r + 10, y: p.y, vx: 0, vy: 0, r: 4,
      life: 5, dead: false, synced: false, dmg: 10, heavy: false,
    });
    S.updateBullets(0.001);
  }
  return { before, after: S.bullets.length, count: p.stats.bulletCount, reflect: p.grazeReflect };
});
ok("反射装甲每 3 发返还强化弹（继承散射弹道）",
  reflect.after - reflect.before === reflect.count && reflect.count > 1, reflect);

// 8) 护盾过载：护盾上限 +25，每次擦弹 +2
const over = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  const max0 = p.stats.shieldMax;
  const mod = S.SKILL_MODS.find((d) => d.id === "mod_graze_overcharge");
  mod.apply(p.stats, 0, p);
  p.grazeActive = 5;
  p.shield = 0;
  S.ebullets.push({
    x: p.x + p.r + 10, y: p.y, vx: 0, vy: 0, r: 4,
    life: 5, dead: false, synced: false, dmg: 10, heavy: false,
  });
  S.updateBullets(0.001);
  return { max0, max1: p.stats.shieldMax, shield: p.shield, skillMod: p.skillMod };
});
ok("护盾过载上限 +25", over.max1 - over.max0 === 25, over);
ok("护盾过载每次擦弹 +2 护盾", over.shield >= 2 && over.skillMod === "graze_overcharge", over);

// 9) 武器继承：通用弹道函数按当前武器生成多发
const inherit = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("scatter", "phase");
  const p = S.getLocalPlayer();
  const before = S.bullets.length;
  S.fireWeaponPattern(p, 0, 1, { shadow: true, origin: { x: p.x + 30, y: p.y } });
  return {
    n: p.stats.bulletCount,
    added: S.bullets.length - before,
    x: S.bullets[S.bullets.length - 1].x,
    px: p.x,
  };
});
ok("fireWeaponPattern 继承散射多弹道", inherit.added === inherit.n && inherit.n > 1, inherit);
ok("残影弹从残影位置发射（而非玩家位置）", inherit.x > inherit.px + 25, inherit);

// 10) HUD 显示「技能·改装」
const hud = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  p.skillMod = "graze_reflect";
  p.skillEnergy = 20;
  return { name: S.skillDisplayName(p), text: document.getElementById("ui-skill-text").textContent };
});
ok("技能名带改装后缀", /擦弹回流·反射装甲/.test(hud.name), hud.name);

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ checks, errors }, null, 2));
console.log(failed.length === 0 && errors.length === 0 ? "SKILL MOD PASS" : "SKILL MOD FAIL");
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
