  /* =====================================================================
   * 14. 游戏流程（开始 / 暂停 / 结束 / 重开）
   * ===================================================================*/
  function startGame(weaponKey) {
    if (weaponKey && CFG.WEAPONS[weaponKey]) chosenWeapon = weaponKey;
    resetGame();
    hideAllOverlays();
    document.getElementById("hud").classList.remove("hidden");

    // 避免按钮保持焦点后被空格 / 回车重复触发
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    state = "playing";
    clearKeys();
    lastFrame = performance.now();

    initAudio();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();
    updateBuffPanel();
    refreshHud(true);
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      clearKeys();
      shake = 0;
      document.getElementById("ov-pause").classList.remove("hidden");
    } else if (state === "paused") {
      document.getElementById("ov-pause").classList.add("hidden");
      state = "playing";
      lastFrame = performance.now();
    }
  }

  function endGame(win, reason) {
    if (state === "over") return;
    state = "over";
    clearKeys();
    shake = 0;
    hurtFlash = 0;
    hideBossBar();

    const title = document.getElementById("res-title");
    title.textContent = win ? "任务完成" : "信号中断";
    title.className = win ? "win" : "lose";
    document.getElementById("res-sub").textContent = win
      ? (reason === "boss" ? "你击败了虚空之眼，星域暂时安全" : "你坚持到了最后，成功守住星域")
      : `你在第 ${chapter} 星域的第 ${waveNum} 波倒下，远航止步于此`;

    const survived = elapsed;
    const m = Math.floor(survived / 60);
    const s = Math.floor(survived % 60);
    const shardGain = metaShardGain();
    meta.shards += shardGain;
    saveMeta();
    const grid = document.getElementById("res-grid");
    grid.innerHTML = `
      <div><span>抵达星域</span><b>第 ${chapter} 星域</b></div>
      <div><span>存活时间</span><b>${m}:${String(s).padStart(2, "0")}</b></div>
      <div><span>分数</span><b>${score}</b></div>
      <div><span>击杀</span><b>${kills}</b></div>
      <div><span>等级</span><b>LV ${level}</b></div>
      <div><span>最高连杀</span><b>${comboBest}</b></div>
      <div><span>星币</span><b>${credits}</b></div>
      <div><span>防线</span><b>${turrets.length + fields.length}</b></div>
      <div><span>获得残骸</span><b style="color:var(--gold)">+${shardGain}</b></div>
    `;

    const list = document.getElementById("res-buffs");
    const entries = Object.keys(stacks).map((id) => {
      const def = ALL_DEFS.find((d) => d.id === id);
      return `${def ? def.name : id} ×${stacks[id]}`;
    });
    list.innerHTML = entries.length
      ? entries.map((t) => `<span>•</span> ${t}`).join("　")
      : "本局没有获得强化";

    document.getElementById("ov-result").classList.remove("hidden");
    if (win) sfxWin(); else sfxLose();
  }

  function hideAllOverlays() {
    ["ov-menu", "ov-weapon", "ov-pause", "ov-upgrade", "ov-result", "ov-shop", "ov-build", "ov-theme", "ov-meta", "ov-trader"].forEach((id) => {
      document.getElementById(id).classList.add("hidden");
    });
  }

  function hideBossBar() {
    document.getElementById("boss-wrap").classList.add("hidden");
  }

