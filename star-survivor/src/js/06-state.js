  /* =====================================================================
   * 5. 游戏状态
   * ===================================================================*/
  let state = "menu";              // menu | playing | paused | upgrade | over
  let player = null;               // 本地玩家别名（保留单机写法）
  let players = [];                // 本局全部玩家集合
  let localPlayerId = null;        // 本地玩家稳定 ID；单机固定为 "p1"
  let stats = null;
  let bullets = [];
  let enemies = [];
  let ebullets = [];
  let particles = [];
  let texts = [];
  let gems = [];
  let zones = [];                  // 风险星域
  let crystals = [];               // 可破坏能量水晶
  let pods = [];                   // 补给舱
  let pulses = [];                 // 超载冲击波
  let stacks = {};                 // 已获得的强化堆叠
  let boss = null;

  let elapsed = 0;
  let chapter = 1;                 // 当前星域章节（无尽）
  let chapterStartElapsed = 0;     // 本章开始时的总存活时间
  let credits = 0;                 // 星港货币
  let cores = 0;                   // 建造用能量核心
  let revives = 0;                 // 应急保险次数
  let turrets = [];
  let fields = [];
  let walls = [];
  let buildGhosts = [];            // 联机客户端建造预测（半透明残影）
  let defDamageTaken = 0;          // 本局防线累计承伤
  let defLost = 0;                 // 本局被摧毁的防线数
  let coreDrops = [];
  let buildMode = null;            // "turret" / "field" / null
  let lastShopWave = 0;
  let shopCounts = {};             // 本局商店购买次数（用于涨价）
  let chapterMod = null;           // 当前星域环境词条
  let hitStop = 0;                 // 命中顿帧（秒）
  let lowFx = (() => {
    try { return localStorage.getItem("sf_lowfx") === "1"; } catch (e) { return false; }
  })();
  let waveNum = 1;
  let score = 0;
  let kills = 0;
  let level = 1;
  let xp = 0;
  let xpNeed = CFG.XP.BASE;
  let pendingLevels = 0;
  let bossSpawned = false;
  let spawnTimer = 1.2;
  let shake = 0;
  let shakeDirX = 0;               // 重击震屏方向（单位向量，P0 打击感）
  let shakeDirY = 0;
  let hurtFlash = 0;
  let hudAcc = 0;          // HUD 刷新节流（每帧写 DOM 会造成额外布局开销）
  let nextEnemyId = 1;
  let nextBulletId = 1;
  let nextPropId = 1;
  let lastFrame = performance.now();
  let upgradeCards = [];
  let ultTimer = 0;                // 超载减速剩余时间
  let echoTimer = 0;               // 进化「虚空回响」计时
  let zoneTimer = 6;
  let crystalTimer = 5;
  let podTimer = 10;
  let combo = 0;                   // 当前连杀
  let comboTimer = 0;              // 连杀保持倒计时
  let comboBest = 0;               // 本局最高连杀
  let chosenWeapon = "pulse";      // 本局选择的武器
  let slowmo = 0;                  // Boss 击杀慢动作剩余时间
  let victoryTimer = 0;            // Boss 击杀后的结算延迟
  let victoryFlash = 0;            // Boss 击杀白闪
  let chips = [];                  // 本局芯片构建（3 槽）
  let chipDrops = [];              // 芯片掉落物
  let asteroids = [];              // 可破坏陨石
  let asteroidTimer = 6;
  let trader = null;               // 星际游商
  let traderTimer = CFG.TRADER.INTERVAL;
  let traderOffers = [];

