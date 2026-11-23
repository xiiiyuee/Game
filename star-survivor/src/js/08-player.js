  /* =====================================================================
   * 6. 玩家与统计数据
   * ===================================================================*/
  function makeStats(weaponKey) {
    const P = CFG.PLAYER;
    const W = CFG.WEAPONS[weaponKey] || CFG.WEAPONS.pulse;
    return {
      moveSpeed: P.SPEED,
      fireInterval: W.interval,
      damage: W.damage,
      bulletSpeed: W.speed,
      range: W.range,
      crit: P.CRIT,
      critMult: P.CRIT_MULT,
      armor: 0,
      bulletCount: W.count,
      pierce: W.pierce,
      spread: W.spread,          // 武器固有扇形（散射）
      bulletR: W.bulletR,
      bulletColor: THEME.weapons[weaponKey] || W.color,
      drones: 0,                 // 守护无人机数量
      shieldMax: P.SHIELD_MAX,
      shieldRegen: P.SHIELD_REGEN,
      // 主动技能成长（升级卡修正）
      skillGainMul: 1,           // 技能能量获取倍率
      skillPowerMul: 1,          // 技能伤害倍率
      skillDurationMul: 1,       // 技能持续倍率
      // 事件 / 进化 / 诅咒修正
      xpMul: 1,               // 经验获取倍率
      takenMul: 1,            // 受到伤害倍率（诅咒）
      enemySpeedMul: 1,       // 敌人移速倍率（诅咒）
      explodeOnHit: false,    // 进化「裂变弹」
      echoBurst: false,       // 进化「虚空回响」
      twinPulse: false,       // 脉冲分支「双子脉冲」
      pulseBlast: false,      // 脉冲分支「湮灭脉冲」
      scatterBlast: false,    // 散射分支「霰爆核心」
      railShard: false,       // 轨道分支「裂变轨道」
    };
  }

  // 创建一名玩家；id 在整局内保持稳定，联机时由房间槽位分配
  function createPlayer(id, x, y, local) {
    const P = CFG.PLAYER;
    const st = makeStats(chosenWeapon);
    return {
      id,
      local: !!local,
      stats: st,                 // 每名玩家独立属性（移速 / 伤害 / 护盾 / 冷却等）
      stacks: {},                // 每名玩家独立强化堆叠
      chips: [],                 // 每名玩家独立芯片构筑（3 槽）
      x,
      y,
      r: P.RADIUS,
      hp: P.HP,
      hpMax: P.HP,
      shield: st.shieldMax,
      shieldDelay: 0,
      invuln: 0,
      fireCd: 0,
      dashCd: 0,
      dashTime: 0,
      dashDir: { x: 1, y: 0 },
      lastDir: { x: 0, y: -1 },
      facing: -Math.PI / 2,
      trailCd: 0,
      hitFlash: 0,
      hitDir: 0,                 // 最近一次受击来向（弧度）
      hitDirT: 0,                // 受击方向指示剩余时间
      shieldBreak: 0,            // 护盾破碎反馈剩余时间
      energy: 0,                 // 超载能量
      skill: chosenSkill || "phase", // 本局主动技能
      skillMod: "",              // 技能改装（互斥，见 SKILL_MODS）
      skillAwaken: "",           // 技能终极觉醒（改装后解锁）
      skillEnergy: 0,            // 技能能量 0..MAX
      skillLock: 0,              // 施放后短锁
      grazeActive: 0,            // 擦弹回流剩余时间
      grazeStacks: 0,            // 擦弹层数（强化射击）
      grazeAwakenCount: 0,       // 觉醒：擦弹返还计数
      phaseTime: 0,              // 相位冲刺剩余时间
      phaseLeft: 0,              // 待生成残影数
      phaseSpawn: 0,             // 残影生成计时
      phaseDir: { x: 1, y: 0 },
      xp: 0,                     // 个人经验 / 等级（联机各自成长，P4-01）
      level: 1,
      xpNeed: CFG.XP.BASE,
      pendingLevels: 0,          // 待选升级次数
      upOffer: null,             // 房主侧：该玩家的待选报价 { oid, cards }
      upgradeTimer: 0,           // 选卡倒计时（秒）
      kills: 0,                  // 个人击杀（P4-07）
      damage: 0,                 // 个人造成伤害
      shopOpen: false,           // 个人商店是否打开（P4-02）
      shopTimer: 0,
      weapon: chosenWeapon,
      intent: { mx: 0, my: 0 },  // 非本地玩家的移动意图（联机时由输入包写入）
      droneCd: [],               // 每架无人机的射击冷却
      down: false,               // 联机倒地状态
      downTimer: 0,              // 倒地剩余倒计时（秒）
      reviveProgress: 0,         // 队友救援进度（秒）
      eliminated: false,         // 倒计时结束，已淘汰
      tradeOffer: null,          // 个人游商报价（P4-02）
      tradeTimer: 0,
      tradeCooldown: 0,
      color: ["#3fe5ff", "#ffd666", "#ff6bd6", "#8bffdc"][
        Math.max(0, (parseInt(String(id).replace(/\D/g, ""), 10) || 1) - 1) % 4
      ],
    };
  }

  // 取本地玩家；槽位缺失时回退到 player 别名
  function getLocalPlayer() {
    for (let i = 0; i < players.length; i++) {
      if (players[i].id === localPlayerId) return players[i];
    }
    return player;
  }

  // 人数难度缩放：单机恒为 1，联机按额外人数提升
  function partyCount() {
    return Math.max(1, players.length);
  }

  function partyScale(perExtra) {
    return 1 + (partyCount() - 1) * perExtra;
  }

  // 最近的存活玩家：倒地/淘汰者不参与索敌，全部倒地时回退
  function nearestPlayer(x, y) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.down || p.eliminated) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) return best;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.eliminated) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best || player;
  }

  // 玩家之间轻微推挤，避免完全重叠；单机直接跳过
  function separatePlayers() {
    if (players.length < 2) return;
    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (a.down || a.eliminated) continue;
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];
        if (b.down || b.eliminated) continue;
        const min = a.r + b.r;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        let ux = 1, uy = 0;
        if (d >= 0.001) { ux = dx / d; uy = dy / d; }
        const push = (min - d) * 0.5;
        a.x = clamp(a.x - ux * push, a.r, world.w - a.r);
        a.y = clamp(a.y - uy * push, a.r, world.h - a.r);
        b.x = clamp(b.x + ux * push, b.r, world.w - b.r);
        b.y = clamp(b.y + uy * push, b.r, world.h - b.r);
      }
    }
  }

  function resetGame() {
    localPlayerId = "p1";
    player = createPlayer(localPlayerId, world.w / 2, world.h / 2, true);
    players = [player];
    stats = player.stats;      // 兼容别名：指向本地玩家属性对象
    stacks = player.stacks;    // 兼容别名：指向本地玩家强化堆叠
    chips = player.chips;      // 兼容别名：指向本地玩家芯片构筑
    applyMeta(stats, player);

    bullets = [];
    enemies = [];
    ebullets = [];
    particles = [];
    texts = [];
    gems = [];
    zones = [];
    crystals = [];
    pods = [];
    pulses = [];
    turrets = [];
    fields = [];
    walls = [];
    buildGhosts = [];
    gravityWells = [];
    skillShadows = [];
    frostZones = [];
    defDamageTaken = 0;
    defLost = 0;
    coreDrops = [];
    boss = null;

    elapsed = 0;
    chapter = 1;
    chapterStartElapsed = 0;
    credits = 0;
    cores = 0;
    revives = 0;
    buildMode = null;
    lastShopWave = 0;
    shopCounts = {};
    waveNum = 1;
    score = 0;
    kills = 0;
    level = 1;
    xp = 0;
    xpNeed = CFG.XP.BASE;
    pendingLevels = 0;
    bossSpawned = false;
    spawnTimer = 0.7;
    threat = 0;
    salvoTimer = 4;
    squadTimer = 24;
    hunterTimer = 14;
    hunterSpawned = false;
    hazards = [];
    hazardTimer = CFG.EVENTS.HAZARD.INTERVAL;
    shake = 0;
    shakeDirX = 0;
    shakeDirY = 0;
    hurtFlash = 0;
    nextEnemyId = 1;
    nextBulletId = 1;
    nextPropId = 1;
    upgradeCards = [];
    chapterMod = null;          // 首章无星域事件，章节切换时由玩家抉择
    hitStop = 0;
    musicTimer = 0;
    ultTimer = 0;
    echoTimer = 0;
    zoneTimer = 7;
    crystalTimer = 5;
    podTimer = 12;
    combo = 0;
    comboTimer = 0;
    comboBest = 0;
    slowmo = 0;
    victoryTimer = 0;
    victoryFlash = 0;
    chipDrops = [];
    asteroids = [];
    asteroidTimer = 6;
    trader = null;
    traderTimer = CFG.TRADER.INTERVAL;
    traderOffers = [];

    hideBossBar();
    snapCamera();
    coopResetSimClock();
    coopClearInterp();
    updateBuffPanel();
    refreshHud(true);
  }

