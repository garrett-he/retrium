# Retrium Cart 格式 v2 修改方案

> 本文是把现有 cart 格式（zip + `.retrium/metadata.json`、id = 归档文件 SHA-1）替换为 v2 的修改方案。
> 目标：让 cart 成为自描述、与打包方式无关、有稳定身份的包；让 library 的运行时数据与原始数据彻底分离。
> 状态：已实现，随 1.0.0 发布（落地情况见 §6.1）。文末列出已确认决策与本轮范围外事项。

## 0. 总体决策（讨论结论）

1. **完全放弃向后兼容**：根级 `version = 1`；不再读取 `.retrium/metadata.json`、`info.json`，也不再从文件夹名兜底。旧 cart 直接拒绝导入（`Not a Retrium cart` / `Unsupported cart version: N`）。旧 library（`carts/<sha1>/`）同样不迁移、不识别、不提供转换工具——连"备份后清空"的提示都不做，library 根下不符合新布局的东西一律视为无关文件。**这条规则适用于所有持久化数据，不只是 cart 和 library**：`config.json` 也不做旧结构迁移（结构对不上就用默认值重建），SQLite schema 变了就删库重建（§4）。任何地方都不要为兼容写分支代码——迁移代码是只在启动时跑一次、之后永远没人验证的代码，成本却是永久的。
2. **1.0.0 已发布，"免兼容"窗口关闭**：下面这些从 1.0.0 起算**对外契约**，改动必须先升版本、并给出用户侧的处置办法（迁移，或明确告知旧数据不可用）——`manifest.json` 的 `version: 1` cart 格式（真要改就是 `version: 2`，且不能再"旧包一律拒绝"，得能读 v1）、library 布局（`carts/<id>.cart`、`installed/<id>/`）、`config.json` 的 `{ library, dosbox: { path } }` 形状（可选键 `dosbox.scale` 是 1.0.0 之后的**加法扩展**：旧配置缺键按 1 处理、旧应用忽略新键，双向兼容）。**仍然是内部实现、照旧可以直接改**：SQLite schema（可丢弃索引，删库重建）、Tauri 命令名与参数、前端路由与本地 UI 状态——用户在磁盘上看不到它们，也就不欠兼容。**别把两个 `version` 搞混**：manifest 里的 `version: 1` 是 cart 的格式版本（它变了意味着一份 cart 读不了）；1.0.0 是应用版本。
3. **cart 是 ZIP**，内容直接放在 ZIP 根，借鉴 macOS `.app` 的"固定顶层布局 + 单一清单"，但不照搬 Framework/签名那套。不设 `Contents/` 包裹层——ZIP 本身已经是边界。
4. **身份是声明，内容哈希是事实**：`cart.id` 是首次创建时生成、此后永不改变的 UUID；`cart.revision` 是由作者决定的整数版本；两者的真实性由作者背书。整包完整性由根级 `hash` 文件承担，只描述字节。**不做内容寻址**——内容变了 id 不变，这是刻意选择（见 §2.1.1）。
5. **不做"同一程序的另一套配置"这类分组**：配置本来就是升级的一部分，改配置 = 同一 cart 的下一个 revision；真要两份并存就是两个 cart。
6. **cart 内只带 `launch.json`，不带 `dosbox.conf`**：`launch.json` 是启动配置的唯一来源；每次启动时 Retrium 只写出**与 DOSBox 内置默认值的差异**（必写的基础覆盖 + profile + `[autoexec]`）到 `installed/<id>/Runtime/dosbox.conf`，配合 `-noconfig -conf` 由 DOSBox 编译期内置默认值兜底。它是可丢弃的生成物，不写回 cart、不进导出。
7. **library 侧**：`carts/<id>.cart` 存不可变原始归档；`installed/<id>/` 存安装后的可运行副本；元数据与 summaries 进 SQLite。运行层目录命名为 `installed/`，cart 内部用 `Runtime/`，避免同名层级冲突。
8. **保留 State（存档差异层）**，因为将来可能需要单独导出/导入存档。它只存相对 cart 被改动或新增的文件，不是全量镜像。
9. **导出 = 重建 manifest**：内容来源是 `installed/<id>/Program/**`（按 §5.3 排除 `Runtime/State/` 的存档），从数据库取元数据与作者，重建 manifest，重算 `hash` 写入根级 `hash` 文件，再打包覆盖归档。导出前若内容已变而 `revision` 未增，UI 必须提示（见 §2.4）。
10. **SQLite 中 `program.*` 按列存储**：可筛选/排序的标量字段各占一列；`dos`、`externalIds`、`tool` 这类嵌套结构保留 JSON 文本列。
11. **不设"推荐配置"基线**：DOSBox 配置的基线就是本机那份 DOSBox 的编译期内置默认值，不是 Retrium 定义的一套推荐值。conf 里只有三类内容——必写的基础覆盖（`mapperfile`/`captures`）、选中 profile 的键、`[autoexec]`。画面与性能的差异一律由作者写进 profile，Retrium 不预置、也不替用户决定要不要缩放（§1.4）。
12. **启动不解压**：`installed/<id>/Program/` 是唯一工作副本，解压只发生在导入、重置、修复三种情况；存档增删用"启动写基线 + 退出比对"表达（见 §5.2），不靠常驻 watcher 猜。
13. **DOSBox 不随应用分发，且只支持一个**：不捆绑、不首次运行下载；设置里只有一个路径字段（`config.json` 的 `dosbox.path`），不做全盘搜索，也不读取用户已有的 `dosbox.conf`（`-noconfig` 保证隔离）。**不再支持登记多份 DOSBox**——多版本带来的"这个 cart 用哪个"问题、UI 上的版本选择器、以及跨版本行为差异，都不值得。代价是版本不可控：Retrium 只对 0.74-3 保证行为，其余实现 best-effort（见 §1.4.1）。
14. **`installed/<id>/Config/launch.json` 可以直接编辑**：`id` 与内容解耦后，改它不换身份、不改目录名，只让 `hash` 变化，导出时体现为下一个 revision。
15. **manifest 顶层只有 `cart` 与 `program`，`version` 拍平到根级**：不设 `format` 包裹层。`version` 是 manifest 结构版本，`cart.revision` 是 cart 版本，两个名字本身就不撞，不必靠层级区分。"谁、用什么、何时造的"属于这个 cart，放进 `cart`。

## 1. Cart 文件格式

### 1.1 归档布局

```
<uuid>.cart                     # ZIP 格式
├── hash                        # 必需：整包哈希，单行 64 位小写 hex，不含自身
├── manifest.json               # 必需：version + cart + program
├── Program/                    # 必需：程序文件，DOSBox 挂载为 C:
│   ├── GAME.EXE
│   └── ...
├── Config/
│   └── launch.json             # 必需：启动配置唯一真相源
└── Resources/
    └── cover.png               # 可选封面
```

硬规则：

- ZIP 根必须直接有 `manifest.json`；不接受任何 wrapper 文件夹（根上没有 manifest 即拒绝）。
- 根级 entry 白名单：`hash`、`manifest.json`、`Program/`、`Config/`、`Resources/`。散落在根的其他文件/目录一律拒绝。
- 重名 entry、symlink entry 一律拒绝导入。
- **格式识别只看根级 `version` 这一个字段**：缺失或非整数 → `Not a Retrium cart`；是整数但不等于 1 → `Unsupported cart version: N`。没有 `name` 字段——固定字符串 `"retrium-cart"` 是重复信息，还容易和 cart 标题混淆。`version` 合法但缺 `cart` / `program` 的，按 `Not a Retrium cart` 处理（结构损坏，不是版本问题）。
- `hash` 必须存在，内容为单行 64 位小写 hex（允许结尾换行），且与重算值一致，否则拒绝。
- `Config/launch.json` 必须存在且可解析，否则拒绝——没有它就无法生成启动配置。

### 1.1.1 为什么 `hash` 是独立文件

如果把整包哈希写进 manifest，只能让 manifest 自己被排除在哈希之外——否则写回哈希就无限递归。结果是**改 manifest（改作者、改标题）不改变哈希**，完整性校验覆盖不到包内唯一一个声明文件。

所以哈希放根级 `hash` 文件：

```
hash = tree_hash({ 除 hash 外的全部 entry })   # 包含 manifest.json
```

- `hash` 是唯一的排除项，自引用问题消失，manifest 在校验范围内；
- 它**不参与身份**：`cart.id` 与 `cart.revision` 都来自作者，所以改 manifest 只改 `hash`，不改"这是哪个 cart 的第几版"；
- 它**不是签名**——任何人都能改完文件后重算 `hash` 再打包。作用是发现传输损坏、解压错误、工具无意改动，不是防伪造。要防伪造得引入签名，本版不做；
- 内容为单行 64 位小写 hex，**不带前缀**。算法世代由根级 `version` 承担，只有一个哈希时前缀不再起消歧作用；
- 生成顺序必须是：写 `Program/`、`Config/`、`Resources/`、`manifest.json` → 计算 → 写 `hash` → 打包；导入顺序相反：先读 `hash`、重算比对，再信任 manifest 的声明。

### 1.2 manifest.json

```json
{
    "version": 1,
    "cart": {
        "id": "019ae4c1-2f3b-7c4d-8e9f-0a1b2c3d4e5f",
        "revision": 3,
        "author": { "name": "Garrett He", "email": "garrett@example.com" },
        "tool": { "app": "Retrium", "version": "0.3.0", "host": "windows-x86_64" },
        "createdAt": "2026-11-20T13:00:00Z"
    },
    "program": {
        "name": "三國志4威力加強版",
        "language": "zh-Hant",
        "release": 1994,
        "category": "game",
        "developer": "KOEI",
        "publisher": "KOEI",
        "series": null,
        "tags": ["Strategy", "DOS"],
        "players": 1,
        "platform": "IBM PC DOS",
        "dos": { "version": "6.22", "input": ["keyboard", "mouse"] },
        "externalIds": { "mobygames": "12345", "igdb": "67890" }
    }
}
```

