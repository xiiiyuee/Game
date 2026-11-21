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
      energy: 0,                 // 超载能量
      weapon: chosenWeapon,
      droneCd: [],               // 每架无人机的射击冷却
      down: false,               // 联机倒地状态
      downTimer: 0,              // 倒地剩余倒计时（秒）
      reviveProgress: 0,         // 队友救援进度（秒）
      eliminated: false,         // 倒计时结束，已淘汰
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
    shake = 0;
    hurtFlash = 0;
    nextEnemyId = 1;
    nextPropId = 1;
    upgradeCards = [];
    chapterMod = pick(CHAPTER_MODS);
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
    updateBuffPanel();
    refreshHud(true);
  }

