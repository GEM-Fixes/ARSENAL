[machine] 本文由英文原文 `tools/QUICKSTART.md` 机器翻译而来，未经人工校对；如有出入，以原文为准。

# QUICKSTART：已经运行过的命令
**加入 AS64 社区！** https://discord.gg/pgmfaaBVbf
在 `src/` 下运行。`ARSENAL <tool>` = `node tools/as2/as2.js <tool>`（或 `node tools/<tool>/<tool>.js`）。`G` = 你的 Men of War: Assault Squad 2 文件夹（AS64 版本），`OUT` = 一个新的空文件夹。
标记：[V] 在此运行过或在所指报告中看到过，[I] 推断，[T] 需要游戏内测试。A 部分不需要游戏。B 部分以一次游戏运行结束。这里没有列出任何没人运行过的内容。最后一节说明了哪些内容没有涉及。
`ARSENAL status` 打印 中的里程碑（需要；exe 里没有，会如实提示）。

## A. 不需要游戏
### A1. 检查模组，无论它放在哪里
```
ARSENAL check <模组文件夹> --fast -q
```
- [V，2026-11-07 在 `G/mods` 之外和之内各运行一个模组] 可在任意文件夹运行。对于 `G/mods` 之外的模组，会建立游戏文件夹的覆盖层并把你的模组链接进去；游戏和你的模组只被读取。
- 按严重程度打印发现项，并为每个游戏版本给出一个结论。`LOADS_STATIC` = “未发现已知崩溃模式，版本被接受”。它绝不表示“能正常运行” [V，输出中已打印]。
- `--fast` 跳过 7 项较慢的检查（输出中会列出），小型模组约 15 秒，含 115 个 pak 的模组约 70 秒。要做完整检查就去掉 `--fast`；大型模组需要数分钟 [I，依据输出中被跳过检查的耗时]。
- 同一个模组对旧版游戏（`mod.info` 中需要同时有 Min 和 Max）和 Gates of Hell 会得到 `REFUSED`。对 AS64 模组来说这是正确的。
- 加上 `--with <补丁文件夹>`，可把模组与由 `ARSENAL fix` 或 `ARSENAL upgrade` 生成的补丁文件夹一起检查 [I：来自用法文本，未运行]。

### A2. 用规格文件生成小型模组
```
ARSENAL gen my-spec.yaml --target as64 --plan --out OUT
ARSENAL gen my-spec.yaml --target as64 --out OUT
```
- `my-spec.yaml`（运行的正是这个文件）：
```
name: demo
title: Demo
ops:
  - op: mod
    title: Demo
  - op: text
    key: desc/entity/demo
    text: Demo text
```
- [V] `--plan` 不写入任何内容，只打印它将要做的事（205 毫秒）。第二行把模组直接写进了 `OUT`（`mod.info`、`localization/#demo.lng`、各文件夹），并在旁边写了一个说明文件 `OUT.gen/TESTNOTES.md`。结果：“2/2 ops”，构建关卡 0 个错误，结论 `partial, untested`，约 23 秒。
- `gen` 只做静态检查。“untested” 是它自己的用词：你仍然要在游戏中测试（B 部分）。
- 其他操作（clone、set、armor、roster、card、breed、squad、map-clone、mission-clone、place）见 `tools/gen/samples/sample.yaml`。该示例使用测试夹具名称，所以在真实游戏文件夹上会给出 8 项发现并以退出码 1 结束 [V，以计划方式运行]。使用前请换成真实名称。
- 如果某个操作引用了游戏中不存在的单位（`clone`、`set`、`armor`、`roster`、`card`、`place`），会作为发现项报告而不会写入 [V，示例计划的输出]。

### A3. 地图（计划形式）
```
ARSENAL map-clone --game G --map map/multi/<group>/<map> --name <new> --out OUT --plan
ARSENAL mapview --game G --map multi/<group>/<map> --width 60
ARSENAL mission-clone --game G --map map/multi/<group>/<map> --from <mode> --to <mode> --out OUT --list
```
- [V，在一张原版多人地图上运行] `map-clone --plan` 列出它将复制的 20 个文件及字节大小（`map.net` 原样复制）、它为大厅添加的名称文件，以及一个 `mod.info`。不写入任何内容。不存在的地图名会给出 `MAPCLONE_NO_MAP`。
- `mapview` 用字符打印地形（此处宽度 60） [V]。`--entities` 和 `--layer` 列在 `tools/INDEX.md` 中；上面的运行没有用到。
- `mission-clone --list` 打印该地图拥有的模式 [V]。写入形式（不带 `--list` 的 `--from X --to Y`）没有运行 [T]。
- 克隆的地图是否出现在大厅并能加载，尚未证明。唯一有游戏运行的地图结果在（重建的地图），不是克隆工具 [I]。

