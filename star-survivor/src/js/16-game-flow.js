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
    coopOnGameStarted();
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
    coopStopPosLoop();
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
    refreshCoopDebug();
  }

  function newRoom() {
    if (coopNet.host && coopNet.peer) coopBroadcastCtrl({ t: "bye", reason: "房主已离开房间" });
    coopReset();
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

  /* =====================================================================
   * 联机连接（P2-03）：PeerJS 信令 + ctrl / state 双通道
   *   ctrl  可靠有序（升级、商店、握手、心跳）
   *   state 不可靠无序（位置快照、输入）
   * ===================================================================*/
  const PEER_SRC = [
    "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js",
    "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",
  ];
  const PEER_ID_PREFIX = "xysv-";

  let coopNet = {
    status: "idle",        // idle | loading | waiting | connecting | connected | error
    error: "",
    peer: null,
    ctrl: null,
    state: null,
    host: false,
  };
  let peerLoadPromise = null;

  /* ===== 握手协议（P2-04）===== */
  const COOP_VERSION = 1;
  const COOP_MAX_PLAYERS = 4;
  let coopSeed = 0;          // 本局随机种子（房主生成）
  let coopSelf = null;       // 加入方自身的槽位 { slot, id }
  let coopRoster = [];       // 当前队伍 [{ id, slot }]
  let coopGuests = {};       // 房主侧：peer -> { ctrl, state, slot, id, lastSeen, ping }
  let coopFallbackId = 0;
  let coopHelloSent = false;

  /* ===== 心跳（P2-05）：1 秒一次，5 秒无响应判定掉线 ===== */
  const COOP_HEARTBEAT_MS = 1000;
  const COOP_TIMEOUT_MS = 5000;
  let coopHeartTimer = null;

  /* ===== 调试面板（P2-08）：ping / 快照频率 / 丢包估算 ===== */
  let coopStats = { recv: 0, rate: 0, got: 0, lost: 0, lossPct: 0 };
  let coopSeq = {};       // 发送方 id -> 最近快照序号
  let coopPosSeq = 0;     // 本地快照序号

  /* ===== 连接失败兜底（P2-09）===== */
  let coopFatalActive = false;
  let coopFatalPaused = false;
  let coopDiscTimer = null;

  function setCoopStatus(status, text) {
    coopNet.status = status;
    const el = document.getElementById("coop-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", status === "connected" || status === "waiting");
    el.classList.toggle("err", status === "error");
    refreshCoopDebug();
  }

  function loadPeerLib(i) {
    const idx = i || 0;
    if (window.Peer) return Promise.resolve();
    if (idx >= PEER_SRC.length) return Promise.reject(new Error("信令库加载失败"));
    if (peerLoadPromise) return peerLoadPromise;
    peerLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      let done = false;
      const fail = () => {
        if (done) return;
        done = true;
        peerLoadPromise = null;
        loadPeerLib(idx + 1).then(resolve, reject);
      };
      s.src = PEER_SRC[idx];
      s.async = true;
      s.onload = () => {
        if (done) return;
        if (window.Peer) {
          done = true;
          peerLoadPromise = null;
          resolve();
        } else fail();
      };
      s.onerror = fail;
      setTimeout(fail, 6000);
      document.head.appendChild(s);
    });
    return peerLoadPromise;
  }

  function coopReset(keepStatus) {
    const oldPeer = coopNet.peer;
    coopNet.peer = null;
    if (oldPeer) {
      try { oldPeer.destroy(); } catch (err) {}
    }
    coopNet.ctrl = null;
    coopNet.state = null;
    coopNet.error = "";
    coopGuests = {};
    coopSelf = null;
    coopRoster = [];
    coopSeed = 0;
    coopHelloSent = false;
    coopNet.ping = 0;
    coopNet.lastSeen = 0;
    coopStats = { recv: 0, rate: 0, got: 0, lost: 0, lossPct: 0 };
    coopSeq = {};
    coopPosSeq = 0;
    coopFatalActive = false;
    coopFatalPaused = false;
    if (coopDiscTimer) { clearTimeout(coopDiscTimer); coopDiscTimer = null; }
    coopStopHeartbeat();
    coopStopPosLoop();
    if (!keepStatus) setCoopStatus("idle", "未连接");
  }

  function peerOptions() {
    return { host: "0.peerjs.com", port: 443, secure: true, path: "/", debug: 0 };
  }

  function onPeerError(err) {
    const type = err && err.type ? err.type : "";
    let msg = "连接失败";
    if (type === "peer-unavailable") msg = "房间不存在或房主不在线";
    else if (type === "unavailable-id") msg = "房间码被占用，请换一个";
    else if (type === "network" || type === "server-error" || type === "socket-error") msg = "信令服务不可用";
    else if (err && err.message) msg = err.message;
    coopStopHeartbeat();
    coopNet.error = msg;
    setCoopStatus("error", "连接失败：" + msg);
    if (type === "peer-unavailable" || type === "network" || type === "server-error" || type === "socket-error") {
      coopFatal("连接失败", msg);
    }
  }

  function onLoadError(err) {
    coopStopHeartbeat();
    coopNet.error = err && err.message ? err.message : "信令库加载失败";
    setCoopStatus("error", "连接失败：" + coopNet.error);
    coopFatal("连接失败", "无法加载信令库，请检查网络后重试");
  }

  function refreshChannelStatus() {
    if (coopNet.host) {
      let n = 0;
      for (const pid in coopGuests) {
        const g = coopGuests[pid];
        if (g.ctrl && g.ctrl.open && g.state && g.state.open) n += 1;
      }
      if (n > 0) setCoopStatus("connected", "已连接 " + n + " 人");
      else setCoopStatus("waiting", "等待队友加入…");
      return;
    }
    const ctrl = coopNet.ctrl && coopNet.ctrl.open;
    const state = coopNet.state && coopNet.state.open;
    if (ctrl && state) setCoopStatus("connected", "已连接");
    else if (ctrl || state) setCoopStatus("connecting", "通道 1/2");
    else setCoopStatus("connecting", "连接中…");
  }

  function coopGuestOf(conn) {
    const pid = conn.peer || ("g" + (++coopFallbackId));
    if (!coopGuests[pid]) coopGuests[pid] = { ctrl: null, state: null, slot: 0, id: null, lastSeen: Date.now(), ping: 0 };
    return { pid, g: coopGuests[pid] };
  }

  function coopAssignSlot(pid, g) {
    if (g.slot) return g.slot;
    const used = { 1: true };
    for (const k in coopGuests) if (k !== pid && coopGuests[k].slot) used[coopGuests[k].slot] = true;
    for (let slot = 2; slot <= COOP_MAX_PLAYERS; slot++) {
      if (!used[slot]) {
        g.slot = slot;
        g.id = "p" + slot;
        return slot;
      }
    }
    return 0;
  }

  function coopRosterList() {
    const list = [{ id: "p1", slot: 1 }];
    for (const pid in coopGuests) {
      const g = coopGuests[pid];
      if (g.slot) list.push({ id: g.id, slot: g.slot });
    }
    list.sort((a, b) => a.slot - b.slot);
    return list;
  }

  function coopBroadcastCtrl(msg, exceptPid) {
    for (const pid in coopGuests) {
      if (pid === exceptPid) continue;
      const c = coopGuests[pid].ctrl;
      if (c && c.open) c.send(msg);
    }
  }

  function coopStartHeartbeat() {
    coopStopHeartbeat();
    coopHeartTimer = setInterval(coopHeartbeatTick, COOP_HEARTBEAT_MS);
  }

  function coopStopHeartbeat() {
    if (coopHeartTimer) {
      clearInterval(coopHeartTimer);
      coopHeartTimer = null;
    }
  }

  function coopDropGuest(pid, reason) {
    const g = coopGuests[pid];
    if (!g) return;
    try { if (g.ctrl && g.ctrl.close) g.ctrl.close(); } catch (err) {}
    try { if (g.state && g.state.close) g.state.close(); } catch (err) {}
    const id = g.id;
    delete coopGuests[pid];
    if (id) coopBroadcastCtrl({ t: "left", id });
    setCoopStatus("waiting", (reason || "队友掉线") + "，等待重新加入…");
  }

  function coopHeartbeatTick() {
    coopStatsTick();
    const now = Date.now();
    if (coopNet.host) {
      for (const pid in coopGuests) {
        const g = coopGuests[pid];
        if (!g.ctrl || !g.ctrl.open) continue;
        if (g.lastSeen && now - g.lastSeen > COOP_TIMEOUT_MS) {
          coopDropGuest(pid, "队友掉线");
          continue;
        }
        g.ctrl.send({ t: "ping", ts: now });
      }
      return;
    }
    if (!coopNet.ctrl || !coopNet.ctrl.open) return;
    if (coopNet.lastSeen && now - coopNet.lastSeen > COOP_TIMEOUT_MS) {
      coopStopHeartbeat();
      coopNet.error = "与房主连接超时";
      coopFatal("与房主连接超时", "5 秒内没有收到房主数据，请检查网络后重试");
      return;
    }
    coopSendCtrl({ t: "ping", ts: now });
  }

  // 握手：加入方发 hello，房主回 welcome（版本 / 槽位 / 种子 / 队伍）
  function coopOnData(conn, data) {
    if (!data || typeof data !== "object") return;
    const now = Date.now();
    if (coopNet.host) {
      const g = conn && conn.peer ? coopGuests[conn.peer] : null;
      if (g) g.lastSeen = now;
    } else {
      coopNet.lastSeen = now;
    }
    if (data.t === "ping") {
      if (conn && conn.send) conn.send({ t: "pong", ts: data.ts });
      return;
    }
    if (data.t === "pong") {
      coopNet.ping = Math.max(0, now - (data.ts || now));
      if (coopNet.host && conn && conn.peer && coopGuests[conn.peer]) coopGuests[conn.peer].ping = coopNet.ping;
      return;
    }
    if (data.t === "hello") {
      if (!coopNet.host || !conn) return;
      if (data.v !== COOP_VERSION) {
        conn.send({ t: "reject", reason: "版本不一致" });
        return;
      }
      const { pid, g } = coopGuestOf(conn);
      const slot = coopAssignSlot(pid, g);
      if (!slot) {
        conn.send({ t: "reject", reason: "房间已满" });
        return;
      }
      conn.send({
        t: "welcome", v: COOP_VERSION, slot, id: g.id, seed: coopSeed,
        roster: coopRosterList(),
      });
      refreshChannelStatus();
    } else if (data.t === "welcome") {
      if (coopNet.host) return;
      if (data.v !== COOP_VERSION) {
        coopNet.error = "版本不一致";
        setCoopStatus("error", "连接失败：版本不一致");
        return;
      }
      coopSelf = { slot: data.slot || 0, id: data.id || "" };
      coopSeed = data.seed | 0;
      coopRoster = Array.isArray(data.roster) ? data.roster : [];
      setCoopStatus("connected", "已连接 · " + String(coopSelf.id).toUpperCase());
    } else if (data.t === "reject") {
      coopNet.error = data.reason || "被拒绝";
      setCoopStatus("error", "连接失败：" + coopNet.error);
    } else if (data.t === "left") {
      coopRoster = coopRoster.filter((p) => p.id !== data.id);
    } else if (data.t === "start") {
      coopStartGuestGame();
    } else if (data.t === "pause") {
      if (!coopNet.host) {
        coopRemoteAway = true;
        coopPauseLocal("房主暂时离开，等待恢复…");
      }
    } else if (data.t === "resume") {
      if (!coopNet.host && coopRemoteAway) {
        coopRemoteAway = false;
        coopResumeLocal();
      }
    } else if (data.t === "bye") {
      if (!coopNet.host) coopFatal("房主已离开房间", data.reason || "房主已结束联机，请返回菜单或重新加入");
    } else if (data.t === "p") {
      coopNoteSnapshot(data);
      coopApplyPlayerState(data);
    }
  }

  function coopNoteSnapshot(data) {
    coopStats.recv += 1;
    coopStats.got += 1;
    if (typeof data.s === "number" && typeof data.id === "string") {
      const last = coopSeq[data.id];
      if (typeof last === "number" && data.s > last + 1) coopStats.lost += data.s - last - 1;
      if (typeof last !== "number" || data.s > last) coopSeq[data.id] = data.s;
    }
  }

  function coopStatsTick() {
    coopStats.rate = coopStats.recv;
    coopStats.recv = 0;
    const total = coopStats.got + coopStats.lost;
    coopStats.lossPct = total ? Math.round((coopStats.lost * 100) / total) : 0;
    coopStats.got = 0;
    coopStats.lost = 0;
    refreshCoopDebug();
  }

  function refreshCoopDebug() {
    const el = document.getElementById("coop-debug");
    if (!el) return;
    if (!roomCode) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const labels = {
      idle: "未连接", loading: "加载中", waiting: "等待队友",
      connecting: "连接中", connected: "已连接", error: "错误",
    };
    const st = document.getElementById("dbg-status");
    const ping = document.getElementById("dbg-ping");
    const rate = document.getElementById("dbg-rate");
    const loss = document.getElementById("dbg-loss");
    if (st) st.textContent = "状态 " + (labels[coopNet.status] || coopNet.status);
    if (ping) ping.textContent = "PING " + (coopNet.ping ? Math.round(coopNet.ping) + "ms" : "-");
    if (rate) rate.textContent = "快照 " + coopStats.rate + "/s";
    if (loss) loss.textContent = "丢包 " + coopStats.lossPct + "%";
  }

  function coopSayHello() {
    if (coopNet.host || coopHelloSent) return;
    if (!coopNet.ctrl || !coopNet.ctrl.open) return;
    coopHelloSent = true;
    coopNet.ctrl.send({ t: "hello", v: COOP_VERSION });
  }

  function wireChannel(kind, conn) {
    if (coopNet.host) {
      const { pid, g } = coopGuestOf(conn);
      g[kind] = conn;
      coopNet[kind] = conn;
      conn.on("open", refreshChannelStatus);
      conn.on("close", () => {
        g[kind] = null;
        if (!g.ctrl && !g.state) delete coopGuests[pid];
        if (g.slot) coopBroadcastCtrl({ t: "left", id: g.id }, pid);
        refreshChannelStatus();
      });
      conn.on("error", () => {});
      conn.on("data", (data) => coopOnData(conn, data));
      refreshChannelStatus();
      return;
    }
    coopNet[kind] = conn;
    conn.on("open", () => {
      coopNet.lastSeen = Date.now();
      refreshChannelStatus();
      if (kind === "ctrl" && !coopNet.host) coopSayHello();
    });
    conn.on("close", () => {
      if (!coopNet.peer) return;
      if (coopNet[kind] === conn) coopNet[kind] = null;
      refreshChannelStatus();
      if (!coopNet.host && !coopNet.ctrl && !coopNet.state && !coopFatalActive) {
        coopFatal("连接中断", "与房主的连接已断开，请重试或返回菜单");
      }
    });
    conn.on("error", () => {});
    conn.on("data", (data) => coopOnData(conn, data));
    if (kind === "ctrl" && !coopNet.host && conn.open) coopSayHello();
    refreshChannelStatus();
  }

  let coopPosTimer = null;

  function coopAddRemote(id, x, y) {
    if (!id || id === localPlayerId) return null;
    for (let i = 0; i < players.length; i++) if (players[i].id === id) return players[i];
    const cx = x === undefined ? world.w / 2 : x;
    const cy = y === undefined ? world.h / 2 : y;
    const ang = (players.length * Math.PI) / 2;
    const rp = createPlayer(id, cx + Math.cos(ang) * 86, cy + Math.sin(ang) * 86, false);
    rp.remote = true;
    rp.intent = { mx: 0, my: 0, fire: false, dash: false, ult: false, aim: 0 };
    players.push(rp);
    return rp;
  }

  function coopApplyPlayerState(d) {
    if (!player || state === "menu" || state === "over") return;
    if (!d.id || d.id === localPlayerId) return;
    let p = null;
    for (let i = 0; i < players.length; i++) if (players[i].id === d.id) { p = players[i]; break; }
    if (!p) p = coopAddRemote(d.id, d.x, d.y);
    if (!p) return;
    p.x = d.x;
    p.y = d.y;
    p.facing = d.f;
    p.lastDir = { x: Math.cos(d.f), y: Math.sin(d.f) };
  }

  function coopSendPositions() {
    if (state !== "playing" || !player || !player.local) return;
    coopPosSeq += 1;
    coopSendState({
      t: "p", s: coopPosSeq, id: player.id,
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      f: Math.round(player.facing * 100) / 100,
    });
  }

  function coopStartPosLoop() {
    if (coopPosTimer) return;
    coopSeq = {};
    coopPosSeq = 0;
    coopPosTimer = setInterval(coopSendPositions, 66);
  }

  function coopStopPosLoop() {
    if (coopPosTimer) {
      clearInterval(coopPosTimer);
      coopPosTimer = null;
    }
  }

  // 房主开局：登记队友残影、广播开始；加入方收到 start 后开局并改用自己的槽位 ID
  function coopOnGameStarted() {
    if (!roomCode) return;
    if (coopNet.host) {
      for (const pid in coopGuests) if (coopGuests[pid].slot) coopAddRemote(coopGuests[pid].id);
      coopBroadcastCtrl({ t: "start", seed: coopSeed });
      coopStartPosLoop();
    } else if (coopSelf) {
      coopStartPosLoop();
    }
  }

  function coopStartGuestGame() {
    if (coopNet.host || !coopSelf || state !== "menu") return;
    startGame("pulse");
    if (player) {
      player.id = coopSelf.id;
      localPlayerId = coopSelf.id;
    }
  }

  /* ===== 房主后台暂停（P2-07）===== */
  let coopHostAway = false;
  let coopRemoteAway = false;

  function coopPauseLocal(text) {
    if (state !== "playing") return;
    togglePause();
    const hint = document.getElementById("pause-hint");
    if (hint) hint.textContent = text;
  }

  function coopResumeLocal() {
    if (state === "paused") togglePause();
    const hint = document.getElementById("pause-hint");
    if (hint) hint.textContent = "按 ESC 也可继续";
  }

  function coopSetAway(hidden) {
    if (!roomCode || !coopNet.host) return;
    if (hidden) {
      if (state === "playing") {
        coopHostAway = true;
        coopBroadcastCtrl({ t: "pause", reason: "房主暂时离开" });
        coopPauseLocal("房主暂时离开，等待恢复…");
      }
    } else if (coopHostAway) {
      coopHostAway = false;
      coopBroadcastCtrl({ t: "resume" });
      coopResumeLocal();
    }
  }

  function coopOnVisibility() {
    coopSetAway(!!document.hidden);
  }

  document.addEventListener("visibilitychange", coopOnVisibility);

  function coopFatal(title, text) {
    if (coopFatalActive) return;
    coopFatalActive = true;
    coopStopHeartbeat();
    if (state === "playing") {
      togglePause();
      coopFatalPaused = true;
    }
    const ov = document.getElementById("ov-coop");
    if (ov) {
      ov.classList.remove("hidden");
      const t = document.getElementById("coop-err-title");
      const d = document.getElementById("coop-err-text");
      if (t) t.textContent = title || "连接中断";
      if (d) d.textContent = text || "";
      const pause = document.getElementById("ov-pause");
      if (pause) pause.classList.add("hidden");
    }
    setCoopStatus("error", title || "连接中断");
  }

  function coopRetry() {
    const ov = document.getElementById("ov-coop");
    if (ov) ov.classList.add("hidden");
    if (coopFatalPaused && state === "paused") togglePause();
    coopFatalActive = false;
    coopFatalPaused = false;
    if (!roomCode) {
      location.href = location.pathname;
      return;
    }
    connectCoop();
  }

  function coopBackToMenu() {
    if (coopNet.host && coopNet.peer) coopBroadcastCtrl({ t: "bye", reason: "房主已离开房间" });
    coopStopHeartbeat();
    coopStopPosLoop();
    location.href = location.pathname;
  }

  function connectHost() {
    if (!roomCode) return;
    coopReset(true);
    coopNet.host = true;
    coopSeed = (Math.random() * 2147483647) | 0;
    coopStartHeartbeat();
    setCoopStatus("loading", "加载信令库…");
    loadPeerLib().then(() => {
      if (!roomCode || !coopNet.host) return;
      let peer;
      try {
        peer = new Peer(PEER_ID_PREFIX + roomCode, peerOptions());
      } catch (err) {
        onPeerError(err);
        return;
      }
      coopNet.peer = peer;
      peer.on("open", () => {
        coopNet.error = "";
        refreshChannelStatus();
      });
      peer.on("connection", (conn) => {
        const label = conn.label === "state" ? "state" : "ctrl";
        wireChannel(label, conn);
      });
      peer.on("close", () => {
        if (coopNet.peer === peer) coopFatal("连接已关闭", "信令服务连接已断开，请重试或返回菜单");
      });
      peer.on("disconnected", () => {
        if (coopNet.peer !== peer) return;
        setCoopStatus("connecting", "连接中断，正在尝试恢复…");
        if (coopDiscTimer) clearTimeout(coopDiscTimer);
        coopDiscTimer = setTimeout(() => {
          if (coopNet.peer === peer) coopFatal("连接中断", "与信令服务的连接已断开，请重试或返回菜单");
        }, 4000);
      });
      peer.on("error", onPeerError);
    }).catch(onLoadError);
  }

  function connectGuest() {
    if (!roomCode) return;
    coopReset(true);
    coopNet.host = false;
    coopHelloSent = false;
    coopStartHeartbeat();
    setCoopStatus("loading", "加载信令库…");
    loadPeerLib().then(() => {
      if (!roomCode || coopNet.host) return;
      let peer;
      try {
        peer = new Peer(peerOptions());
      } catch (err) {
        onPeerError(err);
        return;
      }
      coopNet.peer = peer;
      peer.on("open", () => {
        if (coopDiscTimer) { clearTimeout(coopDiscTimer); coopDiscTimer = null; }
        const target = PEER_ID_PREFIX + roomCode;
        wireChannel("ctrl", peer.connect(target, { label: "ctrl", reliable: true, serialization: "json" }));
        wireChannel("state", peer.connect(target, { label: "state", reliable: false, serialization: "json" }));
      });
      peer.on("close", () => {
        if (coopNet.peer === peer) coopFatal("连接已关闭", "与信令服务的连接已断开，请重试或返回菜单");
      });
      peer.on("disconnected", () => {
        if (coopNet.peer !== peer) return;
        setCoopStatus("connecting", "连接中断，正在尝试恢复…");
        if (coopDiscTimer) clearTimeout(coopDiscTimer);
        coopDiscTimer = setTimeout(() => {
          if (coopNet.peer === peer) coopFatal("连接中断", "与信令服务的连接已断开，请重试或返回菜单");
        }, 4000);
      });
      peer.on("error", onPeerError);
    }).catch(onLoadError);
  }

  function connectCoop() {
    if (!roomCode) return;
    if (roomHost) connectHost();
    else connectGuest();
  }

  function coopSendCtrl(msg) {
    if (coopNet.ctrl && coopNet.ctrl.open) coopNet.ctrl.send(msg);
  }

  function coopSendState(msg) {
    if (coopNet.state && coopNet.state.open) coopNet.state.send(msg);
  }



