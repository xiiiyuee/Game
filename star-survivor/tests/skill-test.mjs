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

// 1) 默认技能 + 技能定义
const base = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse");
  const p = S.getLocalPlayer();
  return {
    state: S.state,
    skill: p.skill,
    defs: Object.keys(S.SKILL_DEFS),
    energy: p.skillEnergy,
  };
});
ok("默认技能为相位冲刺", base.skill === "phase", base.skill);
ok("三个主动技能定义齐全",
  ["phase", "well", "graze"].every((k) => base.defs.includes(k)), base.defs);

// 2) 被动蓄能 + HUD 技能条
await new Promise((r) => setTimeout(r, 700));
const hud = await page.evaluate(() => {
  const S = window.__SS__;
  const p = S.getLocalPlayer();
  return {
    energy: p.skillEnergy,
    text: document.getElementById("ui-skill-text").textContent,
    width: document.getElementById("ui-skill").style.width,
    hasBar: !!document.getElementById("skill-bar"),
  };
});
ok("被动能量积累", hud.energy > 1, hud.energy);
ok("HUD 技能条存在且更新", hud.hasBar && /%|就绪/.test(hud.text) && /%$/.test(hud.width), hud);

// 3) 相位冲刺：消耗能量、进入冲刺、留下残影
const phase = await page.evaluate(async () => {
  const S = window.__SS__;
  const p = S.getLocalPlayer();
  p.skillEnergy = 100;
  const before = p.skillEnergy;
  const castOk = S.castSkill(p);
  const justAfter = { energy: p.skillEnergy, lock: p.skillLock, phaseTime: p.phaseTime };
  await new Promise((r) => setTimeout(r, 260));
  return {
    castOk, before, justAfter,
    shadows: S.skillShadows.length,
    moved: p.phaseTime >= 0,
  };
});
ok("相位冲刺可施放并清空能量",
  phase.castOk && phase.justAfter.energy === 0 && phase.justAfter.phaseTime > 0,
  { energy: phase.justAfter.energy, phaseTime: phase.justAfter.phaseTime });
ok("相位冲刺产生残影", phase.shadows >= 1, phase.shadows);

// 3b) 相位冲刺手感：起步定身 / 方向宽限 / 冲后惯性
const feel = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillEnergy = 100;
  S.intent.mx = 1;
  S.intent.my = 0;
  S.castSkill(p);
  // 起步定身：首帧不应位移
  const x0 = p.x, y0 = p.y;
  S.updatePlayer(0.016, p);
  const holdDist = Math.hypot(p.x - x0, p.y - y0);
  const holdActive = p.phaseHold > 0;
  // 方向晚点定：宽限窗口内改按向下，冲刺方向应被覆盖
  S.intent.mx = 0;
  S.intent.my = 1;
  S.updatePlayer(0.02, p);
  S.updatePlayer(0.016, p);
  const dirY = p.phaseDir.y;
  // 跑完冲刺，检查结束后的惯性滑行
  for (let i = 0; i < 60 && p.phaseTime > 0; i++) S.updatePlayer(0.016, p);
  S.intent.mx = 0;
  S.intent.my = 0;
  const carryT = p.phaseCarryT;
  const cx = p.x, cy = p.y;
  S.updatePlayer(0.016, p);
  const carryDist = Math.hypot(p.x - cx, p.y - cy);
  return { holdDist, holdActive, dirY, carryT, carryDist };
});
ok("冲刺起步先定身（首帧不位移）", feel.holdActive && feel.holdDist === 0, feel);
ok("冲刺方向在宽限窗口内被修正", feel.dirY > 0.9, feel.dirY);
ok("冲刺结束后保留惯性滑行", feel.carryT > 0 && feel.carryDist > 1, feel);

// 3c) 冲刺窗口内击杀回充技能能量
const refund = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.skillEnergy = 0;
  p.phaseRefundT = 1;
  const e = S.spawnEnemy("square", p.x + 40, p.y);
  e.lastHit = p.id;
  e.hp = 0;
  S.killEnemy(e);
  return { energy: p.skillEnergy, refundT: p.phaseRefundT, max: S.CFG.SKILL.MAX };
});
ok("冲刺窗口内击杀回充技能能量", refund.energy > 0 && refund.refundT === 0, refund);