字段分区：

- **根级 `version`**：manifest 结构版本，本版固定 `1`。它同时就是 magic number + 版本：缺失或非整数说明这根本不是 Retrium cart，不等于 1 说明版本不兼容（§1.1）。注意它和 `cart.revision` 是两个东西——前者是**格式**的第几版、由 Retrium 定；后者是**这份 cart** 的第几版、由作者定。所以一个叫 `version`、一个叫 `revision`，而不是两个都叫 version：名字不同，读代码的人不用靠层级猜。
- **`cart`**：这个 cart 的身份、版本与来源。
  - `id`：UUID，**首次创建时生成，此后永不改变**。它是 `carts/<id>.cart`、`installed/<id>/`、数据库主键。格式为小写带连字符的规范 UUID（推荐 v7，时间有序、便于排序；v4 也可，读取端不校验版本位）。它同时是合法目录名。
  - `revision`：整数，从 1 开始，**同一 `id` 下严格递增**。由作者决定何时递增，且**唯一写入口是导出时的提示框**（见 §2.4）——没有别的地方能改它。
  - `author`：**整体可选**。出现时 `name` 必须非空，`email` 可选（写了才做格式校验）。没署名是合法状态，不是缺陷——多数自用 cart 都不署名。
  - `tool`：**必需**。`app` / `version` / `host` 三字段，记录生成它的软件与平台。
  - `createdAt`：**必需**，ISO 8601 UTC。语义是**这一版（revision）被造出来的时间**，每次 revision 递增时刷新——和 `revision` 的语义对齐，不做"首次创建时间"那种需要额外存储的语义。
  - 为什么不另开 `build` / `metadata` 块：这三者描述的是"这一份 cart 的这一版由谁、用什么、何时造出"，主语就是 `cart` 本身，另开一个块只是把同一个主语拆两次。`cart` 因此承担三件事——身份（`id`）、版本（`revision`）、来源（`author`/`tool`/`createdAt`），读起来是一句完整的话。
  - `tool` 而不叫 `builder`：`cart.tool` 与 `cart.author` 对仗，一个软件一个人。
- **`program`**：被包装软件自身的元数据。`name` 必需；`language`/`category` 使用 ID 而非自然语言字符串——注意这里说的是**被包装的软件**，`category: "game"` 只是枚举里的一个值，非游戏（编译器、工具、办公软件）同样合法。**启动信息不在这里**，在 `launch.json`。

不写进 manifest 的东西：run summary、存档、运行次数、启动方式——这些属于 library 或 `launch.json`，不属于 manifest。

**命名约定**：JSON 用短名（`id` / `revision`），因为它们已经在 `cart` 这个命名空间里，再带 `cart` 前缀反而是 `cart.cartId` 这种口吃。代码与 DB 里没有这个命名空间，所以保留限定：Rust/TS 字段 `cart_id`、`cart_revision`，DB 列名 `id`、`revision`（表名 `carts` 已经限定了），serde 上加 `rename` 映射即可。本文正文为了可读性写 `cartId` / `cartRevision`，指的就是这两个 JSON 值。

### 1.2.1 元数据 ID 约定

**`language`：BCP 47 语言标签**（不是自由文本）。UI 按标签显示本地化名称，筛选/排序稳定，避免 `Traditional Chinese` / `traditional chinese` 这类脏数据。

| 标签 | 含义 |
| --- | --- |
| `zh-Hant` | 繁体中文 |
| `zh-Hans` | 简体中文 |
| `en` | 英语 |
| `ja` | 日语 |
| `ko` | 韩语 |
| `fr` / `de` / `es` / `it` / `ru` | 法/德/西/意/俄 |

大小写遵循 BCP 47：语言小写、文字标识首字母大写、地区代码全大写（如 `pt-BR`）。导入时做语法校验，但**不限制枚举**——任何合法标签都接受。

**`category`：固定小写 ID 枚举**，未知值拒绝导入；细粒度分类放 `tags`。

| ID | 含义 |
| --- | --- |
| `game` | 游戏 |
| `application` | 应用（文字处理、表格等） |
| `utility` | 工具（磁盘、系统、压缩等） |
| `education` | 教育/学习 |
| `demo` | 演示版、技术演示 |
| `development` | 开发工具、编译器 |
| `system` | 系统软件、启动盘 |
| `reference` | 参考资料、百科 |

`tags` 仍是自由文本数组（如 `["Strategy", "DOS"]`），承载 `category` 表达不了的细分标签。

**`externalIds`：外部数据库 ID 映射**，可选字段；本版只存不用、不联网。

| key | 数据库 |
| --- | --- |
| `mobygames` | MobyGames（mobygames.com），老牌游戏资料库，相当于游戏界的 IMDb，每个游戏一个数字 ID，DOS 游戏覆盖很好 |
| `igdb` | IGDB，较现代的游戏数据库，API 友好 |

- key 全小写；value 统一用字符串，即使看起来是数字。
- 用途：`cart.id` 是随机的，同一份软件被不同人各打包一次会得到两个不同的 `cart.id`，靠它识别"同一份软件"做不到；外部 ID 才能跨来源对应。将来用于元数据补全、去重提示和外部资料链接。
- 非游戏（编译器、办公软件、驱动盘）通常没有 MobyGames/IGDB 条目，这类 cart 的 `externalIds` 留空即可——**不要为了填而填**，填错的外部 ID 比没有更糟。
- 约定：只写确实知道的 ID，不猜、不伪造；解析失败或未知 key 保留原样，不视为错误。

`program.*`、`cart.author`、`cart.tool`、`cart.createdAt` 全部是描述性字段，不影响身份：改语言、分类、标签、作者只是让 `hash` 变化，`cart.id` 与 `cart.revision` 都不变（见 §2.1）。

### 1.3 Config/launch.json

启动配置的唯一来源，也是 `installed/<id>/` 下唯一允许用户直接编辑的文件。它同时描述"有哪些启动方式"（`targets`）和"各自需要什么 DOSBox 环境"（`profiles`）。没写到的 DOSBox 设置一律交给 DOSBox 内置默认值，Retrium 只额外写基础覆盖与选中的 profile（见 §1.4），不要求作者写全。

```json
{
    "version": 1,
    "default": "game",
    "targets": [
        { "id": "game",  "label": "主游戏",   "executable": "SAN486.COM", "arguments": [],   "workingDir": ".",     "profile": "svga-high" },
        { "id": "setup", "label": "声音设置", "executable": "SETUP.EXE",   "arguments": ["/s"], "workingDir": "SOUND", "profile": "minimal" },
        { "id": "cd",    "label": "光盘版",   "executable": "PLAY.BAT",    "arguments": [],
          "preCommands": ["IMGMOUNT D \"../Resources/GAME.ISO\" -t iso"] }
    ],
    "profiles": {
        "svga-high": {
            "machine": "svga_s3",
            "memsize": 16,
            "cycles": 3000,
            "core": "normal",
            "sound": ["sb16"],
            "extra": { "render.scaler": "normal3x" }
        },
        "minimal": {
            "machine": "hercules",
            "memsize": 4,
            "cycles": "max"
        }
    }
}
```

- `version`：`launch.json` 自己的结构版本，本版固定 1。
- `targets[]`：启动入口，至少一个。`id` 唯一（`^[a-z][a-z0-9_-]{0,31}$`），`label` 是 UI 上显示的文字（1–40 字符，直接用于 Run 按钮与下拉），`executable` 相对 `workingDir`，`arguments` 原样拼在可执行文件之后。`profile` 可选——省略就是"只用基础覆盖"，也就是最接近 DOSBox 原样的环境（示例里的 `cd` 就是这个用法）。
- `workingDir`：相对 `Program/` 的启动目录，默认 `.`；规范化后必须仍落在 `Program/` 内。
- `preCommands`：启动可执行文件之前执行的受限命令，白名单见下方生成规则。
- `profiles`：DOSBox 环境预设，可被多个 target 复用。`machine`/`memsize`/`cycles`/`core`/`sound` 是一等字段；其余一律用 `extra` 承载，键写成 `段名.键名`（如 `render.scaler`），值是字符串。
- `default`：主 Run 按钮用的入口。**可省略**——省略时取 `targets[0]`；写了就必须指向存在的 `id`。

**生成规则**（`run_cart` 每次启动执行）：

