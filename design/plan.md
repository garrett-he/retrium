# Retrium Cart v2 实施计划

> 输入：[`CART_FORMAT_V2.md`](./CART_FORMAT_V2.md)（§8.1 共 21 条已确认决策，无待决策项）
> 产出：可运行的 v2 实现 + 与 Rust 结果一致的 Python 校验脚本
> 前提：应用版本 0.2.1，`1.0.0` 之前不考虑任何层面的兼容（设计文档 §0.2）

## 1. 目标

把"cart = 一个带 `.retrium/` 的目录，id = 归档 SHA-1"整体换成"cart = 一个自描述的 ZIP，id = 作者声明的 UUID，内容由 hash 描述"。这不是加功能，是换数据层。

三句话验收：

1. 库里只有三种东西——`carts/<uuid>.cart`、`installed/<uuid>/`、`retrium.db`；删掉 `retrium.db` 能自己长回来。
2. 导入只认 v2，任何不符合的包给出**指名道姓**的拒绝原因（哪个字段、哪个 entry），而不是 "invalid cart"。
3. 导出 = 从 `installed/` 按矩阵取内容 → 重建 manifest → 重算 hash → 原子替换归档；导出后的包能被自己的导入流程原样接受（往返无损）。

**不做**（设计文档 §8.2）：存档单独导出/导入、DOSBox 打包分发、旧数据迁移与转换工具。

## 2. 现状 → 目标

| 维度 | 现在 | v2 | 主要落点 |
| --- | --- | --- | --- |
| 归档形态 | `carts/<sha1>/` 目录 | `carts/<uuid>.cart` 单文件 ZIP | `library.rs` |
| 身份 | 归档字节的 SHA-1 | `manifest.cart.id`（UUID）+ `revision` | `manifest.rs` |
| 完整性 | 无 | 根级 `hash` = `tree_hash(除 hash 外全部 entry)` | `hash.rs` |
| 元数据 | `.retrium/metadata.json` | 归档内 `manifest.json` + SQLite 行 | `manifest.rs` / `db.rs` |
| 启动 | 目录里有 conf 就 `-conf` | `launch.json` → 生成 `Runtime/dosbox.conf`，`-noconfig -conf` | `launch.rs` |
| 存档 | 常驻 `notify` watcher 复制到 `states/` | 启动写基线 + 退出比对 → `Runtime/State/` | `state.rs` |
| 运行汇总 | `summaries/<id>.json` | `retrium.db` 的 `summaries` 表 | `db.rs` |
| DOSBox | 多版本 `versions[]` + 选择器 | 单 `dosbox.path` + best-effort 版本探测 | `config.rs` |
| 导出 | 目录整体 zip 到另存路径 | 四行矩阵取内容 + 重建 manifest + 重算 hash | `library.rs` |

## 3. 实施策略

### 3.1 大爆炸，但分阶段可验证

不兼容是明确的，所以不存在"新旧并存"的过渡态——第一次改动就会让旧库读不出来。既然躲不掉，就不要试图让应用全程可用，而是**让每个阶段结束时有一个能亲眼验证的里程碑**：

| 阶段 | 内容 | 里程碑（手动可验） |
| --- | --- | --- |
| P0 | 纯函数地基：hash / manifest / launch / db / library / state | `cargo test` 全绿，且这些模块不依赖 Tauri |
| P1 | 接口契约：Rust DTO + TS 类型 + 命令签名 | `cargo check` + `pnpm typecheck` 同时通过 |
| P2 | 导入与发现 | 手工把一个 v2 包放进库 → 列表出现 → 数据来自 DB |
| P3 | 运行 | 点 Run 进游戏；退出后 `Runtime/State/` 出现存档；再启动存档还在 |
| P4 | 生命周期：删除 / 重置 / 修复 / 改元数据 | 重置后进度清空、`Program/` 回到出厂 |
| P5 | 导出 | 导出 → 删 `retrium.db` → 重启重建 → 再次导入同一包 → hash 一致 |
| P6 | UI：targets 下拉、单路径设置、导入冲突对话框、dirty 徽章 | 多 target cart 能分别启动；运行中下拉禁用 |
| P7 | skill 脚本与文档对齐 | `validate_cart.py` 与 Rust 对同一包给出相同 hash |

### 3.2 先定契约，再双线并行

