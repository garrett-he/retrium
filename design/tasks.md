# Cart v2 任务清单

> 计划见 [`plan.md`](./plan.md)，设计见 [`CART_FORMAT_V2.md`](./CART_FORMAT_V2.md)。
> 规模：S ≈ 半天内，M ≈ 一天，L ≈ 需要拆开来做。
> 状态：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成。**按编号顺序做**，标⛓的任务依赖前一个编号。

## 总览

| 阶段 | 任务 | 里程碑 |
| --- | --- | --- |
| P0 地基 | T01–T09 | `cargo test` 全绿，模块不依赖 Tauri |
| P1 契约 | T10–T11 | `cargo check` + `pnpm typecheck` 同时通过 |
| P2 导入与库 | T12–T15 | 手工放一个 v2 包 → 列表出现，数据来自 DB |
| P3 运行 | T16–T18 | 点 Run 进游戏，退出后存档进 `State/` 且再次启动仍在 |
| P4 生命周期 | T19–T20 | 重置清空进度、`Program/` 回出厂 |
| P5 导出 | T21–T23 | 导出 → 删 DB → 重建 → 再导入 → hash 一致 |
| P6 UI | T24–T29 | 多 target 可分别启动；运行中下拉禁用 |
| P7 skill 与收尾 | T30–T35 | Python 与 Rust 对同一包给出相同 hash |

---

## P0 地基

### [x] T01 依赖与模块骨架
- 规模 S · 无依赖
- **改**：`src-tauri/Cargo.toml` 增 `rusqlite`（`bundled`，避免依赖系统 sqlite）、`sha2`、`uuid`（`v4` + `v7`）、`thiserror`；**先不删** `sha1`/`hex`/`notify`（P7 清理）
- **建**：`hash.rs` `manifest.rs` `launch.rs` `library.rs` `state.rs` `db.rs`，在 `lib.rs` 里 `pub mod`
- **完成**：`cargo check` 通过，旧代码一行未动

### [x] T02 tree_hash
- 规模 M · ⛓T01
- **改**：`hash.rs`
- **做**：
  - `fn tree_hash<I: Iterator<Item = (String, [u8; 32])>>(entries: I) -> String`；每条记录 `u32le(len) || path || digest`，字节序排序后拼接再 SHA-256，输出 64 位小写 hex
  - 两个产出方：`digest_zip(archive)`（流式读 entry，跳过根级 `hash` 与目录 entry）、`digest_dir(dir)`（导出前算待写集合）
  - 路径统一 `/`，长度前缀不可省
- **建**：`design/fixtures/hash-vectors.json`（空集合、单文件、多文件乱序、`("ab")` vs `("a","b")`、含 UTF-8 中文路径、含空文件）
- **完成**：单元测试逐条断言黄金向量；空集合 = `e3b0c442…b855`；同一内容两种打包顺序结果相同

### [x] T03 manifest 结构与校验
- 规模 M · ⛓T01
- **改**：`manifest.rs`
- **做**：`Manifest { version, cart: CartBlock, program: ProgramBlock }`；`CartBlock { id, revision, author: Option<Author>, tool: Tool, createdAt }`；`ProgramBlock { name, language, release, category, developer, publisher, series, tags, players, platform, dos, externalIds }`
  - `validate()` 返回 `FieldError`（带路径），覆盖：`version` 缺失/非整数/≠1（分别映射到 `Not a Retrium cart` / `Unsupported cart version: N`）、`id` 必须是小写带连字符 UUID、`revision ≥ 1`、`tool` 三字段非空、`createdAt` 合法 ISO 8601、`author` 可缺省但出现时 `name` 非空、`email` 有值才校验、`language` 合法 BCP 47、`category` 在 8 值枚举内、`externalIds` 键值均为字符串
  - `to_json()` 用固定字段序（serde 结构体声明序）输出 pretty JSON
