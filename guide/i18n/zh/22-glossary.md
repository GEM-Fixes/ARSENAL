[machine] 本文由英文原文 `guide/22-glossary.md` 机器翻译而来，未经人工校对；如有出入，以原文为准。术语保留英文原词（与文件和工具中的写法一致），后附中文；各节仍按英文字母顺序排列。链接指向英文章节。

# 22. 术语表

本章按字母顺序解释指南中用到的术语，包括第一部分的分步页面和第三部分的参考条目所用的词。每一条都指向详细讲解该内容的章节，必要时也指向第一部分的页面或第三部分的条目。`mod.info` 的键和模组文件夹见[参考 1](../../r01-mod-info-and-folder.md)；机器人脚本和控制台见[参考 12](../../r12-bot-lua-and-console.md)。

## A

- **Ability（能力、技能）**：士兵的某项命名技能等级，例如武器技能，用等级数字设置。超出允许范围的等级数字会被悄悄当作最高等级。见第 [8](../../08-infantry-and-humans.md) 章。
- **Advanced（高级）**：ARSENAL 窗口的一项设置，在“工具与设置 > 设置”中，Ctrl+K 中也有。它在已有的选项卡中添加条目和专家选项（例如“测试运行”“模组文件”“专家工具”和页面中标为高级的折叠区），从不新增选项卡。每次打开时都会先询问；打开期间，页眉显示小标签“高级：开”。见第 [19](../../19-toolchain.md#settings-all-games) 章。
- **Ammo type（弹药类型）**：一枚弹药的数据条目，带有标签（口径加类型），武器和穿深表据此匹配。见第 [9](../../09-weapons-ammo-damage.md) 章。
- **Apply（应用）**：Options 模组界面中的按钮，让游戏重新读取已启用的模组。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **ARSENAL**：本指南使用的模组制作工具包。`ARSENAL.exe` 用一条命令（`ARSENAL <tool> ...`）运行每个工具，不需要安装其他任何东西；`ARSENAL help` 列出这些工具。没有 exe 时，同样的命令在 ARSENAL 文件夹中以 `node tools/as2/as2.js <tool>` 运行（旧名：`as2`）。见第 [19](../../19-toolchain.md) 章。
- **ARSENAL-gui**：窗口形式的同一批工具。双击 `ARSENAL.exe` 或 `ARSENAL-gui.cmd`，它的页面就会在你的浏览器中打开；每个页面都会写明它服务于哪款游戏。见第 [19](../../19-toolchain.md) 章。
- **Armour simulator（装甲模拟器）**：“模型与模拟 > 模型”中的“装甲”选项卡，以及 `armorsim` 命令。它按游戏读取的方式显示载具的装甲（把你的模组叠加在游戏之上），以及哪些炮弹在哪个距离能击穿。见第 [9](../../09-weapons-ammo-damage.md#11-seeing-and-testing-armour-in-the-arsenal-window) 和 [19](../../19-toolchain.md#models--sim-all-games) 章，以及[修改装甲](../../p05-change-armour.md)。
- **Arrange mode（布局模式）**：ARSENAL 窗口的一种模式，在“工具与设置 > 设置”中或用 Ctrl+K 的“调整此页面布局”开始，可以移动、隐藏和显示每个页面的各个块。布局保存在一个配置中。见第 [19](../../19-toolchain.md#arrange-mode) 章。
- **as64.exe**：64 位游戏程序。它增加了控制台（`-console`）、一台电脑上的多个游戏窗口（`-instance N`）以及 `testrun` 使用的控制管道（`-control`），并把上一份日志保留为 `game.prev.log`。见第 [18](../../18-testing-and-logs.md) 章。
- **as64+**：64 位版本内置的扩展包。启用列表中有它时，游戏以增强模式运行；没有它时，以经典模式运行。它总是在所有玩家模组之前加载。见第 [3](../../03-mod-folder-and-load-order.md) 章和[参考 1](../../r01-mod-info-and-folder.md#as64)。
- **Assault Squad 2（AS2）**：本指南所讲的游戏。见第 [1](../../01-getting-started.md) 章。

## B

- **BOOT OK**：模组已加载、测试对局已开始时，`play` 和“游玩”页面给出的报告。它并不表示模组玩起来是对的。见第 [18](../../18-testing-and-logs.md) 章。
- **Behind the armour（装甲之后）**：“模型”页面射击测试下方的面板，它跟随一发炮弹穿过装甲板，说明它对部件、乘员和整辆载具造成了什么。见第 [9](../../09-weapons-ammo-damage.md#behind-the-armour) 章。
- **binaries/x64**：Gates of Hell 安装中存放游戏程序 `call_to_arms.exe`、它自己的创意工坊上传器和 `steam_api64.dll` 的文件夹。ARSENAL 的创意工坊上传器放在这里。见第 [20](../../20-packaging-and-release.md#the-arsenal-workshop-uploader) 章。
- **Bisect（二分法）**：通过先关掉一半修改、再关掉剩余的一半，直到只剩一个修改，来定位故障。见第 [18](../../18-testing-and-logs.md) 和 [21](../../21-troubleshooting.md) 章。
- **Block（块）**：ARSENAL 窗口某个页面的一个部分，布局模式可以移动、隐藏或重新显示它。见第 [19](../../19-toolchain.md#arrange-mode) 章。
- **Bone（骨骼）**：模型骨架中的命名点或关节，用于炮塔、炮口和车轮。更换模型后缺少骨骼是常见错误。见第 [16](../../16-effects-sound-models.md) 章。
- **Bot（机器人）**：多人游戏中的电脑玩家，由数据和 Lua 脚本驱动。见第 [10](../../10-ai-and-bots.md) 章。
- **Bot Doctrine（机器人战术条令）**：ARSENAL 窗口的一个页面（64 位版本，“游戏模式与机器人 > 机器人 > 机器人战术条令”），它把小部队作战方式的简短规则以及遵循这些规则的角色，转成你模组中的机器人设置。与 Gates of Hell 的 doctrine 不是一回事。见[机器人](../../p11-bots.md)和第 [10](../../10-ai-and-bots.md) 章。
- **Branch task（分支任务）**：在另一个快速引导任务内部开始的任务，例如在载具任务中新建一门炮。它结束后你会回到第一个任务。见第 [19](../../19-toolchain.md#quick-guided-task) 章和[使用快速引导任务](../../p17-quick-guided-task.md)。
- **Breed（品种）**：描述某类士兵身体和感知能力的一组数据。见第 [6](../../06-data-keys-entities.md) 和 [8](../../08-infantry-and-humans.md) 章。
- **Build (tool)（构建，工具）**：运行所有检查并写出 pak 的工具。见第 [20](../../20-packaging-and-release.md) 章。
- **Buy panel（购买面板）**：多人游戏中玩家购买单位的游戏内面板。每个按钮来自多人单位列表中的一张单位卡。见第 [15](../../15-interface-and-icons.md) 章和[修改单位数值](../../p02-change-unit-numbers.md)。

## C

- **Cache（缓存）**：`entityindex` 等工具保存的索引，以便快速启动。见第 [19](../../19-toolchain.md) 章。
- **call_to_arms.exe**：Gates of Hell 的游戏程序，位于 `binaries/x64`。ARSENAL 凭它识别 Gates of Hell 文件夹。见第 [20](../../20-packaging-and-release.md#the-arsenal-workshop-uploader) 章。
- **check**：入口工具：给它任意位置的模组文件夹，它会在不运行游戏的情况下，为每个游戏版本打印发现项和结论。见第 [19](../../19-toolchain.md) 章。
- **Card id (unit card, price card)（卡片 id，单位卡、价格卡）**：单位在多人单位列表中的条目名称，条目中有价格、所需军衔和解锁时间。购买面板图标以它命名。小队卡片在括号中带有阵营。见[添加单位](../../p03-add-a-unit.md)。
- **Chassis（底盘）**：载具数据中定义车轮、履带和移动的部分。见第 [7](../../07-units-vehicles-movement.md) 章。
- **Classic mode（经典模式）**：加载为旧数据版本（3.262）编写的模组的游戏模式。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **Clean copy（干净副本）**：“分享”页面为创意工坊上传器制作的模组文件夹副本，不含 `.git`、笔记、备份、`UPGRADE.md` 和其他残留物。见第 [20](../../20-packaging-and-release.md#the-clean-copy) 章。
- **Console（控制台）**：64 位版本的游戏内命令行。它需要 `-console` 启动选项；用 1 左边的键打开。见[参考 12](../../r12-bot-lua-and-console.md#8-reaching-the-console)。
- **Control pipe（控制管道）**：64 位版本用 `-control` 启动时打开的通道，工具通过它发送控制台命令。`testrun` 使用它。见第 [18](../../18-testing-and-logs.md) 章。
- **Confirm box（确认框）**：ARSENAL 窗口中每个会写文件或启动程序的步骤都会先打开的那个框：将发生什么、在哪里、“执行”和“取消”。见第 [19](../../19-toolchain.md#the-confirm-box) 章。
- **Conflict（冲突）**：两个模组替换同一个文件，只有一个生效。见第 [4](../../04-vfs-paks-patches.md) 和 [19](../../19-toolchain.md) 章。
- **Conquest（征服模式）**：只有 Gates of Hell 才有的战役模式，战斗在一张由据点组成的地图上进行。它读取 `set/dynamic_campaign` 下的固定文件（例如 `values.set` 和 `map_points.set`），机器人脚本通过 `BotApi.Conquest` 看到它（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [12](../../12-missions-and-multiplayer-setup.md#gates-of-hell-summary) 章。
- **cp1251**：旧的 Windows 西里尔编码。在原版数据中它只留在游戏会跳过的 `;` 注释里；不要改动这些字节。64 位版本把字符串值按 UTF-8 读取，所以存成 cp1251 的字符串显示为方块。见第 [5](../../05-sdl-language.md)、[14](../../14-localization.md) 和 [20](../../20-packaging-and-release.md) 章。
- **CRC**：校验和。多人大厅会比较文本类数据文件的校验和，而二进制文件只比较大小。见第 [12](../../12-missions-and-multiplayer-setup.md) 和 [20](../../20-packaging-and-release.md) 章。
- **CRLF**：游戏文本文件使用的双字符行尾（回车加换行）。见第 [5](../../05-sdl-language.md) 章。
- **Crash dump (minidump)（崩溃转储，小型转储）**：游戏崩溃时写出的文件，带有以 `.mdmp.log` 结尾的文本附件。见第 [18](../../18-testing-and-logs.md) 章。

## D

- **DDA**：SDL 所由发展而来的“块加键”文本语法的旧称。见第 [5](../../05-sdl-language.md) 章。
- **Dedicated server（专用服务器）**：在没有玩家参与的情况下运行多人对局的游戏程序。Gates of Hell 附带一个，即 `binaries/x64` 中的 `call_to_arms_server.exe`；它的声音默认关闭（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [12](../../12-missions-and-multiplayer-setup.md#gates-of-hell-summary) 章。
- **def（`.def`）**：实体定义文件。见第 [6](../../06-data-keys-entities.md) 章。
- **define（定义，宏）**：SDL 中的命名宏。调用未定义的宏是致命错误。见第 [5](../../05-sdl-language.md) 和 [21](../../21-troubleshooting.md) 章。
- **Desync（不同步）**：各玩家的游戏对发生了什么产生分歧的状态。参见 OOS。见第 [12](../../12-missions-and-multiplayer-setup.md) 和 [21](../../21-troubleshooting.md) 章。
- **develop (tag)（develop 标签）**：Gates of Hell `mod.info` 的 `Tags` 行中的一个词，它对该模组取消版本检查，在你制作模组期间很方便（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-6) 章。
- **Direct control（直接控制）**：亲手操纵一名士兵或一辆载具。Gates of Hell 为它增加了第三人称视角，用按键 `manual_mode_toggle` 切换；主机可以只允许直接视角、只允许第三人称，或两者都允许（`manualControlMode` 为 1、2 或 3）（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [7](../../07-units-vehicles-movement.md#gates-of-hell-summary) 章。
- **Docs page（“文档”页面）**：“帮助与文档”下的子选项卡，分为 ARSENAL、模组制作、引擎和项目笔记几个部分，在窗口内阅读和搜索本指南及其他文档，可以逐章阅读，也可以作为一本书阅读。见第 [19](../../19-toolchain.md#help--docs-all-games) 章。
- **Doctor**：对模组运行所有 lint 检查的工具，加 `--release` 时会在发布前检查文件夹。见第 [19](../../19-toolchain.md) 和 [20](../../20-packaging-and-release.md) 章。
- **Doctrine (Gates of Hell)（Gates of Hell 的 doctrine）**：每个玩家在 Gates of Hell 大厅中为自己的军队做出的选择；它筛选他能购买哪些单位。ARSENAL 的“机器人战术条令”是另一回事（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [12](../../12-missions-and-multiplayer-setup.md#gates-of-hell-summary) 章。
- **Donor（供体）**：一个能正常工作、同类的 Assault Squad 2 单位，从 Gates of Hell 移植来的单位就建立在它之上。供体带来乘员位置、武器槽和装甲布局。`donorpick` 会推荐一个。见[来自 Gates of Hell 的单位](../../p12-unit-from-gates-of-hell.md)。

## E

- **Enhanced mode（增强模式）**：用于要求 3.301 或更高版本的模组的游戏模式。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **Entity（实体）**：由数据定义的任何游戏对象：单位、载具、建筑或物品。见第 [6](../../06-data-keys-entities.md) 章。
- **entityindex**：为所有实体及其引用对象建立索引的工具。见第 [19](../../19-toolchain.md) 章。
- **Event（事件）**：发生的事情，交互脚本可以对其作出反应。见第 [11](../../11-interaction-scripts.md) 章。
- **Expert Tools（专家工具）**：“工具与设置 > 其他工具”中的条目，只在打开“高级”时显示，列出每个 ARSENAL 工具及其命令行，并显示差异、属性表和冲突。见第 [19](../../19-toolchain.md#other-tools-generator-and-expert-tools-all-games) 章。
- **ext（`.ext`）**：实体在其上构建的共享模板文件。见第 [6](../../06-data-keys-entities.md) 章。
- **Extender（扩展器）**：实体中添加某种能力的块，例如物品栏、生命力或火炮。见第 [6](../../06-data-keys-entities.md) 章。

## F

- **Fatal error（致命错误）**：会关闭游戏的加载错误，例如 `define not found`。见第 [18](../../18-testing-and-logs.md) 和 [21](../../21-troubleshooting.md) 章。
- **File viewer（文件查看器）**：不是纯文本的文件会在其中打开的只读视图：声音、图片、视频、字体、着色器、压缩包和字节。见第 [19](../../19-toolchain.md#file-viewers) 章。
- **Flag（标志）**：脚本中的命名开/关值，用 `{set}` 设置。超过 128 个不同的标志名是加载错误。见第 [11](../../11-interaction-scripts.md) 和 [12](../../12-missions-and-multiplayer-setup.md) 章。
- **FX（特效）**：视觉效果，如烟、火或炮口火焰。见第 [16](../../16-effects-sound-models.md) 章。

## G

- **gen**：根据规格文件写出小型模组的工具，或者用 `--describe` 根据用简单文字描述的单位来写；`--plan` 只预览。它写出的东西只是一个开始：在信任它之前先去玩一下。见第 [19](../../19-toolchain.md) 章。
- **Game card（游戏卡）**：在大厅中列出多人游戏模式的数据条目。见第 [12](../../12-missions-and-multiplayer-setup.md) 章。
- **Game folder（游戏文件夹）**：游戏的安装位置。请视为只读。见第 [2](../../02-install-layout.md) 章。
- **game.log**：游戏写入 `log/game.log` 的文本日志。见第 [18](../../18-testing-and-logs.md) 章。
- **Gates of Hell（GoH）**：一款使用较新版本引擎的相关游戏。它的数据在谨慎处理后可以移植，但只能供你自己游玩；它的内容永远不能分享。第二部分的各章逐节说明 Gates of Hell 在哪里不同。见第 [19](../../19-toolchain.md#appendix-porting-from-gates-of-hell) 章、[来自 Gates of Hell 的单位](../../p12-unit-from-gates-of-hell.md)和[下面的小结](#gates-of-hell小结)。
- **GEM index（GEM 索引）**：其他模组作者的指南和工具的索引，由“帮助与文档 > 指南与外部工具”和 `gemindex` 命令读取。见第 [19](../../19-toolchain.md) 章和[查找指南和工具](../../p16-find-guides-and-tools.md)。
- **GOH-ORIGIN.tsv**：模组保存的清单，列出它来自 Gates of Hell 的文件。带有这个文件的模组，“分享”页面和 `release-check --publish` 会拒绝打包、复制或发布。见第 [19](../../19-toolchain.md#appendix-porting-from-gates-of-hell) 和 [20](../../20-packaging-and-release.md#5-the-pre-release-gate) 章。
- **GoH numbers（GoH 数值）**：以前的一个页面，现在是 GoH 下“单位与平衡”第 3 步中的折叠区“翻译数值”。它显示移植如何把速度、装甲和其他数值换算到 Assault Squad 2 的尺度，并让你在换算不确定的地方自己选择。见第 [19](../../19-toolchain.md#units--balance-under-goh) 章。
- **GoH unit（GoH 单位）**：GoH 下“单位与平衡”选项卡“单位”子选项卡中的页面，以供体为基础，把一辆 Gates of Hell 载具带进 Assault Squad 2 模组。见第 [19](../../19-toolchain.md#units--balance-under-goh) 章和[来自 Gates of Hell 的单位](../../p12-unit-from-gates-of-hell.md)。

## H

- **Host（主机）**：创建多人对局的玩家，大厅会检查其设置。见第 [12](../../12-missions-and-multiplayer-setup.md) 章。
- **Human（人类）**：士兵的实体类别。见第 [8](../../08-infantry-and-humans.md) 章。

## I

- **inc（`.inc`）**：共享数据的包含文件。见第 [5](../../05-sdl-language.md) 章。
- **include（包含）**：粘贴另一个文件的 SDL 命令。见第 [5](../../05-sdl-language.md) 章。
- **Instance（实例）**：一台电脑上多个游戏窗口中的一个。用 `-instance N`（N 为 1 到 9）启动 64 位版本；每个实例都有自己的设置和 `game.log`。见第 [18](../../18-testing-and-logs.md) 章。
- **Interaction（交互）**：由 `{on event}` 规则组成、控制行为的脚本。见第 [11](../../11-interaction-scripts.md) 章。
- **Inventory（物品栏）**：存放单位武器和弹药的扩展器。见第 [6](../../06-data-keys-entities.md) 和 [8](../../08-infantry-and-humans.md) 章。

## K

- **Key（键）**：块内的命名设置，后面跟着它的值。见第 [5](../../05-sdl-language.md) 和 [6](../../06-data-keys-entities.md) 章。
- **keylint**：检查键的拼写错误和错误取值的工具。见第 [19](../../19-toolchain.md) 章。
- **keys.set**：定义热键的文件。见第 [15](../../15-interface-and-icons.md) 章。

## L

- **LAN Remote**：让家庭网络中的手机、平板或另一台电脑通过一个私人链接查看 ARSENAL 窗口。修改只能在电脑上进行。见第 [19](../../19-toolchain.md#lan-remote-and-the-phone-view) 章。
- **LOADS_STATIC**：`check` 未发现已知崩溃模式并接受该版本时给出的结论。它绝不表示模组能正常运行。见第 [19](../../19-toolchain.md) 章。
- **Lint**：对可能的错误做自动检查。见第 [19](../../19-toolchain.md) 章。
- **Lobby（大厅）**：对局开始前玩家加入并比较数据的界面。见第 [12](../../12-missions-and-multiplayer-setup.md) 章。
- **lng（`.lng`）**：文本键的本地化文件，以 UTF-8 保存。见第 [14](../../14-localization.md) 章。
- **Load order（加载顺序）**：模组被挂载的顺序。后加载的优先。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **localizations (folder)（localizations 文件夹）**：Gates of Hell 模组中按语言存放文本和文件的文件夹，`localizations/<code>/`。Gates of Hell 不读取 Assault Squad 2 模组的 `localization/` 文件夹（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-1) 章。
- **LOD**：细节层次，即在远处显示更简单的模型。见第 [16](../../16-effects-sound-models.md) 章。
- **Loose file（散装文件）**：放在文件夹中而不是 pak 里的文件。它总是优先于模组根目录 `resource.pak` 中的同一路径；与 `resource/` 内的 pak 相比，由文件夹扫描顺序决定。见第 [4](../../04-vfs-paks-patches.md) 章和[参考 1](../../r01-mod-info-and-folder.md#loose-file-against-pak)。
- **Lua**：多人机器人使用的脚本语言。见第 [10](../../10-ai-and-bots.md) 和 [12](../../12-missions-and-multiplayer-setup.md) 章。

## M

- **Macro（宏）**：带参数、可重复使用的 SDL 片段。见第 [5](../../05-sdl-language.md) 章。
- **Material（`.mtl`，材质）**：说明网格使用哪些贴图和着色的文件。见第 [16](../../16-effects-sound-models.md) 章。
- **mdl（`.mdl`）**：模型定义文件。见第 [16](../../16-effects-sound-models.md) 章。
- **mi（`.mi`）**：含玩家、触发器和命令的任务或地图文件。见第 [12](../../12-missions-and-multiplayer-setup.md) 和 [13](../../13-maps.md) 章。
- **Minidump（小型转储）**：见 Crash dump。
- **Mod（模组）**：带有 `mod.info`、会改变游戏的文件夹。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **mod.info**：模组的描述文件，含名称、版本范围和依赖。见第 [3](../../03-mod-folder-and-load-order.md) 章。
- **`mod_<item number>`（`mod_<物品编号>`）**：Gates of Hell 给来自创意工坊的模组起的名字，由物品编号决定（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-7) 章。
- **Morale（士气）**：士兵继续战斗的意愿。见第 [8](../../08-infantry-and-humans.md) 章。
- **Mount（挂载）**：使文件夹或 pak 成为虚拟文件系统的一部分。见第 [4](../../04-vfs-paks-patches.md) 和 [20](../../20-packaging-and-release.md) 章。

## N

- **Node**：运行模组工具的程序（Node.js）。见第 [19](../../19-toolchain.md) 章。

## O

- **OOS（out of sync，失去同步）**：各机器出现分歧的多人故障。转储写入 `log/oos/`。见第 [18](../../18-testing-and-logs.md) 和 [21](../../21-troubleshooting.md) 章。
- **options.set**：你的配置文件设置，包括已启用模组的列表。见第 [2](../../02-install-layout.md) 和 [3](../../03-mod-folder-and-load-order.md) 章。
- **Override（覆盖）**：让你的模组提供同路径文件以替换原文件。见第 [4](../../04-vfs-paks-patches.md) 章。

## P

- **Pak**：游戏文件的 zip 压缩包。见第 [4](../../04-vfs-paks-patches.md) 和 [20](../../20-packaging-and-release.md) 章。
- **Package（发布包）**：“分享”页面为朋友写出的现成模组文件夹，带有它的 `mod.info` 和 pak。见第 [20](../../20-packaging-and-release.md#5-the-pre-release-gate) 章。
- **pat（`.pat`）**：存放补丁的编号压缩包（`1.pat`、`2.pat`）。编号不能有空缺。见第 [4](../../04-vfs-paks-patches.md) 章。
- **Patch（`.patch`，补丁）**：从 `.pat` 压缩包应用的编辑指令文件。见第 [4](../../04-vfs-paks-patches.md) 章。
- **Patch mod（补丁模组）**：`ARSENAL fix` 把安全修复写入的一个单独的模组文件夹。它在你的模组之后加载，所以你的模组永远不会被修改。见[检查、修复并阅读日志](../../p14-check-fix-read-log.md)。
- **Pathfinding（寻路）**：单位如何选择路线。见第 [7](../../07-units-vehicles-movement.md) 章。
- **Penetration（穿深）**：炮弹能否击穿装甲。见第 [9](../../09-weapons-ammo-damage.md) 章。
- **Persona（角色）**：多人机器人的一种打法，由“机器人战术条令”页面和 `doctrine` 作为初始数值写入模组。见[机器人](../../p11-bots.md)。
- **Phone view（手机视图）**：另一台设备通过 LAN Remote 显示的 ARSENAL 窗口：每个页面都能阅读，什么都不能修改。见第 [19](../../19-toolchain.md#lan-remote-and-the-phone-view) 章。
- **Pitfall（陷阱）**：已知的坑。每章都列出各自主题的陷阱。
- **Play card（游玩卡）**：“分享”页面和发布任务为朋友制作的简短文字：哪些模组、按什么顺序、在哪个游戏版本上。见第 [20](../../20-packaging-and-release.md#6-multiplayer-compatibility) 章。
- **pot（`.pot`）**：Gates of Hell 的文本文件格式（UTF-8）。这款游戏不附带 `.lng` 文件（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [14](../../14-localization.md#gates-of-hell-summary) 章。
- **Preset（预设）**：为一场对局保存的一组游戏设置。见第 [12](../../12-missions-and-multiplayer-setup.md) 章。
- **Priority（优先级）**：只有 Gates of Hell 读取的 `mod.info` 键：一个整数，缺省时为 1。在互不依赖的模组之间，数字更高的后应用并生效（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-6) 章。

## Q

- **Quant（量子）**：游戏时间的一个刻，数据中计时器和速度所用的单位。见第 [5](../../05-sdl-language.md) 章。
- **Quick Guided Task（快速引导任务）**：ARSENAL 窗口选项卡上方的那一行：“我想要”制作、修改或查看某样东西，然后按“开始”。任务一次问一个问题，带着还原点写入你的模组，并检查它。见[使用快速引导任务](../../p17-quick-guided-task.md)和第 [19](../../19-toolchain.md#quick-guided-task) 章。

## R

- **refcheck**：检查实体用到的每个名称是否存在的工具。见第 [19](../../19-toolchain.md) 章。
- **rep（`.rep`）**：Gates of Hell 的录像，`replays/` 中的一个 zip 文件。Gates of Hell 和 Assault Squad 2 读不了对方的录像（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#replays-on-the-workshop) 章。
- **Repository（仓库）**：游戏内部已加载资源的列表。日志会打印 `Repository: N resources`。见第 [4](../../04-vfs-paks-patches.md) 和 [18](../../18-testing-and-logs.md) 章。
- **Resource folder（资源文件夹）**：游戏或模组中存放数据的 `resource/`。见第 [2](../../02-install-layout.md) 章。
- **Restore point（还原点）**：文件的旧版本，在编辑器（IDE 选项卡）或某个任务写入它之前保存，放在模组旁边名为 `<mod>.arsenal-undo` 的文件夹里。见第 [19](../../19-toolchain.md#saving-and-undo) 章。

## S

- **sav（`.sav`）**：Gates of Hell 的存档，每个存档一个压缩包。存档不能在 Gates of Hell 和 Assault Squad 2 之间互通（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-5) 章。
- **Saved task（已保存的任务）**：你开始后又离开的快速引导任务。在“已保存的任务”下选中它，按“继续”，或按“丢弃”。见第 [19](../../19-toolchain.md#quick-guided-task) 章。
- **SOEdit**：用于游戏模型文件的模型编辑器，从“模型”页面或用 `ARSENAL soedit open` 打开。它作为 `ARSENAL.exe` 旁边的 `soedit` 文件夹提供；没有它时，“模型”页面会提供 “Get SOEdit and open it”。见第 [19](../../19-toolchain.md#soedit-models-in-soedit) 和 [21](../../21-troubleshooting.md#13-symptom-an-arsenal-page-refuses-or-finds-nothing) 章，以及[编辑模型](../../p06-edit-a-model.md)。
- **SDL**：几乎所有游戏数据所用的文本数据语言。见第 [5](../../05-sdl-language.md) 章。
- **Sensor（传感器）**：定义单位能看到和听到什么的数据。见第 [6](../../06-data-keys-entities.md) 和 [10](../../10-ai-and-bots.md) 章。
- **set（`.set`）**：数据文件，常为数值表，位于 `set/` 下。见第 [5](../../05-sdl-language.md) 和 [6](../../06-data-keys-entities.md) 章。
- **Share page（“分享”页面）**：为朋友或创意工坊准备模组的页面：`mod.info`、图片、发布检查、发布包、干净副本、上传器、新版本和游玩卡。仅限 Assault Squad 2 和 64 位版本。见第 [20](../../20-packaging-and-release.md#5-the-pre-release-gate) 章和[打包与分享](../../p15-pack-and-share.md)。
- **Shot tool（射击工具）**：“模型”页面 3D 视图中的“射击”按钮：在模型上点击一下，就会向那个点发射所选的炮弹，并显示发生了什么。见第 [9](../../09-weapons-ammo-damage.md#the-shot-tool-in-the-3d-view) 章。
- **Soft code（软代码）**：可编辑的文本和资源层，与编译后的程序相对。见第 [1](../../01-getting-started.md) 章。
- **Stage record（暂存记录）**：“模型”页面复制模型时写入你模组（在 `.arsenal/soedit/` 下）的小文件，让 SOEdit 打开副本而不是原件。见[编辑模型](../../p06-edit-a-model.md)。
- **Stuff（物品数据）**：武器、弹药和物品的数据文件。见第 [6](../../06-data-keys-entities.md) 和 [9](../../09-weapons-ammo-damage.md) 章。

## T

- **Tag（标签）**：用于匹配事物的词，例如把弹药匹配到穿深表。见第 [5](../../05-sdl-language.md) 和 [9](../../09-weapons-ammo-damage.md) 章。
- **Tags (mod.info)（mod.info 的 Tags）**：Gates of Hell `mod.info` 中的一行词：`develop` 取消版本检查，`no_delete` 隐藏删除按钮。Assault Squad 2 会跳过这一行（未在运行中的游戏里测试，见[小结](#gates-of-hell小结)）。见第 [20](../../20-packaging-and-release.md#in-gates-of-hell-6) 章。
- **Testrun**：驱动游戏进行自动检查的工具。见第 [18](../../18-testing-and-logs.md) 章。
- **Texture（贴图）**：画在模型上的图像。见第 [16](../../16-effects-sound-models.md) 章。
- **Triage（分诊）**：把日志消息分为致命、可疑和无害三类。见第 [18](../../18-testing-and-logs.md) 和 [21](../../21-troubleshooting.md) 章。

## U

- **Unconfirmed（未确认）**：尚未在游戏中确认的事实，在本指南中标为 “(unconfirmed)”。见 [README](../../README.md)。
- **UTF-8**：`.lng` 文件所用的文本编码。见第 [14](../../14-localization.md) 章。

## V

- **VFS（virtual file system，虚拟文件系统）**：所有游戏和模组文件的合并视图。见第 [4](../../04-vfs-paks-patches.md) 章。
- **Vitality（生命力）**：存放生命值的扩展器。见第 [6](../../06-data-keys-entities.md) 章。
- **vol（`.vol`）**：描述命中形状和装甲区域的体积文件。见第 [6](../../06-data-keys-entities.md) 和 [9](../../09-weapons-ammo-damage.md) 章。

## W

- **Whole document（完整文档）**：在“文档”页面上整份阅读的文档：“战术条令图集”“模组制作指南”或“引擎文档”。见第 [19](../../19-toolchain.md#whole-documents) 章。
- **Workshop（创意工坊）**：Steam 的模组分享服务。见第 [20](../../20-packaging-and-release.md) 章和[打包与分享](../../p15-pack-and-share.md)。
- **Workshop copy（创意工坊副本）**：已订阅的创意工坊物品的副本。原版游戏把它复制到 `mods/<Name>/`；64 位版本直接从 Steam 的下载文件夹加载它，并忽略 `mods/` 中的副本。Gates of Hell 也直接加载它，名为 `mod_<item number>`。见第 [20](../../20-packaging-and-release.md#8-steam-workshop) 章和[参考 1](../../r01-mod-info-and-folder.md#workshop-copy)。
- **Workshop uploader（创意工坊上传器）**：把模组文件夹上传到 Steam 创意工坊的程序。ARSENAL 自己的上传器是 `workshop_gui.exe`，“分享”页面把它放到游戏程序旁边并打开它；它适用于 Assault Squad 2、64 位版本和 Gates of Hell。见第 [20](../../20-packaging-and-release.md#the-arsenal-workshop-uploader) 章。

## Z

- **Zip root（zip 根）**：pak 内条目路径的起始文件夹。放在 `resource/` 中的 pak 需要在内部带上顶层文件夹名。见第 [20](../../20-packaging-and-release.md) 章。
- **Zip64**：允许超大 pak 的 zip 扩展。见第 [20](../../20-packaging-and-release.md) 章。

## Gates of Hell：小结
<!-- goh: GHVFS-01 GHVFS-02 GHVFS-04 GHVFS-24 GHVFS-36 GHNET-17 GHNET-56 GHNET-66 GHCQ-03 GHCQ-41 GHDC-05 GHDC-06 GHMIS-117 PORT-42 -->

本书中关于 Gates of Hell 的说明都没有在运行中的游戏里测试过。依赖它们之前，请在你自己的游戏中检查。

下面这些术语属于 Gates of Hell，或说明 ARSENAL 如何处理它：

| 术语 | 是什么 |
|---|---|
| [binaries/x64](#b) | 游戏程序所在的文件夹；创意工坊上传器放在这里 |
| [call_to_arms.exe](#c) | Gates of Hell 的游戏程序 |
| [Conquest](#c) | 只有 Gates of Hell 才有的战役模式 |
| [Dedicated server](#d) | `call_to_arms_server.exe`，没有玩家参与的对局 |
| [develop (tag)](#d) | 取消某个模组的版本检查 |
| [Direct control](#d) | Gates of Hell 增加了第三人称视角 |
| [Doctrine (Gates of Hell)](#d) | 大厅中每个玩家的一项选择，用来筛选单位 |
| [GOH-ORIGIN.tsv](#g) | 移植文件的清单；这样的模组永远不会被分享 |
| [GoH numbers](#g)、[GoH unit](#g) | 把载具带进 Assault Squad 2 的 ARSENAL 页面和折叠区 |
| [localizations (folder)](#l) | Gates of Hell 模组中按语言存放的文本 |
| [`mod_<item number>`](#m) | Gates of Hell 中创意工坊模组的名字 |
| [pot (`.pot`)](#p) | Gates of Hell 的文本文件 |
| [Priority](#p) | 给互不依赖的模组排序的 `mod.info` 键 |
| [rep (`.rep`)](#r) | Gates of Hell 的录像 |
| [sav (`.sav`)](#s) | Gates of Hell 的存档 |
| [Tags (mod.info)](#t) | `develop` 和 `no_delete` |

第二部分的每一章最后都有自己的 Gates of Hell 小结；打包和创意工坊见[第 20 章](../../20-packaging-and-release.md#gates-of-hell-summary)，问题排查见[第 21 章](../../21-troubleshooting.md#gates-of-hell-summary)。