1. 只写**差异**：先写必写的基础覆盖（`mapperfile`/`captures` 指向 `Runtime/`，见 §1.4），再叠加选中 target 的 profile（一等字段 + `extra`），按下方《字段级校验与取值》的落位表合并、按固定段序输出。没有"基线覆盖集"这一层，没写到的键全部留给 DOSBox 自己的默认值；
2. **全局窗口倍数**（`config.json` 的可选键 `dosbox.scale`，1..5）：为 2..5 时写 `[sdl] output=openglnb` + `windowresolution=<320·N>x<240·N>`（baseline 320x240）。**不能只用 `render.scaler`**：0.74 只在硬件倍线模式（mode 13h）下应用 scaler，普通 SVGA/文本模式静默回退 1x；而 `windowresolution` 只有支持硬件缩放的 output 才生效（`surface` 忽略它），故必须配 `openglnb`——DOSBox 会按游戏图像自身比例在窗口内信箱式居中（`GFX_SetupSurfaceScaled` 的 `sdl.clip` 逻辑），不拉伸变形，`openglnb`（nearest）保持像素锐利。320x200 游戏在 4:3 窗口里恰好得到整数倍画面（640x400…1600x1000）。这是**固定窗口尺寸**语义——所有 cart 窗口一样大，不是"游戏分辨率的 N 倍"。cart 的 `extra` 里显式写了 `sdl.output` / `sdl.windowresolution` 时逐键以 cart 为准；scale 为 1 或缺省时不写任何键；
3. 追加 `[autoexec]`：`MOUNT C "<installed>/Program"` → `C:` → `workingDir` 的 `cd`（为 `.` 时省略）→ `preCommands` → `executable` + `arguments`（含空格的参数整体加双引号）；
4. 写到 `installed/<id>/Runtime/dosbox.conf`（覆盖上一次生成的文件）；
5. 启动命令固定为 `<dosbox-exe> -noconfig -conf <Runtime/dosbox.conf>`（可执行文件取设置里 `config.json` 的 `dosbox.path`，见 §1.4.1）：`-noconfig` 不加载任何默认配置文件，`-conf` 叠加这份，其余一切取 DOSBox 编译期内置默认值。
6. 生成文件头注释里记账：Retrium 版本、生成时间、选中的 DOSBox 版本（best-effort 探测结果，可能是 `unknown`）、target 与 profile——排查"为什么这个键没生效"时先看这里。

**`preCommands` 白名单**（导入时校验一次，生成 conf 时再校验一次——本地编辑过的文件也要过这一关）：

| 命令 | 规则 |
| --- | --- |
| `cd` | 目标必须是 `Program/` 内的相对路径 |
| `loadfix` | 仅 `loadfix [-1] <可执行文件>`，可执行文件须在 `Program/` 内 |
| `set` | 仅允许 `SET BLASTER=...` / `SET SOUND=...`；值中禁止路径分隔符与盘符 |
| `imgmount` | `IMGMOUNT <盘符> <文件> [-t iso\|cdrom\|floppy]`；文件须解析到 `Program/` 或 `Resources/` 内 |

参数里出现盘符、绝对路径、shell 重定向/管道符（`|` `&` `>` `<`）一律拒绝；`..` 允许但必须在**规范化后**仍落在 `Program/` 或 `Resources/` 内（所有路径以 `Program/` 为基准解析），越界即拒绝。**不允许裸 `MOUNT`**——否则恶意 cart 可以挂载宿主目录读到任意文件。

DOSBox 工作目录 = `installed/<id>/Program/`。因为每次启动都重写同一个 conf，不存在"非默认 target 走临时 conf"，也不存在"用户手工调优被覆盖"的问题。

#### 字段级校验与取值

校验跑两次：导入时一次，每次启动生成 conf 前再一次（用户可能改过 `installed/<id>/Config/launch.json`）。下面所有"拒绝"都指整份 `launch.json` 无效——不做"跳过这个 target 继续跑"的局部降级，否则用户永远不知道自己少写了一个键。

**target 字段**

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `id` | string | 是 | `^[a-z][a-z0-9_-]{0,31}$`，数组内唯一（仅大小写不同也算重名） |
| `label` | string | 是 | 1–40 字符，去首尾空白后非空；中文、空格、标点都允许，原样显示 |
| `executable` | string | 是 | 相对 `workingDir` 的文件；不得绝对路径、盘符、`..` 越界；导入时要求文件确实存在（大小写不敏感匹配，以磁盘真实名为准）；生成时含空格则加引号 |
| `arguments` | string[] | 否 | 每项 ≤ 260 字符；**不得含 `"`、换行、制表符**——DOS 命令行没有转义机制，"禁止"比"猜怎么转义"可靠；含空格的项生成时整体加双引号 |
| `workingDir` | string | 否 | 默认 `.`；相对 `Program/`，规范化后仍在 `Program/` 内 |
| `profile` | string | 否 | 必须存在于 `profiles`；省略 = 不加任何 profile 键 |
| `preCommands` | string[] | 否 | 白名单见上；最多 16 条 |

**profile 字段与落位**

| 字段 | 类型 | 生成到 |
| --- | --- | --- |
| `machine` | 枚举 | `[dosbox] machine=<值>` |
| `memsize` | 整数 1–63 | `[dosbox] memsize=<值>`（单位 MB） |
| `cycles` | 整数 ≥1，或 `"auto"` / `"max"` | `[cpu] cycles=<值>`；字符串只能是这两个，数字必须是整数（`3000.0`、`1e4` 拒绝） |
| `core` | `auto` / `normal` / `simple` / `dynamic` | `[cpu] core=<值>` |
| `sound` | string[] | 见下 |
| `extra` | object | 逐条写进对应段 |

`machine` 允许值（0.74-3 的集合）：`hercules`、`cga_mono`、`cga`、`tandy`、`pcjr`、`ega`、`vgaonly`、`svga_s3`、`svga_et3000`、`svga_et4000`、`svga_paradise`、`vesa_nolfb`、`vesa_oldvbe`。别的实现会多几种机器类型，本版不接受；真要用就写 `extra` 的 `dosbox.machine` 并**同时删掉 `machine` 字段**（两个都写会按撞键拒绝），键名不校验、值写错由 DOSBox 自己忽略。

**`sound` 映射**（省略或 `[]` = 一个声音键都不写，用 DOSBox 默认 SB16）

| token | 生成 | 约束 |
| --- | --- | --- |
| `sb1` `sb2` `sbpro1` `sbpro2` `sb16` `gb` | `[sblaster] sbtype=<token>` | 互斥，最多一个 |
| `gus` | `[gus] gus=true` | 可与 sb 同时出现 |
| `none` | `[mixer] nosound=true` | 独占，不能与其他 token 共存 |

- 未知 token 拒绝。`adlib` 不作为 token——它不是独立设备，SB 卡自带 OPL；要纯 Adlib 就写 `"sound": []` 加 `"extra": { "sblaster.oplmode": "opl2" }`。
- 只写 `sbtype`，`sbbase`/`irq`/`dma` 取 DOSBox 默认（220/7/1）——几乎所有游戏都期望这组值，要改属于 `extra` 的事。

**`extra` 规则**

- 键写成 `段名.键名`：`sdl.output`、`render.aspect`、`sblaster.irq`，段名不带方括号。
- 段名白名单（防"写错段"）：`sdl` `dosbox` `render` `cpu` `mixer` `midi` `sblaster` `gus` `speaker` `joystick` `serial` `dos` `ipx`。`autoexec` 不在内——它由生成器拼装。段名不认识就拒绝。
- 键名**不校验**：各实现键集不同，认不出的键由 DOSBox 告警后忽略（§1.4.1 第 4 条）。这是在"多认一个键"和"一次笔误就打不开"之间取了前者。
- 值必须是字符串，不得含换行、回车、`\0`、`[`、`]`；`true`/`false` 写成 `"true"`/`"false"`，数字写成 `"3000"`。
- 与一等字段撞键一律拒绝：写了 `extra["cpu.cycles"]` 就不能再写 `cycles`，报错时点名冲突的键——绝不允两条路径互相覆盖。撞键清单按"一等字段生成的键"算：`dosbox.machine`、`dosbox.memsize`、`cpu.cycles`、`cpu.core`、`sblaster.sbtype`、`gus.gus`、`mixer.nosound`（由 `sound` 生成）；另外 `sdl.mapperfile` 与 `dosbox.captures` 是基础覆盖，`extra` 里出现这两个也拒绝（否则谁赢取决于代码顺序）。
- `profiles` 里出现未列出的字段（把 `memsize` 写成 `memory`）直接拒绝：schema 是关闭的，逃生口只有 `extra`。这样拼错在导入时就报错，而不是等到某个游戏跑不起来才查。

**输出顺序**（固定，为了人眼 diff 与哈希稳定）

1. 头注释；
2. 段序：`[sdl]` → `[dosbox]` → `[render]` → `[cpu]` → `[mixer]` → `[midi]` → `[sblaster]` → `[gus]` → 其余段（按段名字母序）→ `[autoexec]`；
3. 段内键按名字母序；空段不输出；同一个键只出现一次。

### 1.4 DOSBox 配置的叠加顺序

原则：**不复制 DOSBox 的默认值，只写与默认值不同的部分。** 基线就是本机那份 DOSBox 的编译期内置默认值——不是 Retrium 定义的一套"推荐配置"，也没有"官方/推荐"这种二选一。这样 Retrium 不用维护一份 60 行的 conf 副本，也不会随 DOSBox 升级漂移；代价是同一个 cart 在两台机器上的画面可能不同，这是刻意的（见 §1.4.1）。

**每次生成都必须写的基础覆盖**：

```ini
[sdl]
mapperfile=<installed>/<id>/Runtime/mapper.map

[dosbox]
captures=<installed>/<id>/Runtime/captures
```

必须写是因为这两个默认值都是**相对路径**（`mapper-0.74-3.map`、`capture`），会落到进程工作目录，也就是 `Program/`，污染安装副本。注意我们写出的文件名是 `mapper.map`，**不带版本号**——DOSBox 默认名里的 `0.74-3` 是它自己的版本标记，而用户装的是哪个版本我们说了不算（§1.4.1）。

优先级从低到高：**DOSBox 内置默认 → 基础覆盖 → profile 一等字段 → `extra` → `[autoexec]`**。

