[machine] 本文由英文原文 `guide/18-testing-and-logs.md` 机器翻译而来，未经人工校对；如有出入，以原文为准。命令、文件名、键名和游戏消息保持原样。链接指向英文章节。

# 18. 测试与日志

简便路线：[检查模组、修复检查发现的问题、阅读游戏日志](../../p14-check-fix-read-log.md)用七个步骤完成同样的工作。本章解释每一步发生了什么，以及如何读懂游戏告诉你的内容。

## 你将学到

- 适用于每次修改的可重复测试循环。
- 如何启动游戏、启用你的模组并确认运行的正是它。
- 如何把使用 “Test mode” 预设的局域网（LAN）对局当作试验台。
- 如何阅读 `game.log`，区分致命错误与警告，并忽略无害的噪声。
- 如何阅读崩溃转储和失去同步（OOS）转储，以及如何用二分法（bisect）找出崩溃原因。
- 哪些 ARSENAL 页面和命令可以替你读日志。
- 测试 Gates of Hell 模组时有什么不同。

整本指南的规则：数据修改只有在你于游戏中看到它生效、并在事后读过日志之后，才算完成。

## 1. 每次修改的测试循环

1. **保存你的工作。** 在版本控制中提交修改，并在覆盖之前把你的 pak 文件复制到安全的地方，因为版本控制不保存 pak。如果你的模组是散装文件夹，则无需重新打包；如果你打包 pak，请重新打包并确认 pak 的时间戳比你的编辑更新（见第 2 节）。
2. **先在没有游戏的情况下检查。** 在 ARSENAL 窗口的“检查”页面上按 “Check the mod”（模组有 300 个或更多文件时，“quick check” 勾选框一开始是勾上的，文件更少时不勾；想快速运行就勾上它）。命令方式是 `ARSENAL check <模组文件夹> --fast -q`。它只需几秒，告诉你模组能否静态加载，也就是文件中是否有工具已知会让游戏停止或崩溃的错误（[第 19 章](../../19-toolchain.md)）。结论 `LOADS_STATIC` 的意思是“没有发现已知的崩溃模式”，而不是“能用”。
3. **只启用被测试的模组，启动游戏**（第 2 节）。“游玩”页面可以替你完成：它检查模组、安装模组、在你的设置的一份独立副本中用测试地图启动游戏，并读取日志得出加载结论（第 9 节）。
4. **开始一场 LAN 测试对局**（第 4 节），购买改动过的单位并使用它们：开火、挨打、装填、燃烧。
5. 测试后或崩溃后**阅读日志**。在“读取 game.log”页面上按“解读最近的日志”，或者自己在日志中搜索你改过的文件名、“may lead to crash” 和 “define not found”。
6. **记录下来。** 记下日期、提交、单位和结果。把截图和完整日志保存在每次测试专属的文件夹里。把任何新出现但无害的警告记入你模组的“已知警告”列表。

要通过实际游玩来测试真实情况。决定性的射击（侧射、打发动机、用高爆弹打炮组）最好在直接控制下进行，由你亲自瞄准。