// 3d) 超载：范围爆发 + 残血处决 + 强化窗口
const ult = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  const p = S.getLocalPlayer();
  p.energy = S.CFG.ULT.MAX;
  p.stats.damage = 20;
  const a = S.spawnEnemy("square", p.x + 100, p.y);
  a.hp = 1000;
  a.hpMax = 1000;
  const b = S.spawnEnemy("square", p.x - 100, p.y);
  b.hp = 150;                       // 15% < EXEC，应被处决
  b.hpMax = 1000;
  S.activateUltimate();
  return {
    energy: p.energy, buff: p.ultBuffT, slow: S.ultTimer,
    aHp: a.hp, bDead: !!b.dead,
  };
});
ok("超载范围爆发、处决残血并进入强化窗口",
  ult.energy < 20 && ult.aHp < 1000 && ult.bDead && ult.buff > 0 && ult.slow > 0, ult);

// 3e) 超载期间机动强化：移速、冲刺距离、冲刺 CD、移动残影
const mobility = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "phase");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.ultBuffT = S.CFG.ULT.SLOW_TIME;
  const baseMove = p.stats.moveSpeed * S.view.scale * 0.1;
  S.intent.mx = 1;
  S.intent.my = 0;
  const x0 = p.x;
  S.updatePlayer(0.1, p);
  const moveDist = p.x - x0;
  const trails = S.ultTrails.length;
  p.dashCd = 0;
  p.x = 400;
  p.y = 400;
  S.tryDash();
  const dashTime = p.dashTime;
  const dashCd = p.dashCd;
  const baseDash = S.CFG.PLAYER.DASH_SPEED * S.view.scale * 0.1;
  const dx0 = p.x;
  S.updatePlayer(0.1, p);
  const dashDist = p.x - dx0;
  return {
    moveDist, baseMove, trails, dashDist, baseDash,
    dashTime, baseDashTime: S.CFG.PLAYER.DASH_TIME,
    dashCd, baseDashCd: S.CFG.PLAYER.DASH_CD,
  };
});
ok("超载期间移速提升并留下移动残影",
  mobility.moveDist > mobility.baseMove * 1.15 && mobility.trails > 0, mobility);
ok("超载期间冲刺更远、冷却更短",
  mobility.dashTime > mobility.baseDashTime && mobility.dashCd < mobility.baseDashCd &&
  mobility.dashDist > mobility.baseDash * 1.15, mobility);

// 4) 重力井：生成 + 到期内爆移除
const well = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "well");
  const p = S.getLocalPlayer();
  p.skillEnergy = 100;
  const castOk = S.castSkill(p);
  const list = S.coopWellList();
  const w = S.gravityWells[0];
  if (w) w.t = 0.02;
  S.updateSkillEffects(0.05);
  return {
    castOk, skill: p.skill, count: list.length,
    list, after: S.gravityWells.length,
  };
});
ok("重力井可施放并记录快照", well.castOk && well.list.length === 1 && well.list[0].length >= 4, well.list);
ok("重力井到期后移除", well.after === 0, well.after);

// 5) 擦弹回流：吸收子弹 -> 护盾 + 层数 + 能量
const graze = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "graze");
  const p = S.getLocalPlayer();
  p.grazeActive = 5;
  p.grazeStacks = 0;
  p.shield = 0;
  p.skillEnergy = 0;
  S.ebullets.push({
    x: p.x + p.r + 10, y: p.y, vx: 0, vy: 0, r: 4,
    life: 5, dead: false, synced: false, dmg: 10, heavy: false,
  });
  const before = S.ebullets.length;
  S.updateBullets(0.001);
  return {
    before, after: S.ebullets.length,
    stacks: p.grazeStacks, shield: p.shield, energy: p.skillEnergy,
  };
});
ok("擦弹吸收近距离敌弹", graze.after === graze.before - 1, graze);
ok("擦弹转为护盾与层数", graze.shield >= 1 && graze.stacks >= 1, graze);
ok("擦弹返还技能能量", graze.energy > 0, graze.energy);

// 6) 命中返能量（直接走 gainSkillEnergy）
const gain = await page.evaluate(() => {
  const S = window.__SS__;
  const p = S.getLocalPlayer();
  p.skillEnergy = 0;
  S.gainSkillEnergy(p, S.CFG.SKILL.HIT_GAIN);
  const e1 = p.skillEnergy;
  S.gainSkillEnergy(p, 9999);
  return { e1, cap: p.skillEnergy, max: S.CFG.SKILL.MAX };
});
ok("命中返能量且不超上限", gain.e1 > 0 && gain.cap === gain.max, gain);