五层，没有第六层。所谓"推荐画面"（`output=opengl`、`aspect=true`、`fullresolution=desktop`）不是 Retrium 的默认行为，而是作者想写就写在 profile `extra` 里的三行；不写就是本机 DOSBox 的原样输出。Retrium 不预置、不切换、也不在 UI 上给一个"画面质量"开关——要改画面就改 `launch.json`，没有第二条路径。

**依赖的 0.74-3 内置默认值**（**不写入** conf，只写进生成文件头部注释供排查；其他 DOSBox 实现以各自文档为准）：

| 段 | 关键默认值 |
| --- | --- |
| `[sdl]` | `fullscreen=false` `output=surface` `fullresolution=original` `windowresolution=original` `priority=higher,normal` `usescancodes=true` |
| `[dosbox]` | `machine=svga_s3` `memsize=16` `captures=capture` |
| `[render]` | `frameskip=0` `aspect=false` `scaler=normal2x` |
| `[cpu]` | `core=auto` `cputype=auto` `cycles=auto` `cycleup=10` `cycledown=20` |
| `[mixer]` | `nosound=false` `rate=44100` `blocksize=1024` `prebuffer=25` |
| `[midi]` | `mpu401=intelligent` `mididevice=default` |
| `[sblaster]` | `sbtype=sb16` `sbbase=220` `irq=7` `dma=1` `hdma=5` `sbmixer=true` `oplmode=auto` |
| `[gus]` | `gus=false` `gusbase=240` `gusirq=5` `gusdma=3` |
| `[speaker]` | `pcspeaker=true` `tandy=auto` `disney=true` |
| `[joystick]` | `joysticktype=auto` `timed=true` |
| `[serial]` | `serial1=dummy` `serial2=dummy` `serial3`/`serial4`=disabled |
| `[dos]` | `xms=true` `ems=true` `umb=true` `keyboardlayout=auto` |
| `[ipx]` | `ipx=false` |

这张表只是文档，代码里没有任何常量与它对应——它存在的唯一用途是排查时有个对照（"这个键我没写，值应该是 16"）。来源：DOSBox Wiki《Dosbox.conf》《Performance》与 0.74-3 生成的默认 conf。

**生成的 conf 长这样**（profile `svga-high`，target `game`）：

```ini
# Generated by Retrium 0.3.0 — 由 Config/launch.json 生成，请勿手工编辑
# DOSBox: 0.74-3 (DOSBox.exe)   target=game   profile=svga-high
# 未列出的键取本机 DOSBox 内置默认值（0.74-3 参考值：machine=svga_s3 memsize=16 cycles=auto core=auto sbtype=sb16 ...）

[sdl]
mapperfile=C:\Games\Retrium\installed\019ae4c1-...\Runtime\mapper.map

[dosbox]
captures=C:\Games\Retrium\installed\019ae4c1-...\Runtime\captures
machine=svga_s3
memsize=16

[render]
scaler=normal3x

[cpu]
core=normal
cycles=3000

[sblaster]
sbtype=sb16

[autoexec]
MOUNT C "C:\Games\Retrium\installed\019ae4c1-...\Program"
C:
SAN486.COM
```

- 整个文件就是"我们改了什么"：2 个必写覆盖 + profile 的 6 个键 + 启动命令，没有一行是抄来的默认值。段序与段内键序都是固定的（§1.3 的输出顺序表），所以 `[dosbox]` 里 `captures` 排在 `machine` 之前、`[render]` 排在 `[cpu]` 之前——不是排版随意，是为了让两份 conf 能直接 diff。
- profile 里写的值即使恰好等于本机默认值（如 `machine=svga_s3`、`memsize=16`）也照写不误——**Retrium 不做"与默认值相同就省略"的优化**，因为那需要知道每个实现、每个版本的确切默认值，而这恰恰是我们没有的（§1.4.1）。多写一行的代价是文件长一点，写掉的代价是行为不确定。
- `memsize` 的单位是 MB，DOSBox 0.74-3 的合法范围是 1–63。写 `640` 是非法的（那是 KB 的直觉），校验时必须拒绝。
- 要查完整生效值，看头部注释列的参考默认值；要改画面，就在 profile 的 `extra` 里写，改完下次启动生效。

性能调优参考（来自 DOSBox Wiki Performance）：`cycles=3000`/`fixed 4000` 一类固定值适合 auto 判断失误的游戏；`core=dynamic` + `cycles=max` 速度最快但部分游戏不兼容；`cycles` 过高会导致音频断续。这些全部是 profile 的取值参考，Retrium 不预置任何一个。

### 1.4.1 用户自备 DOSBox 的后果

DOSBox 由用户提供（§0.13），Retrium 不知道对方装的是 0.74-3、Staging 还是 DOSBox-X。这不是"以后再说"的隐患，它直接决定生成器能写什么，因此下面四条是硬约定：

1. **只写跨实现稳定的键**。基础覆盖固定为 `[sdl] mapperfile` 与 `[dosbox] captures`；profile 的一等字段固定为 `machine`、`memsize`、`cycles`、`core`、`sound`。其余一律走 `extra`——它是"任意 DOSBox key"的出口，但不代表兼容性承诺。
2. **凡是必须成立的项都要显式写，不指望默认值**。§1.4 那张默认值表是 0.74-3 的参考，别家实现的默认 `output`、`machine`、`scaler` 都可能不同。既然 Retrium 不提供任何"推荐基线"，cart 想要什么行为就得在 profile 里写出来；不写就是这份 DOSBox 的原样——"同一 cart 在两台机器上画面不同"是预期行为，不是 bug，唯一的解法是作者把要固定住的值写进 profile。
3. **版本探测是 best-effort，失败不阻断**。启动前跑一次 `<exe> -version` 取版本串写进 conf 头注释；失败或输出不可解析就记 `unknown`，照常启动。这个值只用于排查与"版本不符"提示，不参与任何校验分支——用户升级 DOSBox 不该让库里所有 cart 失效。
4. **认不出的键是告警而非致命**。conf 里出现当前 DOSBox 不认识的键时，DOSBox 会告警并忽略，不会中止启动；所以多写一个键最坏是无效。实现时不要把它升级成硬失败，否则一次 `extra` 手误就会让 cart 打不开。反过来说，若某个实现连 `-noconfig`/`-conf` 都不接受，它会立刻退出——按"这个 DOSBox 版本不受支持"报错并指向设置页，不要重试、不要回退到读写用户 conf。

这一条也解释了为什么"随包分发"曾经那么有吸引力：自带一份 0.74-3 能让上面四条全部消失。放弃分发是主动接受这份不确定性，换掉的是 GPL 合规负担、安装包体积与每次升级 DOSBox 都要同步源码。

## 2. 身份、修订与哈希

### 2.1 三个值怎么分工

| 值 | 谁写 | 什么时候变 | 作用 |
| --- | --- | --- | --- |
| `cart.id`（UUID） | 生成器：首次创建时随机生成 | **永不变** | 身份：`carts/<id>.cart`、`installed/<id>/`、DB 主键 |
| `cart.revision` | 作者（人或"另存为新版本"动作） | 作者决定 | 版本：判断"这份比库里那份新吗" |
| `hash`（根级文件） | 机器：打包时计算 | 任何字节变化 | 完整性 + 内容指纹：判断"内容真的变了吗" |

三条规则：

1. **`id` 不随内容变**。改 `launch.json`、换 `GAME.EXE`、改封面、改元数据——`id` 都不变，库里还是同一条记录、同一个目录。
2. **`revision` 只有一个写入口：导出提示框**。Retrium 不会偷偷递增，也不在 cart 详情页里提供编辑框；导出时若 `hash` 与库里记录的不同，UI 提示"要不要升到 N+1"（默认勾选，可拒绝），这是唯一能改它的地方（见 §2.4）。
3. **`hash` 全自动**。它是唯一的内容指纹，负责完整性校验、重复检测，以及"这份和那份到底一不一样"。

因此：`id` + `revision` 是**声明**（作者背书），`hash` 是**事实**（内容背书）。两者不互相证明，各管各的——这正是它们分开的价值。

### 2.1.1 为什么不用内容寻址

早期方案是 `cartId = H(programHash, configHash)`：内容相同必然 id 相同，导入能自动去重。代价是改一行 `cycles` 就换身份，于是不得不引入 `configId`、变体分组、"编辑即分叉"、目录迁移、canonical JSON 一整套机制来对付它——而目录迁移在用户每次调参时都要复制一份完整的 `Program/`。

换成 UUID 后这整套机制蒸发了，代价是三样东西：

| 失去 | 替代 |
| --- | --- |
| 跨来源自动去重（同内容 = 同 id） | 用 `hash` 比对：hash 相同就是同一份内容，提示"库里已有内容相同的 cart" |
| "同一程序的不同配置"分组 | 不做。配置是升级的一部分（改 profile = 下一个 revision），真要并存两份就是两个 cart、两个 UUID |
| 身份可被内容验证（伪造 manifest 会露馅） | 没有替代。`id` 是信任声明，只靠导入冲突规则兜住，不做防伪 |

换来的是：`id` 稳定、有真正的升级路径（同 id、更高 revision）、编辑 `launch.json` 不再是事故、代码里少两个哈希推导和整套 canonical JSON。

### 2.2 hash 算法

`hash` 对归档里除它自己之外的全部 entry 计算。**输入不是归档字节，而是文件条目集合** `(相对路径, 文件内容 SHA-256)`。路径以 ZIP 内路径为准，统一 `/` 分隔符，例如 `Program/GAME.EXE`。

```
tree_hash(entries):
    records = []
    for (path, bytes) in entries:
        rec = u32le(path.len()) || path.utf8_bytes || sha256(bytes)   # 32 字节原始摘要
        records.push(rec)
    records.sort()                       # 按字节序；路径在前，等价于按路径排序
    return hex(sha256(concat(records)))  # 32 字节 -> 64 位小写 hex

hash = tree_hash({ 除 hash 外的全部 entry })
```

