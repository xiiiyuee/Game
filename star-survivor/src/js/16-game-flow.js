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
  let coopGuests = {};       // 房主侧：peer -> { ctrl, state, slot, id }
  let coopFallbackId = 0;
  let coopHelloSent = false;

  function setCoopStatus(status, text) {
    coopNet.status = status;
    const el = document.getElementById("coop-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", status === "connected" || status === "waiting");
    el.classList.toggle("err", status === "error");
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
    if (coopNet.peer) {
      try { coopNet.peer.destroy(); } catch (err) {}
    }
    coopNet.peer = null;
    coopNet.ctrl = null;
    coopNet.state = null;
    coopNet.error = "";
    coopGuests = {};
    coopSelf = null;
    coopRoster = [];
    coopSeed = 0;
    coopHelloSent = false;
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
    coopNet.error = msg;
    setCoopStatus("error", "连接失败：" + msg);
  }

  function onLoadError(err) {
    coopNet.error = err && err.message ? err.message : "信令库加载失败";
    setCoopStatus("error", "连接失败：" + coopNet.error);
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
    if (!coopGuests[pid]) coopGuests[pid] = { ctrl: null, state: null, slot: 0, id: null };
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

  // 握手：加入方发 hello，房主回 welcome（版本 / 槽位 / 种子 / 队伍）
  function coopOnData(conn, data) {
    if (!data || typeof data !== "object") return;
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
    }
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
      refreshChannelStatus();
      if (kind === "ctrl" && !coopNet.host) coopSayHello();
    });
    conn.on("close", () => {
      if (coopNet[kind] === conn) coopNet[kind] = null;
      refreshChannelStatus();
    });
    conn.on("error", () => {});
    conn.on("data", (data) => coopOnData(conn, data));
    if (kind === "ctrl" && !coopNet.host && conn.open) coopSayHello();
    refreshChannelStatus();
  }

  function connectHost() {
    if (!roomCode) return;
    coopReset(true);
    coopNet.host = true;
    coopSeed = (Math.random() * 2147483647) | 0;
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
      peer.on("error", onPeerError);
    }).catch(onLoadError);
  }

  function connectGuest() {
    if (!roomCode) return;
    coopReset(true);
    coopNet.host = false;
    coopHelloSent = false;
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
        const target = PEER_ID_PREFIX + roomCode;
        wireChannel("ctrl", peer.connect(target, { label: "ctrl", reliable: true, serialization: "json" }));
        wireChannel("state", peer.connect(target, { label: "state", reliable: false, serialization: "json" }));
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