- **完成**：合法/非法各 1 组用例；缺 `author` 通过；`author.name = "  "` 拒绝并给出 `cart.author.name`；未知根级键被忽略而非报错

### [x] T04 launch.json 结构与 target/profile 校验
- 规模 M · ⛓T01
- **改**：`launch.rs`
- **做**：`Launch { version, default: Option<String>, targets: Vec<Target>, profiles: BTreeMap<String, Profile> }`
  - target：`id` `^[a-z][a-z0-9_-]{0,31}$` 且仅大小写不同也算重名、`label` 1–40 字符、`executable` 相对路径且不得绝对/盘符/越界、`arguments` 每项 ≤260 且不含 `"`/换行/Tab、`workingDir` 默认 `.` 且规范化后仍在 `Program/` 内、`profile` 必须存在、`preCommands` ≤16
  - profile 关闭式 schema：只允许 `machine`/`memsize`/`cycles`/`core`/`sound`/`extra`，其余字段报错点名
  - `machine` 13 值枚举、`memsize` 1–63、`cycles` 整数 ≥1 或 `"auto"`/`"max"`（拒绝 `3000.0`）、`core` 4 值
  - `default` 省略合法（取 `targets[0]`），指向不存在则拒绝
- **完成**：设计文档 §1.3 两张字段表逐行有用例；错误信息含 `targets[1].executable` 这类路径

### [x] T05 launch.json 的 sound 与 extra 规则
- 规模 M · ⛓T04
- **改**：`launch.rs`
- **做**：
  - `sound` token 映射：`sb1/sb2/sbpro1/sbpro2/sb16/gb` → `[sblaster] sbtype=`（互斥，最多一个）；`gus` → `[gus] gus=true`；`none` → `[mixer] nosound=true`（独占）；未知 token 拒绝；`[]` 不写任何声音键
  - `extra` 键必须是 `段名.键名`，段名在 13 项白名单内（无 `autoexec`），键名不校验，值必须是字符串且不含换行/`\0`/`[`/`]`
  - 撞键检测：`dosbox.machine`、`dosbox.memsize`、`cpu.cycles`、`cpu.core`、`sblaster.sbtype`、`gus.gus`、`mixer.nosound`，外加基础覆盖 `sdl.mapperfile`、`dosbox.captures`
- **完成**：`["sb16","sbpro2"]` 拒绝；`["none","sb16"]` 拒绝；`{"cpu.cycles":"3000"}` + `cycles: 3000` 拒绝并点名；段名 `render2` 拒绝

### [x] T06 生成 dosbox.conf
- 规模 L · ⛓T05
- **改**：`launch.rs`（`fn render_conf(launch, target_id, installed_dir, ctx) -> String`）
- **做**：
  - 头注释：Retrium 版本、生成时间、探测到的 DOSBox 版本、target、profile
  - 基础覆盖固定写 `[sdl] mapperfile=<installed>/Runtime/mapper.map`、`[dosbox] captures=<installed>/Runtime/captures`
  - profile 一等字段落位（`machine`/`memsize` → `[dosbox]`，`cycles`/`core` → `[cpu]`，`sound` 按 T05，`extra` 逐条进对应段）
  - 固定段序 `sdl → dosbox → render → cpu → mixer → midi → sblaster → gus → 其余字母序 → autoexec`，段内键字母序，空段不输出
  - `[autoexec]`：`MOUNT C "<abs Program>"` → `C:` → `cd`（`.` 时省略）→ `preCommands` → `executable` + `arguments`（含空格整体加双引号）
  - `preCommands` 白名单二次校验：`cd`/`loadfix`/`set`（仅 BLASTER、SOUND）/`imgmount`（限 `Program/`、`Resources/`）；禁裸 `MOUNT`、盘符、`|&><`、越界 `..`
- **完成**：同一输入两次生成字节完全相同；`cd` target（无 profile）只输出基础覆盖 + autoexec；含空格参数被正确引号包裹