要点：

- 长度前缀不可省，否则 `("ab", h)` 与 `("a", "b"+h)` 会产生相同字节流。
- 排序保证 ZIP 条目顺序不影响结果；哈希文件内容而非 ZIP 字节，保证时间戳、压缩方式、归档文件名不影响结果。**同样的内容重新打包，`hash` 不变**。
- 唯一的排除项是根级 `hash` 文件本身（避免自引用）；`manifest.json` 在输入内，所以改元数据、改作者、改 revision 都会改变 `hash`。
- 所有文件一律按**原始字节**哈希，不做归一化——`launch.json` 换个缩进也算内容变化。这是有意的：`hash` 描述字节，不描述语义；既然身份已经不由内容推导，就没有必要维护一套 canonical JSON 规则。
- 目录 entry 必须排除，否则不同打包工具会算出不同 `hash`。
- 导入时从 ZIP entry 流直接计算（不落盘）；导出时从待写出的 entry 集合计算。**两条路径必须共用同一个函数**，否则必然不符。
- 哈希只描述不可变归档 `carts/<id>.cart`，**从不用于校验 `installed/`**——那是可变的运行副本（`launch.json` 可编辑，程序会写存档）。

### 2.3 revision 语义与导入冲突

`revision` 从 1 开始，同一 `id` 下严格递增。导入时按下表处理：

| 库里的状态 | 判据 | 默认动作 |
| --- | --- | --- |
| 没有这个 id | — | 直接导入 |
| 已有一份完全相同的 | 同 id + 同 revision + 同 `hash` | 幂等：提示"已导入过"，不产生副本 |
| 同 id、内容不同、版本更高 | 同 id + `revision` 更大 | 提议**升级**：覆盖归档 → 重解压 `Program/` → 用 `Runtime/State/**` 覆盖回去 |
| 同 id、内容不同、版本相同 | 同 id + 同 `revision` + `hash` 不同 | **冲突**：默认拒绝，显式选择才"用导入的替换本地" |
| 同 id、版本更低 | `revision` 更小 | 默认拒绝（降级），显式确认才允许，且会覆盖 `Program/` |
| 不同 id、`hash` 相同 | `hash` 相同 | 提示"这是同一份内容的另一个副本"，由用户决定是否仍导入 |

- **升级时保留 `Runtime/State/`** 是刻意的：存档是玩家的，`Program/` 是 cart 的。重解压 `Program/` 再把 `State/` 覆盖上去，正好复用启动流程的同一套代码。
- **`revision` 相同、内容不同**之所以判为冲突而不是"静默覆盖"，是因为同一个 `(id, revision)` 在不同人手里可能真的是两份不同的包——这时应该由人决定谁是那份"官方"的第 N 版，而不是让后导入的赢。
- **没有 `revision` 校验的余地**：`id` / `revision` 都是声明，导入端无法验证真伪，只能靠这条冲突规则约束"同一 id 同一 revision 只有一份内容"。

**开新 cart 还是升 revision**：问自己这两个包会不会**同时存在且都需要**——会（低配/高配两套设置、原版/汉化版）就两个 cart、两个 UUID；不会（修 bug、换更好的 exe、补一版配置、改封面）就同一个 cart 升 revision，旧版本来也没有保留价值。格式两种都支持，不替用户决定。

### 2.4 导出时的 revision 决策

导出前把即将写出的 entry 集合算一遍 `hash`，与数据库里记录的 `package_hash` 比较：

| 情况 | 动作 |
| --- | --- |
| `hash` 相同 | 内容没变。沿用当前 `revision`，提示框里可以手动改成 N+1（重新打包同一内容、发布一个新版本号时用） |
| `hash` 不同 | 弹窗提示"内容已变更，是否作为 revision N+1 导出？"——**默认勾选升版**，但用户可拒绝 |

拒绝升版是允许的（作者可能只是重新打包、想保持版本号），但要在 UI 上说清后果：同一个 `(id, revision)` 出现两份不同内容，别人导入时会撞上 §2.3 的冲突规则。

**`revision` 只有一个写入口：导出时的这个提示框。** cart 详情页里不提供直接编辑——否则用户可以在任意时刻改它，导出的包就会是"内容没变、版本号跳了"，或者"内容变了、版本号没动"，两种都会让导入端的冲突规则失效。

## 3. Library 布局

```
<library>/
├── carts/
│   └── <uuid>.cart             # 不可变原始归档；导出源、恢复源
├── installed/
│   └── <uuid>/
│       ├── Program/**          # DOSBox 挂载为 C:；程序写出的文件（存档等）自然落在这里
│       ├── Config/launch.json  # 唯一可直接编辑的配置文件
│       ├── Resources/cover.png
│       └── Runtime/
│           ├── dosbox.conf     # 每次启动生成，只含覆盖项，可丢弃
│           ├── baseline.json   # 启动时对 Program/ 的 stat 快照，退出比对用
│           ├── running         # 运行标记；存在即说明上次未正常收尾
│           ├── State/**        # 相对 cart 的差异层（改动/新增），不是全量镜像
│           ├── commit.json     # {revision, package_hash, manifest_version}：dirty 判定的缓存
│           ├── mapper.map
│           └── captures/
└── retrium.db                  # SQLite：carts + summaries
```

命名说明：

- `carts/<id>.cart`：不用 `archives/`。归档本身是 cart 的权威原始副本。
- `installed/<id>/`：不用 `work/`、`drives/`、`runtime/`。它是"安装后的 cart"，且与 cart 内的 `Runtime/` 不冲突。
- cart 内路径与 installed 路径一致（没有 `Contents/` 层），解压时不需要路径映射，哈希校验与解压/导出共用同一套前缀。
- `Runtime/`：非隐藏，包含生成物与可变状态；重新解压 `Program/` 时必须保留 `Runtime/`。
- `State/`：**相对 cart 的差异层**，只存被程序改过或新建的文件，不存与 cart 相同的文件。启动时覆盖进 `Program/`，退出时按基线比对增删。将来单独导出/导入存档直接指向它。
- `baseline.json` / `running`：让"上次运行改了什么、删了什么"可复原；两者都可丢弃，删掉最多丢一次退出比对（见 §5.2 的崩溃处理）。
- `commit.json`：`{revision, package_hash, manifest_version}`，导出成功后写入。它是 `dirty` 判定的**缓存**而不是事实来源——`retrium.db` 重建后没有这一行时退回"重新算一遍整包 hash"，所以删掉它只损失一次顺序读，不损失正确性（§5.3 的 dirty 判定，§4 的"删库重建"）。
- `Runtime/dosbox.conf` + `mapper.map` + `captures/`：全部是生成物/本地数据，不随 cart 导出，可安全删除并重建。文件名不写 DOSBox 版本号，因为版本由用户在设置里指定、随时可能换（§1.4.1）。
- DOSBox 可执行文件**不在 library 里**：它属于用户环境，存在 `config.json` 的 `dosbox.path`（单一路径，不支持多版本）。库里不复制二进制，也不为 cart 固定版本——conf 头注释记下这次探测到的版本，够排查就行（§1.4.1 第 3 条）。同一节下的可选键 `dosbox.scale`（1/2/3）是全局窗口放大倍数，实现见 §1.4.1 生成规则第 2 条；`1` 在 config.json 里不落盘（`None`）。
- 封面只存一份，在 `installed/<id>/Resources/cover.png`，不另设 `covers/`。

## 4. SQLite

`retrium.db` 放在 `<library>/` 下。

```sql
CREATE TABLE carts (
    id               TEXT PRIMARY KEY,    -- cart.id，UUID；目录名与归档名的来源
    revision         INTEGER NOT NULL,    -- cart.revision，≥1
    package_hash     TEXT NOT NULL,       -- 描述 carts/<id>.cart 的内容（含 manifest）
    manifest_version INTEGER NOT NULL,    -- 根级 version
    -- cart.author（整体可选）
    author_name      TEXT,                -- 可空；非空时不能是空串
    author_email     TEXT,
    -- program.* 的标量字段按列存储；嵌套结构用 JSON 文本列
    name             TEXT NOT NULL,
    language         TEXT,          -- BCP 47，如 zh-Hant / en / ja
    release          INTEGER,
    category         TEXT,          -- game|application|utility|education|demo|development|system|reference
    developer        TEXT,
    publisher        TEXT,
    series           TEXT,
    tags             TEXT,          -- JSON array，自由标签
    platform         TEXT,
    players          INTEGER,
    dos_json         TEXT,          -- program.dos
    external_json    TEXT,          -- program.externalIds，如 {"mobygames":"12345"}
    tool_json        TEXT,          -- cart.tool：{"app","version","host"}
    created_at       TEXT,          -- cart.createdAt（这一版的构建时间）
    raw_path         TEXT NOT NULL  -- 相对 library 根：carts/<id>.cart
);

CREATE INDEX idx_carts_package_hash ON carts(package_hash);  -- 内容相同的副本检测
CREATE INDEX idx_carts_author       ON carts(author_name);
CREATE INDEX idx_carts_category     ON carts(category);
CREATE INDEX idx_carts_language     ON carts(language);
CREATE INDEX idx_carts_release      ON carts(release);

CREATE TABLE summaries (
    cart_id   TEXT PRIMARY KEY,
    last_run  TEXT NOT NULL,
    runs      INTEGER NOT NULL,
    elapsed   INTEGER NOT NULL          -- 秒
);

CREATE INDEX idx_summaries_last_run ON summaries(last_run);

PRAGMA user_version = 1;
```