P0 完成后，前端唯一的阻塞点是"命令叫什么、参数什么形状、返回什么字段"。所以 P1 先把 Rust DTO 与 `src/types/index.ts`、`src/lib/api.ts` 一起定下来（哪怕命令体还是 `todo!()`），之后后端（P2–P5）与前端（P6）可以互不等待。这也是为什么 T10/T11 单独成阶段而不是塞进各自模块。

### 3.3 中途每个提交都要能编译

旧代码（`sha1_of_file`、`run_watcher`、`LegacyConfig`、`.retrium` 相关路径）**不在开始删**，而是在对应功能被替换后保留到 P7 一次性清理（T32）。理由是删早了会让中途的编译/测试长时间红着，反而看不清真正的失败。

## 4. 模块划分

```
src-tauri/src/
├── hash.rs       tree_hash：输入是 (路径, 内容摘要) 集合，不是 ZIP 字节
├── manifest.rs   manifest.json 结构 + 校验；UUID / revision / 时间 / 枚举
├── launch.rs     launch.json 结构 + 校验 + 生成 dosbox.conf（唯一写 conf 的地方）
├── library.rs    库布局、ZIP 安全读写、导入/导出、四行矩阵
├── state.rs      baseline.json、退出比对、State 应用
├── db.rs         rusqlite：schema、CRUD、重建索引
├── config.rs     { library, dosbox: { path } }
└── commands.rs   Tauri 命令，只做编排与错误翻译，不放业务规则
```

三条数据流，每条只经过一个模块入口：

```
导入  .cart ──library::analyze──▶ 校验结果 ──library::apply──▶ carts/ + installed/ + db
                                              │
运行  db ──id──▶ launch.json ──launch::conf──▶ Runtime/dosbox.conf ──▶ spawn
                                                        │
                                              退出 ──state::diff──▶ Runtime/State/ + summaries

导出  installed/ + State/ + 旧归档 ──library::collect_export_entries──▶ manifest ──hash::tree──▶ carts/<id>.cart
```

## 5. 设计文档没写、实现前必须先定的 6 件事

这些是文档定到"能生成 conf"为止所留下的空白，实现时踩到会返工，先在这里拍板。

### 5.1 导入是两阶段，不是一个命令

设计文档要求"同 revision 不同 hash 默认拒绝，显式选择才替换"、"高 revision 提议升级"（§2.3），所以导入必须能**先出报告、再落盘**：

- `add_carts()`：弹选择框 → 分析每个包 → 自动执行无歧义动作（新 id 直接导入、同 revision 同 hash 幂等跳过）→ 返回 `ImportReport`，其中 `pending` 列出需要人决定的项（升级 / 冲突 / 降级 / 内容重复）。
- `resolve_import(archive, action)`：对 `pending` 项逐个执行 `Upgrade` / `Replace` / `Skip`。

`apply` 必须是"复制归档 → 解压 → 写库"三步，中途失败要回滚已创建的 `installed/<id>/`，不能留下半个安装目录。DB 写入与文件操作放在同一个事务边界内（先落盘后写库，写库失败则删掉刚建的文件）。

### 5.2 "导出"其实是两个动作，别混

- `commit_cart(id, revision)`：**库内归档**重建，覆盖 `carts/<id>.cart`。这是设计文档 §5.3 说的"导出"，也是 `revision` 唯一的写入口。
- `export_cart_file(id)`：弹保存对话框，**复制**当前归档出去分享。它不重算、不升版；内容取自 `carts/<id>.cart`。

UI 上"导出"按钮应当先 `preview_export` → 若 dirty 则提示升版 → `commit_cart` → 再问要不要另存一份。把两步合成一步会导致"我明明导出了，别人收到的还是旧版"。

### 5.3 "上次提交的 hash" 需要一个家，DB 之外

`package_hash` 存在 DB 里，但设计文档要求 DB 删了能重建（§4）。重建时若不重算每个归档的 hash，就无法判断 dirty；若重算，等于启动时把整库读一遍。

方案：`installed/<id>/Runtime/commit.json` 存 `{ revision, package_hash, manifest_version }`，在导入与 `commit_cart` 时写入。`Runtime/` 本来就是"生成物 + 本地状态"的目录，与 `baseline.json` 同级。DB 是权威，`commit.json` 是缓存；DB 缺行时用 `commit.json` 快速补索引，缺 `commit.json` 就标 dirty（内容未知，必须重算才知道）。

代价：`Runtime/` 的内容清单多一项，与设计文档 §3 的列举有偏差，需在文档里补一行。

### 5.4 hash 有两份实现，必须对拍

