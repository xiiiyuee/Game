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

const r = await page.evaluate(() => {
  const S = window.__SS__;
  const tutorEl = document.getElementById("tutor");
  S.startGame("pulse");
  const out = {};
  out.tutorShown = !tutorEl.classList.contains("hidden");
  S.closeTutorial();
  out.tutorHidden = tutorEl.classList.contains("hidden");
  out.tutorSeen = localStorage.getItem("sf_tutor_seen");
  S.startGame("pulse");
  out.tutorAfterRestart = tutorEl.classList.contains("hidden");

  S.state = "paused";
  const p = S.player;
  S.cores = 10;
  const okPlace = S.placeDefense("turret", p.x + 40, p.y);
  const t = S.turrets[S.turrets.length - 1];
  out.place = {
    ok: okPlace,
    level: t ? S.defenseLevel(t) : 0,
    cores: S.cores,
  };
  const hp0 = t.maxHp, rng0 = t.range, dmg0 = t.dmg;

  const up1 = S.upgradeDefense(t);
  out.up1 = {
    ok: up1,
    level: S.defenseLevel(t),
    hp: t.hp,
    maxHp: t.maxHp,
    cores: S.cores,
    rng: t.range,
    dmg: t.dmg,
    hpGrow: t.maxHp === Math.round(hp0 * 1.35),
    rngGrow: Math.abs(t.range - rng0 * 1.08) < 1e-6,
    dmgGrow: Math.abs(t.dmg - dmg0 * 1.3) < 1e-6,
  };

  const up2 = S.upgradeDefense(t);
  const coresMax = S.cores;
  const up3 = S.upgradeDefense(t);
  out.up2 = { ok: up2, level: S.defenseLevel(t), cores: S.cores };
  out.up3 = { ok: up3, level: S.defenseLevel(t), cores: S.cores, noSpend: S.cores === coresMax };

  // 手动修复：受损时消耗 1 核心恢复 35% 最大耐久
  t.hp = Math.round(t.maxHp * 0.2);
  const hpBefore = t.hp;
  const coresBeforeRepair = S.cores;
  const rp = S.repairDefense(t);
  out.repair = {
    ok: rp,
    before: hpBefore,
    after: t.hp,
    delta: t.hp - hpBefore,
    expect: Math.round(t.maxHp * S.CFG.RUN.DEF_REPAIR_PCT),
    coresSpent: coresBeforeRepair - S.cores,
  };

  // 核心不足时修复失败且不扣核心
  S.cores = 0;
  t.hp = 5;
  const rp2 = S.repairDefense(t);
  out.repairNoCore = { ok: rp2, hp: t.hp, cores: S.cores };

  // 满耐久时修复失败
  S.cores = 5;
  t.hp = t.maxHp;
  const coresFull = S.cores;
  const rp3 = S.repairDefense(t);
  out.repairFull = { ok: rp3, cores: S.cores, noSpend: S.cores === coresFull };

  // F 交互：靠近受损防线自动选择修复
  p.x = t.x;
  p.y = t.y;
  t.hp = 5;
  S.state = "playing";
  const coresBeforeInteract = S.cores;
  S.interactDefense();
  out.interact = { hp: t.hp, coresSpent: coresBeforeInteract - S.cores, near: !!S.nearestAnyDefense(t.x, t.y, 92 * S.view.scale) };
  S.state = "paused";

  // 城墙 / 缓速场升级成本为 1，且几何随等级放大
  S.cores = 10;
  S.placeDefense("field", p.x + 30, p.y + 30);
  const f = S.fields[S.fields.length - 1];
  const fr0 = f.r;
  const fu = S.upgradeDefense(f);
  out.field = { ok: fu, level: S.defenseLevel(f), rGrow: f.r > fr0, cores: S.cores };
  S.placeDefense("wall", p.x - 30, p.y + 30);
  const w = S.walls[S.walls.length - 1];
  const wl0 = w.len;
  const wu = S.upgradeDefense(w);
  out.wall = { ok: wu, level: S.defenseLevel(w), lenGrow: w.len > wl0, cores: S.cores };

  // 升级卡刷新：每级一次、消耗 1 核心、剩余次数展示
  S.cores = 5;
  p.pendingLevels = 2;
  S.syncProgressGlobals(p);
  S.state = "playing";
  S.openUpgrade();
  const rerollBtn = document.getElementById("up-reroll");
  const leftEl = document.getElementById("up-left");
  out.rerollOpen = {
    state: S.state,
    left: leftEl.textContent,
    enabled: !rerollBtn.disabled,
    text: rerollBtn.textContent,
  };
  const coresBeforeReroll = S.cores;
  const cardsBefore = document.querySelectorAll("#cards .card").length;
  S.rerollUpgrade();
  out.reroll1 = {
    coresSpent: coresBeforeReroll - S.cores,
    used: S.upgradeRerollUsed,
    disabled: rerollBtn.disabled,
    text: rerollBtn.textContent,
    cards: document.querySelectorAll("#cards .card").length,
    cardsBefore,
  };
  const coresAfterReroll = S.cores;
  S.rerollUpgrade();
  out.reroll2 = { noSpend: S.cores === coresAfterReroll, used: S.upgradeRerollUsed };
  S.chooseUpgrade(0);
  out.afterPick = { state: S.state, pending: p.pendingLevels, global: S.pendingLevels, left: leftEl.textContent };
  S.chooseUpgrade(0);
  out.afterPick2 = { state: S.state, pending: p.pendingLevels, global: S.pendingLevels };
  return out;
});