// 7) 技能升级卡接入与倍率生效
const up = await page.evaluate(() => {
  const S = window.__SS__;
  const p = S.getLocalPlayer();
  const before = {
    gain: p.stats.skillGainMul, power: p.stats.skillPowerMul, dur: p.stats.skillDurationMul,
  };
  p.skillEnergy = 0;
  // 通过公开的升级卡池验证三张卡存在且可作用
  const ids = ["skill_charge", "skill_power", "skill_flow"];
  const found = ids.every((id) => !!S.UPGRADES.find((d) => d.id === id));
  for (const id of ids) {
    const d = S.UPGRADES.find((x) => x.id === id);
    d.apply(p.stats, d.base, p);
  }
  return {
    found, before,
    after: {
      gain: p.stats.skillGainMul, power: p.stats.skillPowerMul, dur: p.stats.skillDurationMul,
    },
    energyAfterFlow: p.skillEnergy,
  };
});
ok("技能升级卡已接入", up.found, up.found);
ok("技能倍率生效",
  up.after.gain > up.before.gain && up.after.power > up.before.power && up.after.dur > up.before.dur,
  up.after);
ok("过载循环施放返能", up.energyAfterFlow >= 15, up.energyAfterFlow);

// 8) 开局选择流程：武器 -> 技能 -> 进入战斗
const flow = await page.evaluate(() => {
  const S = window.__SS__;
  S.chosenSkill = "phase";
  S.state = "menu";
  const menu = document.getElementById("ov-menu");
  const weapon = document.getElementById("ov-weapon");
  const skill = document.getElementById("ov-skill");
  menu.classList.add("hidden");
  weapon.classList.add("hidden");
  skill.classList.add("hidden");
  const wBtn = document.querySelector('[data-weapon="rail"]');
  wBtn.click();
  const skillVisible = !skill.classList.contains("hidden") && weapon.classList.contains("hidden");
  const sBtn = document.querySelector('[data-skill="well"]');
  sBtn.click();
  return {
    skillVisible,
    state: S.state,
    chosenWeapon: S.chosenWeapon,
    chosenSkill: S.chosenSkill,
    skillBarHidden: document.getElementById("skill-bar").classList.contains("hidden"),
  };
});
ok("选武器后进入技能选择", flow.skillVisible, flow);
ok("选择技能后开始游戏并保留选择",
  flow.state === "playing" && flow.chosenWeapon === "rail" && flow.chosenSkill === "well", flow);
ok("技能条在战斗中显示", !flow.skillBarHidden, flow.skillBarHidden);

/* ===== 灼蚀光束 ===== */
const beam = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "beam");
  S.state = "playing";
  const p = S.getLocalPlayer();
  p.skillEnergy = S.CFG.SKILL.MAX;
  const target = S.spawnEnemy("hex", p.x + 220, p.y);
  target.hp = target.maxHp = 500;
  const cast = S.castSkill(p);
  const base = S.beamSpec(p);
  const hp0 = target.hp;
  p.beamTick = 0;
  S.beamDamageTick(p);
  const hp1 = target.hp;
  // 光束两侧远处目标不应被主光束命中
  const off = S.spawnEnemy("hex", p.x + 220, p.y + 220);
  off.hp = off.maxHp = 500;
  S.beamDamageTick(p);
  return {
    cast, time: p.beamTime, baseW: base.width, dmg: hp0 - hp1,
    offHp: off.hp, slow: S.beamMoveMul(p),
  };
});
ok("灼蚀光束施放后进入引导并造成穿透伤害", beam.cast === true && beam.time > 0 &&
  beam.dmg > 0 && beam.offHp === 500, beam);

const beamMods = await page.evaluate(() => {
  const S = window.__SS__;
  S.startGame("pulse", "beam");
  const p = S.getLocalPlayer();
  p.skillMod = "";
  const base = S.beamSpec(p);
  p.skillMod = "beam_focus";
  const focus = S.beamSpec(p);
  p.skillMod = "beam_wide";
  const wide = S.beamSpec(p);
  const wideSlow = S.beamMoveMul(p);
  p.skillMod = "beam_focus";
  p.skillAwaken = "awaken_beam";
  // 主光束宽度收束后打不中侧偏目标，次级光束应能命中
  p.beamAng = 0;
  p.beamTick = 0;
  const side = S.spawnEnemy("hex", p.x + 220, p.y + 25);
  side.hp = side.maxHp = 500;
  const before = side.hp;
  S.beamDamageTick(p);
  return { base, focus, wide, wideSlow, sideHit: before - side.hp };
});
ok("聚能收束增伤、熔流加宽减速更轻", beamMods.focus.width < beamMods.base.width &&
  beamMods.focus.dmg > beamMods.base.dmg && beamMods.wide.width > beamMods.base.width &&
  beamMods.wide.dmg < beamMods.base.dmg && beamMods.wideSlow > 0.5, beamMods);
ok("裂光棱镜的次级光束覆盖主光束盲区", beamMods.sideHit > 0, beamMods.sideHit);

await browser.close();
const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ checks, errors }, null, 2));
console.log(failed.length === 0 && errors.length === 0 ? "SKILL PASS" : "SKILL FAIL");
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
