import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.QA_OUT || "/tmp/qa/sstest";
fs.mkdirSync(outDir, { recursive: true });

let html = fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
const marker = "})();";
const idx = html.lastIndexOf(marker);
if (idx < 0) throw new Error("找不到 IIFE 结尾");

const hook = `
  window.__SS__ = {
    get state() { return state; }, set state(v) { state = v; },
    get player() { return player; },
    get players() { return players; },
    get stats() { return stats; },
    get gems() { return gems; },
    get enemies() { return enemies; },
    get view() { return view; },
    get hurtFlash() { return hurtFlash; }, set hurtFlash(v) { hurtFlash = v; },
    get shake() { return shake; }, set shake(v) { shake = v; },
    get combo() { return combo; }, set combo(v) { combo = v; },
    spawnEnemy, damagePlayer, updateEnemies, coopAddRemote, coopEnemyPacket,
    weightedEnemyType,
    get waveNum() { return waveNum; }, set waveNum(v) { waveNum = v; },
    get chapter() { return chapter; }, set chapter(v) { chapter = v; },
    startIceWatchdog, get coopNet() { return coopNet; },
    CFG, gainXpFor, rollRarity, rarityWeights, RARITIES,
    get pendingLevels() { return pendingLevels; },
    chooseUpgrade,
    startGame,
    get cores() { return cores; }, set cores(v) { cores = v; },
    get turrets() { return turrets; },
    get fields() { return fields; },
    get walls() { return walls; },
    placeDefense, defenseOfId, defenseLevel, nearestAnyDefense,
    defenseMaxHp, upgradeDefense, repairDefense, interactDefense, applyDefenseLevel,
    get upgradeRerollUsed() { return upgradeRerollUsed; },
    rerollUpgrade, updateUpgradeMeta, openUpgrade, syncProgressGlobals,
    maybeShowTutorial, closeTutorial,
    // 主动技能
    get chosenSkill() { return chosenSkill; }, set chosenSkill(v) { chosenSkill = v; },
    get gravityWells() { return gravityWells; },
    get skillShadows() { return skillShadows; },
    get frostZones() { return frostZones; },
    get bullets() { return bullets; },
    get ebullets() { return ebullets; },
    get intent() { return intent; },
    SKILL_DEFS, UPGRADES, SKILL_MODS, ALL_DEFS, skillDef, skillModDef, skillDisplayName,
    castSkill, tryCastSkill, gainSkillEnergy, updateSkillEffects, spawnSkillShadow,
    updateBullets, getLocalPlayer, buildCards,
    get chosenWeapon() { return chosenWeapon; },
    coopWellList, coopApplyWells, coopFrostList, coopApplyFrost, coopIsGuest,
    get roomCode() { return roomCode; },
    spawnPlayerBullet, fireWeaponPattern, makeStats,
  };
`;
html = html.slice(0, idx) + hook + html.slice(idx);
fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
console.log("prepared", path.join(outDir, "index.html"));