### [x] T07 SQLite
- 规模 M · ⛓T01
- **改**：`db.rs`
- **做**：`Connection`（`Mutex` 持有）、`ensure_schema()`（`PRAGMA user_version` 不匹配则删库重建）、`upsert_cart`、`get_cart`、`list_carts`（按 `name` 排序）、`delete_cart_row`、`find_by_package_hash`、`upsert_summary`、`list_summaries`
- **完成**：schema 与设计文档 §4 逐列一致；`user_version` 改成 99 → 重开自动重建空库；`package_hash` 重复查询命中

### [x] T08 库布局与 ZIP 安全读写
- 规模 L · ⛓T02
- **改**：`library.rs`
- **做**：
  - 路径解析：`carts_dir`、`installed_dir`、`archive_path(id)`、`install_path(id)`；`raw_path` 存相对路径
  - `open_archive()` 返回 entry 索引（路径 → 大小、unix mode、是否目录）
  - `extract(archive, dest)`：跳过 `hash`/`manifest.json`，只解 `Program/**`、`Config/launch.json`、`Resources/**`；拒绝 symlink、路径穿越、绝对路径、Windows 保留名、大小写/NFC 冲突、加密/分卷；entry 数与解压总量上限
  - `write_archive(entries, dest)`：写同目录临时文件 → 成功后原子 rename；**不写目录 entry**（保证 hash 与打包工具无关）
- **完成**：8 个坏包夹具逐个被拒且目标目录无残留；往返解压再打包，`tree_hash` 不变

### [x] T09 存档差异层
- 规模 M · ⛓T08
- **改**：`state.rs`
- **做**：
  - `snapshot(program_dir) -> Baseline`（`path` → `size` + `mtime_ns`，不读内容）
  - `diff(baseline, program_dir, state_dir)`：新增或 size/mtime 变化 → 复制进 `State/`（保持相对路径）；`State/` 里有但 `Program/` 里没了 → 从 `State/` 删除；只在归档里有而 `Program/` 没了的 → 不动
  - `apply(state_dir, program_dir)`：启动前把 `State/**` 覆盖进 `Program/`
  - `clear(state_dir)` + 删除 `baseline.json`/`running`
- **完成**：四种情形（新增/修改/删除/只删归档文件）各一条用例；`apply` 后 `Program/` 与 `State/` 一致

---

## P1 契约

### [x] T10 Rust DTO 与命令签名
- 规模 M · ⛓T07 T08
- **改**：`lib.rs`、`commands.rs`
- **做**：定稿并留 `todo!()` 实现——
  `discover_carts` · `add_carts` → `ImportReport` · `resolve_import(archive, action)` · `get_cart_launch(id)` → `LaunchInfo{default_target, targets[{id,label,executable}]}` · `run_cart(id, target_id?)` · `stop_cart(id)` · `stop_all_carts` · `list_cart_processes` · `get_cart_process(id)` · `open_cart_folder(id)` · `delete_cart(id)` · `reset_cart(id)` · `repair_cart(id)` · `preview_export(id)` → `{dirty, revision, next_revision}` · `commit_cart(id, revision)` · `export_cart_file(id)` · `update_cart_info(id, info)` · `get_cart_summary(id)` / `get_cart_summaries` · `get_dosbox_path` / `set_dosbox_path` / `probe_dosbox` · `get_setup_state` / `complete_setup` / `set_library_directory` / `pick_library_directory` / `pick_dosbox_executable`
  - 删除 `add_dosbox_version` / `remove_dosbox_version` / `set_default_dosbox_version`
  - `Cart` 改为 `{ id, revision, author?, tool, createdAt, info: CartInfo, cover? }`，去掉 `dir`
- **完成**：`cargo check` 通过；`invoke_handler` 列表与上述一致