### A4. 图形界面 `ARSENAL-gui`
```
node tools/dist/sea.js --out <dir> --name ARSENAL-gui
ARSENAL-gui.exe
```
- [V，；此处重新构建并重新测试] 第一行生成 `ARSENAL-gui.exe`（103 MB，内含 308 个文件，约 1 秒）。运行它的机器不需要 Node。
- 不带参数启动：它在本机提供一个页面并打开默认浏览器。`ARSENAL-gui.exe gui --no-open --port N` 不打开浏览器。
- 此处的测试运行：`node tools/gui/test/test-exe.js <exe> <干净文件夹> <端口>` = 通过 10 项，失败 0 项。exe 在 PATH 中没有 Node 的情况下启动，自己找到了游戏，提供了页面（43967 字节），列出 13 条命令，并把 `gen` 作为 exe 的子进程运行。
- `node tools/gui/test/test-gui2.js` = 通过 120 项，失败 0 项 [V，在此运行]。
- 未展示：页面中的任何点击、浏览器中渲染的页面、除 `gen` 以外作为 exe 子进程的任何工具。exe 拒绝 install、uninstall、probe、e2e 和 dev-loop [I：来自 gui-3 报告]。exe 未签名，Windows 可能会警告 [I]。
- 我直接尝试了 `ARSENAL-gui.exe check ...` 和 `ARSENAL-gui.exe status`：shell 要求批准，我没有继续。所以这两条在 exe 中没有运行 [T]。（exe 中的 `status` 在 里打印了预期的 “no” 提示 [V]。）

## B. 以游戏运行结束
### B1. 把创意工坊模组（AS2）移植到 AS64
```
ARSENAL upgrade "<AS2 创意工坊模组文件夹>" --to as64 --mode enhanced --out "G/mods/<mod>_as64"
```
- 结果 [V， s8]：含 115 个 pak 的模组，43 秒内退出码 0。mod.info 变为 Min 3.301，没有 Max，没有 FileId。pak 使用硬链接（没有复制 5.4 GB），写入 8.5 KB。源文件夹和 `G/mods` 必须在同一个 NTFS 盘上，否则会复制 5.2 GB。永远不要编辑结果里的文件：那就是创意工坊的文件。
- 用 `--plan` 代替 `--out` 只做预览。我在这里对大型模组启动了它，运行超过两分钟，所以没有等待；它的输出没看到 [T]。
- 游戏内 [V，]：启用 `as64+` 和升级后的模组，20 个单位全部出现。115 个 pak 中有 5 个的哈希在 4 次启动后匹配；其余 110 个没有检查。
- 未展示：对照组较弱，所以击杀数只是参考。

### B2. 按兵种组测试单位（编辑器版本）
```
node tools/edrun/edrun.js --game G --root <编辑器版本文件夹> --exe as64_ed.exe --mods as64+,<mod> --pairs pairs.json --secs 120 --out OUT
```
- `edrun` 是 `tools/edrun/` 中的公开工具。`pairs.json` = 最多 8 行 {shooter, crew, foe, foeCrew, dist, mark...}；其中一行必须是对照（`control:true`）。字段列表在 `tools/edrun/edrun.js` 的开头。对照组没命中的对局无效。
- [V，、m4-rr2.md] 每对给出出现、命令、击杀时间、射击和命中；一局约 2.5 到 5.5 分钟。通过 = 目标到达标记点，并不证明装甲一致 [I]。需要 `as64_ed.exe`，这是单独的编辑器版本。向用户提问：公开下载的读者能拿到它吗？如果不能，B2 和 B3 只面向维护者。
- `--inst N`（1 到 7，绝不用 0）在第一局旁边再运行一局。
- 此处未运行（本次会话没有游戏）。

### B3. 把 Gates of Hell 单位移植到 AS64（在你自己的机器上转换）
Gates of Hell 的文件没有发布，也不能发布：输出中含有它的模型和贴图，所以请保存在本地。你需要自己的 Gates of Hell 安装和该模组。
```
ARSENAL goh2as2 --goh "<GoH 模组文件夹>" --entity <unit> --donor <as64 原版单位名> --rep-key --pull-props --mtl-fallback --match-weapon --game G --out OUT
ARSENAL donorfit OUT/resource/entity/<...>/<unit>.def --game G --fit --write --in-place --moddir OUT
ARSENAL install OUT --name <modname> --game G
```
然后在 `as64+` 之后启用该模组，并用 `--mods as64+,<modname>` 运行 B2。
- [V，、rebuild-3.md] 30 个单位无需手工修改即构建完成。游戏中，用这种方式做的 10 辆坦克：向外射击 7 个通过、3 个失败（一个没有击杀，一个始终无法操作，一个 def 使游戏崩溃）。向内受伤测试只对 10 个中的 2 个运行（1 通过，1 失败）；崩溃之后 8 个没有运行。
- [V，在此运行] 用不存在的单位名运行 `goh2as2 ... --dry-run`，以 `PORT_NOT_FOUND` 和 “would write 0 files” 结束。这是本次会话中 goh2as2 唯一的运行；整条流程来自报告。
- 未展示：坦克以外的兵种；`--base`（两个单位上构建干净，没有游戏运行） [I]；需要模型所缺少的门或乘员宏的单位。
- 引擎无法解析的 def 会在加载时让整个游戏崩溃（见过一次，骨骼块中的 `{limits}`）。在信任一批结果之前，先读第一局游戏的日志。

## 未证明（请勿依赖）
- `fix`、`lng`、`botrecipe`、`release-check`：这里没有列出运行记录。检查类工具中，`check` 和 `gen` 有静态运行（A 部分），没有任何报告展示它们在游戏中的输出。
- `prove`、`testrun`（这里只打印了它的 `--dry` 计划）、`e2e`、多人、购买卡、机器人、同步。
- 外观和声音（还欠一次目视检查）、存档、创意工坊与原版副本并存时的挂载，以及通过正常菜单使用升级后的模组。
- 装甲：被摧毁的车体是击杀标记；移植单位的装甲是否与原版一致尚未证明。