await browser.close();

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log("PASS " + name); }
  else { fail++; console.log("FAIL " + name + (info !== undefined ? " :: " + JSON.stringify(info) : "")); }
};

ok("首次进入自动显示操作提示", r.tutorShown, r);
ok("点击知道了可关闭提示", r.tutorHidden, r.tutorHidden);
ok("关闭后写入已看标记", r.tutorSeen === "1", r.tutorSeen);
ok("再次开局不再打扰", r.tutorAfterRestart, r.tutorAfterRestart);

ok("炮塔可正常建造为 Lv1", r.place.ok && r.place.level === 1, r.place);
ok("升级炮塔到 Lv2", r.up1.ok && r.up1.level === 2, r.up1);
ok("升级后回满耐久", r.up1.hp === r.up1.maxHp, r.up1);
ok("升级后最大耐久 +35%", r.up1.hpGrow, r.up1);
ok("升级后射程 +8%", r.up1.rngGrow, r.up1);
ok("升级后伤害 +30%", r.up1.dmgGrow, r.up1);
ok("升级消耗 2 核心", r.up1.cores === r.place.cores - 2, { up1: r.up1.cores, place: r.place.cores });
ok("可升到 Lv3", r.up2.ok && r.up2.level === 3, r.up2);
ok("满级后拒绝升级", !r.up3.ok && r.up3.level === 3, r.up3);
ok("满级不扣核心", r.up3.noSpend, r.up3);

ok("受损防线可手动修复", r.repair.ok && r.repair.delta === r.repair.expect, r.repair);
ok("修复消耗 1 核心", r.repair.coresSpent === 1, r.repair);
ok("核心不足无法修复", !r.repairNoCore.ok && r.repairNoCore.hp === 5 && r.repairNoCore.cores === 0, r.repairNoCore);
ok("满耐久不消耗核心", !r.repairFull.ok && r.repairFull.noSpend, r.repairFull);
ok("F 交互优先修复受损防线", r.interact.hp > 5 && r.interact.coresSpent === 1 && r.interact.near, r.interact);

ok("缓速场升级成本 1 且半径放大", r.field.ok && r.field.level === 2 && r.field.rGrow, r.field);
ok("城墙升级成本 1 且长度放大", r.wall.ok && r.wall.level === 2 && r.wall.lenGrow, r.wall);

ok("升级面板显示剩余选卡次数", r.rerollOpen.left.includes("剩余选卡 2 次"), r.rerollOpen);
ok("刷新按钮默认可用", r.rerollOpen.enabled, r.rerollOpen);
ok("刷新消耗 1 核心并重发卡片", r.reroll1.coresSpent === 1 && r.reroll1.cards === 3, r.reroll1);
ok("刷新后每级限一次", r.reroll1.used && r.reroll1.disabled && r.reroll1.text.includes("已刷新"), r.reroll1);
ok("重复刷新不扣核心", r.reroll2.noSpend && r.reroll2.used, r.reroll2);
ok("选卡后剩余次数递减", r.afterPick.state === "upgrade" && r.afterPick.pending === 1 && r.afterPick.left.includes("剩余选卡 1 次"), r.afterPick);
ok("选完最后一张恢复战斗", r.afterPick2.state === "playing" && r.afterPick2.pending === 0, r.afterPick2);
ok("无页面报错", errors.length === 0, errors);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