### [x] T11 TS 类型与 api.ts
- 规模 S · ⛓T10
- **改**：`src/types/index.ts`、`src/lib/api.ts`
- **做**：按 T10 逐个镜像；`Manifest`/`Launch`/`ImportReport`/`LaunchInfo` 类型；删 `DosboxVersion`/`DosboxVersions`
- **完成**：`pnpm typecheck` 通过（此阶段组件仍会报错，先只保证类型文件自身正确，组件在 P6 修）

---

## P2 导入与库

### [x] T12 config.json 单路径
- 规模 S · ⛓T01
- **改**：`config.rs`
- **做**：`Config { library, dosbox: { path } }`；删 `DosboxVersion`/`DosboxConfig.versions`/`default`/`default_version()`/`version()`/`LegacyConfig`/`From<LegacyConfig>`
  - 反序列化失败 → `Config::load()` 返回 `None` → 启动用默认值重建，**不写任何兼容分支**（§0.1）
  - 新增 `probe_version(path) -> Option<String>`：跑 `-version` 取首行，失败返回 `None`
- **完成**：旧结构 JSON 读不出来且不迁移；`probe_version` 对不存在的路径返回 `None` 不 panic

### [x] T13 导入分析阶段
- 规模 L · ⛓T02 T03 T04 T08 T11
- **改**：`library.rs`、`commands.rs`
- **做**：`analyze(archive) -> ImportOutcome`
  1. 只读 ZIP 中央目录 + 三个小文件（`hash`/`manifest.json`/`Config/launch.json`），不落盘
  2. 形状预检：根级有 `manifest.json`、根级 entry 全在白名单内、`hash` 单行 64 hex
  3. `tree_hash` 重算比对（一次全流），不符拒绝
  4. `manifest.validate()` + `launch.validate()`；`executable`/`imgmount` 目标用 **ZIP entry 索引**做大小写不敏感匹配（此时尚未解压）
  5. 判 `(id, revision, hash)`：无 id → `New`；同 revision 同 hash → `Idempotent`；高 revision → `Upgrade`；同 revision 异 hash → `Conflict`；低 revision → `Downgrade`；`hash` 命中别的 cart → `Duplicate`（附已有 id）
- **完成**：8 个坏包夹具各给出可读原因；每个 `pending` 项带 `archive_path` 供后续 `resolve_import`

### [x] T14 导入落盘阶段
- 规模 L · ⛓T13
- **改**：`library.rs`、`commands.rs`、`db.rs`
- **做**：
  1. 拒绝在运行中导入同一 id（查 `processes`）
  2. 复制归档字节为 `carts/<id>.cart`（`New`）或临时文件 + 原子 rename（`Upgrade`/`Replace`）
  3. 解压到 `installed/<id>/`；`Upgrade` 时先清空 `Program/` 再解压，最后 `state::apply` 把旧 `State/` 覆盖回去
  4. 写 `Runtime/commit.json`（`revision`/`package_hash`/`manifest_version`）
  5. 写 `carts` 行；任何一步失败删除新建的 `installed/<id>/` 与归档，不留半成品
  6. `add_carts` 返回 `ImportReport { imported[], skipped[], pending[] }`；`resolve_import(archive, action)` 处理 `pending`
- **完成**：`Upgrade` 后 `State/` 里的存档仍在；`Conflict` 默认不覆盖磁盘；中途失败后目录无残留

### [x] T15 discover 改为读 DB
- 规模 M · ⛓T14
- **改**：`commands.rs`、`db.rs`
- **做**：`discover_carts` 读 `carts` 表；启动时做一次轻量对账——枚举 `carts/*.cart` 与 DB 主键比对，缺行的用 `Runtime/commit.json` + 归档内 `manifest.json` 补索引，多余的删行；`cover` 取 `installed/<id>/Resources/cover.png` 是否存在
- **完成**：手工删一行 → 重启自动补回；手工删归档 → 重启自动删行；DB 整体删掉 → 重启全部复现（依赖 `commit.json`）

---

## P3 运行

