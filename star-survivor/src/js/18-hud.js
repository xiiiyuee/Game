  /* =====================================================================
   * 15. HUD / 强化面板更新
   * ===================================================================*/
  function setText(el, v) {
    if (el.textContent !== v) el.textContent = v;
  }

  let teamHudHtml = "";

  // 队友 HUD：只显示其他玩家；单机时整块隐藏
  function updateTeamHud(me) {
    const wrap = document.getElementById("team-list");
    let html = "";
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p || p === me) continue;
      const dead = !!p.eliminated;
      const down = !!p.down || dead;
      const hpPct = clamp(p.hp / p.hpMax, 0, 1) * 100;
      const shPct = clamp(p.shield / p.stats.shieldMax, 0, 1) * 100;
      const note = dead
        ? "已淘汰"
        : p.down
          ? `倒地 ${Math.max(0, Math.ceil(p.downTimer || 0))}s`
          : `${Math.ceil(p.hp)} / ${p.hpMax}`;
      html += `<div class="team-row${down ? " down" : ""}">
        <div class="team-top"><span class="team-name"><i class="team-dot" style="background:${p.color || "#3fe5ff"}"></i>${p.name || String(p.id).toUpperCase()}</span><span class="team-note">Lv${p.level || 1} · ${note}</span></div>
        <div class="team-bar hp"><i style="width:${hpPct.toFixed(1)}%"></i></div>
        <div class="team-bar sh"><i style="width:${shPct.toFixed(1)}%"></i></div>
      </div>`;
    }
    if (!html) {
      if (teamHudHtml !== "") {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
        teamHudHtml = "";
      }
      return;
    }
    wrap.classList.remove("hidden");
    if (html !== teamHudHtml) {
      wrap.innerHTML = html;
      teamHudHtml = html;
    }
  }

  function refreshHud(force) {
    const me = getLocalPlayer();
    if (!me) return;
    const hpPct = clamp(me.hp / me.hpMax, 0, 1) * 100;
    const shPct = clamp(me.shield / me.stats.shieldMax, 0, 1) * 100;
    const myXpNeed = me.xpNeed || xpNeed;
    const xpPct = clamp((me.xp || 0) / myXpNeed, 0, 1) * 100;

    document.getElementById("ui-hp").style.width = hpPct.toFixed(1) + "%";
    document.getElementById("ui-shield").style.width = shPct.toFixed(1) + "%";
    document.getElementById("ui-xp").style.width = xpPct.toFixed(1) + "%";

    setText(document.getElementById("ui-hp-text"), `${Math.ceil(me.hp)} / ${me.hpMax}`);
    setText(document.getElementById("ui-shield-text"), `${Math.ceil(me.shield)} / ${Math.round(me.stats.shieldMax)}`);
    setText(document.getElementById("ui-xp-text"), `${Math.floor(me.xp || 0)} / ${myXpNeed}`);
    setText(document.getElementById("ui-level"), String(me.level || 1));
    setText(document.getElementById("ui-score"), String(score));
    setText(document.getElementById("ui-kills"), String(me.kills || 0));
    setText(document.getElementById("ui-credits"), String(credits));
    setText(document.getElementById("ui-cores"), String(cores));
    setText(document.getElementById("ui-core-btn"), String(cores));
    setText(document.getElementById("ui-chapter"),
      `星域 ${chapter} · ${waveNum}/${CFG.RUN.CHAPTER_WAVES}` +
      (chapterMod ? ` · ${chapterMod.name}` : ""));
    document.getElementById("lowhp").classList.toggle(
      "on", state === "playing" && me.hp / me.hpMax < 0.3);
    document.body.classList.toggle("in-overlay", state !== "playing");
    const power = playerPowerMul();
    setText(document.getElementById("ui-weapon"),
      CFG.WEAPONS[chosenWeapon].name +
      (power > 1.05 ? ` · 深渊适应 ×${power.toFixed(1)}` : ""));

    // 建造入口
    const buildBtn = document.getElementById("build-btn");
    const canBuild = state === "playing" &&
      (turrets.length < CFG.RUN.MAX_TURRETS || fields.length < CFG.RUN.MAX_FIELDS || walls.length < CFG.RUN.MAX_WALLS);
    buildBtn.classList.toggle("hidden", !canBuild);
    buildBtn.classList.toggle("ready", cores >= CFG.RUN.WALL_COST);
    const defBtn = document.getElementById("def-btn");
    if (defBtn) {
      const canInteract = state === "playing" &&
        (turrets.length + fields.length + walls.length) > 0;
      defBtn.classList.toggle("hidden", !canInteract);
    }

    // 连杀
    const comboEl = document.getElementById("ui-combo");
    if (combo >= 2 && comboTimer > 0) {
      comboEl.classList.remove("hidden");
      setText(document.getElementById("ui-combo-n"), String(combo));
      setText(document.getElementById("ui-combo-m"), `×${comboMultiplier().toFixed(2)}`);
    } else {
      comboEl.classList.add("hidden");
    }

    // 超载能量
    const ePct = clamp(me.energy / CFG.ULT.MAX, 0, 1) * 100;
    document.getElementById("ui-ult").style.width = ePct.toFixed(1) + "%";
    const ultBar = document.getElementById("ult-bar");
    const ready = me.energy >= CFG.ULT.MAX;
    ultBar.classList.toggle("ready", ready);
    document.getElementById("ult-btn").classList.toggle("ready", ready);
    setText(document.getElementById("ui-ult-text"),
      ready ? (document.body.classList.contains("touch") ? "超载就绪" : "超载就绪 · E")
            : `超载 ${Math.floor(ePct)}%`);

    // 主动技能能量
    const sd = skillDef(me);
    const sPct = clamp((me.skillEnergy || 0) / CFG.SKILL.MAX, 0, 1) * 100;
    const sReady = (me.skillEnergy || 0) >= CFG.SKILL.MAX && (me.skillLock || 0) <= 0;
    const skillBar = document.getElementById("skill-bar");
    document.getElementById("ui-skill").style.width = sPct.toFixed(1) + "%";
    skillBar.classList.toggle("ready", sReady);
    const skillBtn = document.getElementById("skill-btn");
    if (skillBtn) skillBtn.classList.toggle("ready", sReady);
    setText(document.getElementById("ui-skill-text"),
      sReady ? (document.body.classList.contains("touch") ? `${sd.name}就绪` : `${sd.name}就绪 · Q`)
             : `${sd.name} ${Math.floor(sPct)}%`);

    const total = Math.max(0, Math.floor(elapsed));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    setText(document.getElementById("ui-timer"), `${mm}:${String(ss).padStart(2, "0")}`);

    if (boss && !boss.dead) {
      document.getElementById("boss-wrap").classList.remove("hidden");
      document.getElementById("ui-boss").style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + "%";
    }

    updateTeamHud(me);
  }

  function updateBuffPanel() {
    const panel = document.getElementById("buffs");
    const list = document.getElementById("buff-list");
    const lp = getLocalPlayer() || player;
    const stacks = (lp && lp.stacks) || {};   // 右侧面板只显示本地玩家
    const chips = (lp && lp.chips) || [];
    const ids = Object.keys(stacks);
    if (!ids.length && !chips.length) {
      panel.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    panel.classList.remove("hidden");
    let html = ids.map((id) => {
      const def = ALL_DEFS.find((d) => d.id === id);
      if (!def) return "";
      const cls = def.curse ? " curse" : def.evolution ? " evo" : "";
      return `<div class="buff-row${cls}"><span class="ic">${def.icon}</span><span class="nm">${def.name}</span><span class="ct">×${stacks[id]}</span></div>`;
    }).join("");
    if (chips.length) {
      html += `<h4 class="chip-head">芯片 ${chips.length}/3</h4>`;
      html += chips.map((c) => `<div class="buff-row chip">
        <span class="ic" style="color:${chipColor(c)}">${c.icon}</span>
        <span class="nm">${chipText(c)}</span>
        <span class="rt">${CHIP_TIER[c.tier]}</span>
      </div>`).join("");
    }
    list.innerHTML = html;
  }