`skills/retrium-cart/scripts/validate_cart.py` 要在 Python 里重算同一个 `tree_hash`。两套实现漂移是这类项目最典型的暗坑（VSCode 扩展、CLI 工具都踩过）。

对策：仓库里放**黄金向量** `design/fixtures/hash-vectors.json`（若干组 `entries[]` → 期望 hex），Rust 与 Python 各有一组测试读同一个文件。任何一边改了编码方式，测试立刻红。

### 5.5 校验 `launch.json` 时 `Program/` 还没落盘

设计文档要求导入时校验 `executable` 存在（§1.3）。但导入第 2 步是在 ZIP entry 流上做的，此时还没解压。所以"文件存在"必须对**ZIP entry 列表**做大小写不敏感的匹配，而不是 `Path::exists()`。同一个索引也用来校验 `preCommands` 里 `imgmount` 指向的 `Resources/*.ISO`。

解压后不再重复校验存在性（否则用户删个文件就让 cart 打不开）；只有"是否越界"这类结构性规则在生成 conf 前再跑一次。

### 5.6 错误必须带字段路径

拒绝原因要能直接贴给 cart 作者：`targets[1].executable 不存在：SOUND/SETUP.EXE`、`profiles.svga-high.extra 段名不在白名单：render2`。做法是自定义 `struct FieldError { path: &'static str, message: String }`，由 `thiserror` 汇总，`commands.rs` 只负责 `.to_string()` 给前端。禁止在业务层拼 `format!("invalid config")`。

## 6. 风险

| 风险 | 后果 | 对策 |
| --- | --- | --- |
| `installed/` 与归档分歧，State 漏记导致导出丢文件 | 静默数据丢失 | 四行矩阵只有**一份实现**（`collect_export_entries`），dirty 判定、预览、实际导出全部调用它；往返测试兜底 |
| 大小写 / NFC 冲突（Windows、macOS 默认文件系统） | 解压覆盖、静默丢文件 | 导入期建 `lowercase + NFD` 归一化索引，冲突即拒绝（§5.1 第 6 步） |
| ZIP 里的 symlink / 加密 / 路径穿越 | 写到库外 | 在 `library::extract` 里显式检查 `unix_mode()` 与中央目录标志位，不依赖 `enclosed_name()` 一个判断 |
| `mtime` + `size` 判定改动 | 同尺寸同秒改动漏记 | 已知限制。退出比对只用于存档层，漏记的后果是"这次改动没进 State"，不是丢 cart 数据 |
| 崩溃残留 `running` 与半截 `Program/` | 存档错乱 | 启动时若见 `running` 先补比对；`baseline.json` 缺失则放弃本轮比对（不清 State） |
| DB 删库重建丢 `summaries` | 运行次数归零 | 明示于 UI 与文档；`Runtime/commit.json` 保证重建后 dirty 判定仍正确 |
| 用户自备 DOSBox 版本差异 | conf 键无效、启动失败 | 只写跨实现稳定键（§1.4.1）；`-noconfig -conf` 被拒时明确报"不受支持"并指向设置页，不重试 |
| 前端大改导致 6 个测试文件同时红 | 分不清是回归还是没改完 | 先做 P1 契约，UI 改动按组件分批（T24–T29），每批单独跑测试 |

## 7. 验证

单任务判据写在 `tasks.md` 里。整体只认这四条：

1. **往返**：导出 → 移动到新 library → 导入 → `package_hash` 与导出时一致，`Program/` 文件数一致。
2. **重建**：删 `retrium.db` → 重启 → 全部 cart 复现，dirty 状态与原库一致。
3. **存档**：跑一次游戏 → 存档进 `State/` 不进归档 → 导出包里没有存档 → 重置后存档清空、`Program/` 回出厂。
4. **拒绝**：构造 8 个坏包（缺 hash、manifest 版本错、路径穿越、symlink、根级多余目录、launch.json 非法、executable 不存在、加密 ZIP），逐个给出可读原因且库内无残留。

## 8. 与设计文档的已知偏差

1. `Runtime/commit.json`（§5.3 上文的决定）——设计文档 §3 的 `Runtime/` 清单未列。
2. `reset_cart` / `repair_cart` / `preview_export` / `commit_cart` / `get_cart_launch` 是设计文档 §6 未点名的命令，属于把 §5.4、§5.6 的流程落成 API 时的必要拆分。
3. `add_carts` 拆成 `add_carts` + `resolve_import` 两个命令（§5.1 上文）。

这三条不改变任何格式与语义，只影响实现边界；确认后应回写进 `CART_FORMAT_V2.md` §6。
