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

  /* =====================================================================
   * 联机房间码（P2-02）：只负责生成 / 解析 / 展示，连接在后续任务接入
   * ===================================================================*/
  const ROOM_CHARS = "23456789";     // 去掉 0/1 等易混字符
  let roomCode = null;               // 当前房间码
  let roomHost = false;              // 是否由本页创建（房主）

  function genRoomCode() {
    let s = "";
    for (let i = 0; i < 6; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    return s;
  }

  function shareLink(code) {
    return location.origin + location.pathname + "?room=" + encodeURIComponent(code);
  }

  function refreshRoomPanel() {
    const row = document.getElementById("coop-row");
    if (!row) return;
    row.classList.toggle("hidden", !roomCode);
    const codeEl = document.getElementById("coop-code");
    if (codeEl) codeEl.textContent = roomCode || "------";
    const label = document.getElementById("coop-label");
    if (label) label.textContent = roomHost ? "房间码" : "加入房间";
    const again = row.querySelector('[data-act="coop-new"]');
    if (again) again.classList.toggle("hidden", !roomHost);
    const copy = row.querySelector('[data-act="coop-copy"]');
    if (copy) copy.textContent = roomHost ? "复制邀请链接" : "复制房间号";
  }

  function newRoom() {
    roomCode = genRoomCode();
    roomHost = true;
    refreshRoomPanel();
    return roomCode;
  }

  // 支持 ?coop=1 建房、?room=CODE 加入；房间码只保留字母数字
  function initCoop() {
    let params;
    try { params = new URLSearchParams(location.search); } catch (err) { return; }
    const room = (params.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (room) {
      roomCode = room;
      roomHost = false;
      document.body.classList.add("coop");
      refreshRoomPanel();
    } else if (params.get("coop") === "1") {
      document.body.classList.add("coop");
      newRoom();
    }
  }

  function copyRoom() {
    if (!roomCode) return;
    const text = roomHost ? shareLink(roomCode) : roomCode;
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p && p.catch) p.catch(() => {});
    } catch (err) {}
  }