快捷方式：[快速引导任务](../../19-toolchain.md#quick-guided-task)在每个制作或修改任务的最后给出“立即检查”“前往游玩页面”和一个勾选清单“在游戏中要看什么”，这就是本循环的第 2 到 4 步。查看任务“上次运行出了什么问题”就是第 5 步。见[使用快速引导任务](../../p17-quick-guided-task.md)。

### 打包提醒

- 游戏从模组的 `resource/` 文件夹加载 `.pak` 文件，它们就是普通的 **zip 文件**。旁边的 `entity/`、`set/`、`properties/`、`script/`、`interface/` 和 `map/` 等散装文件夹是解压出来的副本，而 pak 里往往比散装副本更多。
- **散装文件按扫描顺序取胜，而不是按时间戳。** `resource/` 中遗留的 `set/...` 解压副本可能覆盖 `resource/` 内某个 pak 里的同一文件，所以请删除过时的解压副本。见[第 4 章](../../04-vfs-paks-patches.md)。
- pak 的分工：`gamelogic.pak` 存放 `set/`、`properties/` 和 `script/`；`entity.pak` 存放 `entity/`；`map.pak` 存放 `map/`；`interface.pak` 存放 `interface/`；`texture.pak` 存放贴图、模型定义和特效定义；`sound.pak` 存放 `sound/`；`music.pak` 存放音乐。
- **编码：** 文本数据文件使用 **CRLF** 换行，64 位版本把每个字符串值都按 **UTF-8** 读取，数据文件和 `.lng` 文件都一样；标识符必须是 ASCII。原版文件除 `;` 注释外都是 ASCII，注释里还留有旧的 cp1251 字节。有些编辑器会错误猜测这些注释的编码并改写文件。请使用可选择编码的编辑器（ARSENAL 的 IDE 选项卡中的编辑器会保留你没有改动的字节），或用不改动未修改字节并保留 CRLF 的脚本。见[第 14 章](../../14-localization.md)。
- 如果你为模组使用 git，请把仓库放在模组根目录，跟踪文本源文件，忽略 `*.pak` 和大型二进制文件，并设置为不转换换行符，以便带有旧注释字节的文件保持逐字节一致。创意工坊（Workshop）上传会复制整个模组文件夹，包括 `.git` 文件夹，所以请排除它。见[第 20 章](../../20-packaging-and-release.md)。

## 2. 启动并启用模组

从 Steam 启动游戏。标题为 “Select launch option” 的对话框提供 Play、Editor、Safe mode 和 Safe mode (no mods)；选择 Play。约 20 秒后出现主菜单。

模组在 **Options** 界面的 **MODS** 标签页（最后一个标签页）中应用。已禁用的模组在左边，已启用的在右边；选中一个并用箭头移动。然后按 **Apply**。游戏会显示 “Applying mods...” 约 30 秒（大型模组可能需要几分钟），无需重启。菜单按钮常常忽略单击，所以请双击。只启用被测试的模组，因为其他全局模组可能冲突。为 64 位版本制作的模组需要内置的附加模组 `as64+` 处于启用状态，并排在它前面（[第 3 章](../../03-mod-folder-and-load-order.md)）。

**如何确认你的模组已启用：** 打开你的配置文件中的 `options.set`，找到 `{mods` 块。每个已启用的模组占一行，例如 `"mymod:1"`。“读取 game.log”页面会替你读取同一个列表：“显示已启用的内容”按游戏使用的顺序列出你的模组，并对游戏不认识的文件夹以及位置不对的 `as64+` 发出警告。在原版游戏中，这个文件是唯一可靠的检查方法，因为它的日志不会提到本地模组的名字，主菜单页脚只显示版本文字。64 位版本的日志会列出它们（第 5 节）。如果你重命名了模组文件夹，它的那一行会被丢弃，Activated 列表为空，因此需要重新启用。`mod.info` 的键和启用列表在[参考 1](../../r01-mod-info-and-folder.md)中逐个说明。

文件所在位置：游戏把数据存放在“文档”文件夹下的 `My Games/Men of War - Assault Squad 2/`（OneDrive 可能重定向“文档”，所以朴素的路径可能不存在）。其中有 `profiles/<id>/options.set`（配置和选项）、`profiles/<id>/keys.set`（你的热键），以及含有 `game.log`、`minidumps/` 和 `oos/` 的 `log/`。

**两个游戏程序。** 原版游戏是 `mowas_2.exe`（数据版本 3.262）。64 位版本是 `as64.exe`；为它制作的模组声明最低版本 3.301。两者共用一个配置文件，所以在两者之间切换时，已启用的模组列表保持不变。只有 64 位版本会保留上一份日志、在日志中列出已挂载的模组、接受 `-instance`、`-console` 和 `-control` 等启动选项，并拥有用于自动化的控制管道（pipe）（第 9 节）。

**控制台。** 零售版 3.262 没有控制台（`~` 键无效）。64 位版本用 `-console` 启动时会提供控制台，按键是 `1` 左边的那个键。如何打开它以及每条命令的作用，见[参考 12，打开控制台](../../r12-bot-lua-and-console.md#8-reaching-the-console)。

**控制台 `exec`。** 控制台命令 `exec` 运行脚本文件，其路径规则很容易弄错。单独的 `exec "x.cfg"` 只会在 `resource/at/` 内找到 `x.cfg`。对位于 `resource/` 的文件，`exec "at/x.cfg"` 和 `exec "x.cfg"` 都会回答 “file not found”。其他位置则以斜杠从挂载根开始写路径：`exec "/x.cfg"`、`exec "/set/d/x.cfg"`，或写成 `exec "resource/x.cfg"`。脚本文件必须是 `.cfg`；散放的 `.txt` 游戏看不见。见[参考 12，exec](../../r12-bot-lua-and-console.md#exec)。

**同时运行多个副本。** 在 64 位版本上，`-instance N`（1 到 9）会启动一个拥有独立用户文件夹（`My Games/Men of War - Assault Squad 2 - instance N/`）、日志和配置文件的副本；见[第 12 章](../../12-missions-and-multiplayer-setup.md)。它的模组列表起初是空的，所以请先在该实例的 `options.set` 中启用你的模组。“游玩”页面和 `ARSENAL play` 使用实例 1，所以你自己的设置（实例 0）保持不变。

**不要假定某个控制台变量存在。** 你可能遇到的一些控制台变量名在 64 位版 3.301 中并不存在（已知有十三个）；有些只存在于编辑器版本中。先读取该变量，看它如何回答，再据此建立测试。

### 在 Gates of Hell 中
<!-- goh: GHVFS-13 GHLOG-16 GHMIS-07 GHMIS-119 GHMIS-120 GHMIS-122 GHLOG-38 -->

- **用户文件夹。** Gates of Hell 把数据存放在 `Documents/My Games/Gates of Hell/`。用 `-useLocalDataFolder` 启动时，或者“文档”位于 OneDrive 中时，它改用 `%LOCALAPPDATA%/Digitalmindsoft/Gates of Hell/`。它的 `log` 文件夹就在里面。
- **我的模组启用了吗？** 与原版 Assault Squad 2 不同，Gates of Hell 的日志会点出它的模组：`Scanning mods in`、`Found N available mods`、`Mod: activate mod <name>`，以及它挂载的每个 pak 各一行 `Mount package <file> with <n> entries`。在日志中搜索你的模组文件夹名即可。
- Gates of Hell 为测试增加的**控制台辅助命令**：`tut_clear_all` 忘记一次性的教程提示，让它们重新显示；`snd_restart` 重启声音系统并重新加载声音；`dev_l10n_reload` 重新读取文本；`logs_flush` 立即写出调试日志。`ui_armorDisplay` 在那里是一条命令（`ui_armorDisplay true`），不是变量，所以 `ui_armorDisplay = 1` 这种写法会失败。
- ARSENAL 不启动 Gates of Hell：GoH 下有“游玩”页面，但 `play` 不处理这款游戏。请自己启动游戏。

## 3. 测试用操作速查

按键之前先点击游戏窗口；否则按键会发到之前拥有焦点的地方。游戏失去焦点后，第一次点击只负责重新获得焦点。

| 操作 | 方法 |
|---|---|
| 直接控制 | 轻按 `E`（切换）。`W`/`S` 驾驶，`A`/`D` 转向，鼠标瞄准，左键开火，右键切换下一武器，`Space` 切换下一弹种 |
| 跳转镜头 | 右键点击小地图 |
| 暂停菜单 | `Esc`，然后选 Back、Options 或 Close |

（热键是典型自定义配置文件中的设置；默认设置略有不同，以玩家配置文件为准。见[第 15 章](../../15-interface-and-icons.md)。）

直接控制下的瞄准：把光标放在准星的白点上，等待橙色圆环形成。圆环形成前点击无效。实心红点表示正在装填。

其他要点：键盘没有绑定平移或缩放键；屏幕边缘滚动极快，应避免使用。截图有时会整张发灰，稍等片刻再截一次。在相信速度或路线测试之前先检查地面，因为画出来的河流可能只是一种水的*材质*，车辆可以直接驶过。直接控制下镜头似乎随车体转动，所以地标距离不可靠（未确认）。

## 4. LAN 试验台

启用 **Test mode** 设置的 LAN 对局是标准的单位测试。

1. 主菜单：**Multiplayer**，然后 **LAN**，然后 **New game**。在大厅里，菜单项用单击（双击可能落到相邻项上），但 “New game” 要双击。
2. 选择游戏类型 **Combat**。测试预设只被 Combat 和 Assault Zones 包含，Combat 最简单。
3. 选一张双人地图，把 Players 设为 2，创建游戏。
4. 在 “Game settings” 中选择 **Test mode** 并确认警告。这会给出 50000 MP、1000 指挥点、无单位上限、**零解锁时间**，以及开始前没有倒计时。
5. 单位受预设年份标签限制，所以其他时代的单位不会出现在购买面板中。
6. 除非某个模组启用了机器人，否则此大厅没有机器人（见[第 10 章](../../10-ai-and-bots.md)）。你独自游玩，自己放置敌人，或在编辑器中构建场景（见[第 12 章](../../12-missions-and-multiplayer-setup.md)）。
7. 双击 **Ready**，然后 **Start**。加载约需 22 秒。
8. 进入游戏后，右侧面板显示 “N / 1000 CP”、“50000 / 50000 MP” 以及类别按钮。购买后单位约五秒内生成。

购买面板的类别从上到下依次是：步兵班、专家、补给、支援武器、火炮、轻型车辆、两个坦克类别和英雄。如果某个类别打开的是空提示而不是列表，点另一个类别再回来。

**友军伤害是开启的。** 你自己的损失会计入敌方得分，所以除非作为目标，否则让测试单位远离落点区域。

### 截图与记录

居中到单位上（双击它的卡片）或通过小地图跳转，截图并与日志副本一起保存到每次测试的专属文件夹中。屏幕上伤害报告的照片是最好的记录。

### 在 Gates of Hell 中
<!-- goh: GHMIS-106 GHMIS-107 GHMIS-65 GHMIS-67 GHMIS-109 GHLOG-37 -->

Gates of Hell 是否有同样的 “Test mode” 预设尚未梳理。它有一些控制台设置，可以让测试大厅更快、可重复：

| 控制台名称 | 作用 |
|---|---|
| `mp_session_autoready` | 默认关闭；打开后，入座的玩家立即就绪，省去点击 Ready |
| `mp_rndSeed` | 默认为 0；其他任何值都让每场对局使用同一个随机种子，便于重复测试 |
| `dev_enableBotAi` | 默认打开；关闭后，下一场对局不运行机器人脚本，电脑玩家既不购买也不移动 |
| `mp_game_set_victory`、`mp_game_set_personal_score` | `[hostId value]` 给某个玩家增加胜利点数或个人得分 |
| `mp_game_list_players` | 列出玩家及其 host id |
| `mp_checkCombat` | 检查 “combat” 任务的出生点 |
| `g_component list` | 列出所选单位的资源 id 和部件名称 |
| `dbg_damage` | 默认关闭；打开后，载具部件受到伤害时，把部件的生命值打印到控制台 |

## 5. `game.log` 的结构

`game.log` 位于游戏用户文件夹的 `log` 文件夹中（第 2 节）。它**每次游戏启动时都会被覆盖**，所以重新启动之前请先复制。64 位版本会先把旧日志改名为 `game.prev.log`，正好保留上一次运行；原版 `mowas_2.exe` 则直接截断它，所以崩溃并重启之后，崩溃日志就没了。

阅读时首先要跳过配置文件同步的噪声：大约一百行以 `SyncFile` 或 `Result is` 开头的行。“读取 game.log”页面和 `logtriage`（第 9 节）会为你过滤它们。

日志按以下顺序：

1. 一个头部，含可执行文件、Steam 应用 id、工作目录和命令行。64 位版本还会为每个已挂载的模组加一行 `Mod 'name' from path`。
2. 第一轮本地化处理，伴有来自编辑器文本文件的无害键重定义警告。
3. 配置文件同步行。
4. `Build` 和 `Product` 行，然后是 `Repository: N resources`。**增删文件时 N 会变化**，所以这是快速检查“我的 pak 加载了吗”的办法。调试不同步时，可在玩家之间比较它。
5. 资源加载警告。游戏在此处解析全部软代码，所以语法错误、重复定义和缺失物品的警告都出现在这一部分。
6. `Phase ...` 行，例如 “Phase Loading...”、“Phase Mounting mod resources from Steam Workshop...” 和 “Opening main page”。它们在数据警告*之后*打印，所以某条警告相对于它们的位置并不能说明它来自原版还是你的模组。Mounting 阶段从不点出你的模组。
7. 菜单和大厅消息：“Mission '...' is skipped” 和 “Unread data detected”。大厅会两次构建地图列表，所以这些行会重复。
8. `Starting "multi/<map>:<gametype>"`：地图加载；随后是关于地图实体和编制预加载的警告。
9. `GameThreadStart`：对局正在进行。标有 `@ [quant]` 的消息是与模拟中发生的事情相关的运行时事件（一个 *quant* 是游戏时间的一个刻）；把时间戳与你的操作对应起来。
10. `GameThreadStop` 是正常结束。崩溃则会留下一个 `***** Exception *****` 块。

如何阅读一行：

- `[hh:mm:ss] message (/path/file.def, 188)` 是解析数据文件时产生的警告。路径和行号指向你的软代码，**你靠路径判断这条警告是不是你的**。
- `[..] message (程序文件名, 数字) @ [quant]` 由游戏程序在运行时产生。它不点出单位；要根据你在那一秒做了什么来推断是哪个单位。
- 这些程序行号属于写出它们的那个版本。把它们当作“游戏的哪个部分在说话”的提示，而不是要去查看的位置。

警告会被打印，游戏以备用值继续。**错误会打印 Exception 块，游戏随即结束**；无法跳过。

### 在 Gates of Hell 中
<!-- goh: GHLOG-06 GHLOG-07 GHLOG-08 GHLOG-09 GHLOG-11 GHLOG-12 GHLOG-13 GHLOG-15 GHLOG-16 GHLOG-20 GHLOG-21 GHLOG-34 -->

Gates of Hell 的 `game.log` 内容种类相同，但行的形式不同，所以为一款游戏做的搜索或脚本用在另一款上时要小心：

- **每一行**都以 `[hh:mm:ss] ` 开头，即游戏启动以来的时间。在 Assault Squad 2 中只有警告带时间戳。在 Gates of Hell 的控制台上，警告不带时间戳。
- 括号里的**程序位置**写作 `(name:number)`，名称为小写且不带扩展名，而不是 `(name, number)`。崩溃报告会写出错误的种类和游戏版本。
- **游戏事件**（击杀、旗帜、区域）以 `[EVT] <text>` 行写入 `game.log`，与控制台的消息设置无关。
- **启动行**会点出模组和 pak（第 2 节）以及启动过程：`Launcher: Loading phase ...`、`Start mission <map path> on difficulty ... with options [...]`。找不到的对话框会写出 `GUI: Failed to find dialog of type <x>`，无法生成的实体会写出 `Failed to spawn entity <name>`。
- **多人游戏行**包括 `Workshop item <id> installed successfuly `（原文就这样拼写）、`Steam is in OFFLINE mode. Some features are disabled`，以及游戏预设在没有随新游戏模式改变时被重置为 `<name>` 的一行。设置了 `logs_on` 和 `log_mp` 后，`mp` 调试日志会加上胜者、每个 `SPAWN <unit>` 和对局种子。
- 有些日志行中的**数字**打印为 `0x` 十六进制，而 Assault Squad 2 打印为十进制。
- **调试日志**（`logs_on 1` 加上每个日志各一个 `log_<name>` 变量）按整行写出，所以不同线程的行不再混在一起，但文件可能比游戏落后最多 5 秒。其中大多数，包括 `mp` 和 `mp_tcp`，会在每个新任务开始时重新开始，所以要在下一个任务开始之前复制它们。超过 `log_maxLogFileSize`（默认 250 MB；64 位版本用 512 MB）的日志会在 `<name>.<n>.log` 中继续。Gates of Hell 还多两个调试日志：`log_interaction` 和 `log_aiming`。

## 6. 致命错误与警告

### 致命（游戏结束）

| 消息 | 通常含义 |
|---|---|
| `define not found` | `("name" ...)` 调用没有可见的 `(define "name" ...)`。define 的作用域限于正在读取的顶层文件。添加 define、包含其文件，或重命名调用。 |
| `unexpected token` | 解析器期待别的内容。换模型后骨骼或体积名称消失、括号缺失或多余、该放字符串的地方放了数字，或关键字错误。与能正常工作的同级文件比较。 |
| `String expected`、`Number expected`、`Block terminator expected`、`')' required`、`End of SDL file expected` | SDL 格式错误。 |
| `Nested mods not supported` | 一个 `(mod ...)` 嵌在另一个 `(mod ...)` 里。 |
| `pattern not found` | `{from "pattern X"}` 的基础未定义。 |
| `Unknown material` | 材质不在材质列表中。 |
| `Bone modifiers must be placed after skeleton load` | `{bone "x"}` 块出现在骨架行之前。 |
| `Resource not found - <path>`、`File is not found - <path>` | `.def` 或 `.mdl` 中指名的网格、体积、动画或材质不存在。检查名称和大小写。 |
| `Invalid block in .VOL file`、`Unsupported animation version`、`Zero speed in ik-bone` | 模型数据损坏或格式错误。 |

Exception 块内的调试栈会给出数据文件和行号。交互脚本中超过 128 个不同的 `{set}` 标志名也会让游戏在加载时停止；请改用标签（[第 11 章](../../11-interaction-scripts.md)）。

### 按影响排序的重要警告

1. **`No Stuff found for tags 'X' (may lead to crash)`。** 没有任何武器或弹药物品带有这些标签，所以用一个占位物代替。加载没有问题；崩溃发生在物品被使用时。弹药标签的形式是 `<口径> <类型>`。这是唯一会变成崩溃的警告。
2. **`Can't preload`、`Unread data`**，或编制中缺少品种（breed）：某个阵营导入不完整。
3. **`invalid level param`**（未定义的能力等级；士兵会悄悄得到最高等级）、`Unknown props` 拼写错误、`Bone X not found`、`Can't find bone X`。
4. **`Invalid ricochet angle`**：被钳制，对游戏没有影响。改成 `out <= in`。
5. 单个单位的运行时警告：`bone 'X' has no broken view`、没有枢轴骨骼的轮式车辆、`unknown sound file`、`Undefined material`。

### 无害的背景噪声

这些在正常安装中都会出现；不要去追：数百行 `Localization key redefinition`、残留任务标题引起的 `Mission ... is skipped`、头盔、灌木、铁丝网、残骸和炮弹的 `Entity redefinition`、`Automatic MIP generation not supported` 和 `No MIP levels`、`No obstacle ID`、`unknown terrain_pp type - snow`、`'use_blend_tex' is not supported`、`Media file ... story not found`、与战壕相关的 `Unknown control panel item`，以及 `Unknown props "crater big"`。

**如何区分新旧：** 各次运行的计数不同，所以要保留一次干净运行的基线日志。出现新的消息*类型*，或 `No Stuff found`、`Unknown props`、`Unread data`、`Can't preload`、`invalid level param` 的计数变高，说明问题出在你最近的修改上。

另见：解析错误背后的语法见[第 5 章](../../05-sdl-language.md)，弹药标签见[第 9 章](../../09-weapons-ammo-damage.md)和[参考 6](../../r06-weapons-and-ammunition.md)，没有日志行的症状见[第 21 章](../../21-troubleshooting.md)。

### 在 Gates of Hell 中
<!-- goh: GHLOG-02 GHLOG-03 GHLOG-04 GHLOG-05 GHLOG-17 GHLOG-28 GHLOG-31 GHLOG-32 GHLOG-33 GHED-24 GHED-41 -->

有些消息是新的，有些消失了，还有两种故障从崩溃变成警告，或者反过来：

| Gates of Hell | 含义 |
|---|---|
| 弹匣中 id 为空的弹药 | 在 Gates of Hell 中是**致命**的；给每个弹药物品设置 id |
| `Can't find fxBone in weapon <x> held by <y>`、`No launch bone in <x>` | 缺少特效骨骼或发射骨骼在 Gates of Hell 中只是警告；在 Assault Squad 2 中同样的故障会崩溃 |
| 实体携带的武器没有射手骨骼的警告 | 新增：点出没有准星骨骼的武器，Assault Squad 2 会悄悄接受它 |
| `Unable to board <x> into <y>` | 新增：某个单位无法登乘（没有座位，或没有可以拥有它的载具） |
| `Invalid placement matrix for entity <x>` | 新增：脚本把实体放到了无效的位置 |
| `[EFX] Wrong signature` | 新增：特效文件形式不符合预期；它仍会被读取 |
| `Can't apply preset <name>` | 新增：编辑器无法应用的环境预设 |
| `Warning: Invalid land materials found. Fix them in textool` | 新增，在编辑器中：旧地面被赋予新材质，并要求保存 |
| `double Create() call detected`、`Multiple notify mappings`、`Unknown bitmap` | 新增的界面警告，指向布局错误 |
| `Unknown props` | **消失**：拼错的 props 名称在 Gates of Hell 中不出声，所以那里的拼写错误不再出现在日志中 |
| `unit ... can't look for covers` | 消失：要求寻找掩体的载具被拒绝，但没有警告 |
| 交互条件中错误的组件 id | 写作 `unexpected token`，而不是 “invalid parameter” |

## 7. 崩溃转储

### 小型转储（Minidump）

崩溃会在 `log/minidumps/` 中写入两个文件：一个 Windows 小型转储（约 45 MB，不含堆）和一个同名、以 `.mdmp.log` 结尾的附属文件，里面有崩溃时刻的游戏日志加上 Exception 块。**先读附属文件。** 你很少需要调试器。在“读取 game.log”页面上，“读取所有游戏窗口”列出每个游戏副本的崩溃报告，“解读此崩溃”解释其中一个。

该块显示异常类型、出错的程序函数名和调用栈。这样读：

- 异常中的极小地址（如 0x28 或 0x54）是空指针：代码引用的东西不存在。
- 函数名中的词指明区域：cannon 意味着牵引炮的武器或弹药；actor 加 sensor 意味着某士兵的品种或视觉数据不完整；chassis 意味着车轮或履带；ammo 加 reload 意味着在缺失弹药上装填；armor 意味着伤害；SDL 读取器意味着解析错误。
- 看紧挨着该块上方的几行。崩溃前的最后几条警告（`No Stuff found`、`Bone ... not found`、`Undefined material`、`unknown sound file`）就是嫌疑对象。
- 典型情况：士兵传感器崩溃意味着该班的某个品种不完整（逐个购买班组来找出它）；火炮装填崩溃意味着某门牵引炮或榴弹炮缺少弹药物品。

转储里没有数据文件名，所以扫描其中的字符串几乎找不到有用的东西。转储大小由一个控制台变量控制（0 无、1 小、2 完整）。64 位版本默认写小型转储；原版的默认值未确认，所以那里的崩溃可能产生非常大的文件。

如果游戏消失了，既没有 Exception 块也没有转储，请怀疑栈溢出：游戏已经没有空间写出报告。撤销你最后的修改并二分（第 8 节）。

### 失去同步（OOS）转储

多人游戏是**锁步（lockstep）**的：每台机器模拟同一局游戏，每隔一定时间，每个客户端发送场景（单位、位置、随机数）和规则（得分、预算）的校验和。如果主机发现差异，客户端会显示对话框并在 `log/oos/` 中写入转储，放在以本地日期时间命名的文件夹里，每个玩家一个文件。只有主机、不同步的客户端或被标记的主控会写入，所以你可能会找到两三个文件。

很小的文件（几百字节）只含校验和。大的文件含有完整快照，可以当文本比较：从同一文件夹取主机的文件和一个客户端的文件；如果规则校验和一致而场景校验和不同，则是场景发生了分歧；快照中第一处不同的行会指出实体或字段。随机抽取次数不同表示抽取不同；实体数量不同表示某个生成只发生在一侧。

原因，按可能性从高到低：

1. **玩家之间模组或 pak 内容不同。** 一切必须完全相同，包括加载顺序。比较每位玩家日志中的 `Repository: N resources`。
2. 游戏版本不同，或混用了 32 位和 64 位版本。
3. 交互脚本读取了某台机器特有的东西（配置文件、按键、选项、图形设置）。
4. 以大厅不检查的方式编辑了模型或文件。大厅对部分二进制文件只比较大小，对某些类型完全不比较，所以大小相同的修改能通过大厅，却在游戏中造成不同步。运行 `ARSENAL mpsync`（[第 20 章](../../20-packaging-and-release.md)）。
5. 一台机器上的崩溃常常在其他机器上表现为不同步。

没有实时重新同步：不同步的客户端会被移除。

### 在 Gates of Hell 中
<!-- goh: GHLOG-10 GHLOG-14 GHLOG-22 GHLOG-36 GHLOG-40 GHLOG-41 -->

- **哪些错误会留下转储。** 普通错误、数据文件（SDL）错误和失去同步错误会写出小型转储和崩溃报告，与 Assault Squad 2 相同。内存不足和签名检查失败会显示一个 `Error` 框，并以退出码 2 结束游戏，不留转储。DirectX 错误会立即结束游戏，既没有框也没有转储：Gates of Hell 游戏不留痕迹地消失时，先怀疑图形方面。
- **保留多少个转储。** `dbg_minidumpFileLimit`（默认 5）是 `log/minidumps/` 中保留的小型转储数量；0 表示一个都不删。
- **发送出去的报告。** 崩溃、失去同步和反馈报告会上传到 BugSplat 服务。在游戏工作文件夹中放一个 `BugSplat.ini`，在 `[BugSplat]` 下写 `Enabled=0`，即可停止上传；游戏没有附带这个文件。只要有任何模组处于应用状态或正在切换，就不会发送报告，而本地小型转储照样写出。上传之前，`log/game.log` 和专用服务器日志的副本会替换 Steam id、Steam 名称和 Windows 账户名，但只替换长于 4 个字符的名字；你本地的 `game.log` 不会改变。
- **失去同步转储**精确到位进行比较：每个数字后面跟着它的十六进制字节，二进制记录按字节打印。玩家发送的报告大概以一个固定的头部开始（单人或多人、地图、预设、种子、模组名称、游玩时间、玩家）；这一点未确认。

## 8. 分诊清单与二分法

1. 是否发生了崩溃？在 `game.log` 中找 `***** Exception *****`，或在 `minidumps/` 中找新文件。如果没有，问题在游戏性方面；查看与你的单位相关的警告。
2. 读附属文件：异常类型、函数、调用路径。
3. 读异常上方的 10 到 30 行。带有方括号文件路径的那行就是元凶；在那一行打开该文件。
4. 对于加载时的 `define not found` 或 `unexpected token`，从调试栈取文件和行号。对 define，在数据中搜索 `(define "<name>"`，并检查顶层 include 链（IDE 选项卡中编辑器的“在文件中查找”也能搜索游戏自己的文件）。对 token，与能工作的同级文件比较，并对照模型检查骨骼名称。
5. 检查模组状态：`options.set` 中只列出想要的模组；pak 比你的编辑新；pak 在你最后一次修改后重新打包过；`Repository: N resources` 与预期一致。在“读取 game.log”页面上，“为什么没有？”会检查模组的 `mod.info`、版本行、文件夹名以及它是否已启用（勾选“同时按游戏自身加载规则检查（较慢，约一分钟）”可同时按游戏自己的规则检查），“检查此单位”会从一个单位的文件出发，沿着它的模型、材质、购买卡、阵营和图片追踪下去，并点出第一个断开的环节（勾选“同时扫描失效引用（较慢）”可做更深的扫描）。
6. 与你的已知警告基线比较。
7. **二分。** 回退你的最后一次编辑（文本用版本控制，pak 用你的备份），重新启动并在 LAN 试验台中测试一个单位。或者从备份恢复所有 pak，再逐个重新应用。
8. 对于多人不同步，先确认所有机器上的 pak 和版本相同，再对比快照。
9. 记录结果。在结论形成文档之前不要删除日志，并在每次重新启动前复制 `game.log`。

值得记住的过去崩溃原因：被调用但从未定义的预设、不存在的武器名、模型中被重命名的骨骼，以及没有材质的网格。

## 9. 让 ARSENAL 读取日志

这里有三个页面和三条命令可以节省时间。命令以 `ARSENAL <tool>` 运行（见[第 19 章：工具链](../../19-toolchain.md)）。

**“读取 game.log”页面**（在“模组 > 检查与修复”中）不启动游戏，读取最新的 `game.log`，不修改也不删除任何东西。“解读最近的日志”把日志变成用简单话语写的卡片，每张标为“中断”“崩溃”“检查”“提示”或“正常”，并各带“怎么办”；“显示游戏原文”显示原始行。“游戏留下的日志文件”按从新到旧列出每个游戏副本（“主游戏窗口”“额外游戏窗口 N”）的 `game.log` 和 `game.prev.log`，以及它的崩溃报告和失去同步文件夹：“读取所有游戏窗口”读取全部，“解读此崩溃”解释一份崩溃报告，“重新查找”重新载入列表，“选择其他日志文件夹...”读取你另外复制出来的文件夹。“请在游戏里试一试”是游玩后要测试的勾选清单，来自模组升级时写下的备注加上基本项；你的勾选保存在这个浏览器里，“清除勾选”重新开始。该页面的其他框见第 2 节和第 8 节。

**IDE 选项卡中的编辑器**有一个“游戏日志”面板：游玩之后，按“读取最新日志”（Ctrl+L）或面板中的“读取最新日志”。点击一条发现会在对应行打开你的文件，“下一个日志错误”转到下一条（[第 19 章，编辑器](../../19-toolchain.md#game-log)）。

**快速引导任务**有查看任务“上次运行出了什么问题”：它读取上次运行，用简单的话列出错误以及每条错误指向的文件和行，并说明各自该怎么办。它不写入任何内容，最后一步提供修改任务“有问题的模组（修复它）”。见[快速引导任务](../../19-toolchain.md#quick-guided-task)。

**在手机或平板上**，打开 LAN Remote 后，你可以在游戏于电脑上运行时，用另一台设备阅读这些结果；它只能查看（[LAN Remote 与手机视图](../../19-toolchain.md#lan-remote-and-the-phone-view)）。

**`ARSENAL logtriage`** 是这些页面背后的命令。它读取日志文件夹（或单个 `game.log`），合并重复项，把消息分成发现项和已知噪声，并为每一项指出可能的原因。给它一个文件夹时，它还会读取 `game.prev.log`、小型转储附属文件和失去同步文件夹：

```
ARSENAL logtriage <log folder> --summary
ARSENAL logtriage <log folder or game.log> --mod <mod folder> --game <game folder>
```

`--mod` 标出日志中哪些数据路径由你的模组提供，让你一眼区分自己的警告和原版的警告。

**“游玩”页面和 `ARSENAL play`** 做一次完整的启动测试：检查模组，把它安装到游戏的 `mods` 文件夹，在实例 1 中启用该模组并用测试地图启动游戏，然后读取 `game.log` 得出加载结论（BOOT）。在窗口中，先打开“允许 ARSENAL 启动游戏”；“play: dry run”显示每一步，不做任何修改。

```
ARSENAL play <mod folder> --dry
ARSENAL play <mod folder>
```

干净的 BOOT 表示游戏加载你的模组时没有出错。它并不表示模组按你的意图工作，所以仍然要去玩。

**`ARSENAL testrun`** 通过 64 位版本的控制管道驱动整个测试：把旧日志复制到一旁（绝不删除），无声启动游戏，启用你的模组，打开 LAN 大厅，主持一张地图，开始，等待地图加载，退出，然后运行 `logtriage` 并打印一份摘要。`--dry` 打印各个步骤，不启动任何东西：

```
ARSENAL testrun --map multi/<map>:combat --exe <game folder>/as64.exe --dry
```

地图 id 形如 `multi/<map>:<mode>`，例如 `multi/1v1_road:combat`；只写地图名时使用 `combat` 模式。零售版 `mowas_2.exe` 没有管道，所以 `testrun` 只适用于 64 位版本。

脚本化测试可以在无人看管的情况下通过或失败。要小心你测试的内容：一个只说“没有出现错误”的检查证明得很少，因为损坏的模组可能同样安静。优先使用正面信号，例如只有在你的修改生效时才会出现的日志行。

等待对局结束时，游戏时长很重要：在大约 60 秒游戏时间时没有单位的一方判负，对局结束。某一方什么都没生成的测试几乎立刻结束。`mod.info` 损坏的模组文件夹会让每次启动都失败，所以先检查它（`ARSENAL modinfo <mod folder>`）。

### 在 Gates of Hell 中
<!-- goh: none; ARSENAL behaviour under the GoH header button (groups.js, x-log recipe, logtriage) -->

在 GoH 按钮下，“读取 game.log”页面读取 Gates of Hell 用户文件夹中的 `game.log`（`logtriage --exe goh`），快速引导任务“上次运行出了什么问题”也一样。“游玩”和“测试运行”页面也在，但 `play` 和测试运行只启动 Assault Squad 2：GoH 编辑器不会自行启动任务，Gates of Hell 也没有控制管道。请自己启动 Gates of Hell，并按第 5 节所说的行形式去读它的 `game.log`。`logtriage` 能读 Gates of Hell 的日志形式，但很多 Gates of Hell 日志行仍会显示为未知类型，所以读它的卡片时要小心。

## Gates of Hell：小结

本书中关于 Gates of Hell 的说明都没有在运行中的游戏里测试过。依赖它们之前，请在你自己的游戏中检查。

| 节 | Gates of Hell | 简述 |
|---|---|---|
| 1. 每次修改的测试循环 | 就已梳理的部分而言相同 | 同样的循环；ARSENAL 能检查 Gates of Hell 模组，但不能启动游戏 |
| 2. 启动并启用模组 | [不同](../../18-testing-and-logs.md#in-gates-of-hell) | 自己的用户文件夹；日志点出模组和 pak；额外的控制台辅助命令 |
| 3. 测试用操作速查 | 未梳理 | |
| 4. LAN 试验台 | [不同](../../18-testing-and-logs.md#in-gates-of-hell-1) | 用控制台设置做快速、可重复的测试大厅和没有机器人的对局 |
| 5. `game.log` 的结构 | [不同](../../18-testing-and-logs.md#in-gates-of-hell-2) | 每行都有时间戳；`[EVT]` 事件行；位置写法不同；调试日志每个任务重新开始 |
| 6. 致命错误与警告 | [不同](../../18-testing-and-logs.md#in-gates-of-hell-3) | 弹药 id 为空是致命的；缺少特效骨骼只是警告；`Unknown props` 消失了 |
| 7. 崩溃转储 | [不同](../../18-testing-and-logs.md#in-gates-of-hell-4) | DirectX 或内存错误不留转储；转储数量上限；报告上传到 BugSplat |
| 8. 分诊清单与二分法 | 就已梳理的部分而言相同 | 同样的方法 |
| 9. 让 ARSENAL 读取日志 | [不同](../../18-testing-and-logs.md#in-gates-of-hell-5) | “读取 game.log”读取 GoH 日志；“游玩”和“测试运行”不启动 GoH 游戏 |

### 基准测试运行
<!-- goh: GHMIS-13 GHMIS-30 GHLOG-26 GHLOG-39 -->

Gates of Hell 有一个 Assault Squad 2 所没有的基准测试。`dbg_benchmark start|stop [profile "<name>"] [camera "<name>"] [start_camera]` 从控制台运行它；配置在 `/set/benchmark.set` 中，每次运行都把结果写入 `benchmark/` 下一个以日期时间命名的新文件夹。它测量 FPS、以毫秒计的 quant 时间、渲染时间和以 MB 计的内存负载（显存数值始终为 0）。任务可以用 `benchmark` 命令启动一次基准测试；配置名错误时会回答 `Invalid or unknown benchmark profile selected. Request rejected.`

## 陷阱

- 相信主菜单页脚能证明模组已启用。请读 `options.set`，或使用“读取 game.log”页面上的“显示已启用的内容”。
- 忘记 `game.log` 在下次启动时会被替换，而且只有 64 位版本会保留上一次运行。
- 遗留的散装文件覆盖了你刚重建的 pak。
- 在 `.set` 或 `.lng` 文件中把字符串值存成 cp1251（屏幕上显示为方块），或让编辑器改写了复制来的原版文件注释中的旧 cp1251 字节。
- 把无害噪声当成你的 bug，又把 `No Stuff found` 当成噪声。
- 在实际上是地面的“河”上测试车辆。
- 忘记测试设置中友军伤害是开启的。
- 把 `LOADS_STATIC` 或干净的 BOOT 当作修改生效的证据。

## 引擎参考

警告和错误由引擎的异常处理器写出；崩溃转储写入器和多人同步检查器是独立的模块。

**下一章：** [第 19 章：工具链](../../19-toolchain.md)