- 主键就是 `cart.id`，没有 `program_id` / `config_id` 之类的派生键——身份只有一层。
- 标量字段按列存（`author_name`/`author_email`/`name`/`language`/`category`/`developer`/`publisher`/`series`/`platform`/`players`/`release`），可下推筛选与排序——"我打包的 cart"就是 `WHERE author_name = ?`；没署名的 cart 是 `author_name IS NULL`。
- 嵌套结构保留 JSON 列：`tags`、`dos_json`（`program.dos`）、`external_json`（`program.externalIds`）、`tool_json`（`cart.tool`）。
- `raw_path` 存**相对路径**，library 整体移动后仍然有效；运行时拼接 library 根。
- `idx_carts_package_hash` 服务于"另一份内容相同的副本"提示（§2.3 最后一行），这是放弃内容寻址后唯一的去重手段。
- **schema 改动不做迁移**：`user_version` 不匹配就地删库重建，再从 `carts/*.cart` 与 `installed/` 重新发现。DB 只是索引，`carts/` 目录才是真相来源——所以重建的代价可接受，而这正是"能有底气不写迁移"的前提（§0.1）。代价要在明处：重建会丢掉两样东西——尚未导出的元数据编辑、以及 `summaries` 里的运行次数/时长。开发期接受；到 1.0.0 时这两样东西是否值得保住，是重新审视"删库重建"这条的正当理由之一。

收益：`discover_carts` 与 `get_cart_summaries` 从"遍历目录 + 每 cart 读 JSON"变成单条 `SELECT`；筛选/排序/搜索可下推到 SQL。依赖增加 `rusqlite` 与 `sha2`，移除 `sha1`/`hex`。

## 5. 主要流程变化

### 5.1 导入 `add_carts` / `import_archive`

1. 打开归档，从 entry 流直接读 `hash`、`manifest.json`、`Config/launch.json`（不落盘）；
2. 先校验形状，避免对垃圾包做重活：根级 `version` 是整数且等于 1、`hash` 是单行 64 位 hex、`launch.json` 可解析；
3. 重算 `hash`（除 `hash` 外全部 entry）与 `hash` 文件比对，不符则拒绝——这一步顺带验证了 `manifest.json` 未被改动；
4. 校验 `manifest` 结构：`cart.id` 是合法 UUID、`cart.revision` 是 ≥1 的整数、`cart.tool` 三字段非空、`cart.createdAt` 是合法 ISO 8601、`cart.author` 可缺省（存在时 `name` 非空、`email` 若存在则格式合法）；`program.name` 非空、`language` 合法 BCP 47、`category` 在枚举内、`externalIds` 的 key/value 均为字符串；
5. 校验 `launch.json` 结构：`default` 指向存在的 target、profile 引用有效、`workingDir` 与 `preCommands` 过白名单；
6. 拒绝重名 entry、symlink、路径穿越、保留名、大小写/NFC 冲突、加密/分卷条目、根级白名单外的 entry；检查 entry 数与解压总量上限；
7. 按 §2.3 表判断 `(id, revision, hash)` 关系：无此 id → 导入；同 revision 同 hash → 幂等跳过；同 id 更高 revision → 提议升级；同 revision 不同 hash → 冲突；更低 revision → 拒绝；`hash` 与库中其他 cart 相同 → 提示副本；
8. 归档字节原样复制为 `carts/<id>.cart`；
9. 解压 `Program/**`、`Resources/**` 到 `installed/<id>/`，`Config/launch.json` 解到 `installed/<id>/Config/`（`hash` 与 `manifest.json` 不落盘）；
10. `cart.*` 与 `program.*` 写入 `carts` 表（`author_*` 允许 NULL）。

导入不生成 `dosbox.conf`——它只在启动时生成。

### 5.2 运行 `run_cart`

1. 解析 DOSBox 可执行文件：取 `config.json` 的 `dosbox.path`。文件不存在或不可执行就直接报错并跳到设置页，既不生成 conf 也不启动——library 里没有任何副本可以回退（§0.13、§1.4.1）。
2. 读 `Config/launch.json`，取 `default` 或用户在 Run 下拉选中的 target；
3. 生成 `Runtime/dosbox.conf`（只含覆盖项，见 §1.3）；生成前就地校验 `launch.json`（它可能被用户编辑过，不能信任导入时的校验结果）；
4. **不重新解压**。只有 `Program/` 缺失（首次安装、重置、修复）时才从 `carts/<id>.cart` 解压，并把 `Runtime/State/**` 覆盖进去；
5. `Runtime/running` 已存在说明上次异常退出：先对残留的 `Program/` 补做第 7 步的退出比对，再继续；
6. 遍历 `Program/` 写 `Runtime/baseline.json`（`path` + `size` + `mtime_ns`，**不读内容**），创建 `Runtime/running`，以 `<dosbox-exe> -noconfig -conf <Runtime/dosbox.conf>` 启动（工作目录 `installed/<id>/Program/`）；进程立即退出且 conf 未被读取时，按"该 DOSBox 不受支持"报错，不重试；
7. 退出时做**退出比对**：
   - `Program/` 中新增、或 `size`/`mtime` 与基线不同的文件 → 复制进 `State/`（保持相对路径）；
   - `State/` 中存在、但 `Program/` 中已消失的文件 → 从 `State/` 删除（这就是"删除"的表达方式，不需要 tombstone）；
   - 只在 cart 里有、`Program/` 里没了的文件 → 不处理，重置时自然恢复；
8. 删除 `running`，写 `summaries` 表（一次 `UPSERT`），不再写 `summaries/<id>.json`。

不设常驻 watcher：比对在退出时一次完成，崩溃场景由第 5 步在下次启动时补做。代价是运行中看不到"存档已更新"，收益是不再有一个要处理文件锁、路径大小写、事件丢失的后台线程。

`[autoexec]` 里 `MOUNT C` 写 `Program/` 的绝对路径（不依赖工作目录，避免 DOSBox 版本对 cwd 处理差异）；非默认 target 直接重写同一个 conf，不需要临时 conf。

全量解压一次的代价落在导入时，而不是每次启动；几千个文件的 `stat` 遍历在几十毫秒量级。

### 5.3 导出 `archive_cart`

**内容来源是 `installed/<id>/Program/**`**，不是归档——这样用户在 `installed/` 里放进去的补丁文件、换掉的 exe、改过的 `launch.json` 才能进下一次导出。但必须先按 `Runtime/State/` 修正，否则程序写的存档会被打进 cart：

| `installed/Program/` 里 | `Runtime/State/` 里 | 归档里 | 导出用哪份 |
| --- | --- | --- | --- |
| 有 | 无 | — | **installed 当前版本**（用户新增或改过、且程序没碰过的文件，原样打包） |
| 有 | 有 | 有 | **归档版本**（程序在一次运行里改写过的文件；改动留在本地，不进 cart） |
| 有 | 有 | 无 | **跳过**（程序自己生成的存档、配置、临时文件） |
| 无 | — | 有 | **归档版本**（不视为删除，见下） |

第四行是刻意的保守选择：运行时被程序删掉，和作者手动删掉，从文件系统上无法区分，而覆盖 `carts/<id>.cart` 是不可逆的。所以"少了一个文件"一律按"保留归档里的"处理。要真正缩减 cart 的内容，就重建一个新 cart——这比悄悄让一次运行把归档里的数据删掉安全得多。

其余规则：

- `Config/launch.json` 与 `Resources/cover.png` 取 `installed/<id>/`（用户可能改过）；元数据与 `cart.author` 取数据库；`cart.id` 沿用，`cart.revision` 按 §2.4 决定；`cart.tool` 与 `cart.createdAt` 重写为当前值。
- **顺序不能颠倒**：先定稿 `Program/` / `Config/` / `Resources/` / `manifest.json` → 算 `hash` → 写 `hash` → 打包。`hash` 必须在 manifest 定稿之后算，否则必然算错。
- 导出包里只允许 `hash`、`manifest.json`、`Program/**`、`Config/launch.json`、`Resources/**`；`Runtime/` 下的任何东西（conf、State、baseline、running、mapper、captures）都不进包。
- 先写同目录临时文件、成功后原子 rename 覆盖 `carts/<id>.cart`，避免中途失败留下半截归档；随后 `UPDATE carts SET revision=?, package_hash=?, tool_json=?, created_at=? WHERE id=?`。
- 导出完成后 `carts/<id>.cart` 的 `hash` 与数据库 `package_hash` 必须一致；导入端再用同一函数重算一次即可验证往返无损。
- **"有未导出的本地改动"的判定**：用上面这张表在内存里算出待导出集合，算一次 `hash` 与数据库 `package_hash` 比较，不等就是 dirty。不需要额外状态位，也不会因为 `Program/` 里存了存档而误报——存档本来就被表里的第二、三行排除在外。
- 已知副作用：`State/` 只记录**程序在一次受管运行里写出的文件**。你手动往 `installed/Program/` 里拷进去的东西（包括手动放的存档）不在 `State/` 里，会按第一行原样导出。想让某个改动进 cart，这是唯一入口；不想让它进，就别往 `Program/` 里丢。

### 5.4 删除 / 重置

- `delete_cart`：删 `carts/<id>.cart`、`installed/<id>/`、数据库两行。
- 重置进度：清空 `installed/<id>/Program/`，同时删 `Runtime/State/`、`Runtime/baseline.json`、`Runtime/running`，再从 `carts/<id>.cart` 重新解压。`Runtime/dosbox.conf` 下次启动自动重建。
- 修复：`Program/` 被改坏但用户想保留存档时，只重新解压 `Program/` 再覆盖 `State/`；想连存档一起清掉就是"重置进度"。