### [x] T16 run_cart 主链路
- 规模 L · ⛓T06 T09 T11
- **改**：`commands.rs`、`launch.rs`
- **做**：
  1. 取 `config.dosbox.path`，不存在或不可执行 → 报错并提示去设置页，**不生成 conf**
  2. 读 `installed/<id>/Config/launch.json`，就地重新校验（用户可能改过）
  3. `render_conf` 写到 `Runtime/dosbox.conf`
  4. `Program/` 缺失才从归档解压并 `state::apply`
  5. `snapshot` 写 `baseline.json`，创建 `running`，`spawn(<exe>, ["-noconfig","-conf",conf])`，工作目录 `Program/`
  6. 进程立刻退出且 stderr 提示无法识别 `-noconfig` → 报"该 DOSBox 不受支持"，不重试
- **完成**：`target_id` 为 `None` 走 `default`，非法 id 报错；跑完 `dosbox.conf` 与期望文本逐字节一致

### [x] T17 退出比对、stop、崩溃恢复
- 规模 M · ⛓T16
- **改**：`commands.rs`
- **做**：`child.wait()` 或 `kill_tx` 后 `state::diff` → 删 `running` → `UPSERT summaries`（`runs`、`elapsed`、`last_run`）→ 移出 `processes`；启动时若见 `running` 且 `baseline.json` 存在，先补比对再继续；同 cart 第二次 Run 直接拒绝
- **完成**：kill 后比对仍执行；`running` 残留的模拟场景能补回存档；`summaries` 累加正确

### [x] T18 get_cart_launch
- 规模 S · ⛓T16
- **改**：`commands.rs`
- **做**：返回 `{ default_target, targets: [{id, label, executable}] }`；`launch.json` 解析失败返回 `{ error: "启动配置无效：targets[1].executable 不存在" }`，不猜
- **完成**：坏 `launch.json` 返回可读错误而非空列表

---

## P4 生命周期

### [x] T19 删除 / 重置 / 修复
- 规模 M · ⛓T17
- **改**：`commands.rs`、`library.rs`
- **做**：`delete_cart`（归档 + `installed/` + 两表行，运行中拒绝）；`reset_cart`（清 `Program/`、`State/`、`baseline.json`、`running`，重解压）；`repair_cart`（只重解压 `Program/` 再 `apply` `State/`）
- **完成**：重置后 `Program/` 与归档解压结果一致且 `State/` 为空；修复后存档仍在

### [x] T20 update_cart_info 写 DB
- 规模 M · ⛓T15
- **改**：`commands.rs`、`db.rs`
- **做**：`UPDATE carts` 覆盖 program 标量与 `author_*`；封面变更同步写 `installed/<id>/Resources/cover.png`；**不动归档、不动 `revision`、不重算 hash**（下次 `commit_cart` 才落进 manifest）
- **完成**：改标题后 `preview_export` 报 dirty；`package_hash` 仍是归档的真实 hash

---

## P5 导出

### [x] T21 collect_export_entries（四行矩阵）
- 规模 L · ⛓T09 T14
- **改**：`library.rs`
- **做**：唯一实现，返回 `Vec<(zip_path, Source)>`，`Source = Installed(PathBuf) | Archive(String)`
  - `installed` 有 / `State` 无 → `Installed`
  - `installed` 有 / `State` 有 / 归档有 → `Archive`
  - `installed` 有 / `State` 有 / 归档无 → 跳过
  - `installed` 无 / 归档有 → `Archive`
  - 另加 `Config/launch.json`、`Resources/**` 取 `installed`
  - 输出按路径字节序排序
- **完成**：四行各一条用例；`Runtime/` 任何内容都不在结果里

