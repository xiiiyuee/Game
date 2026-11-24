# AGENTS.md · 星域幸存者维护交接

面向接手本仓库的 AI / 人类维护者。读完这一份即可拿到最新版、跑通构建、定位代码并安全提交。

## 1. 两个入口

| 用途 | 地址 |
| --- | --- |
| 在线可玩最新版 | <https://37l3l4w2p1gt5uye81t.traesite.cn/> |
| GitHub Pages 在线版 | <https://xiiiyuee.github.io/Game/> |
| 源码仓库 | <https://github.com/xiiiyuee/Game>（`main` 为最新） |
| 仓库内单文件版 | <https://github.com/xiiiyuee/Game/blob/main/star-survivor/dist/index.html>（下载后双击可玩） |

- 在线地址是 Trae 部署的**单文件构建产物**，不是源码，不要尝试从中还原或直接修改。
- `star-survivor/dist/index.html` 已随仓库分发，供其他 agent 直接获取可玩版本；它仍由 `npm run build` 生成，**不要手改**。
- 离线保留可玩版：

```bash
curl -L -o star-survivor-latest.html https://37l3l4w2p1gt5uye81t.traesite.cn/
```

- GitHub Pages 已启用（Source: GitHub Actions），每次推送 `main` 自动构建并发布到 `https://xiiiyuee.github.io/Game/`；工作流见 `.github/workflows/pages.yml`。
- 其他 agent 无法发布到上述 Trae 站点（依赖本环境部署插件与授权）。上线由维护者执行。

## 2. 获取源码与本地运行

要求 Node.js 18+，项目零运行时依赖。

```bash
git clone https://github.com/xiiiyuee/Game.git
cd Game/star-survivor
npm test        # 构建 dist/index.html + 静态检查
npm run dev     # 构建并启动本地预览 http://localhost:4173
```

构建产物：`star-survivor/dist/index.html`，可直接双击打开。

## 3. 代码结构

```
star-survivor/
├─ src/
│  ├─ index.template.html     # 页面骨架与 DOM
│  ├─ manifest.json           # JS / CSS 拼接顺序（新增文件必须登记）
│  ├─ js/01-config.js … 24-init.js
│  └─ styles/00-base.css … 14 个样式分区
├─ scripts/build.mjs          # 模板 + 样式 + 脚本 → 单文件
├─ scripts/check.mjs          # manifest 完整性 / 语法 / 占位符 / IIFE 包装
├─ scripts/serve.mjs          # 本地静态服务，默认 4173
└─ tests/                     # 无头 Chrome 回归脚本
```

改代码前先看对应编号分区，例如：
- 数值与配置：[src/js/01-config.js](star-survivor/src/js/01-config.js)
- 敌机 / Boss：[src/js/13-enemies.js](star-survivor/src/js/13-enemies.js)
- 玩家与射击：[src/js/14-player-update.js](star-survivor/src/js/14-player-update.js)
- 技能：[src/js/15-skills.js](star-survivor/src/js/15-skills.js)
- 升级与卡池：[src/js/12-progression.js](star-survivor/src/js/12-progression.js)
- 防线：[src/js/20-defenses.js](star-survivor/src/js/20-defenses.js)
- 联机同步：[src/js/17-game-flow.js](star-survivor/src/js/17-game-flow.js)
- 渲染：[src/js/22-render.js](star-survivor/src/js/22-render.js)

## 4. 硬性约束

1. **只改 `src/`**。`dist/index.html` 是构建产物（随仓库分发），手改会被下次构建覆盖。
2. 保持**单文件自包含**构建，不引入打包器、框架或运行时依赖。
3. JS / CSS 文件按编号顺序拼接；新增文件必须写入 `src/manifest.json`。
4. 联机保持**房主权威**：客机只上报输入、只做表现；伤害、刷怪、Boss、防线由房主结算。
5. 不新增时停；保留既有特效与玩法，优化优先做数值与机制收敛。
6. 单机与联机路径都要考虑：新增状态需写入快照或事件，否则客机表现会不同步。

## 5. 改完必须验证

```bash
npm test        # 必须通过
npm run dev     # 实际开一局，验证手感和报错
```

回归测试位于 `tests/`，依赖本机 Chrome 与 `puppeteer-core`，不纳入 CI（以下命令在 `star-survivor/` 下执行）：

```bash
npm i -D puppeteer-core
# 按本机路径修改各测试文件顶部的 CHROME 常量
node tests/prep.mjs          # 生成测试页，默认 /tmp/qa/sstest，可用 QA_OUT 覆盖
node tests/smoke.mjs         # 冒烟
node tests/gameplay-test.mjs # 玩法 / 星域事件 / 觉醒 / 防线联动
node tests/pressure-test.mjs # 威胁等级 / 灾害 / 追猎者 / Boss 二阶段
node tests/coop-test.mjs     # 联机
node tests/defense-test.mjs  # 防线
node tests/xp-test.mjs       # 经验曲线
node tests/skill-test.mjs
node tests/skill-mod-test.mjs
node tests/rarity-test.mjs
```

测试通过 `window.__SS__` 暴露内部状态，新增可测逻辑时在 `tests/prep.mjs` 中同步导出。

## 6. 提交与发布

- 在独立分支提交，开 PR 或等待维护者审核，**不要直接覆盖 `main`**。
- 提交内容应包含：源码、必要的测试、以及 `docs/COOP_TASKS.md` 的交接说明。
- 推送到 `main` 会触发仓库 CI（构建 + 检查）；Pages 工作流因 Pages 未启用可能失败，不影响源码。
- 线上更新只能由维护者通过 Trae 部署插件完成；部署后需校验线上页面包含新改动，再向用户报告地址。

## 7. 当前版本要点（便于继续迭代）

- 升级曲线：1 级 24 经验，1.26 递增；连杀对经验只吃一半加成
- 主动技能：相位冲刺 / 重力井 / 擦弹回流，均有改装与终极觉醒
- 防线联动：炮塔光环、技能过载、擦弹城墙充能
- 压迫机制：威胁等级、预判射击与交叉弹幕、场地灾害（陨石 / 激光）、追猎者
- Boss：三阶段，70% / 35% 阈值；二阶段起召唤陨星，留下灼烧地面
- 联机：PeerJS，房主权威；新增字段需同时更新快照协议与客机渲染
