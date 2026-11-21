  /* =====================================================================
   * 15. HUD / 强化面板更新
   * ===================================================================*/
  function setText(el, v) {
    if (el.textContent !== v) el.textContent = v;
  }

  function refreshHud(force) {
    if (!player) return;
    const hpPct = clamp(player.hp / player.hpMax, 0, 1) * 100;
    const shPct = clamp(player.shield / stats.shieldMax, 0, 1) * 100;
    const xpPct = clamp(xp / xpNeed, 0, 1) * 100;

    document.getElementById("ui-hp").style.width = hpPct.toFixed(1) + "%";
    document.getElementById("ui-shield").style.width = shPct.toFixed(1) + "%";
    document.getElementById("ui-xp").style.width = xpPct.toFixed(1) + "%";

    setText(document.getElementById("ui-hp-text"), `${Math.ceil(player.hp)} / ${player.hpMax}`);
    setText(document.getElementById("ui-shield-text"), `${Math.ceil(player.shield)} / ${Math.round(stats.shieldMax)}`);
    setText(document.getElementById("ui-xp-text"), `${Math.floor(xp)} / ${xpNeed}`);
    setText(document.getElementById("ui-level"), String(level));
    setText(document.getElementById("ui-score"), String(score));
    setText(document.getElementById("ui-kills"), String(kills));
    setText(document.getElementById("ui-credits"), String(credits));
    setText(document.getElementById("ui-cores"), String(cores));
    setText(document.getElementById("ui-core-btn"), String(cores));
    setText(document.getElementById("ui-chapter"),
      `星域 ${chapter} · ${waveNum}/${CFG.RUN.CHAPTER_WAVES}` +
      (chapterMod ? ` · ${chapterMod.name}` : ""));
    document.getElementById("lowhp").classList.toggle(
      "on", state === "playing" && player.hp / player.hpMax < 0.3);
    document.body.classList.toggle("in-overlay", state !== "playing");
    const power = playerPowerMul();
    setText(document.getElementById("ui-weapon"),
      CFG.WEAPONS[chosenWeapon].name +
      (power > 1.05 ? ` · 深渊适应 ×${power.toFixed(1)}` : ""));

    // 建造入口
    const buildBtn = document.getElementById("build-btn");
    const canBuild = state === "playing" && (turrets.length < CFG.RUN.MAX_TURRETS || fields.length < CFG.RUN.MAX_FIELDS);
    buildBtn.classList.toggle("hidden", !canBuild);
    buildBtn.classList.toggle("ready", cores >= CFG.RUN.TURRET_COST);

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
    const ePct = clamp(player.energy / CFG.ULT.MAX, 0, 1) * 100;
    document.getElementById("ui-ult").style.width = ePct.toFixed(1) + "%";
    const ultBar = document.getElementById("ult-bar");
    const ready = player.energy >= CFG.ULT.MAX;
    ultBar.classList.toggle("ready", ready);
    document.getElementById("ult-btn").classList.toggle("ready", ready);
    setText(document.getElementById("ui-ult-text"),
      ready ? (document.body.classList.contains("touch") ? "超载就绪" : "超载就绪 · E")
            : `超载 ${Math.floor(ePct)}%`);

    const total = Math.max(0, Math.floor(elapsed));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    setText(document.getElementById("ui-timer"), `${mm}:${String(ss).padStart(2, "0")}`);

    if (boss && !boss.dead) {
      document.getElementById("boss-wrap").classList.remove("hidden");
      document.getElementById("ui-boss").style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + "%";
    }
  }

  function updateBuffPanel() {
    const panel = document.getElementById("buffs");
    const list = document.getElementById("buff-list");
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