### [x] T22 commit_cart 与 export_cart_file
- 规模 L · ⛓T21 T03 T02
- **改**：`library.rs`、`commands.rs`、`db.rs`
- **做**：
  - `preview_export`：用 T21 算出待写集合 → `tree_hash` → 与 `package_hash` 比 → `{dirty, revision, next_revision}`
  - `commit_cart(id, revision)`：校验 `revision ≥ 当前`；重建 manifest（沿用 `id`，`tool`/`createdAt` 重写，`author` 取自 DB，元数据取自 DB）→ 写 `hash` → 打包（先临时文件再原子 rename）→ `UPDATE carts SET revision, package_hash, tool_json, created_at` → 刷新 `Runtime/commit.json`
  - `export_cart_file(id)`：保存对话框，复制 `carts/<id>.cart`，不重算
- **完成**：导出包里只有 `hash`/`manifest.json`/`Program/**`/`Config/launch.json`/`Resources/**`；导出后自己的导入校验通过；中断后原归档完好

### [x] T23 dirty 判定接进 discover
- 规模 S · ⛓T22
- **改**：`commands.rs`、`db.rs`
- **做**：`discover_carts` 顺带返回 `dirty`（读 `commit.json` 与 `package_hash` 比，不扫文件）；未知时 `null`
- **完成**：改 `launch.json` 后列表徽章出现；导出处消失

---

## P6 UI

### [x] T24 RunSplitButton 改 targets
- 规模 M · ⛓T11 T18
- **改**：`src/components/RunSplitButton.tsx`
- **做**：主按钮 = `default_target` 的 `label`；下拉列 targets（`label` + 小字 `executable`），点击不改写 `default`；单 target 不出箭头；运行中禁用；`launch.json` 无效时按钮禁用并显示原因；删掉 DOSBox 版本选择器
- **完成**：3 个用例（单 target 无箭头 / 多 target 列出且点击传对 id / 运行中禁用）

### [x] T25 CartMenu、RunningPage、CartPage
- 规模 M · ⛓T24
- **改**：`src/components/CartMenu.tsx`、`src/pages/RunningPage.tsx`、`src/pages/CartPage.tsx`
- **做**：`Run` + `Run with…` 子菜单；`RunningPage` 显示当前 target `label`；`CartPage` 显示 `revision`、dirty 徽章、重置/修复入口
- **完成**：运行中页面能看到进的是哪个 target

### [x] T26 设置页与首次启动页单路径
- 规模 M · ⛓T12
- **改**：`src/pages/SettingsPage.tsx`、`src/pages/SetupPage.tsx`
- **做**：一个路径输入 + 浏览 + 测试 + 探测到的版本号；删掉增删条目、设为默认、版本列表全部逻辑与状态
- **完成**：路径无效时显示原因；探测失败显示"版本未知"但允许保存

### [x] T27 EditCartDialog 扩展字段
- 规模 M · ⛓T11
- **改**：`src/components/EditCartDialog.tsx`
- **做**：补 `players`、`platform`、`dos.version`、`dos.input`、`externalIds`、`author.name`/`email`；`category` 用 8 值下拉、`language` 用 BCP 47 下拉
- **完成**：全部字段编辑后能保存并回显；`author` 可留空

### [x] T28 导入结果对话框
- 规模 M · ⛓T14
- **改**：`src/pages/LibraryPage.tsx` + 新组件 `ImportReportDialog.tsx`
- **做**：展示 `imported`/`skipped`/`pending`；`pending` 每项给 `Upgrade`/`Replace`/`Skip` 三个动作，调 `resolve_import`；拒绝原因原文展示
- **完成**：冲突项默认不选"替换"；处理完全部 `pending` 后列表刷新

### [x] T29 空态与文案清扫
- 规模 S · ⛓T25
- **改**：`src/pages/*.tsx`
- **做**：删掉所有 "DOSBox version"、"archive"、"states" 一类旧措辞；空库提示改为"导入 .cart"；删 DB 重建后的提示
- **完成**：`grep -ri "dosbox version\|states/" src/` 无命中

---

## P7 skill 与收尾

