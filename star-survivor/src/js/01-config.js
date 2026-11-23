  /* =====================================================================
   * 1. 配置区（集中调整游戏参数）
   * ===================================================================*/
  const CFG = {
    // 无尽远航：每章 10 波，Boss 后进入下一星域，难度持续攀升
    RUN: {
      CHAPTER_WAVES: 10,          // 每章波数（第 10 波 Boss）
      CLIMAX_WAVES: 3,            // 每章最后 3 波进入高潮节奏
      CLIMAX_SPAWN: 0.8,          // 高潮期刷怪间隔倍率（越低越密）
      CLIMAX_HAZARD: 0.75,        // 高潮期灾害间隔倍率
      BOSS_HP_GROWTH: 1.8,        // 章节 Boss 生命成长
      BOSS_DMG_GROWTH: 1.18,      // 章节 Boss 伤害成长
      ENEMY_HP_GROWTH: 1.065,     // 每个等效波次生命成长（跨章节连续，不回落）
      ENEMY_DMG_GROWTH: 1.2,      // 章节敌人伤害成长
      ENEMY_ARMOR_PER_CHAPTER: 0.04, // 每章获得减伤
      ENEMY_ARMOR_MAX: 0.5,       // 敌人减伤上限
      ENEMY_SPEED_CAP: 1.9,       // 敌人移速成长上限
      EBULLET_SPEED_PER_CHAPTER: 0.05, // 每章敌方弹速成长
      EBULLET_SPEED_CAP: 1.6,     // 敌方弹速总上限（含风暴词条）
      POWER_ADAPT: 0.5,           // 深渊适应指数：按玩家实际 DPS 抬升敌人生命
      POWER_CAP: 18,              // 深渊适应倍率上限，避免无限膨胀
      BOSS_POWER_ADAPT: 0.28,     // Boss 的 DPS 适应更平缓，避免后期血条过长
      BOSS_POWER_CAP: 3.2,
      CLEAR_HEAL: 0.25,           // 击破 Boss 后回复生命比例
      CLEAR_CREDITS: 60,          // 击破 Boss 星币奖励
      SHOP_WAVE: 3,               // 每 3 波进入星港
      CREDIT_KILL: 3,             // 普通击杀星币
      CREDIT_ELITE: 14,           // 精英击杀星币
      CREDIT_BOSS: 120,           // Boss 击杀星币
      MAX_TURRETS: 3,
      MAX_FIELDS: 2,
      MAX_WALLS: 6,
      TURRET_COST: 2,             // 建造炮塔消耗核心
      FIELD_COST: 3,              // 建造缓速场消耗核心
      WALL_COST: 1,               // 建造城墙消耗核心
      WALL_LEN: 120,              // 城墙长度
      WALL_THICK: 16,             // 城墙厚度
      TURRET_RANGE: 360,
      TURRET_CD: 0.7,
      TURRET_DMG: 9,
      FIELD_RADIUS: 125,
      FIELD_SLOW: 0.5,            // 缓速场内敌人移速倍率
      DEF_TURRET_HP: 90,          // 炮塔耐久
      DEF_FIELD_HP: 70,           // 缓速场耐久
      DEF_WALL_HP: 120,           // 城墙耐久
      DEF_REPAIR_DELAY: 6,        // 防线脱战多久后开始自修复
      DEF_REPAIR_RATE: 0.06,      // 自修复速度（每秒恢复最大耐久比例）
      DEF_HP_GROWTH: 0.35,        // 每章耐久成长
      DEF_AGGRO: 300,             // 敌人转火防线的距离
      DEF_ATTACK_CD: 0.8,         // 敌人拆塔间隔
      DEF_BUILD_RANGE: 520,       // 部署距离上限
      DEF_MAX_LEVEL: 3,           // 防线最高等级
      DEF_UPGRADE_COST: 2,        // 炮塔升级消耗
      DEF_UPGRADE_COST_SMALL: 1,  // 城墙 / 缓速场升级消耗
      DEF_REPAIR_COST: 1,         // 手动修复消耗
      DEF_REPAIR_PCT: 0.35,       // 手动修复恢复的最大耐久比例
      // 防线联动：站位 / 擦弹 / 技能施放与炮塔、城墙形成配合
      TURRET_AURA: 150,           // 炮塔增益光环半径
      TURRET_AURA_FIRE: 0.88,     // 光环内玩家射击间隔倍率
      TURRET_OC_RADIUS: 230,      // 技能施放可为炮塔叠加过载的距离
      TURRET_OC_MAX: 3,           // 过载层数上限
      TURRET_OC_TIME: 6,          // 单层过载持续
      TURRET_OC_DMG: 0.12,        // 每层过载炮塔伤害加成
      WALL_CHARGE_RADIUS: 200,    // 擦弹为城墙充能的距离
      WALL_CHARGE_MAX: 8,         // 充满所需次数
      WALL_CHARGE_DMG: 1.6,       // 冲击波伤害（玩家伤害倍率）
      WALL_CHARGE_R: 115,         // 冲击波半径
      UPGRADE_REROLL_COST: 1,     // 刷新升级卡消耗核心
      CORE_MAGNET: 170,
      CORE_PICKUP: 30,
    },
    PLAYER: {
      HP: 100,                    // 初始生命
      SHIELD_MAX: 50,             // 初始护盾上限
      SHIELD_REGEN: 3.5,          // 护盾每秒恢复量
      SHIELD_DELAY: 3.5,          // 受到伤害后护盾延迟恢复（秒）
      SPEED: 245,                 // 移动速度（px/s）
      RADIUS: 11,                 // 碰撞半径
      DASH_SPEED: 950,            // 冲刺速度（px/s）
      DASH_TIME: 0.13,            // 冲刺持续时间
      DASH_CD: 1.5,               // 冲刺冷却
      DASH_INVULN: 0.34,          // 冲刺无敌时间
      INVULN_ON_HURT: 0.7,        // 受伤后的无敌时间
      BASE_DAMAGE: 10,            // 基础子弹伤害
      FIRE_INTERVAL: 0.26,        // 基础射击间隔（秒）
      BULLET_SPEED: 640,          // 子弹速度
      RANGE: 470,                 // 自动索敌范围
      CRIT: 0.08,                 // 初始暴击率
      CRIT_MULT: 2.0,             // 暴击倍率
      DOWN_TIMEOUT: 30,           // 联机倒地倒计时（秒）
      REVIVE_TIME: 2,             // 队友靠近复活所需时间
      REVIVE_RADIUS: 80,          // 复活交互半径
      REVIVE_HP: 0.5,             // 复活后生命比例
    },
    COOP: {
      ENEMY_HP_PER_EXTRA: 0.55,   // 每多名玩家，敌人生命加成
      ENEMY_EXTRA_PER_EXTRA: 1,   // 每多名玩家，每组刷怪额外数量
      BOSS_HP_PER_EXTRA: 0.8,     // 每多名玩家，Boss 生命加成
    },
    WORLD: {
      // 实际战场远大于视口，相机跟随玩家滚动
      WIDTH_FACTOR: 2.2,          // 世界宽度 = max(视口宽, 960) × 该系数
      HEIGHT_FACTOR: 2.0,         // 世界高度 = max(视口高, 720) × 该系数
      CAMERA_SMOOTH: 10,          // 相机跟随平滑速度（越大越跟手）
    },
    XP: {
      BASE: 24,                   // 1 级升 2 级所需经验（抬高前期门槛，避免几杀一级）
      GROWTH: 1.26,               // 每级经验需求成长系数
      PICKUP: 135,                // 经验吸附范围
      COLLECT: 24,                // 实际拾取距离
    },
    // 威胁等级：随时间与击杀上涨，受击回落；联动刷怪、弹速、精英率
    THREAT: {
      MAX: 10,                    // 基础威胁上限（每章继续抬高）
      CHAPTER_MAX: 1,             // 每章额外威胁上限
      CHAPTER_FLOOR: 1.5,         // 每章压迫基准：低于该值时威胁恢复更快
      RECOVER_MUL: 3,             // 低于压迫基准时的恢复倍率
      TIME_RATE: 0.05,            // 每秒自然上涨
      KILL_RATE: 0.035,           // 每次击杀上涨
      HIT_DROP: 1.5,              // 每次受伤回落
      SPAWN: 0.055,               // 每级刷怪速度加成
      BULLET: 0.035,              // 每级敌弹速度加成
      ELITE: 0.012,               // 每级精英出现率加成
      SPEED: 0.012,               // 每级敌机移速加成
    },
    WAVE: {
      INTERVAL: 30,               // 每波持续时间（秒）
      ELITE_WAVE: 5,              // 第 5 波后开始出现精英
      SPAWN_BASE: 1.05,           // 初始刷怪间隔
      SPAWN_MIN: 0.34,           // 最短刷怪间隔（后期压力）
    },
    // 敌方编队：成组投放远程小队，同边入场并同步开火
    SQUAD: {
      FIRST_WAVE: 4,              // 从第 4 波开始出现
      INTERVAL: 26,               // 基础投放间隔（秒）
      SIZE: 3,                    // 每队数量
      GAP: 52,                    // 队形间距
    },
    ENEMIES: {
      tri:     { name: "疾行者", hp: 16, speed: 96,  dmg: 8,  xp: 3,  score: 10, r: 12,   color: "#ff5252", weight: 42 },
      square:  { name: "重甲",   hp: 38, speed: 58,  dmg: 12, xp: 5,  score: 16, r: 15,   color: "#4d7cff", weight: 26 },
      penta:   { name: "游弋者", hp: 26, speed: 80,  dmg: 10, xp: 4,  score: 13, r: 13.5, color: "#b06bff", weight: 20 },
      diamond: { name: "裂星精英", hp: 82, speed: 108, dmg: 18, xp: 11, score: 40, r: 16,  color: "#ff9f2e", weight: 0 },
      // 棱堡：远程炮台，保持距离并三连射
      hex:     { name: "棱堡",   hp: 66, speed: 46,  dmg: 14, xp: 6,  score: 22, r: 16,   color: "#8ea6ff", weight: 9,  minWave: 6 },
      // 突刺者：蓄力预警后高速冲刺
      dart:    { name: "突刺者", hp: 22, speed: 128, dmg: 11, xp: 4,  score: 15, r: 11,   color: "#ff3ea5", weight: 8,  minWave: 3 },
      // 修补者：为周围敌人持续回血，优先击杀目标
      mender:  { name: "修补者", hp: 26, speed: 74,  dmg: 6,  xp: 5,  score: 18, r: 13,   color: "#6dffc9", weight: 6,  minWave: 8 },
      // 追猎者：每章锁定玩家持续追击，越拖越快，击杀有额外奖励
      hunter:  { name: "追猎者", hp: 130, speed: 84, dmg: 16, xp: 26, score: 130, r: 19,  color: "#ff2d55", weight: 0,  minWave: 4 },
      // 灼光者：后期远程激光，蓄力后发射穿透光束（无视护甲减伤）
      lancer:  { name: "灼光者", hp: 34, speed: 54,  dmg: 20, xp: 9,  score: 36, r: 15,   color: "#ff8a3c", weight: 7,  minWave: 26 },
    },
    // 敌方激光：长距离预警后发射，穿透沿途所有玩家并绕过护甲
    ENEMY_LASER: {
      WARN: 1.1,              // 蓄力预警时长（秒）
      ACTIVE: 0.36,           // 光束持续时长
      WIDTH: 18,              // 光束宽度
      LEN: 1000,              // 光束长度（世界单位）
      RANGE: 560,             // 进入该距离才会蓄力
      CD_MIN: 5.2,            // 冷却下限
      CD_MAX: 7.2,            // 冷却上限
      DMG_MUL: 0.9,           // 光束伤害 = 敌人接触伤害 × 该倍率
      DMG_CAP: 0.55,          // 单次激光伤害不超过目标最大生命的该比例（防后期秒杀）
      STOP_MOVE: 0.12,        // 蓄力期间移速倍率
    },
    // 小怪远程弹幕：间隔范围（秒）、弹速、伤害倍率、每次弹数、扇形角（三角怪不射击）
    ENEMY_GUN: {
      LEAD: 0.62,             // 预判提前量系数：按目标速度预测落点
      square:  { cd: [4.4, 5.8], speed: 165, dmgMul: 0.55, count: 1, spread: 0 },
      penta:   { cd: [3.2, 4.4], speed: 185, dmgMul: 0.5,  count: 1, spread: 0 },
      diamond: { cd: [2.9, 4.0], speed: 200, dmgMul: 0.6,  count: 3, spread: 0.4 },
      hex:     { cd: [4.6, 6.0], speed: 155, dmgMul: 0.5,  count: 3, spread: 0.36 },
    },
    // 修补者光环：同一时刻最多治疗 4 名友军
    ENEMY_SUPPORT: {
      MENDER_CD: 3.6,
      MENDER_RADIUS: 160,
      MENDER_HEAL: 0.05,
      MENDER_MAX_TARGETS: 4,
    },
    BOSS: {
      name: "虚空之眼 · 吞噬者",
      hp: 2800, speed: 66, dmg: 30, xp: 160, score: 900, r: 44, color: "#ff3b6b",
      PHASE2: 0.7,           // 血量低于 70% 进入二阶段
      PHASE3: 0.35,          // 血量低于 35% 进入三阶段
      DASH_SPEED: 640,       // 冲刺速度
      DASH_CD: 6.6,          // 冲刺冷却
      DASH_WARN: 0.52,       // 冲刺预警时间
      DASH_TIME: 0.34,       // 冲刺持续时间
      RING_GAP: 0.55,        // 环形弹幕安全缺口半角（弧度）
      // 二阶段起专属：陨星召唤（砸向玩家当前位置，留下灼烧地面）
      METEOR_CD: 7.5,        // 陨星召唤冷却（三阶段缩短）
      METEOR_CD_P3: 5.2,
      METEOR_WARN: 1.0,      // 首颗落点预警时间
      METEOR_DELAY: 0.55,    // 后续陨星的追加延迟（形成陨星雨）
      METEOR_COUNT_P2: 2,    // 二阶段每位玩家落点数量
      METEOR_COUNT_P3: 3,    // 三阶段每位玩家落点数量
      METEOR_R: 66,          // 陨石爆炸半径
      METEOR_DMG: 22,        // 直接命中伤害
      METEOR_SHARDS: 6,      // 落地炸裂的碎片弹数量
      METEOR_SHARD_MUL: 0.3, // 碎片弹伤害 = Boss 伤害 × 该系数
      METEOR_BURN: 2.2,      // 灼烧地面持续时间
      METEOR_TICK: 4,        // 灼烧每次伤害
      METEOR_TICK_CD: 0.6,   // 灼烧伤害间隔
      // 每章固定机制组合，形成不同的 Boss 战节奏
      CHAPTER_KITS: [
        ["laser", "shield"],     // 星域 1：激光 + 护盾
        ["summon", "rage"],      // 星域 2：召唤 + 狂暴
        ["laser", "homing"],     // 星域 3：激光 + 追猎弹
        ["summon", "shield"],    // 星域 4：召唤 + 护盾
        ["rage", "homing"],      // 星域 5：狂暴 + 追猎弹
      ],
      MECH_NAMES: { laser: "旋转激光", shield: "分裂护盾", summon: "召唤潮汐", rage: "限时狂暴", homing: "追猎弹", meteor: "陨星召唤" },
      SHIELD_PCT: 0.16,      // 分裂护盾：护盾量占最大生命比例
      SHIELD_CD: 13,         // 护盾重生冷却
      LASER_CD: 8.5,         // 旋转激光冷却
      LASER_TIME: 2.4,       // 激光持续
      LASER_DMG: 0.55,       // 激光接触伤害（Boss 伤害倍率）
      RAGE_TIME: 5,          // 狂暴持续
      RAGE_CD: 19,           // 狂暴冷却
      RAGE_MUL: 1.5,         // 狂暴期速度 / 攻速倍率
      HOMING_CD: 7.5,        // 追猎弹发射冷却
      HOMING_COUNT: 3,       // 每次发射数量（三阶段 +1）
      HOMING_SPEED: 125,     // 追猎弹初速
      HOMING_DMG: 0.45,      // 追猎弹伤害（Boss 伤害倍率）
      HOMING_TURN: 0.85,     // 追猎弹转向速度（弧度/秒）
    },
    // 开局武器：不同弹道 / 节奏决定本局玩法骨架
    WEAPONS: {
      pulse: {
        name: "脉冲核心", icon: "◇", tag: "均衡",
        desc: "单发稳定、射速均衡，泛用性最强",
        damage: 10, interval: 0.26, speed: 640, count: 1, pierce: 0, range: 470, spread: 0, bulletR: 4, color: "#3fe5ff",
      },
      scatter: {
        name: "散射核心", icon: "⋔", tag: "近战爆发",
        desc: "一次 4 发扇形弹，近距离火力极高，射程较短",
        damage: 6.2, interval: 0.44, speed: 690, count: 4, pierce: 0, range: 380, spread: 0.5, bulletR: 3.4, color: "#9ff8ff",
      },
      rail: {
        name: "轨道激光", icon: "↟", tag: "远程穿透",
        desc: "单发高伤慢射速，可贯穿 2 个敌人",
        damage: 26, interval: 0.64, speed: 1320, count: 1, pierce: 2, range: 560, spread: 0, bulletR: 5.5, color: "#7ea8ff",
      },
    },
    // 连杀狂热：短时间连续击杀叠加收益，受击断连
    COMBO: {
      TIME: 3.0,              // 连杀保持时间
      STEP: 0.02,             // 每层连杀增加倍率
      MAX: 2.0,               // 倍率上限
      XP_FACTOR: 0.5,         // 连杀对经验的加成折半，分数仍吃满倍率
    },
    // 第 5 波后敌人随机获得词缀
    AFFIX: {
      START_WAVE: 5,
      BASE_CHANCE: 0.18,
      PER_WAVE: 0.015,
      PER_CHAPTER: 0.06,      // 每章额外词缀概率
      MAX_CHANCE: 0.85,
      ELITE_EXTRA: 0.5,       // 精英额外获得第二个词缀的概率
      SHIELD_HP: 1.4,         // 护盾词缀：生命倍率
      SHIELD_ARMOR: 0.25,     // 护盾词缀：减伤
      HASTE: 1.35,            // 迅捷词缀：移速倍率
      BOOM_COUNT: 8,          // 爆裂词缀：死亡弹幕数量
      SPLIT_COUNT: 2,         // 分裂词缀：分裂数量
    },
    // 守护无人机（召唤流）
    DRONES: {
      MAX: 3,
      ORBIT: 44,              // 环绕半径
      FIRE_CD: 0.95,          // 单架射击间隔
      DMG_MUL: 0.45,          // 伤害 = 玩家伤害 × 该系数
      RANGE_MUL: 0.85,        // 索敌范围倍率
      SPEED_MUL: 0.95,
    },
    // 主动技能：能量靠被动回复与命中敌人积累，冷却期间仍可继续蓄能
    SKILL: {
      MAX: 100,              // 技能能量上限
      PASSIVE: 2.2,          // 每秒被动回复
      HIT_GAIN: 0.7,         // 命中敌人返能量
      CAST_LOCK: 0.4,        // 施放后的短锁，避免连按
      // 相位冲刺：穿越弹幕与敌人，沿路留下残影补射
      PHASE: {
        TIME: 0.32, SPEED: 1080, SHADOWS: 3, SHADOW_DELAY: 0.16, SHADOW_DMG: 0.45, SHADOW_LIFE: 0.7,
        // 改装「冰痕」：残影不射击，沿路径留下冰区
        ICE_RADIUS: 62, ICE_TIME: 2.0, ICE_SLOW: 0.55,
        // 改装「爆痕」：残影延迟爆炸
        BLAST_DELAY: 0.5, BLAST_DMG: 1.1, BLAST_RADIUS: 70,
      },
      // 重力井：吸附敌人与弹幕，结束时内爆
      WELL: {
        DIST: 190, RADIUS: 120, TIME: 2.4, PULL_ENEMY: 90, PULL_BULLET: 90, DMG: 26,
        // 持续控场递减：同一敌人被吸附越久，拉力越弱
        CC_RESIST_GAIN: 0.9, CC_RESIST_MAX: 0.65, CC_RESIST_DECAY: 0.5,
        // 改装「奇点」：半径缩小、吸附更强、内爆翻倍
        SINGULARITY_R: 0.8, SINGULARITY_PULL: 1.6, SINGULARITY_DMG: 2,
        // 改装「脉冲井」：取消内爆，周期性脉冲伤害
        PULSE_TIME: 1.4, PULSE_CD: 0.6, PULSE_DMG: 11,
      },
      // 擦弹回流：近距离掠过敌弹时吸收，转为护盾与强化射击
      GRAZE: {
        TIME: 4.5, RADIUS: 38, MAX_STACKS: 10, DMG_PER: 0.06, SHIELD: 1, ENERGY: 0.4,
        // 单次施放最多吸收弹数：吸满后光环饱和，避免长期无弹压
        MAX_ABSORB: 36,
        // 改装「反射装甲」：每吸收 N 发返还一发强化弹
        REFLECT_EVERY: 3, REFLECT_DMG: 0.6,
        // 改装「护盾过载」：护盾上限与单发护盾提升，但增伤层数减半
        OVER_SHIELD_MAX: 25, OVER_SHIELD: 2, OVER_STACK_MUL: 0.5,
      },
      // 灼蚀光束：持续引导的贯穿激光，路径上所有敌人持续受击
      BEAM: {
        TIME: 1.8,              // 引导时长
        TICK: 0.12,             // 伤害判定间隔
        DMG: 0.45,              // 每跳伤害 = 玩家伤害 × 该系数
        WIDTH: 26,              // 光束宽度
        LEN: 900,               // 光束长度（会乘 view.scale）
        SLOW: 0.45,             // 引导期间移速倍率
        TRACK: 2.4,             // 每秒追踪转向速度（弧度）
        // 改装「聚能」：光束收束、伤害提高
        FOCUS_WIDTH: 0.55, FOCUS_DMG: 1.6,
        // 改装「熔流」：光束变宽、移速惩罚降低、单体伤害略降
        WIDE_WIDTH: 1.7, WIDE_DMG: 0.8, WIDE_SLOW: 0.72,
      },
      // 技能终极觉醒：改装后解锁，每技能唯一
      AWAKEN: {
        // 相位：冲刺终点爆发，冰痕同步留下冰区
        PHASE_DMG: 2.2, PHASE_RADIUS: 86, PHASE_FROST: true,
        // 重力井：结束后留下 2 秒事件视界，持续吸附与脉冲
        HOLE_TIME: 2.0, HOLE_R: 0.85, HOLE_PULL: 1.5,
        HOLE_CD: 0.6, HOLE_DMG: 6,
        // 擦弹：每吸收 2 发额外返还一枚可分裂反射弹
        GRAZE_EVERY: 2, SPLIT_COUNT: 2, SPLIT_DMG: 0.5,
        // 光束觉醒：两侧分裂出次级光束，覆盖更宽
        BEAM_SIDE_ANG: 0.16, BEAM_SIDE_MUL: 0.38,
        // 冰区觉醒：每秒冻结区域内敌人
        FREEZE_TIME: 0.35, FREEZE_CD: 1.1, FREEZE_BOSS: 0.2,
      },
    },
    ULT: {
      MAX: 100,              // 能量上限
      GAIN_KILL: 4,          // 普通敌人击杀充能
      GAIN_ELITE: 11,        // 精英击杀充能
      RADIUS: 360,           // 爆发伤害半径
      DAMAGE: 120,           // 爆发伤害
      SLOW: 0.5,             // 敌人在超载期间的移速/弹速倍率
      SLOW_TIME: 2.2,        // 减速持续时间
      INVULN: 0.5,           // 释放时的无敌时间
      CLEAR_MARGIN: 140,     // 清弹范围：镜头外扩边距
    },
    // 大世界随机事件：风险星域 / 能量水晶 / 补给舱
    EVENTS: {
      ZONE_INTERVAL: 24,     // 风险星域生成间隔（秒）
      ZONE_LIFE: 18,         // 风险星域持续
      ZONE_RADIUS: 150,      // 半径
      ZONE_DPS: 6,           // 圈内每秒掉血
      ZONE_XP_MUL: 2,        // 圈内击杀经验倍率
      MAX_ZONES: 2,
      CRYSTAL_INTERVAL: 13,  // 能量水晶生成间隔
      CRYSTAL_HP: 45,
      CRYSTAL_R: 17,
      CRYSTAL_GEMS: 4,       // 击碎掉落经验球数量
      MAX_CRYSTALS: 4,
      POD_INTERVAL: 30,      // 补给舱生成间隔
      POD_R: 15,
      POD_HEAL: 25,          // 拾取回复生命
      POD_ENERGY: 45,        // 拾取回复超载能量
      MAX_PODS: 1,
      // 场地灾害：陨石雨 / 扫射激光，预警后落地，逼迫走位
      HAZARD: {
        FIRST_WAVE: 3,         // 第 3 波开始出现
        INTERVAL: 17,          // 基础间隔（秒）
        METEOR_COUNT: 4,       // 每轮陨石数量
        METEOR_R: 62,          // 爆炸半径
        METEOR_WARN: 1.15,     // 预警时间
        METEOR_DMG: 15,        // 单次伤害
        BEAM_WARN: 1.1,        // 激光预警
        BEAM_ACTIVE: 0.45,     // 激光持续
        BEAM_WIDTH: 54,        // 激光判定宽度
        BEAM_DMG: 18,          // 激光伤害
        MAX_ACTIVE: 3,         // 同屏灾害上限
      },
    },
    // 可破坏陨石：挡路但可击碎，碎裂时对周围敌人爆炸并掉落资源
    ASTEROID: {
      INTERVAL: 9,            // 生成间隔（秒）
      MAX: 7,                 // 同屏上限
      R: 27,                  // 基础半径
      HP: 110,                // 生命
      EXPLODE_R: 118,         // 碎裂爆炸半径
      EXPLODE_DMG: 55,        // 爆炸伤害
      GEMS: 3,                // 掉落经验球
      CREDITS: 8,             // 掉落星币
    },
    // 星际游商：随机出现，触碰后三选一交易
    TRADER: {
      INTERVAL: 48,           // 出现间隔
      LIFE: 26,               // 停留时间
      R: 19,
    },

    LIMITS: {
      ENEMIES: 140,               // 同屏敌人上限
      BULLETS: 220,               // 同屏玩家子弹上限
      EBULLETS: 160,              // 同屏敌方子弹上限
      PARTICLES: 340,             // 同屏粒子上限
      GEMS: 100,                  // 经验球上限
      NUMBERS: 40,                // 飘字上限
    },
    FX: {
      SHAKE: 1.0,                 // 屏幕震动强度倍率
      FLASH: 1.0,                 // 受伤闪屏强度
    },
    AUDIO: {
      MASTER: 0.55,               // 总音量
      SFX: 0.7,                   // 音效音量
      MUSIC: 0.22,                // 背景音音量
    },
  };

