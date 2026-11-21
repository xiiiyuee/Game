  /* =====================================================================
   * 5.5 局外成长档案（残骸 + 永久强化，localStorage 持久化）
   * ===================================================================*/
  const META_NODES = [
    { id: "hp", icon: "❤", name: "强化舰体", base: 30, step: 1.7, max: 5, desc: (lv) => `初始生命 +${lv * 18}` },
    { id: "shield", icon: "◈", name: "棱镜镀层", base: 34, step: 1.7, max: 5, desc: (lv) => `初始护盾 +${lv * 8}` },
    { id: "damage", icon: "✦", name: "火控校准", base: 42, step: 1.75, max: 5, desc: (lv) => `全武器伤害 +${lv * 7}%` },
    { id: "drone", icon: "⬢", name: "僚机协议", base: 90, step: 2.1, max: 2, desc: (lv) => `开局 ${lv} 架守护无人机` },
    { id: "speed", icon: "➤", name: "推进改良", base: 38, step: 1.7, max: 4, desc: (lv) => `移动速度 +${lv * 4}%` },
  ];

  let meta = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("sf_meta") || "null");
      if (raw && typeof raw === "object") {
        return { shards: Math.max(0, Math.floor(raw.shards || 0)), nodes: raw.nodes || {} };
      }
    } catch (err) {}
    return { shards: 0, nodes: {} };
  })();

  function saveMeta() {
    try { localStorage.setItem("sf_meta", JSON.stringify(meta)); } catch (err) {}
  }

  function metaLevel(id) {
    const node = META_NODES.find((n) => n.id === id);
    if (!node) return 0;
    return Math.min(node.max, Math.max(0, Math.floor(meta.nodes[id] || 0)));
  }

  function metaCost(node) {
    return Math.round(node.base * Math.pow(node.step, metaLevel(node.id)));
  }

  function applyMeta(s, p) {
    const hpLv = metaLevel("hp");
    const shLv = metaLevel("shield");
    const dmgLv = metaLevel("damage");
    const droneLv = metaLevel("drone");
    const spdLv = metaLevel("speed");
    if (hpLv) { p.hpMax += hpLv * 18; p.hp = p.hpMax; }
    if (shLv) s.shieldMax += shLv * 8;
    if (dmgLv) s.damage *= Math.pow(1.07, dmgLv);
    if (droneLv) s.drones = Math.min(CFG.DRONES.MAX, droneLv);
    if (spdLv) s.moveSpeed *= 1 + spdLv * 0.04;
    p.shield = s.shieldMax;
  }

  function renderMeta() {
    document.getElementById("meta-shards").textContent = String(meta.shards);
    const wrap = document.getElementById("meta-items");
    wrap.innerHTML = META_NODES.map((node) => {
      const lv = metaLevel(node.id);
      const maxed = lv >= node.max;
      const cost = metaCost(node);
      const able = !maxed && meta.shards >= cost;
      return `<button class="shop-item" data-meta="${node.id}" ${able ? "" : "disabled"}>
        <h3>${node.icon} ${node.name} <span class="lv">LV ${lv}/${node.max}</span></h3>
        <p>${maxed ? "当前 " + node.desc(lv) : (lv > 0 ? "当前 " + node.desc(lv) + " · " : "") + "下一级 " + node.desc(lv + 1)}</p>
        <span class="cost">${maxed ? "已满级" : cost + " 残骸"}</span>
      </button>`;
    }).join("");
  }

  function openMeta() {
    renderMeta();
    document.getElementById("ov-menu").classList.add("hidden");
    document.getElementById("ov-meta").classList.remove("hidden");
    document.getElementById("ov-meta").scrollTop = 0;
  }

  function closeMeta() {
    document.getElementById("ov-meta").classList.add("hidden");
    document.getElementById("ov-menu").classList.remove("hidden");
    document.getElementById("ov-menu").scrollTop = 0;
  }

  function buyMeta(id) {
    const node = META_NODES.find((n) => n.id === id);
    if (!node) return;
    const lv = metaLevel(id);
    const cost = metaCost(node);
    if (lv >= node.max || meta.shards < cost) return;
    meta.shards -= cost;
    meta.nodes[id] = lv + 1;
    saveMeta();
    renderMeta();
    sfxLevelUp();
  }

  function metaShardGain() {
    return Math.max(1, Math.round(score / 650 + kills / 55 + (chapter - 1) * 3));
  }


