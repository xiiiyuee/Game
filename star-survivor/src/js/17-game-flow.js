  /* =====================================================================
   * 14. 游戏流程（开始 / 暂停 / 结束 / 重开）
   * ===================================================================*/
  let tutorHideTimer = 0;

  // 首次进入自动展示操作提示，手动关闭或 9 秒后自动收起
  function maybeShowTutorial() {
    const el = document.getElementById("tutor");
    if (!el) return;
    let seen = false;
    try { seen = localStorage.getItem("sf_tutor_seen") === "1"; } catch (err) {}
    if (seen) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    clearTimeout(tutorHideTimer);
    tutorHideTimer = setTimeout(closeTutorial, 9000);
  }

  function closeTutorial() {
    const el = document.getElementById("tutor");
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("hidden");
    clearTimeout(tutorHideTimer);
    tutorHideTimer = 0;
    try { localStorage.setItem("sf_tutor_seen", "1"); } catch (err) {}
  }

  function startGame(weaponKey, skillKey) {
    if (weaponKey && CFG.WEAPONS[weaponKey]) chosenWeapon = weaponKey;
    if (skillKey && SKILL_DEFS[skillKey]) chosenSkill = skillKey;
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
    maybeShowTutorial();
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

  function coopTeamStats() {
    return players.map((p) => ({
      id: p.id,
      n: p.name || String(p.id).toUpperCase(),
      k: p.kills || 0,
      d: Math.round(p.damage || 0),
      lv: p.level || 1,
      out: !!p.eliminated,
      c: p.color || "#3fe5ff",
    }));
  }

  function endGame(win, reason, team) {
    if (state === "over") return;
    const teamStats = team || (roomCode ? coopTeamStats() : null);
    if (coopNet.host) coopSendEvent("over", { win: !!win, reason, team: teamStats });
    coopStopPosLoop();
    state = "over";
    clearKeys();
    closeTutorial();
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
    const me = getLocalPlayer() || player;
    const myKills = me && typeof me.kills === "number" ? me.kills : kills;
    const myLevel = me && typeof me.level === "number" ? me.level : level;
    let teamHtml = "";
    if (teamStats && teamStats.length > 1) {
      teamHtml = `<div class="res-team-head"><span>队友战绩</span><b>击杀 · 伤害 · 等级</b></div>` +
        teamStats.map((q) => `<div class="res-team-row${q.out ? " out" : ""}">
          <span><i class="team-dot" style="background:${q.c}"></i>${q.n}${q.out ? "（淘汰）" : ""}</span>
          <b>${q.k} · ${q.d} · LV${q.lv}</b>
        </div>`).join("");
    }
    grid.innerHTML = teamHtml + `
      <div><span>抵达星域</span><b>第 ${chapter} 星域</b></div>
      <div><span>存活时间</span><b>${m}:${String(s).padStart(2, "0")}</b></div>
      <div><span>分数</span><b>${score}</b></div>
      <div><span>击杀</span><b>${myKills}</b></div>
      <div><span>等级</span><b>LV ${myLevel}</b></div>
      <div><span>最高连杀</span><b>${comboBest}</b></div>
      <div><span>星币</span><b>${credits}</b></div>
      <div><span>防线</span><b>${turrets.length + fields.length + walls.length}</b></div>
      <div><span>防线承伤</span><b>${Math.round(defDamageTaken)}</b></div>
      <div><span>防线损失</span><b>${defLost}</b></div>
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
    ["ov-menu", "ov-weapon", "ov-skill", "ov-pause", "ov-upgrade", "ov-result", "ov-shop", "ov-build", "ov-theme", "ov-meta", "ov-trader"].forEach((id) => {
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
    const keep = ["sig", "sigport", "sigpath", "sigsecure", "turn", "peersrc"];
    const out = new URLSearchParams();
    const q = coopQuery();
    if (q) for (const k of keep) { const v = q.get(k); if (v) out.set(k, v); }
    out.set("room", code);
    return location.origin + location.pathname + "?" + out.toString();
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
    refreshLobby();
  }

  // ===== 联机大厅（P4-08）：列表 / 准备 / 开始 / 踢人 =====
  let coopSelfReady = false;
  let coopLobbyCache = [];

  function coopLobbyDataHost() {
    const list = [{ id: localPlayerId, n: "房主", host: true, ready: true }];
    for (const pid in coopGuests) {
      const g = coopGuests[pid];
      if (!g || !g.id) continue;
      list.push({
        id: g.id,
        n: g.name || ("队友 " + g.id.replace(/\D/g, "")),
        host: false,
        ready: !!g.ready,
      });
    }
    return list;
  }

  function refreshLobby(data) {
    const wrap = document.getElementById("lobby");
    if (!wrap) return;
    const show = !!roomCode && state === "menu";
    wrap.classList.toggle("hidden", !show);
    if (!show) return;
    const list = data || (coopNet.host ? coopLobbyDataHost() : coopLobbyCache);
    document.getElementById("lobby-count").textContent = list.length + " / 4";
    document.getElementById("lobby-list").innerHTML = list.map((q) => `
      <div class="lobby-row">
        <span><i class="team-dot" style="background:${q.host ? "#ffd666" : "#3fe5ff"}"></i>${q.n}</span>
        <em class="${q.ready ? "ok" : ""}">${q.host ? "房主" : (q.ready ? "已准备" : "未准备")}</em>
        ${coopNet.host && !q.host ? `<button class="lobby-kick" data-kick="${q.id}" title="移出房间">✕</button>` : ""}
      </div>`).join("");
    const startBtn = document.querySelector('[data-act="lobby-start"]');
    if (startBtn) startBtn.classList.toggle("hidden", !coopNet.host);
    const readyBtn = document.querySelector('[data-act="lobby-ready"]');
    if (readyBtn) {
      readyBtn.classList.toggle("hidden", !!coopNet.host);
      readyBtn.textContent = coopSelfReady ? "取消准备" : "准备";
    }
    const hint = document.getElementById("lobby-hint");
    if (hint) {
      hint.textContent = coopNet.host
        ? (list.length > 1 ? "队友已就位，选择武器即可开始" : "等待队友加入…（可复制邀请链接）")
        : (coopSelfReady ? "已准备，等待房主开始…" : "点击准备，等待房主开始…");
    }
  }

  function coopBroadcastLobby() {
    if (!coopNet.host) return;
    coopBroadcastCtrl({ t: "lobby", list: coopLobbyDataHost() });
    refreshLobby();
  }

  function coopToggleReady() {
    if (coopNet.host || !roomCode) return;
    coopSelfReady = !coopSelfReady;
    coopSendCtrl({ t: "ready", v: coopSelfReady });
    refreshLobby();
  }

  function coopStartFromLobby() {
    if (!coopNet.host) return;
    document.getElementById("lobby").classList.add("hidden");
    openWeaponSelect();
  }

  function coopLeaveLobby() {
    if (coopNet.host && coopNet.ctrl) {
      coopBroadcastCtrl({ t: "bye", reason: "房主已离开房间" });
    } else if (roomCode && !coopNet.host && coopNet.ctrl) {
      coopSendCtrl({ t: "left", id: coopSelf ? coopSelf.id : "" });
    }
    coopReset();
    roomCode = null;
    roomHost = false;
    coopSelfReady = false;
    coopLobbyCache = [];
    setCoopStatus("idle", "未连接");
    refreshRoomPanel();
    refreshLobby();
  }

  function coopKickGuest(id) {
    if (!coopNet.host || !id) return;
    const pid = coopFindPeerOf(id);
    if (!pid) return;
    const g = coopGuests[pid];
    coopSendEventTo(pid, "kick", {});
    coopBroadcastCtrl({ t: "left", id });
    if (g && g.id) coopRoster = coopRoster.filter((q) => q.id !== g.id);
    delete coopGuests[pid];
    setTimeout(() => {
      try { if (g && g.ctrl) g.ctrl.close(); if (g && g.peer) g.peer.close(); } catch (err) {}
    }, 200);
    coopBroadcastLobby();
    refreshRoomPanel();
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
  const COOP_DEFAULT_SIGNAL = { host: "0.peerjs.com", port: 443, secure: true, path: "/" };
  const PEER_ID_PREFIX = "xysv-";

  /* ===== 配置注入（P5-03）：信令 / TURN / 客户端库都可通过配置或 URL 覆盖 =====
     window.SS_COOP_CONFIG = {
       signal: { host, port, secure, path },
       iceServers: [{ urls, username, credential }],
       peerSrc: ["https://.../peerjs.min.js"],
     }
     URL：?sig=host:port/path | wss://host/path  ?sigport= ?sigpath= ?sigsecure=0/1
          ?turn=turn:user:pass@host:3478,turns:host:5349  ?peersrc=url1,url2
     注意：PeerJS 会自动在 path 后追加 "peerjs"，所以直接粘贴完整 /peerjs 地址也能识别 */
  function coopConfig() {
    const g = typeof window !== "undefined" ? window.SS_COOP_CONFIG : null;
    return g && typeof g === "object" ? g : {};
  }

  function coopQuery() {
    try { return new URLSearchParams(location.search); } catch (err) { return null; }
  }

  // PeerJS 会在 path 后自动追加 "peerjs"；去掉用户误带的 /peerjs 后缀
  function coopSignalPath(p) {
    let v = typeof p === "string" && p ? p : "/";
    if (v[0] !== "/") v = "/" + v;
    v = v.replace(/\/+$/, "");
    if (/\/peerjs$/i.test(v)) v = v.slice(0, -7);
    return v || "/";
  }

  function coopSignalConfig() {
    const out = Object.assign({}, COOP_DEFAULT_SIGNAL);
    const g = coopConfig();
    if (g.signal && typeof g.signal === "object") Object.assign(out, g.signal);
    const q = coopQuery();
    if (q) {
      const sig = q.get("sig");
      if (sig) {
        if (sig.indexOf("://") >= 0) {
          try {
            const u = new URL(sig);
            out.host = u.hostname;
            out.secure = u.protocol === "wss:" || u.protocol === "https:";
            out.port = u.port ? Number(u.port) : (out.secure ? 443 : 80);
            if (u.pathname && u.pathname !== "/") out.path = u.pathname;
          } catch (err) {}
        } else {
          const m = /^([^\/:]+)(?::(\d+))?(\/.*)?$/.exec(sig);
          if (m) {
            out.host = m[1];
            if (m[2]) out.port = Number(m[2]);
            if (m[3]) out.path = m[3];
          }
        }
      }
      const port = Number(q.get("sigport"));
      if (port > 0) out.port = port;
      if (q.get("sigpath")) out.path = q.get("sigpath");
      const secure = q.get("sigsecure");
      if (secure === "1" || secure === "true") out.secure = true;
      else if (secure === "0" || secure === "false") out.secure = false;
    }
    out.path = coopSignalPath(out.path);
    return out;
  }

  function coopIceServers() {
    const list = [];
    const g = coopConfig();
    if (Array.isArray(g.iceServers)) {
      for (const s of g.iceServers) if (s && s.urls) list.push(s);
    }
    const q = coopQuery();
    const raw = q ? (q.get("turn") || "") : "";
    for (const part of raw.split(",")) {
      const s = part.trim();
      if (!s) continue;
      const m = /^(turns?):(?:([^:@\/]+):([^@\/]+)@)?(.+)$/i.exec(s);
      if (!m) continue;
      const item = { urls: m[1].toLowerCase() + ":" + m[4] };
      if (m[2]) item.username = m[2];
      if (m[3]) item.credential = m[3];
      list.push(item);
    }
    return list;
  }

  function coopPeerSrc() {
    const g = coopConfig();
    if (Array.isArray(g.peerSrc) && g.peerSrc.length) return g.peerSrc.slice();
    const q = coopQuery();
    const raw = q ? (q.get("peersrc") || "") : "";
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return list.length ? list : PEER_SRC;
  }


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
  let coopEventSeq = 0;      // 可靠事件序号（P3-12）

  /* ===== 输入校验（P3-13）：房主对客户端输入做边界检查 ===== */
  const COOP_IN_MAX_FRAMES = 6;    // 单包最多帧数（客户端正常 3）
  const COOP_IN_RATE = 90;         // 每客户端每秒最多输入包数（正常 30）
  let coopInBad = 0;               // 被拒绝的非法包计数（调试面板可见）

  /* ===== 心跳（P2-05）：1 秒一次，5 秒无响应判定掉线 ===== */
  const COOP_HEARTBEAT_MS = 1000;
  const COOP_TIMEOUT_MS = 5000;
  let coopHeartTimer = null;

  /* ===== 调试面板（P2-08）：ping / 快照频率 / 丢包估算 ===== */
  let coopStats = { recv: 0, rate: 0, got: 0, lost: 0, lossPct: 0 };
  let coopSeq = {};       // 发送方 id -> 最近快照序号
  let coopPosSeq = 0;     // 本地快照序号

  /* ===== 带宽 / 房主 CPU 观测（P3-14）===== */
  let coopNetBytes = {
    sent: 0, recv: 0,          // 本秒累计（字节）
    sentRate: 0, recvRate: 0,  // 上一秒速率（字节/秒）
    tickSum: 0, tickN: 0,      // 模拟步耗时累计
    tickMs: 0,                 // 单步平均耗时
  };
  const coopByteCache = new WeakMap();   // 同一包发给多人时只序列化一次
  function coopMsgBytes(msg) {
    let n = coopByteCache.get(msg);
    if (n === undefined) {
      try { n = JSON.stringify(msg).length; } catch (err) { n = 0; }
      coopByteCache.set(msg, n);
    }
    return n;
  }
  function coopCountSent(msg) { coopNetBytes.sent += coopMsgBytes(msg); }
  function coopCountRecv(msg) { coopNetBytes.recv += coopMsgBytes(msg); }

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
    const src = coopPeerSrc();
    if (idx >= src.length) return Promise.reject(new Error("信令库加载失败"));
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
      s.src = src[idx];
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
    if (coopIceTimer) { clearInterval(coopIceTimer); coopIceTimer = null; }
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
    coopNetBytes.sent = 0;
    coopNetBytes.recv = 0;
    coopNetBytes.sentRate = 0;
    coopNetBytes.recvRate = 0;
    coopNetBytes.tickSum = 0;
    coopNetBytes.tickN = 0;
    coopNetBytes.tickMs = 0;
    coopSeq = {};
    coopPosSeq = 0;
    coopSnapSeq = 0;
    coopFatalActive = false;
    coopFatalPaused = false;
    if (coopDiscTimer) { clearTimeout(coopDiscTimer); coopDiscTimer = null; }
    coopStopHeartbeat();
    coopStopPosLoop();
    coopStopInputLoop();
    coopResetSimClock();
    coopClearInterp();
    coopEdge.dash = false;
    coopEdge.ult = false;
    coopInSeq = 0;
    coopInBuf = [];
    coopInState = {};
    if (!keepStatus) setCoopStatus("idle", "未连接");
  }

  function peerOptions() {
    const opts = coopSignalConfig();
    opts.debug = 0;
    const ice = coopIceServers();
    if (ice.length) opts.config = { iceServers: ice };
    return opts;
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
      if (c && c.open) { c.send(msg); coopCountSent(msg); }
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
    coopCountRecv(data);
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
      coopBroadcastLobby();
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
      refreshLobby();
    } else if (data.t === "lobby") {
      if (coopNet.host) return;
      coopLobbyCache = Array.isArray(data.list) ? data.list : [];
      refreshLobby(coopLobbyCache);
    } else if (data.t === "ready") {
      if (!coopNet.host || !conn) return;
      const g = coopGuests[conn.peer];
      if (g) { g.ready = !!data.v; coopBroadcastLobby(); }
    } else if (data.t === "kick") {
      if (!coopNet.host) {
        coopFatal("已被移出房间", "房主将你移出房间，请返回菜单或重新加入");
      }
    } else if (data.t === "reject") {
      coopNet.error = data.reason || "被拒绝";
      setCoopStatus("error", "连接失败：" + coopNet.error);
    } else if (data.t === "left") {
      coopRoster = coopRoster.filter((p) => p.id !== data.id);
      if (coopNet.host) coopBroadcastLobby();
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
    } else if (data.t === "i") {
      if (coopNet.host) coopApplyInput(data, conn);
    } else if (data.t === "snap") {
      coopApplySnapshot(data);
    } else if (data.t === "en") {
      coopApplyEnemies(data);
    } else if (data.t === "p") {
      coopNoteSnapshot(data);
      coopApplyPlayerState(data);
    } else if (data.t === "ev") {
      if (coopNet.host) coopOnHostEvent(conn, data);
      else coopOnEvent(data);
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
    coopNetBytes.sentRate = coopNetBytes.sent;
    coopNetBytes.recvRate = coopNetBytes.recv;
    coopNetBytes.sent = 0;
    coopNetBytes.recv = 0;
    coopNetBytes.tickMs = coopNetBytes.tickN ? coopNetBytes.tickSum / coopNetBytes.tickN : 0;
    coopNetBytes.tickSum = 0;
    coopNetBytes.tickN = 0;
    refreshCoopDebug();
  }

  function coopKb(v) { return (v / 1024).toFixed(1); }

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
    const net = document.getElementById("dbg-net");
    const tick = document.getElementById("dbg-tick");
    if (net) {
      if (coopNet.host) {
        const n = Math.max(1, Object.keys(coopGuests).length);
        net.textContent = `带宽 ↑${coopKb(coopNetBytes.sentRate)} KB/s · 单人 ${coopKb(coopNetBytes.sentRate / n)} KB/s`;
        net.classList.toggle("over", coopNetBytes.sentRate / n > 100 * 1024);
      } else {
        net.textContent = `带宽 ↓${coopKb(coopNetBytes.recvRate)} KB/s`;
        net.classList.toggle("over", coopNetBytes.recvRate > 100 * 1024);
      }
    }
    if (tick) {
      tick.textContent = coopNet.host
        ? `CPU ${coopNetBytes.tickMs.toFixed(2)}ms/步`
        : "CPU -";
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
      if (kind === "ctrl" && coopIceTimer) { clearInterval(coopIceTimer); coopIceTimer = null; }
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
  let coopIceTimer = null;   // 加入方：P2P 打洞看门狗
  let coopInterp = {};       // 加入方：玩家 id -> 位置样本缓冲

  /* ===== 快照协议 v1（P3-02）：15Hz，只含玩家，坐标量化到 0.1 ===== */
  const COOP_SNAP_VER = 1;
  let coopSnapSeq = 0;

  function coopSnapshotList() {
    const arr = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      arr.push([
        p.id,
        Math.round(p.x * 10), Math.round(p.y * 10),
        Math.round(p.facing * 100),
        Math.round(p.hp), Math.round(p.hpMax),
        Math.round(p.shield), Math.round(p.stats.shieldMax),
        p.down ? 1 : 0, Math.round(p.downTimer || 0), p.eliminated ? 1 : 0,
        p.level || 1, p.kills || 0,
        p.skill || "", Math.round(p.skillEnergy || 0),
        p.skillMod || "",
      ]);
    }
    return arr;
  }

  // 防线快照：id, kind(0炮塔/1缓速场/2城墙), x, y, hp, maxHp, 角度, 等级
  function coopDefenseList() {
    const arr = [];
    for (let i = 0; i < turrets.length; i++) {
      const d = turrets[i];
      arr.push([d.id, 0, Math.round(d.x), Math.round(d.y), Math.round(d.hp), Math.round(d.maxHp), Math.round((d.ang || 0) * 100), defenseLevel(d)]);
    }
    for (let i = 0; i < fields.length; i++) {
      const d = fields[i];
      arr.push([d.id, 1, Math.round(d.x), Math.round(d.y), Math.round(d.hp), Math.round(d.maxHp), 0, defenseLevel(d)]);
    }
    for (let i = 0; i < walls.length; i++) {
      const d = walls[i];
      arr.push([d.id, 2, Math.round(d.x), Math.round(d.y), Math.round(d.hp), Math.round(d.maxHp), Math.round((d.ang || 0) * 100), defenseLevel(d)]);
    }
    return arr;
  }

  function coopApplyDefenses(list) {
    if (coopNet.host || !list) return;
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row || row.length < 6 || !row[0]) continue;
      const id = row[0];
      const kind = row[1];
      const arr = kind === 0 ? turrets : kind === 1 ? fields : walls;
      let d = null;
      for (let j = 0; j < arr.length; j++) if (arr[j].id === id) { d = arr[j]; break; }
      if (!d) {
        if (kind === 0) {
          d = { id, kind: "turret", synced: true, x: 0, y: 0, cd: 0, ang: -Math.PI / 2,
            seed: Math.random() * TAU, hp: 1, maxHp: 1, hitR: 18, flash: 0 };
        } else if (kind === 1) {
          d = { id, kind: "field", synced: true, x: 0, y: 0,
            r: CFG.RUN.FIELD_RADIUS * view.scale, seed: Math.random() * TAU,
            hp: 1, maxHp: 1, hitR: 20, flash: 0 };
        } else {
          d = { id, kind: "wall", synced: true, x: 0, y: 0, ang: 0,
            len: CFG.RUN.WALL_LEN * view.scale, thick: CFG.RUN.WALL_THICK * view.scale,
            seed: Math.random() * TAU, hp: 1, maxHp: 1, flash: 0,
            hitR: CFG.RUN.WALL_THICK * view.scale * 0.5 + 6 };
        }
        arr.push(d);
      }
      const hp = row[4], maxHp = row[5] || 1;
      if (hp < d.hp - 0.5) d.flash = 1;          // 客户端从掉血推导受击闪白
      d.x = row[2];
      d.y = row[3];
      d.hp = hp;
      d.maxHp = maxHp;
      d.level = row[7] || 1;
      if (kind === 0 || kind === 2) d.ang = (row[6] || 0) / 100;
      applyDefenseLevel(d);
      seen[id] = 1;
    }
    // 房主已摧毁的防线，在客户端移除并播放摧毁反馈
    for (let i = turrets.length - 1; i >= 0; i--) {
      if (turrets[i].synced && !seen[turrets[i].id]) {
        emit(turrets[i].x, turrets[i].y, 16, "#ffd666", 220, 3, 0.55);
        addText(turrets[i].x, turrets[i].y - 26, "防线被摧毁", "#ff6b6b", 13);
        turrets.splice(i, 1);
      }
    }
    for (let i = fields.length - 1; i >= 0; i--) {
      if (fields[i].synced && !seen[fields[i].id]) {
        emit(fields[i].x, fields[i].y, 16, "#8ff6ff", 220, 3, 0.55);
        addText(fields[i].x, fields[i].y - 26, "防线被摧毁", "#ff6b6b", 13);
        fields.splice(i, 1);
      }
    }
    for (let i = walls.length - 1; i >= 0; i--) {
      if (walls[i].synced && !seen[walls[i].id]) {
        emit(walls[i].x, walls[i].y, 16, "#d8e6ff", 220, 3, 0.55);
        addText(walls[i].x, walls[i].y - 26, "城墙被摧毁", "#ff6b6b", 13);
        walls.splice(i, 1);
      }
    }
  }

  // 房主确认/拒绝后清理客户端的建造预测残影
  function clearBuildGhost(type, x, y) {
    for (let i = 0; i < buildGhosts.length; i++) {
      const g = buildGhosts[i];
      if (type && g.type !== type) continue;
      if (x !== undefined && dist2(g.x, g.y, x, y) > 90 * 90) continue;
      buildGhosts.splice(i, 1);
      return;
    }
  }

  function coopSendSnapshot() {
    if (!coopNet.host || state !== "playing") return;
    coopSnapSeq += 1;
    coopSendState({
      t: "snap", v: COOP_SNAP_VER, s: coopSnapSeq, pl: coopSnapshotList(),
      cr: Math.round(credits), co: cores, rv: revives,
      df: coopDefenseList(),
      sg: coopWellList(),
      sf: coopFrostList(),
      dd: Math.round(defDamageTaken),
      dl: defLost,
    });
  }

  function coopApplySnapshot(d) {
    if (coopNet.host || !d || d.v !== COOP_SNAP_VER || !d.pl || !d.pl.length) return;
    if (state !== "playing" || !player) return;
    for (let i = 0; i < d.pl.length; i++) {
      const e = d.pl[i];
      if (!e || e.length < 4) continue;
      const id = e[0];
      if (!id) continue;
      if (id === localPlayerId) { coopCorrectLocal(e); continue; }
      let p = null;
      for (let j = 0; j < players.length; j++) if (players[j].id === id) { p = players[j]; break; }
      if (!p) p = coopAddRemote(id, e[1] / 10, e[2] / 10);
      if (!p) continue;
      p.x = e[1] / 10;
      p.y = e[2] / 10;
      p.facing = e[3] / 100;
      if (e.length >= 8) {
        p.hp = e[4];
        p.hpMax = e[5];
        p.shield = e[6];
        p.stats.shieldMax = e[7];
      }
      if (e.length >= 10) {
        p.down = !!e[8];
        p.downTimer = e[9] || 0;
        p.eliminated = !!e[10];
      }
      if (e.length >= 13) {
        p.level = e[11] || 1;
        p.kills = e[12] || 0;
      }
      if (e.length >= 15) {
        if (e[13]) p.skill = e[13];
        p.skillEnergy = e[14] || 0;
      }
      if (e.length >= 16) p.skillMod = e[15] || "";
      coopInterpPush(id, p.x, p.y, p.facing);
    }
    // 团队共享资源（D-03）：星币 / 核心 / 保险由房主同步
    if (typeof d.cr === "number" && d.cr !== credits) credits = d.cr;
    if (typeof d.co === "number" && d.co !== cores) cores = d.co;
    if (typeof d.rv === "number" && d.rv !== revives) revives = d.rv;
    if (d.df) coopApplyDefenses(d.df);       // 炮塔/缓速场及耐久由房主同步
    if (d.sg) coopApplyWells(d.sg);          // 重力井表现由房主同步
    if (d.sf) coopApplyFrost(d.sf);          // 冰痕减速区表现由房主同步
    if (typeof d.dd === "number") defDamageTaken = d.dd;
    if (typeof d.dl === "number") defLost = d.dl;
    refreshHud();
  }

  /* ===== 本地预测与校正（P3-05）：房主快照逐步纠偏，不做瞬移 ===== */
  const COOP_SNAP_SNAP_DIST = 180;   // 超过这个误差视为掉队，直接对齐
  const COOP_SNAP_CORRECT = 0.25;    // 每次快照纠偏 25%

  function coopCorrectLocal(e) {
    if (!player) return;
    const ax = e[1] / 10;
    const ay = e[2] / 10;
    // 生命 / 护盾 / 倒地状态以房主为准（P4-04）
    const hpBefore = player.hp;
    if (e.length >= 8) {
      player.hp = e[4];
      player.hpMax = e[5];
      player.shield = e[6];
      player.stats.shieldMax = e[7];
    }
    if (e.length >= 10) {
      player.down = !!e[8];
      player.downTimer = e[9] || 0;
      player.eliminated = !!e[10];
    }
    if (e.length >= 13) {
      player.level = e[11] || player.level;
      player.kills = e[12] || 0;
      syncProgressGlobals(player);
    }
    if (e.length >= 15) {
      if (e[13]) player.skill = e[13];
      player.skillEnergy = e[14] || 0;
    }
    if (e.length >= 16) player.skillMod = e[15] || "";
    if (player.hp < hpBefore - 0.5) {
      if (coopGuestShop) coopCloseShopUI();     // 受击关闭个人商店
      if (coopGuestTrade) coopCloseTradeUI();
    }
    if (player.eliminated) return;
    const dx = ax - player.x;
    const dy = ay - player.y;
    const d = Math.hypot(dx, dy);
    if (d > COOP_SNAP_SNAP_DIST) {
      player.x = ax;
      player.y = ay;
      return;
    }
    if (d > 0.5) {
      player.x += dx * COOP_SNAP_CORRECT;
      player.y += dy * COOP_SNAP_CORRECT;
    }
  }

  /* ===== 远端插值（P3-04）：120ms 缓冲，按接收时间平滑 ===== */
  const COOP_INTERP_MS = 120;

  function coopClearInterp() {
    for (const id in coopInterp) delete coopInterp[id];
  }

  function coopInterpPush(id, x, y, f) {
    const now = performance.now();
    const buf = coopInterp[id] || (coopInterp[id] = []);
    const last = buf[buf.length - 1];
    if (last && now - last.t < 4) {
      last.x = x;
      last.y = y;
      last.f = f;
      return;
    }
    buf.push({ t: now, x, y, f });
    if (buf.length > 15) buf.shift();
  }

  function coopLerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }

  function coopInterpTick() {
    if (!roomCode || coopNet.host || state !== "playing") return;
    const target = performance.now() - COOP_INTERP_MS;
    for (const id in coopInterp) {
      const buf = coopInterp[id];
      if (!buf || !buf.length) continue;
      while (buf.length > 2 && buf[1].t <= target) buf.shift();
      const a = buf[0];
      let x = a.x;
      let y = a.y;
      let f = a.f;
      if (buf.length >= 2) {
        const b = buf[1];
        const span = b.t - a.t;
        const k = span > 0 ? Math.max(0, Math.min(1, (target - a.t) / span)) : 1;
        x = a.x + (b.x - a.x) * k;
        y = a.y + (b.y - a.y) * k;
        f = coopLerpAngle(a.f, b.f, k);
      }
      let p = null;
      for (let j = 0; j < players.length; j++) if (players[j].id === id) { p = players[j]; break; }
      if (!p) continue;
      p.x = x;
      p.y = y;
      p.facing = f;
    }
  }

  /* ===== 敌人同步（P3-06）：房主 15Hz 广播，客户端只做表现 ===== */
  function coopIsGuest() {
    return !!roomCode && !coopNet.host;
  }

  /* ===== 兴趣裁剪（P3-11）：只下发该客户端视野 + 120px ===== */
  const COOP_CULL_PAD = 120;
  const COOP_CULL_MIN = 700;        // 小窗 / 竖屏保底半径

  function coopCullRadius(g) {
    const w = (g && g.vw) || view.w;
    const h = (g && g.vh) || view.h;
    return Math.max(COOP_CULL_MIN, Math.hypot(w, h) / 2) + COOP_CULL_PAD;
  }

  function coopInRange(x, y, cx, cy, rad) {
    if (rad === undefined) return true;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= rad * rad;
  }

  function coopEnemyList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || e.synced || e.isBoss) continue;
      if (!coopInRange(e.x, e.y, cx, cy, rad)) continue;
      arr.push([
        e.id, e.type,
        Math.round(e.x * 10), Math.round(e.y * 10),
        Math.round(e.hp), Math.round(e.maxHp), Math.round(e.r),
      ]);
    }
    return arr;
  }

  function coopBulletList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < ebullets.length && arr.length < 160; i++) {
      const b = ebullets[i];
      if (b.dead) continue;
      if (!coopInRange(b.x, b.y, cx, cy, rad)) continue;
      arr.push([
        Math.round(b.x * 10), Math.round(b.y * 10), Math.round(b.r),
        Math.round(b.dmg * 10) / 10, b.color, b.heavy ? 1 : 0,
      ]);
    }
    return arr;
  }

  function coopApplyEnemyBullets(list) {
    if (coopNet.host || !list) return;
    const next = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || s.length < 6) continue;
      next.push({
        x: s[0] / 10, y: s[1] / 10, vx: 0, vy: 0,
        r: s[2], dmg: s[3], color: s[4], heavy: !!s[5],
        life: 5, dead: false, synced: true,
      });
    }
    ebullets = next;
  }

  function coopPlayerBulletList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < bullets.length && arr.length < 200; i++) {
      const b = bullets[i];
      if (b.dead || !b.owner) continue;       // 只同步玩家/无人机子弹
      if (!coopInRange(b.x, b.y, cx, cy, rad)) continue;
      arr.push([
        b.bid, Math.round(b.x * 10), Math.round(b.y * 10),
        Math.round(b.r), b.color, b.owner,
      ]);
    }
    return arr;
  }

  function coopApplyPlayerBullets(list) {
    if (coopNet.host || !list) return;
    const next = [];
    const keep = {};
    for (let i = 0; i < bullets.length; i++) {
      if (!bullets[i].synced) next.push(bullets[i]);   // 本地预测的自己的子弹保留
    }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || s.length < 6) continue;
      if (s[5] === localPlayerId) continue;            // 自己的子弹已在本地
      let b = null;
      for (let j = 0; j < next.length; j++) {
        if (next[j].synced && next[j].bid === s[0]) { b = next[j]; break; }
      }
      if (!b) {
        b = {
          bid: s[0], owner: s[5], x: s[1] / 10, y: s[2] / 10,
          vx: 0, vy: 0, r: s[3], dmg: 0, pierce: 0, life: 1.5,
          dead: false, hit: new Set(), ang: 0, color: s[4], synced: true,
        };
        next.push(b);
      }
      b.tx = s[1] / 10;
      b.ty = s[2] / 10;
      keep[s[0]] = 1;
    }
    bullets = next.filter((b) => !b.synced || keep[b.bid]);
  }

  /* ===== Boss 同步（P3-09）：房主广播完整状态，客户端只做表现 ===== */
  function coopBossState() {
    const b = boss;
    if (!b || b.dead) return null;
    return [
      b.id, Math.round(b.x * 10), Math.round(b.y * 10),
      Math.round(b.hp), Math.round(b.maxHp), b.phase,
      Math.round(b.laserAng * 100), Math.round(b.laserTime * 100) / 100,
      Math.round(b.shield), b.rage > 0 ? 1 : 0,
      (b.mechanics || []).join(","), b.warn > 0 ? 1 : 0,
      Math.round(b.dashAng * 100), Math.round(b.spin * 100) / 100,
    ];
  }

  function coopApplyBoss(s) {
    if (coopNet.host || s === undefined) return;
    if (!s) {
      if (boss) {
        const idx = enemies.indexOf(boss);
        if (idx >= 0) enemies.splice(idx, 1);
        boss = null;
      }
      hideBossBar();
      return;
    }
    const mech = String(s[10] || "").split(",").filter(Boolean);
    if (!boss) {
      boss = {
        id: s[0], type: "boss", x: s[1] / 10, y: s[2] / 10,
        r: CFG.BOSS.r, hp: s[3], maxHp: s[4], speed: 0, dmg: 0, xp: 0, score: 0,
        color: THEME.boss, angle: 0, seed: 0, isBoss: true, dead: false, synced: true,
        fireCd: 0, burstCd: 0, ringCd: 0, minionCd: 0,
        warn: 0, dashTime: 0, dashCd: 0, dashAng: 0,
        phase: s[5], spin: s[13], mechanics: mech,
        shield: s[8], shieldCd: 0, laserCd: 0, laserTime: 0, laserAng: 0,
        rage: 0, rageCd: 0,
      };
      enemies.push(boss);
      bossSpawned = true;
      document.getElementById("boss-wrap").classList.remove("hidden");
      document.getElementById("ui-boss-name").textContent = bossLabel(boss);
    }
    boss.x = s[1] / 10;
    boss.y = s[2] / 10;
    boss.hp = s[3];
    boss.maxHp = s[4];
    boss.phase = s[5];
    boss.laserAng = s[6] / 100;
    boss.laserTime = s[7];
    boss.shield = s[8];
    boss.rage = s[9] ? 1 : 0;
    boss.mechanics = mech;
    boss.warn = s[11] ? 1 : 0;
    boss.dashAng = s[12] / 100;
    boss.spin = s[13];
  }

  /* ===== 场景物件同步（P3-10）：陨石 / 游商 / 经验 / 核心 / 芯片 ===== */
  function coopAsteroidList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < asteroids.length && arr.length < 12; i++) {
      const a = asteroids[i];
      if (!coopInRange(a.x, a.y, cx, cy, rad)) continue;
      arr.push([a.id, Math.round(a.x * 10), Math.round(a.y * 10), Math.round(a.r),
        Math.round(a.hp), Math.round(a.maxHp), Math.round(a.seed * 100) / 100]);
    }
    return arr;
  }

  function coopApplyAsteroids(list) {
    if (coopNet.host || !list) return;
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || s.length < 7) continue;
      let a = null;
      for (let j = 0; j < asteroids.length; j++) {
        if (asteroids[j].id === s[0]) { a = asteroids[j]; break; }
      }
      if (!a) {
        const r = s[3];
        const n = 7 + randInt(3);
        const verts = [];
        for (let k = 0; k < n; k++) verts.push({ a: (k / n) * TAU, r: r * rand(0.78, 1.12) });
        a = { id: s[0], x: s[1] / 10, y: s[2] / 10, r, hp: s[4], maxHp: s[5], verts, seed: s[6], flash: 0, synced: true };
        asteroids.push(a);
      }
      a.x = s[1] / 10;
      a.y = s[2] / 10;
      a.hp = s[4];
      a.maxHp = s[5];
      seen[s[0]] = 1;
    }
    asteroids = asteroids.filter((a) => seen[a.id]);
  }

  function coopTraderState() {
    const t = trader;
    if (!t) return null;
    return [Math.round(t.x * 10), Math.round(t.y * 10), Math.round(t.r),
      Math.round(t.life * 10) / 10, Math.round(t.seed * 100) / 100];
  }

  function coopApplyTrader(s) {
    if (coopNet.host || s === undefined) return;
    if (!s) { trader = null; return; }
    trader = {
      x: s[0] / 10, y: s[1] / 10, r: s[2], life: s[3], seed: s[4] || 0, synced: true,
    };
  }

  function coopGemList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < gems.length && arr.length < 150; i++) {
      if (!coopInRange(gems[i].x, gems[i].y, cx, cy, rad)) continue;
      arr.push([Math.round(gems[i].x * 10), Math.round(gems[i].y * 10), gems[i].value]);
    }
    return arr;
  }

  function coopApplyGems(list) {
    if (coopNet.host || !list) return;
    const next = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      next.push({
        x: s[0] / 10, y: s[1] / 10, vx: 0, vy: 0, value: s[2],
        r: 4.5, pulse: i * 0.7, synced: true,
      });
    }
    gems = next;
  }

  function coopCoreList(cx, cy, rad) {
    const arr = [];
    for (let i = 0; i < coreDrops.length && arr.length < 30; i++) {
      const c = coreDrops[i];
      if (!coopInRange(c.x, c.y, cx, cy, rad)) continue;
      arr.push([Math.round(c.x * 10), Math.round(c.y * 10), Math.round(c.seed * 100) / 100, Math.round(c.life * 10) / 10]);
    }
    return arr;
  }

  function coopApplyCores(list) {
    if (coopNet.host || !list) return;
    const next = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      next.push({ x: s[0] / 10, y: s[1] / 10, seed: s[2], life: s[3], synced: true });
    }
    coreDrops = next;
  }

  function coopChipList() {
    const arr = [];
    for (let i = 0; i < chipDrops.length && arr.length < 10; i++) {
      const d = chipDrops[i];
      arr.push([Math.round(d.x * 10), Math.round(d.y * 10), Math.round(d.seed * 100) / 100,
        Math.round(d.life * 10) / 10, d.chip ? d.chip.tier : 0]);
    }
    return arr;
  }

  function coopApplyChips(list) {
    if (coopNet.host || !list) return;
    const next = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      next.push({
        x: s[0] / 10, y: s[1] / 10, seed: s[2], life: s[3],
        chip: { tier: s[4] || 0, kind: "dmg", name: "", icon: "", value: 0 },
        synced: true,
      });
    }
    chipDrops = next;
  }

  function coopEnemyPacket(cx, cy, rad, full) {
    const pkt = {
      t: "en", s: coopSnapSeq,
      list: coopEnemyList(cx, cy, rad),
      eb: coopBulletList(cx, cy, rad),
      pb: coopPlayerBulletList(cx, cy, rad),
      bs: coopBossState(),                 // Boss 全量：不受裁剪
      tr: coopTraderState(),               // 游商为关键事件：每帧同步
    };
    // 掉落物/环境物变化慢，降到约 5Hz，减少序列化与带宽
    if (full) {
      pkt.as = coopAsteroidList(cx, cy, rad);
      pkt.gm = coopGemList(cx, cy, rad);
      pkt.cd = coopCoreList(cx, cy, rad);
      pkt.ch = coopChipList();
    }
    return pkt;
  }

  let coopHeavyTick = 0;

  function coopSendEnemies() {
    if (!coopNet.host || state !== "playing") return;
    // 按客户端兴趣裁剪：以该队友的玩家位置为中心，视野半径 + 120px
    coopHeavyTick = (coopHeavyTick + 1) % 3;
    const full = coopHeavyTick === 0;
    for (const pid in coopGuests) {
      const g = coopGuests[pid];
      if (!g.state || !g.state.open) continue;
      let p = null;
      if (g.id) {
        for (let i = 0; i < players.length; i++) {
          if (players[i].id === g.id) { p = players[i]; break; }
        }
      }
      const cx = p ? p.x : (player ? player.x : world.w / 2);
      const cy = p ? p.y : (player ? player.y : world.h / 2);
      const pkt = coopEnemyPacket(cx, cy, coopCullRadius(g), full);
      g.state.send(pkt);
      coopCountSent(pkt);
    }
  }

  function coopSyncedEnemy(id, type, x, y, hp, maxHp, r) {
    const e = spawnEnemy(type, x, y, true);
    if (!e) return null;
    e.id = id;
    e.synced = true;
    e.speed = 0;
    e.hp = hp;
    e.maxHp = maxHp;
    if (r) e.r = r;
    return e;
  }

  function coopApplyEnemies(d) {
    if (coopNet.host || !d || state !== "playing") return;
    const list = d.list || [];
    const seen = {};
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || s.length < 7) continue;
      const id = s[0];
      let e = null;
      for (let j = 0; j < enemies.length; j++) {
        if (enemies[j].synced && enemies[j].id === id) { e = enemies[j]; break; }
      }
      const nx = s[2] / 10, ny = s[3] / 10;
      if (!e) e = coopSyncedEnemy(id, s[1], nx, ny, s[4], s[5], s[6]);
      if (!e) continue;
      // 目标位置用于插值；偏差过大（传送/重生）才直接吸附
      if (dist2(nx, ny, e.x, e.y) > 220 * 220) { e.x = nx; e.y = ny; }
      e.tx = nx;
      e.ty = ny;
      e.hp = s[4];
      e.maxHp = s[5];
      if (s[6]) e.r = s[6];
      e.dead = false;
      seen[id] = 1;
    }
    // 清掉非同步敌人（本地误生成的）以及房主已移除的敌人
    enemies = enemies.filter((e) => e.synced && seen[e.id]);
    coopApplyEnemyBullets(d.eb);
    coopApplyPlayerBullets(d.pb);
    coopApplyBoss(d.bs);
    coopApplyAsteroids(d.as);
    coopApplyTrader(d.tr);
    coopApplyGems(d.gm);
    coopApplyCores(d.cd);
    coopApplyChips(d.ch);
  }

  function coopPosTick() {
    if (coopNet.host) {
      coopSendSnapshot();
      coopSendEnemies();
    } else {
      coopSendPositions();
    }
  }

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
    coopSnapSeq = 0;
    coopPosTimer = setInterval(coopPosTick, 66);
  }

  function coopStopPosLoop() {
    if (coopPosTimer) {
      clearInterval(coopPosTimer);
      coopPosTimer = null;
    }
  }

  /* ===== 输入包（P3-01）：30Hz，序号 + 最近 3 帧冗余 ===== */
  let coopInTimer = null;
  let coopInSeq = 0;
  let coopInBuf = [];
  const coopEdge = { dash: false, ult: false };
  let coopInState = {};       // 房主侧：玩家 id -> 已处理的最大帧序号

  // 冲刺/超载是一次性动作，update 会立刻消费；这里单独留一份给输入包
  function coopMarkEdge(kind) {
    if (roomCode && !coopNet.host) coopEdge[kind] = true;
  }

  function coopInputFrame() {
    const p = getLocalPlayer();
    const it = (p && p.intent) || {};
    const fr = {
      s: 0,
      mx: Math.round((it.mx || 0) * 100) / 100,
      my: Math.round((it.my || 0) * 100) / 100,
      f: it.fire ? 1 : 0,
      d: coopEdge.dash ? 1 : 0,
      u: coopEdge.ult ? 1 : 0,
      a: Math.round((it.aim || 0) * 100) / 100,
    };
    coopEdge.dash = false;
    coopEdge.ult = false;
    return fr;
  }

  function coopSendInput() {
    if (coopNet.host || state !== "playing" || !player) return;
    coopInSeq += 1;
    const fr = coopInputFrame();
    fr.s = coopInSeq;
    coopInBuf.push(fr);
    if (coopInBuf.length > 3) coopInBuf.shift();
    coopSendState({
      t: "i", id: player.id, seq: coopInSeq, fr: coopInBuf.slice(),
      vw: Math.round(view.w), vh: Math.round(view.h),   // 供房主做兴趣裁剪
    });
  }

  // 输入包校验（P3-13）：房主不信客户端，逐字段限幅
  function coopInNum(v, min, max, fallback) {
    return (typeof v === "number" && isFinite(v)) ? clamp(v, min, max) : fallback;
  }

  function coopInReject() {
    coopInBad += 1;
  }

  function coopApplyInput(d, conn) {
    if (!coopNet.host || !d || typeof d !== "object") return;
    if (!Array.isArray(d.fr) || !d.fr.length || d.fr.length > COOP_IN_MAX_FRAMES) {
      coopInReject();
      return;
    }
    if (typeof d.id !== "string" || !d.id) { coopInReject(); return; }

    // 身份校验 + 限流：只接受该连接自称的玩家
    let g = null;
    if (conn && conn.peer) {
      g = coopGuests[conn.peer];
      if (!g || g.id !== d.id) { coopInReject(); return; }
      const sec = Math.floor(Date.now() / 1000);
      if (g.inSec !== sec) { g.inSec = sec; g.inCount = 0; }
      g.inCount = (g.inCount || 0) + 1;
      if (g.inCount > COOP_IN_RATE) { coopInReject(); return; }
    } else {
      for (const k in coopGuests) if (coopGuests[k].id === d.id) { g = coopGuests[k]; break; }
    }

    // 视口尺寸用于兴趣裁剪，限制在合理区间
    if (g && typeof d.vw === "number" && typeof d.vh === "number") {
      g.vw = Math.round(clamp(d.vw, 320, 4096));
      g.vh = Math.round(clamp(d.vh, 240, 2160));
    }

    let p = null;
    for (let i = 0; i < players.length; i++) if (players[i].id === d.id) { p = players[i]; break; }
    if (!p) return;

    const seq = typeof d.seq === "number" && isFinite(d.seq) ? d.seq : 0;
    if (seq <= 0) { coopInReject(); return; }
    const st = coopInState[d.id] || (coopInState[d.id] = { seq: 0 });
    if (seq <= st.seq) return;
    if (seq > st.seq + 600) {          // 序号一次跳 20 秒以上：视为伪造
      coopInReject();
      st.seq = seq;
      return;
    }

    let dash = false;
    let ult = false;
    for (let i = 0; i < d.fr.length; i++) {
      const f = d.fr[i];
      if (!f || typeof f !== "object") { coopInReject(); return; }
      const fs = typeof f.s === "number" && isFinite(f.s) ? f.s : 0;
      if (fs && fs <= st.seq) continue;
      if (f.d) dash = true;           // 冲刺/超载仍受房主冷却与能量裁决
      if (f.u) ult = true;
    }
    const last = d.fr[d.fr.length - 1];
    let mx = coopInNum(last.mx, -1, 1, 0);
    let my = coopInNum(last.my, -1, 1, 0);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }   // 禁止斜向超速
    st.seq = seq;
    p.intent = {
      mx,
      my,
      fire: !!last.f,
      dash,
      ult,
      aim: coopInNum(last.a, -Math.PI, Math.PI, 0),
    };
  }

  function coopStartInputLoop() {
    if (coopInTimer) return;
    coopInSeq = 0;
    coopInBuf = [];
    coopInTimer = setInterval(coopSendInput, 33);
  }

  function coopStopInputLoop() {
    if (coopInTimer) {
      clearInterval(coopInTimer);
      coopInTimer = null;
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
    coopStartInputLoop();
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

  function startIceWatchdog(conn) {
    if (coopIceTimer) clearInterval(coopIceTimer);
    const t0 = Date.now();
    coopIceTimer = setInterval(() => {
      if (!coopNet.peer || coopNet.host || !conn) {
        clearInterval(coopIceTimer);
        coopIceTimer = null;
        return;
      }
      if (conn.open) {
        clearInterval(coopIceTimer);
        coopIceTimer = null;
        return;
      }
      const pc = conn.peerConnection;
      const ice = pc ? pc.iceConnectionState : "";
      if (ice === "failed") {
        clearInterval(coopIceTimer);
        coopIceTimer = null;
        coopFatal("P2P 打洞失败", "手机流量 / 公司网络常被运营商 NAT 拦截，电脑和手机无法直连。请优先让两台设备连同一 Wi-Fi；或配置 TURN 中继后重试。");
      } else if (Date.now() - t0 > 9000) {
        clearInterval(coopIceTimer);
        coopIceTimer = null;
        coopFatal("连接超时", ice === "checking"
          ? "网络打洞未成功：手机流量网络常被 NAT 拦截，建议两台设备连同一 Wi-Fi，或配置 TURN 中继。"
          : "无法建立直连：请检查网络后重试，或让两台设备连同一 Wi-Fi。");
      }
    }, 500);
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
        const ctrl = peer.connect(target, { label: "ctrl", reliable: true, serialization: "json" });
        wireChannel("ctrl", ctrl);
        startIceWatchdog(ctrl);
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
    if (coopNet.ctrl && coopNet.ctrl.open) { coopNet.ctrl.send(msg); coopCountSent(msg); }
  }

  function coopSendState(msg) {
    if (coopNet.host) {
      for (const pid in coopGuests) {
        const c = coopGuests[pid].state;
        if (c && c.open) { c.send(msg); coopCountSent(msg); }
      }
      return;
    }
    if (coopNet.state && coopNet.state.open) { coopNet.state.send(msg); coopCountSent(msg); }
  }

  /* ===== 可靠事件通道（P3-12）：关键事件走 ctrl，不随状态包丢失 ===== */
  // ===== 个人升级（P4-01 / P4-03）：房主生成报价，玩家各自选择 =====
  const COOP_UPGRADE_TIME = 10;
  let coopOfferSeq = 0;
  let coopGuestOffer = null;     // 加入方：当前个人升级报价
  let coopHostOfferP = null;     // 房主：当前正在选卡的本地玩家

  function coopPlayerById(id) {
    if (!id) return null;
    for (let i = 0; i < players.length; i++) if (players[i].id === id) return players[i];
    return null;
  }

  function coopFindPeerOf(id) {
    for (const pid in coopGuests) if (coopGuests[pid].id === id) return pid;
    return null;
  }

  function coopSendTo(pid, msg) {
    const g = coopGuests[pid];
    const c = g && g.ctrl;
    if (c && c.open) { c.send(msg); coopCountSent(msg); }
  }

  function coopSendEventTo(pid, kind, data) {
    if (!pid) return;
    coopEventSeq += 1;
    coopSendTo(pid, { t: "ev", id: coopEventSeq, k: kind, d: data || null });
  }

  function coopOfferCards(p) {
    return buildCards(p).map((c) => ({
      defId: c.def.id, mult: c.mult,
      rarityKey: c.rarity.key, rarityName: c.rarity.name,
      name: c.def.name, icon: c.def.icon, text: c.text,
      curse: !!c.def.curse, evo: !!c.def.evolution, mod: !!c.def.mod,
    }));
  }

  function coopOfferUpgrade(p) {
    if (!p || p.pendingLevels <= 0 || p.upOffer) return;
    const cards = coopOfferCards(p);
    p.upOffer = { oid: ++coopOfferSeq, cards, rerolled: false };
    p.upgradeTimer = COOP_UPGRADE_TIME;
    p.invuln = Math.max(p.invuln, 3);      // 选卡期间 3 秒无敌

    if (p.local) {
      coopHostOfferP = p;
      coopShowUpgradeOffer(p, p.upOffer);
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) {
      coopSendEventTo(pid, "up-offer", {
        oid: p.upOffer.oid, lv: p.level, t: COOP_UPGRADE_TIME, cards,
        rerolled: false, left: p.pendingLevels,
      });
    } else {
      coopApplyPick(p, 0);                 // 队友已断开：自动选，避免卡住
    }
  }

  // 刷新升级卡：房主扣核心、重新生成同一玩家的三选一
  function coopRerollOffer(p) {
    if (!p || !p.upOffer || p.upOffer.rerolled) return;
    const cost = CFG.RUN.UPGRADE_REROLL_COST;
    if (cores < cost) {
      if (p.local) addText(p.x, p.y - 46, "核心不足", "#ff9f9f", 12);
      return;
    }
    cores -= cost;
    p.upOffer = { oid: ++coopOfferSeq, cards: coopOfferCards(p), rerolled: true };
    p.upgradeTimer = Math.max(p.upgradeTimer, 6);
    if (p.local) {
      coopHostOfferP = p;
      coopShowUpgradeOffer(p, p.upOffer);
      updateUpgradeMeta();
      refreshHud(true);
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) {
      coopSendEventTo(pid, "up-offer", {
        oid: p.upOffer.oid, lv: p.level, t: p.upgradeTimer, cards: p.upOffer.cards,
        rerolled: true, left: p.pendingLevels,
      });
    }
  }

  function coopRerollUpgrade() {
    if (coopNet.host) {
      const lp = getLocalPlayer() || player;
      if (lp) coopRerollOffer(lp);
      return;
    }
    const offer = coopGuestOffer;
    if (!offer || offer.rerolled) return;
    offer.rerolled = true;                 // 防连点，等新报价
    coopEventSeq += 1;
    coopSendCtrl({ t: "ev", id: coopEventSeq, k: "up-reroll", d: { oid: offer.oid } });
    updateUpgradeMeta();
  }

  function coopShowUpgradeOffer(p, offer) {
    const cards = offer.cards.map((c) => ({
      def: { id: c.defId, name: c.name, icon: c.icon, curse: c.curse, evolution: c.evo, mod: c.mod },
      rarity: { key: c.rarityKey, name: c.rarityName },
      text: c.text,
    }));
    upgradeCards = cards;
    renderCards(cards);
    document.getElementById("ui-up-level").textContent =
      "LV " + p.level + " · " + Math.ceil(p.upgradeTimer) + "s";
    document.getElementById("ov-upgrade").classList.remove("hidden");
    sfxLevelUp();
    refreshHud();
  }

  function coopCloseUpgradeUI() {
    document.getElementById("ov-upgrade").classList.add("hidden");
    coopHostOfferP = null;
    coopGuestOffer = null;
  }

  // 房主裁决：按报价里的卡牌应用，客户端不能自选任意 ID
  function coopApplyPick(p, idx) {
    if (!p || !p.upOffer) return;
    const offer = p.upOffer;
    const c = offer.cards[idx] || offer.cards[0];
    const def = c ? ALL_DEFS.find((d) => d.id === c.defId) : null;
    p.upOffer = null;
    p.upgradeTimer = 0;
    if (!def || !c) return;

    def.apply(p.stats, c.mult, p);
    p.stacks[def.id] = (p.stacks[def.id] || 0) + 1;
    p.pendingLevels = Math.max(0, p.pendingLevels - 1);
    p.invuln = Math.max(p.invuln, 3);
    emit(p.x, p.y, 18, "#7ef0ff", 240, 3, 0.6);
    addText(p.x, p.y - 52, `${def.name} · ${def.curse ? "诅咒" : "强化"}`, "#7ef0ff", 14);

    if (p.local) {
      syncProgressGlobals(p);
      coopCloseUpgradeUI();
      updateBuffPanel();
      refreshHud(true);
    } else if (coopNet.host) {
      const pid = coopFindPeerOf(p.id);
      if (pid) {
        coopSendEventTo(pid, "up-close", { oid: offer.oid });
        coopSendEventTo(pid, "own", coopOwnState(p));
      }
    }
    if (p.pendingLevels > 0) coopOfferUpgrade(p);
  }

  // 本地点击：房主直接裁决，客户端上报选择
  function coopPickUpgrade(idx) {
    const lp = getLocalPlayer() || player;
    if (coopNet.host) {
      if (lp && lp.upOffer) coopApplyPick(lp, idx);
      return;
    }
    const offer = coopGuestOffer;
    if (!offer || offer.locked) return;
    offer.locked = true;
    coopEventSeq += 1;
    coopSendCtrl({ t: "ev", id: coopEventSeq, k: "up-pick", d: { oid: offer.oid, i: idx } });
    coopCloseUpgradeUI();
  }

  function coopUpgradeOpen() {
    const el = document.getElementById("ov-upgrade");
    return !!(el && !el.classList.contains("hidden") && (coopHostOfferP || coopGuestOffer));
  }

  // 房主推进选卡倒计时，超时自动选第一张
  function coopUpgradeTick(dt) {
    if (!coopNet.host) return;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.upOffer) continue;
      p.upgradeTimer = Math.max(0, p.upgradeTimer - dt);
      if (p.upgradeTimer <= 0) coopApplyPick(p, 0);
    }
    if (coopHostOfferP && coopHostOfferP.upOffer) {
      document.getElementById("ui-up-level").textContent =
        "LV " + coopHostOfferP.level + " · " + Math.ceil(coopHostOfferP.upgradeTimer) + "s";
    }
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.shopOpen) {
        p.shopTimer = Math.max(0, p.shopTimer - dt);
        if (p.shopTimer <= 0) coopCloseShop(p);
        else if (p.local && coopHostShopP === p) {
          document.getElementById("shop-sub").textContent =
            "个人补给 · " + Math.ceil(p.shopTimer) + "s 或受击关闭";
        }
      }
      if (p.tradeCooldown > 0) p.tradeCooldown = Math.max(0, p.tradeCooldown - dt);
      if (p.tradeOffer) {
        p.tradeTimer = Math.max(0, p.tradeTimer - dt);
        if (p.tradeTimer <= 0) coopCloseTrade(p);
      }
    }
  }

  // 加入方推进自己的 UI 倒计时
  function coopGuestTick(dt) {
    if (coopNet.host) return;
    const offer = coopGuestOffer;
    if (offer) {
      offer.timer = Math.max(0, offer.timer - dt);
      document.getElementById("ui-up-level").textContent =
        "LV " + offer.lv + " · " + Math.ceil(offer.timer) + "s";
      if (offer.timer <= 0) coopPickUpgrade(0);
    }
    if (coopGuestShop) {
      coopGuestShop.timer = Math.max(0, coopGuestShop.timer - dt);
      const el = document.getElementById("shop-sub");
      if (el) el.textContent = "个人补给 · " + Math.ceil(coopGuestShop.timer) + "s 或受击关闭";
      if (coopGuestShop.timer <= 0) coopCloseShopUI();
    }
    if (coopGuestTrade) {
      coopGuestTrade.timer = Math.max(0, coopGuestTrade.timer - dt);
      if (coopGuestTrade.timer <= 0) {
        coopEventSeq += 1;
        coopSendCtrl({ t: "ev", id: coopEventSeq, k: "trade-bye", d: { sid: coopGuestTrade.sid } });
        coopCloseTradeUI();
      }
    }
  }

  // 个人成长同步（房主 -> 对应队友）：属性 / 芯片 / 堆叠 / 等级
  function coopOwnState(p) {
    const s = p.stats;
    return {
      id: p.id, lv: p.level, xp: Math.round(p.xp), xpn: p.xpNeed, pl: p.pendingLevels,
      mod: p.skillMod || "",
      st: {
        damage: s.damage, fireInterval: s.fireInterval, crit: s.crit, pierce: s.pierce,
        moveSpeed: s.moveSpeed, shieldMax: s.shieldMax, shieldRegen: s.shieldRegen,
        armor: s.armor, range: s.range, bulletCount: s.bulletCount, bulletSpeed: s.bulletSpeed,
        bulletR: s.bulletR, drones: s.drones || 0,
        explodeOnHit: !!s.explodeOnHit, echoBurst: !!s.echoBurst, twinPulse: !!s.twinPulse,
        pulseBlast: !!s.pulseBlast, scatterBlast: !!s.scatterBlast, railShard: !!s.railShard,
        skillGainMul: s.skillGainMul, skillPowerMul: s.skillPowerMul, skillDurationMul: s.skillDurationMul,
      },
      chips: p.chips.map((c) => ({ kind: c.kind, name: c.name, icon: c.icon, tier: c.tier, value: c.value, score: c.score })),
      stacks: Object.assign({}, p.stacks),
    };
  }

  function coopSyncOwn(p) {
    if (!coopNet.host || !p || p.local) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) coopSendEventTo(pid, "own", coopOwnState(p));
  }

  function coopApplyOwn(d) {
    if (coopNet.host || !d) return;
    const p = getLocalPlayer();
    if (!p || d.id !== p.id) return;
    if (typeof d.lv === "number") p.level = d.lv;
    if (typeof d.xp === "number") p.xp = d.xp;
    if (typeof d.xpn === "number") p.xpNeed = d.xpn;
    if (typeof d.pl === "number") p.pendingLevels = d.pl;
    if (typeof d.mod === "string") p.skillMod = d.mod;
    if (d.st) Object.assign(p.stats, d.st);
    if (Array.isArray(d.chips)) p.chips = d.chips;
    if (d.stacks) p.stacks = d.stacks;
    syncProgressGlobals(p);
    updateBuffPanel();
    refreshHud(true);
  }

  // ===== 个人商店（P4-02 / P4-03）：世界继续，价格由房主裁决 =====
  const COOP_SHOP_TIME = 12;
  let coopShopSeq = 0;
  let coopHostShopP = null;
  let coopGuestShop = null;
  let coopGuestTrade = null;

  function coopOpenShop(p, title) {
    if (!p) return;
    p.shopOpen = true;
    p.shopTimer = COOP_SHOP_TIME;
    p.shopSid = ++coopShopSeq;
    const items = shopOfferFor(p);
    if (p.local) {
      coopHostShopP = p;
      document.getElementById("shop-title").textContent = title || "星港补给站";
      renderShopOffer(items, credits, "个人补给 · " + COOP_SHOP_TIME + "s 或受击关闭");
      document.getElementById("ov-shop").classList.remove("hidden");
      document.getElementById("ov-shop").scrollTop = 0;
      sfxLevelUp();
      refreshHud(true);
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) {
      coopSendEventTo(pid, "shop-offer", {
        sid: p.shopSid, t: COOP_SHOP_TIME, items, credits: Math.round(credits),
      });
    } else {
      p.shopOpen = false;
    }
  }

  function coopCloseShop(p) {
    if (!p) return;
    const sid = p.shopSid;
    p.shopOpen = false;
    p.shopTimer = 0;
    if (p.local) {
      document.getElementById("ov-shop").classList.add("hidden");
      coopHostShopP = null;
      refreshHud(true);
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) coopSendEventTo(pid, "shop-close", { sid });
  }

  function coopCloseShopUI() {
    document.getElementById("ov-shop").classList.add("hidden");
    coopHostShopP = null;
    coopGuestShop = null;
  }

  function coopBuyShopLocal(id) {
    if (coopNet.host) { coopBuyShop(getLocalPlayer() || player, id); return; }
    const sh = coopGuestShop;
    if (!sh) return;
    coopEventSeq += 1;
    coopSendCtrl({ t: "ev", id: coopEventSeq, k: "shop-buy", d: { sid: sh.sid, item: id } });
  }

  // 房主校验：会话、物品白名单、共享星币余量、该玩家可购状态
  function coopBuyShop(p, id) {
    if (!p || !p.shopOpen) return;
    const def = SHOP_ITEMS.find((d) => d.id === id);
    if (!def) { coopInReject(); return; }
    const cost = shopCost(def);
    if (credits < cost || !def.can(p)) return;
    credits -= cost;
    shopCounts[id] = (shopCounts[id] || 0) + 1;
    def.apply(p);
    sfxLevelUp();
    const items = shopOfferFor(p);
    if (p.local) {
      coopHostShopP = p;
      renderShopOffer(items, credits, "个人补给 · " + Math.ceil(p.shopTimer) + "s 或受击关闭");
      updateBuffPanel();
      refreshHud(true);
    } else if (coopNet.host) {
      const pid = coopFindPeerOf(p.id);
      if (pid) {
        coopSendEventTo(pid, "shop-update", { sid: p.shopSid, items, credits: Math.round(credits) });
        coopSendEventTo(pid, "own", coopOwnState(p));
      }
    }
  }

  function coopShowGuestShop(p) {
    coopGuestShop = { sid: p.sid, timer: p.t || COOP_SHOP_TIME, items: p.items || [] };
    document.getElementById("shop-title").textContent = "星港补给站 · 个人";
    renderShopOffer(p.items || [], p.credits != null ? p.credits : credits,
      "个人补给 · " + Math.ceil(coopGuestShop.timer) + "s 或受击关闭");
    document.getElementById("ov-shop").classList.remove("hidden");
    document.getElementById("ov-shop").scrollTop = 0;
    sfxLevelUp();
  }

  // ===== 个人游商（P4-02）：同样不冻结世界，由房主裁决 =====
  const COOP_TRADE_TIME = 12;
  let coopTradeSeq = 0;
  let coopHostTradeP = null;

  function coopOpenTrade(p) {
    if (!p || !trader || p.tradeOffer) return;
    const sid = ++coopTradeSeq;
    const items = traderOffersFor(p);
    p.tradeOffer = { sid, items, defs: items.map((it) => it.def), t: COOP_TRADE_TIME };
    p.tradeTimer = COOP_TRADE_TIME;
    p.tradeCooldown = COOP_TRADE_TIME + 6;
    if (p.local) {
      coopHostTradeP = p;
      document.getElementById("trader-title").textContent = "星际游商 · 第 " + chapter + " 星域";
      renderTradeOffer(items, credits);
      document.getElementById("ov-trader").classList.remove("hidden");
      document.getElementById("ov-trader").scrollTop = 0;
      sfxLevelUp();
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) {
      coopSendEventTo(pid, "trade-offer", {
        sid, t: COOP_TRADE_TIME, items, credits: Math.round(credits),
      });
    }
  }

  function coopShowGuestTrade(p) {
    coopGuestTrade = { sid: p.sid, timer: p.t || COOP_TRADE_TIME, items: p.items || [] };
    document.getElementById("trader-title").textContent = "星际游商 · 个人";
    renderTradeOffer(p.items || [], p.credits != null ? p.credits : credits);
    document.getElementById("ov-trader").classList.remove("hidden");
    document.getElementById("ov-trader").scrollTop = 0;
    sfxLevelUp();
  }

  function coopCloseTradeUI() {
    document.getElementById("ov-trader").classList.add("hidden");
    coopHostTradeP = null;
    coopGuestTrade = null;
  }

  function coopCloseTrade(p) {
    if (!p) return;
    const sid = p.tradeOffer ? p.tradeOffer.sid : null;
    p.tradeOffer = null;
    p.tradeTimer = 0;
    if (p.local) {
      coopCloseTradeUI();
      return;
    }
    if (!coopNet.host) return;
    const pid = coopFindPeerOf(p.id);
    if (pid) coopSendEventTo(pid, "trade-close", { sid });
  }

  // 买走后游商全队消失（一次交易）
  function coopEndTradeAll() {
    for (let i = 0; i < players.length; i++) {
      if (players[i].tradeOffer) players[i].tradeOffer = null;
      players[i].tradeTimer = 0;
    }
    if (coopNet.host) coopSendEvent("trade-close", null);
    coopCloseTradeUI();
  }

  function coopBuyTrade(p, q) {
    if (!p || !p.tradeOffer || !trader) return;
    if (!q || q.sid !== p.tradeOffer.sid) { coopInReject(); return; }
    const idx = Math.round(q.i);
    const it = p.tradeOffer.items[idx];
    if (!it || !(idx >= 0 && idx < 3)) { coopInReject(); return; }
    const cost = it.cost;
    if (credits < cost || !it.can) return;
    credits -= cost;
    it.def.apply(p);
    sfxLevelUp();
    trader = null;
    coopEndTradeAll();
    coopSyncOwn(p);
    updateBuffPanel();
    refreshHud(true);
  }

  function coopSendEvent(kind, data, exceptPid) {
    if (!roomCode || !kind) return;
    coopEventSeq += 1;
    const msg = { t: "ev", id: coopEventSeq, k: kind, d: data || null };
    if (coopNet.host) {
      for (const pid in coopGuests) {
        if (pid === exceptPid) continue;
        const c = coopGuests[pid].ctrl;
        if (c && c.open) { c.send(msg); coopCountSent(msg); }
      }
      return;
    }
    coopSendCtrl(msg);
  }

  // 房主处理队友上报的可靠请求（P4-03）：只接受该连接自己的玩家
  function coopOnHostEvent(conn, d) {
    if (!d || !d.k || !conn || !conn.peer) return;
    const g = coopGuests[conn.peer];
    if (!g || !g.id) return;
    const p = (function () {
      for (let i = 0; i < players.length; i++) if (players[i].id === g.id) return players[i];
      return null;
    })();
    if (!p) return;
    const q = d.d || {};
    if (d.k === "up-pick") {
      if (!p.upOffer || q.oid !== p.upOffer.oid) { coopInReject(); return; }
      const idx = Math.round(q.i);
      if (!(idx >= 0 && idx < 3)) { coopInReject(); return; }
      coopApplyPick(p, idx);
    } else if (d.k === "up-reroll") {
      if (!p.upOffer || q.oid !== p.upOffer.oid) { coopInReject(); return; }
      coopRerollOffer(p);
    } else if (d.k === "shop-buy") {
      if (!p.shopOpen || q.sid !== p.shopSid) { coopInReject(); return; }
      if (typeof q.item !== "string" || q.item.length > 24) { coopInReject(); return; }
      coopBuyShop(p, q.item);
    } else if (d.k === "shop-bye") {
      if (p.shopOpen && q.sid === p.shopSid) coopCloseShop(p);
    } else if (d.k === "trade-buy") {
      coopBuyTrade(p, q);
    } else if (d.k === "trade-bye") {
      if (p.tradeOffer && q.sid === p.tradeOffer.sid) coopCloseTrade(p);
    } else if (d.k === "build") {
      // 队友建造请求：房主校验后生成防线，再回报结果
      if (q.type !== "turret" && q.type !== "field" && q.type !== "wall") { coopInReject(); return; }
      if (p.down || p.eliminated) { coopInReject(); return; }
      const bx = Number(q.x), by = Number(q.y);
      if (!isFinite(bx) || !isFinite(by)) { coopInReject(); return; }
      const maxD = CFG.RUN.DEF_BUILD_RANGE * view.scale;
      const pid = coopFindPeerOf(p.id);
      if (dist2(bx, by, p.x, p.y) > maxD * maxD) {
        if (pid) coopSendEventTo(pid, "build-no", { reason: "range", type: q.type });
        coopInReject();
        return;
      }
      if (!placeDefense(q.type, bx, by, p, true)) {
        if (pid) coopSendEventTo(pid, "build-no", { reason: "cost", type: q.type });
        coopInReject();
        return;
      }
      if (pid) coopSendEventTo(pid, "build-ok", { type: q.type, x: bx, y: by });
    } else if (d.k === "def-act") {
      // 队友升级/修复请求：房主校验距离与核心后执行，结果随防线快照同步
      if (p.down || p.eliminated) { coopInReject(); return; }
      const dd = defenseOfId(q.id);
      if (!dd) { coopInReject(); return; }
      const maxD = 100 * view.scale;
      if (dist2(dd.x, dd.y, p.x, p.y) > maxD * maxD) { coopInReject(); return; }
      if (q.act === "repair") repairDefense(dd);
      else upgradeDefense(dd);
    } else if (d.k === "skill") {
      // 队友主动技能：房主校验能量后执行（重力井落点可指定）
      if (p.down || p.eliminated) return;
      const sx = Number(q.x), sy = Number(q.y);
      castSkill(p, isFinite(sx) ? sx : undefined, isFinite(sy) ? sy : undefined);
    }
  }

  function coopOnEvent(d) {
    if (!d || !d.k || coopNet.host) return;   // 事件由房主下发
    const p = d.d || {};
    if (d.k === "up-offer") {
      const cards = (p.cards || []).map((c) => ({
        def: { id: c.defId, name: c.name, icon: c.icon, curse: c.curse, evolution: c.evo, mod: c.mod },
        rarity: { key: c.rarityKey, name: c.rarityName },
        text: c.text,
      }));
      coopGuestOffer = {
        oid: p.oid, lv: p.lv || 1, timer: p.t || COOP_UPGRADE_TIME, cards, locked: false,
        rerolled: !!p.rerolled, left: p.left || 0,
      };
      upgradeCards = cards;
      renderCards(cards);
      document.getElementById("ui-up-level").textContent =
        "LV " + (p.lv || 1) + " · " + Math.ceil(coopGuestOffer.timer) + "s";
      document.getElementById("ov-upgrade").classList.remove("hidden");
      sfxLevelUp();
    } else if (d.k === "up-close") {
      if (coopGuestOffer && p.oid === coopGuestOffer.oid) coopCloseUpgradeUI();
    } else if (d.k === "own") {
      coopApplyOwn(p);
    } else if (d.k === "shop-offer") {
      coopShowGuestShop(p);
    } else if (d.k === "shop-update") {
      if (coopGuestShop && p.sid === coopGuestShop.sid) {
        coopGuestShop.items = p.items || [];
        renderShopOffer(p.items || [], p.credits != null ? p.credits : credits);
      }
    } else if (d.k === "shop-close") {
      if (!coopGuestShop || p.sid === coopGuestShop.sid) coopCloseShopUI();
    } else if (d.k === "trade-offer") {
      coopShowGuestTrade(p);
    } else if (d.k === "trade-close") {
      coopCloseTradeUI();
    } else if (d.k === "boss-spawn") {
      addText(player.x, player.y - 64, "虚空之眼降临", "#ff4d6d", 20);
      shake = Math.max(shake, 12 * CFG.FX.SHAKE);
    } else if (d.k === "boss-phase") {
      if (boss) {
        const label = ["", "I", "II", "III"][p.p || 1] || "?";
        addText(boss.x, boss.y - boss.r - 26, "阶段 " + label, "#ffc857", 16);
        document.getElementById("ui-boss-name").textContent = bossLabel(boss);
      }
    } else if (d.k === "boss-down") {
      slowmo = Math.max(slowmo, 1.0);
      victoryFlash = 1;
      emit(player.x, player.y, 30, "#ffc857", 320, 4, 1.0);
    } else if (d.k === "chapter") {
      chapter = p.c || chapter + 1;
      chapterMod = CHAPTER_MODS.find((m) => m.id === p.mod) || null;
      waveNum = 1;
      bossSpawned = false;
      boss = null;
      hideBossBar();
      enemies = enemies.filter((e) => !e.synced);
      ebullets = [];
      addText(player.x, player.y - 64, "第 " + chapter + " 星域", "#ffd666", 24);
      refreshHud(true);
    } else if (d.k === "build-ok") {
      const bx = Number(p.x) || 0, by = Number(p.y) || 0;
      clearBuildGhost(p.type, bx, by);
      emit(bx, by, 16, "#ffd666", 200, 3, 0.6);
      addText(bx, by - 26,
        p.type === "field" ? "缓速场已展开" : p.type === "wall" ? "城墙已架设" : "炮塔已部署",
        "#ffd666", 14);
      sfxLevelUp();
    } else if (d.k === "build-no") {
      const lp = getLocalPlayer() || player;
      clearBuildGhost(p.type);
      addText(lp.x, lp.y - 46, p.reason === "range" ? "超出部署范围" : "核心不足 / 已达上限", "#ff9f9f", 13);
    } else if (d.k === "over") {
      if (state !== "over") endGame(!!p.win, p.reason, p.team);
    }
  }



