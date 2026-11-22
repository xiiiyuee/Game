import fs from "node:fs";
import path from "node:path";

const root = "/workspace/star-survivor";
const outDir = "/tmp/qa/sstest";
fs.mkdirSync(outDir, { recursive: true });

let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
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
    startGame,
  };
`;
html = html.slice(0, idx) + hook + html.slice(idx);
fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
console.log("prepared", path.join(outDir, "index.html"));