### 5.5 更新元数据 / 启动配置

- `update_cart_info`：`UPDATE carts SET ... WHERE id = ?`，`author_name`/`author_email` 走同一命令；封面变更同步更新 `installed/<id>/Resources/cover.png`。这些改动只进数据库，**下次导出才写进 manifest 并重算 `package_hash`**——在此之前数据库里的 `package_hash` 仍然准确描述磁盘上那份 `carts/<id>.cart`。
- `installed/<id>/Config/launch.json` **允许直接编辑**（用编辑器或应用内表单都行）。它不影响 `cart.id`、不改目录名、不需要迁移；结果是 `installed/` 与归档不再一致，这正是预期状态：
  - UI 的"有未导出的本地改动"不存状态位，直接用 §5.3 的四行矩阵算出待导出集合、算一次 `hash` 与 `package_hash` 比较得出的结果；
  - 下次启动用新配置生成 conf；生成前重新过一遍白名单校验；
  - 导出时把新 `launch.json` 打进包，`hash` 变、按 §2.4 提示升 revision；
  - 放弃本地改动 = 从 `carts/<id>.cart` 重新解出 `Config/launch.json`。

### 5.6 启动入口的 UI 契约

`targets[]` 是作者写的，但用户点哪个是运行时的事。契约只有五条：

1. **主按钮 = `default` 指向的 target**，按钮文字用它的 `label`（`Run 主游戏`），不用 `id`。`default` 省略时取 `targets[0]`，与 §1.3 一致。
2. **下拉 = target 列表**，每项显示 `label`，第二行小字显示 `executable`（"声音设置 / SETUP.EXE"）——两个 target 都叫"设置"时这是唯一能区分的信息。点击即用该 target 启动，不改写 `default`（想改默认属于编辑 `launch.json` 的事，UI 不提供"设为默认"）。
3. **只有一个 target 时不出下拉箭头**，`RunSplitButton` 退化成普通按钮。原来的 DOSBox 版本选择器**删除**——已不支持多版本（§0.13），这个下拉现在专供 targets。
4. **运行中禁用整个下拉**。同一个 cart 只能有一个实例：conf 是同一个文件、`Runtime/State/` 是同一份存档。要换 target 就是先 Stop 再 Run，不提供"并行开两个"，也不提供"重启到另一个 target"的一键操作。
5. **`launch.json` 解析失败时不猜**：主按钮禁用并显示原因（"启动配置无效：targets[1].executable 不存在"），下拉不渲染。不要回退到"随便跑一个 exe"。

`CartMenuButton` 里现有的 `Run with default DOSBox` 改成两项：`Run`（= 主按钮同义）与 `Run with…` 子菜单（列 targets）。`RunningPage` 显示正在跑的是哪个 `label`，否则用户分不清自己进的是游戏还是 SETUP。

`run_cart` 签名相应变成 `run_cart(id, target_id: Option<String>)`：`None` 走 `default`，超出 `targets` 的 `id` 直接报错。

## 6. 需要同步修改的文件

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/commands.rs` | discover/import/export/run/delete/update/summary 全部重写；去掉 watcher，改为启动写基线、退出比对；`sha1_of_file` → `tree_hash` |
| `src-tauri/src/hash.rs`（新） | `tree_hash` 与整包 `hash` 计算；导入与导出的唯一哈希入口 |
| `src-tauri/src/manifest.rs`（新） | `Manifest` / `CartBlock` / `ProgramBlock` 结构体、serde 映射、UUID 与 revision 校验 |
| `src-tauri/src/launch.rs`（新） | `launch.json` schema、字段校验（`§1.3` 的四张表）、`preCommands` 白名单、`sound`/`extra` 落位、固定段序生成 `Runtime/dosbox.conf`（基础覆盖 + profile + autoexec，无基线层） |
| `src-tauri/src/config.rs` | `{ library, dosbox: { path } }`——**单路径**，删掉 `versions[]`/`default`/`DosboxVersion` 以及现成的 `LegacyConfig` + `From<LegacyConfig>` 迁移实现。不做旧结构读取、不做迁移：读到不合新结构的 `config.json` 就当没有配置文件，用默认值重建（用户重设一次路径）。另加路径存在性/可执行性校验与 `-version` best-effort 探测 |
| `src-tauri/tauri.conf.json` | **不带 DOSBox 二进制**（§0.13 不分发）；只需打包应用自身资源 |
| `src-tauri/src/db.rs`（新） | SQLite 初始化、schema、CRUD、内容相同的副本查询（按 `package_hash`） |
| `src-tauri/src/lib.rs` | `Cart` / `CartInfo` 类型调整（`id` 变 UUID 字符串、加 `revision`）；invoke handler 同步；新增"选 target 运行"命令 |
| `src-tauri/Cargo.toml` | +`rusqlite` +`sha2` +`uuid`；−`sha1` −`hex` |
| `src/types/index.ts` | `Cart` / `CartInfo` 加 `revision`，去掉任何 `configId` 相关字段；`Manifest` 类型按 `version`/`cart`/`program` 定义 |
| `src/lib/api.ts` | 命令签名同步 |
| `src/pages/SettingsPage.tsx` / `SetupPage.tsx` | DOSBox 版本列表改成**单个路径**输入 + "浏览/测试"按钮 + 探测到的版本显示；删掉增删条目、设为默认的逻辑 |
| `src/components/RunSplitButton.tsx` | 下拉内容从 DOSBox 版本列表换成 `targets`（`label` + `executable` 小字）；单 target 不出箭头；运行中禁用（§5.6） |
| `src/components/CartMenu.tsx` | `Run with default DOSBox` 拆成 `Run` + `Run with…` 子菜单（targets） |
| `src/pages/RunningPage.tsx` | 显示当前 target 的 `label` |
| `skills/retrium-cart/SKILL.md` | 全面改为 v2 布局与哈希规则 |
| `skills/retrium-cart/references/cart-format.md` | 同上 |
| `skills/retrium-cart/scripts/validate_cart.py` | 校验 manifest 结构（`version` + `cart` + `program`）、`hash` 文件、ZIP 根布局与白名单、重算哈希 |
| `skills/retrium-cart/assets/cart-template/` | 改为 ZIP 根布局模板（`hash` + `manifest.json` + `Config/launch.json`，不含 dosbox.conf） |
| `AGENTS.md` / `README.md` | 数据模型与命令说明 |
| 相关 `*.test.tsx` / Rust 测试 | 更新期望值 |

### 6.1 落地情况

上表是动工时的改动清单。落地后实际模块划分与命令清单如下（多出的部分是拆分带来的，格式与语义未变）。

模块：

| 文件 | 职责 |
| --- | --- |
| `hash.rs` | `tree_hash`、`digest_archive`、`digest_dir`、`parse_hash_file` |
| `manifest.rs` | `Manifest` / `CartBlock` / `ProgramBlock` / `Tool` / `Author` |
| `launch.rs` | `Launch` / `Target` / `Profile` / `Cycles` / `FileIndex` / `normalize_rel` / `render_conf` |
| `error.rs` | `FieldError { path, message }`，渲染成 `targets[1].executable: file not found` |
| `library.rs` | `Layout`、`inspect`、`extract`、`reset`、`repair`、`remove`、`collect_export_entries`、`commit`、`export_hash`、`commit.json` 读写 |
| `import.rs` | `analyze`（只读）+ `import_new` / `replace`（落盘） |
| `run.rs` | `prepare`（恢复 / 崩溃补比对 / 校验 / 生成 conf / 写基线）、`begin`、`finish` |
| `state.rs` | 基线 `snapshot` / `apply` / `diff` / `clear` |
| `db.rs` | SQLite schema、CRUD、`find_by_hash`、`user_version` 不匹配即删表重建 |
| `config.rs` | `{ library, dosbox: { path } }`，无任何旧结构分支 |
| `commands.rs` | 只做编排：取配置、开库、调上面这些模块、发事件 |

命令（Tauri invoke）：

| 命令 | 来源 |
| --- | --- |
| `discover_carts` | §5.1 第 10 步的读取端 |
| `add_carts` + `resolve_import` | §5.1 拆成两阶段：分析阶段不落盘，需人决定的留 `pending` |
| `get_cart_launch` | §5.6 的 UI 契约（targets + `default` + 错误原因） |
| `run_cart(id, targetId?)` / `stop_cart` / `stop_all_carts` / `list_cart_processes` / `get_cart_process` | §5.2 |
| `delete_cart` / `reset_cart` / `repair_cart` | §5.4，各自一条命令，因为语义不同 |
| `update_cart_info` | §5.5 |
| `open_cart_folder` | 打开 `installed/<id>/` |
| `preview_export` / `commit_cart` / `export_cart_file` | §5.3 拆成"预览 dirty → 写归档 → 另存一份" |
| `get_dosbox_path` / `set_dosbox_path` / `probe_dosbox_path` | §1.4.1 单路径 + 版本探测 |
| `get_setup_state` / `complete_setup` / `set_library_directory` / `pick_library_directory` / `pick_dosbox_executable` | 首次启动与设置页 |

三条偏差（相对本节的原始清单，不改变格式与语义）：

1. `Runtime/commit.json` 已补进 §3 的目录清单（见该节"命名说明"）。
2. `reset_cart` / `repair_cart` / `preview_export` / `commit_cart` / `get_cart_launch` 是把 §5.4、§5.6 的流程落成 API 时的必要拆分。
3. `add_carts` 拆成 `add_carts` + `resolve_import`：分析阶段只读，`Outcome::Pending` 交给人决定（§2.3 的冲突表要求"不自行解决"）。

## 7. 测试要点

- tree_hash：路径顺序、长度前缀、文件字节变化、空集合、重名 entry、目录 entry 被排除。
- manifest 形状：根级 `version` 缺失 / 非整数 / 不等于 1（分别给出 `Not a Retrium cart` 与 `Unsupported cart version`）、`cart.id` 非 UUID、`cart.revision` 为 0 或负数、`cart.tool` 缺字段、`cart.createdAt` 非法、`cart.author` 缺失（**应通过**）、`author.name` 为空串或纯空白（应拒绝）、`author.email` 非法、未知根级键（应忽略而非报错）。
- `hash` 文件：缺文件、格式非法、多行/带 BOM/带前缀、值与重算不符、改 manifest 后 `hash` 变但 `cart.id`/`revision` 不变、重打包（改 ZIP 时间戳与条目顺序）后 `hash` 不变。
- 导入冲突：同 revision 同 hash 幂等；同 revision 不同 hash 拒绝；高 revision 升级且保留 `State/`；低 revision 拒绝；不同 id 同 hash 提示副本；`hash` 相同但 manifest 不同的两份算不同内容。
- 导入安全：wrapper 文件夹、根级白名单外 entry、路径穿越、Windows 保留名、仅大小写不同的重名、NFC/NFD 冲突、symlink、加密/分卷 ZIP、entry 数与解压总量超限。
- launch.json 校验：`targets` 为空数组、`id` 非法或仅大小写重名、`label` 超 40 字符、`executable` 越界/不存在、`arguments` 含 `"` 或换行、`workingDir` 逃出 `Program/`、`profile` 指向不存在的 key、`preCommands` 超过 16 条、未知 profile 字段、`extra` 段名不在白名单、`extra` 与一等字段撞键——逐条应拒绝并给出字段路径；`default` 省略时取 `targets[0]`、指向不存在时拒绝。
- launch.json → dosbox.conf：省略 profile 时 conf 只有基础覆盖与 autoexec；落位（`machine`/`memsize` → `[dosbox]`，`cycles`/`core` → `[cpu]`，`sound` → `[sblaster]`/`[gus]`/`[mixer]`，`extra` 逐条进对应段）；`sound` 的两个 sb token 并存应拒绝、`none` 与其他 token 并存应拒绝、`sound: []` 不写任何声音键；`cycles` 接受整数与 `"auto"`/`"max"`、拒绝 `3000.0`；`memsize` 超出 1–63 被拒绝；段序与段内字母序稳定（同一输入两次生成字节相同）；`workingDir` 生成 `cd`（`.` 时省略）；`preCommands` 顺序与白名单（`cd`/`loadfix`/`set`/`imgmount` 通过，裸 `MOUNT`、盘符、`..` 越界被拒）；含空格的 `arguments` 与 `executable` 加引号；`-noconfig -conf` 参数拼装；本地编辑过的 `launch.json` 在启动前被重新校验。
- 单 DOSBox 路径：`config.json` 只有 `dosbox.path`；旧结构（`versions[]` + `default`）**不解析、不迁移**——反序列化失败即按默认值重建，不写任何兼容分支；路径缺失时报错指向设置页而非静默失败。
- UI：单 target 不渲染下拉箭头；多 target 下拉列出 `label` 与 `executable`；运行中下拉禁用；`launch.json` 解析失败时主按钮禁用并显示原因。
- 导出：`cart.id` 不变、`revision` 只由导出提示框驱动（没有任何其他入口能改它）；§5.3 的四行矩阵各一条用例——用户改过的文件进包、程序改过的文件用归档版、程序生成的存档被跳过、归档有而 `installed` 缺的文件保留归档版；改 metadata/作者后 `hash` 变、`hash` 文件同步；换封面后 `hash` 更新；`launch.json` 的本地编辑进入导出包；包内不含 `Runtime/` 任何内容；导出结果能被自己的导入校验接受（往返测试）；无 `author` 的 cart 导出后仍无 `author`（不写空对象）；导出中断后原归档不被破坏（原子 rename）；dirty 判定不因 `State/` 里的存档而误报。
- 运行：启动不触发解压（用假 `Program/` 断言无 IO）；基线生成与退出比对的四种情形（新增、修改、删除 State 文件、只删 cart 文件）；`running` 残留时下次启动补比对；`Program/` 缺失时恢复解压并覆盖 State。
- 用户自备 DOSBox：默认版本路径缺失/不可执行时启动前报错且不生成 conf；`-version` 探测失败仍能生成 conf（头注释记 `unknown`）并正常启动；conf 里出现未知键时不中止启动；`mapper.map` 文件名不含版本号。
- SQLite：schema 初始化、`discover_carts` 排序、按 `package_hash` 查重复、summaries UPSERT。