### [x] T30 Python 校验脚本 v2
- 规模 L · ⛓T02
- **改**：`skills/retrium-cart/scripts/validate_cart.py`
- **做**：校验 ZIP 根布局与白名单、`hash` 文件、`manifest` 结构、`launch.json` 结构；重算 `tree_hash`（与 Rust 同编码）；读 `design/fixtures/hash-vectors.json` 自检
- **完成**：对 Rust 生成的包给出 `OK`；对 T13 的 8 个坏包给出对应原因；黄金向量全过
- **备注**：`CartSource` 统一 `cart`/文件夹两种输入；`--write-hash` 未通过校验时拒写。9 个坏包逐一给出预期原因（wrapper / 多余根条目 / 路径穿越 / 保留名 / 大小写重名 / hash 被改 / 缺 `launch.json` / revision 非法 / 可执行文件缺失）

### [x] T31 skill 文档与模板
- 规模 M · ⛓T30
- **改**：`skills/retrium-cart/SKILL.md`、`references/cart-format.md`、`assets/cart-template/`
- **做**：全面改为 v2 布局；模板改成 ZIP 根布局（`manifest.json` + `Config/launch.json`，删 `.retrium/`）
- **完成**：按模板造一个 cart 能通过 `validate_cart.py`
- **备注**：`references/dosbox-tuning.md` 一并重写。模板自测：复制模板 + 补 `GAME.EXE`/`SETUP.EXE` + `--write-hash` → `0 error(s), 1 warning`（无封面）

### [x] T32 清理死代码与依赖
- 规模 M · ⛓T22 T26
- **改**：`commands.rs`、`config.rs`、`Cargo.toml`、`lib.rs`
- **做**：删 `sha1_of_file`、`run_watcher`、`create_zip`/`extract_zip` 旧实现、`summary_path`/`load_summary`/`save_summary`、`LegacyConfig`、`states/` 与 `summaries/` 相关路径、旧 `Cart.dir` 用法；Cargo 删 `sha1`/`hex`/`notify`
- **完成**：`cargo clippy -D warnings` 通过；`grep -rn "sha1\|notify\|\.retrium" src-tauri/src/` 无命中
- **备注**：`thiserror` 也一并删除（已全部改用 `FieldError` 手写实现）

### [x] T33 Rust 测试补齐
- 规模 L · ⛓T32
- **改**：各模块 `#[cfg(test)]`
- **做**：按设计文档 §7 逐条落测；`cargo tarpaulin --fail-under 80` 达标
- **完成**：`just test` 一键通过
- **备注**：`just test` = 前端覆盖率 + `cargo test`，本机通过（86 个 Rust 用例）。覆盖率门槛拆成 `just coverage`——`cargo-tarpaulin` 只在 Linux 可用，Windows 上装不了，见 `AGENTS.md`

### [x] T34 前端测试更新
- 规模 L · ⛓T29
- **改**：`App.test.tsx`、`LibraryPage.test.tsx`、`CartPage.test.tsx`、`RunningPage.test.tsx`、`SettingsPage.test.tsx`、`SetupPage.test.tsx`
- **做**：mock 新命令签名；补 T24–T28 的交互用例
- **完成**：`pnpm test` 全绿，`pnpm lint` 无告警
- **备注**：新增 `src/__mocks__/backend.ts`，为每条命令提供默认应答，遇到未知命令直接报错，避免 mock 悄悄过期。70 个用例

### [x] T35 文档回写
- 规模 S · ⛓T32
- **改**：`AGENTS.md`、`README.md`、`design/CART_FORMAT_V2.md` §6
- **做**：数据模型与命令列表更新；把 `plan.md` §8 的三条偏差（`commit.json`、新增命令、导入两阶段）写进设计文档
- **完成**：文档与代码的命名字段一一对得上
- **备注**：三条偏差记在 `CART_FORMAT_V2.md` §6.1「落地情况」；`justfile` 拆出 `coverage`