## 8. 已确认决策与遗留问题

### 8.1 已确认

1. **完全不向后兼容**：根级 `version = 1`；旧 cart 拒绝导入；旧 library 不迁移、不识别、不提供转换工具；`config.json` 结构对不上也直接按默认值重建。任何地方都不写兼容分支（§0.1）。
2. **导出 = 重建 manifest**，不做字节复制（§5.3），写临时文件后原子 rename。
3. **`program.*` 按列存储**：标量一列一项，嵌套结构保留 JSON 列（§4）。
4. **没有基线覆盖集**：`dosbox.conf` 每次启动由 `launch.json` 生成，只写基础覆盖 + profile + `[autoexec]`，其余全取本机 DOSBox 内置默认值；启动方式 `-noconfig -conf`（§1.3、§1.4）。
5. **身份 = UUID + revision，内容 = hash**：`cart.id` 永不变，`cart.revision` 由作者决定，`hash` 全自动。身份是声明，内容哈希是事实，两者互不证明（§2.1）。
6. **放弃内容寻址**，不做 `program` / `config` 两级派生哈希，也不做"同一程序不同配置"分组——配置是升级的一部分（§2.1.1）。
7. **启动不解压**：解压只发生在导入/重置/修复；存档增删由"启动写基线 + 退出比对"表达，取消常驻 watcher（§5.2）。
8. **`preCommands` 白名单**：`cd` / `loadfix` / `set`（仅 BLASTER、SOUND）/ `imgmount`，禁裸 `MOUNT`（§1.3）。
9. **不做 canonical JSON**：所有文件按原始字节哈希，格式变化即内容变化（§2.2）。
10. **导入安全检查**：路径穿越、保留名、大小写/NFC 冲突、符号链接、加密/分卷、entry 数与解压总量上限（§5.1）。
11. **不扫盘、不读用户 `dosbox.conf`**：只在必要时用用户在设置里填的显式路径，`-noconfig` 保证隔离。
12. **`hash` 移出 manifest，改为根级文件且不带前缀**：否则改 manifest 不改变哈希，完整性覆盖不到唯一一个声明文件；前缀在只剩一个哈希后没有消歧作用，算法世代由根级 `version` 承担（§1.1.1）。
13. **manifest 顶层只有 `cart` 与 `program`，`version` 拍平到根级**：不设 `format` 包裹层，`version`（格式）与 `cart.revision`（cart 版本）靠命名区分，不靠层级（§1.2）。
14. **`cart` 承载身份、版本与来源**：`id` / `revision` / `author`（可选）/ `tool` / `createdAt`。不再设 `build` 块。
15. **`author` 不是必填**：没有作者是合法状态；出现时 `name` 必须非空、`email` 可选。DB 对应 `author_name`/`author_email` 可空。
16. **`installed/<id>/Config/launch.json` 可直接编辑**：不影响 `id`、不改目录名，只让 `hash` 变化，导出时体现为下一个 revision（§5.5）。
17. **导出从 `installed/` 取内容**：`Program/**` 以 `installed/` 为准，按 §5.3 的四行矩阵用 `Runtime/State/` 排除存档；这样用户放进 `installed/` 的补丁、替换的 exe 能进下一次导出。
18. **`revision` 只由导出提示框驱动**：cart 详情页不提供直接编辑，避免"内容没变版本号跳了"或"内容变了版本号没动"（§2.4）。
19. **DOSBox 由用户自备，不分发，且只有一个**：不做捆绑、不做首次运行下载；`config.json` 只存 `dosbox.path` 一个路径，不扫盘、不读用户 conf。Retrium 只对 0.74-3 保证行为，其他实现 best-effort——因此只写跨实现稳定的键、必须成立的项显式写、版本探测失败不阻断、未知键按告警处理（§0.13、§1.4.1）。
20. **多 DOSBox 版本支持被移除**：`versions[]` / `default` / 版本选择器全部删除，**不写任何旧配置迁移代码**（读不出来就用默认值重建，用户重设一次路径）。`RunSplitButton` 的下拉改为 `targets` 列表，单 target 时退化为普通按钮，运行中禁用（§5.6）。
21. **`launch.json` 字段级细则定稿**：target / profile 两张字段表 + `sound` 映射表 + `extra` 规则 + 固定输出顺序；schema 关闭（未知 profile 字段拒绝），逃生口只有 `extra`（§1.3）。

### 8.2 本轮范围外

- **存档单独导出/导入**：`Runtime/State/` 的位置与语义已定（§3），但"把存档导成文件/从文件导入"的格式与流程未设计。
- **DOSBox 分发与 GPL**：已决定不分发，因此不需要解决（记录在此仅说明它被主动放弃了，不是遗漏）。若将来改为随包分发，受影响的是 §0.13、§1.4.1 的四条兜底约定与 `tauri.conf.json` 的打包方式。
