# Android v0.1.10 签名预检草案（不可执行、不可发布）

本目录只保存公开元数据与后续审查计划。`enabled: false`；已实现只读验证器和一次性测试身份的签名演示；原社区身份签名器及激活工作流仍未实现。示例不是可激活的 Actions 配方，不得移入 `.github/workflows`。没有签名环境、秘密引用、密钥或凭据附件，不运行、安装 APK，不发布、不合并。

## 已知输入

`candidate-pins.json` 固定已发布桌面源码 `2ed55016` 的正式候选 run `44228163780` / attempt 1、原未签名 Android artifact `14395695421`。本轮从 GitHub REST 独立读取 25 个精确 job，均 completed/success；没有挪用旧 v0.1.9 的 26 项分布式 receipts。

ZIP 和两个成员的大小、SHA256 来自本次实际下载核验结果。APK 预期包名 `com.zhiweixiao.t3code.zhcn`、版本 `0.1.10-zh.1`、versionCode `1000418`（已发布旧版为 `1000416`）、仅 ARM64。版本等仍是验证目标，不是本目录已经完成 Android 工具验收的声明。云端只读检查 ZIP 内 native ABI 仅 arm64，未见 v1 签名项或 APK Signing Block 魔数；这不能替代 `apksigner verify`。未签名 APK 不能作为可安装发布。此草案未在本地重跑 apksigner；生产日志中的元数据核查不替代未来签名前的真实工具验证。

## 后续实现与独立审核清单

1. 使用公开仓库的免费标准 Ubuntu runner，只读 token；分别固定候选源码 SHA/tree/workflow blob 和未来签名工具 workflow commit/blob。操作提交、候选提交、运行 ID/attempt 不可混同。精确工具 SHA 当前为空，因此必须拒绝激活。
2. 实现纯验证阶段：实时检查原 run 成功且仍为 attempt 1、精确 25 个 job 名称和 ID 全部完成成功；核对 source、tree、workflow ID/path/blob、producer 时间与上传步骤。前后重取 run/artifact 身份快照；过期、替换、重跑、缺项、skipped 均失败。
3. 流式有界下载原 artifact，实算 ZIP 大小与 SHA256；严格仅允许 pins 中两个普通文件，拒绝重复、路径穿越、symlink、目录、加密及过大解压。实算两个成员大小与 SHA256。APK 仅作为数据解析，不执行候选源码、依赖脚本或安装包。
4. 用已审 Android build-tools 检查实际包名、versionName、versionCode、ARM64-only、ZIP 对齐、未签名状态与 APK 结构。检查 `apksigner` 返回值和输出，区分“未签名”和“包损坏”。不得修改 APK 版本号来凑齐 pin；不符就停止。签名如须对齐，保留原 APK hash、对齐后 hash 和只允许的变换证据。
5. 复用 `signing/android-bootstrap` 已审 `sign_reviewed.py` / `recovery.py` 的固定身份、恢复证据、受限下载和临时密钥清理机制，不另写秘密处理方案。现有程序硬锁旧 74039745、0.1.9-zh.2/1000417 与旧 receipts，必须在隔离分支改成上述新版合同，并通过真实正例和所有身份/哈希/版本/门禁负例测试；不能仅替换 input 后启用。
6. 独立复核固定证书及 run `40649758501` 的公开恢复证据。不得重新初始化密钥、替换身份或更改签名环境权限。若恢复 artifact 过期，停止并提出新的受审恢复步骤，不能把历史记录当实时下载成功。
7. 单独审核未来准确 workflow commit/blob、工具代码及环境范围后，才讨论激活。未来仅单步使用现有固定身份签名，禁止执行候选代码；验证签名后证书必须精确匹配 pins，输出 APK 需再核 package/version/ABI 和签名证书。始终清理临时密钥，不输出环境或密钥材料。
8. 公共仓库 Actions artifact 不能作为私有暂存。原社区身份签名 APK 在 ARM 安装及覆盖升级验收前不得明文上传。优先同一隔离环境内完成签名与验收，仅保存不含 APK 的结果摘要；跨环境传输如需单次接收方公钥加密，须另审方案与授权，当前未实现。不得上传工作目录、密钥备份或凭据附件。无 publisher、tag、release、OTA 修改。

## 防止误触发与验收限制

旧签名分支工作流实际监听 push，且其旧 input 已 enabled。不要把草案推入该分支；`disabled` 字样的 concurrency 名不是禁用开关。未来激活属于单独审核步骤，本草案不授予授权。

当前没有实体手机安装、覆盖升级、配对连接、后台生命周期验收。Google Device Streaming 仅是可讨论的未来 ARM 真机路线，未获授权上传 APK、开通账号或计费，不可据此宣称已支持或已验收。后续必须单独确认服务、设备、数据传输和费用范围。桌面 25 门禁不等于 Android 真机通过。

## 固定证据入口与到期

- [原正式候选 attempt 1](https://github.com/ZhiweiXiao98/t3code/actions/runs/44228163780/attempts/1)，[Android producer](https://github.com/ZhiweiXiao98/t3code/actions/runs/44228163780/job/134547189421)。原 ZIP 到期：**2026-12-02 03:35:06 UTC（北京时间 11:35:06）**；到期不重建冒充原产物。
- [旧已发布 Android 0.1.9-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.9-zh.1) 与 [签名发布证据](https://github.com/ZhiweiXiao98/t3code/actions/runs/43194813528)。升级验证必须是实际发布的 1000416 → 本候选签名后的 1000418，不以未发布 1000417 替代。
- [固定身份恢复记录](https://github.com/ZhiweiXiao98/t3code/actions/runs/40649758501)。公开恢复 artifact 12799615493 到期 2027-01-26 07:23:28 UTC；历史成功不等于当前秘密仍有效。
- [旧 sign-only 配方固定快照](https://github.com/ZhiweiXiao98/t3code/blob/5b48c3abd7c38618d63a899059fdb852d66a34d7/.github/workflows/android-sign-reviewed.yml)。仅参考，不运行。

## 本地可执行验证与实际结果（2026-11-19）

- `python3 -m unittest discover -s . -p 'test_*.py' -v`：运行严格元数据和归档正负例（不含真实密钥）。
- `python3 verify_live.py --archive /path/to/original-artifact.zip`：官方公共 GitHub GET，拒绝重定向，核对前后快照及原字节；不需要token，不签名。
- `python3 synthetic_sign_test.py --archive /path/to/original-artifact.zip --sdk-tools /path/to/reviewed/build-tools/36.0.0`：仅临时生成一次性合成身份，不能接受社区原钥，不安装或保存已签APK；所有临时输出在返回前删除。

本次真实原ZIP/成员校验通过；官方 aapt2 确认包名/1000418/ARM64，原APK apksigner不验证；临时测试身份签名后 apksigner 验签、16KB对齐、包名版本ABI复查均通过。注入生成临时密钥后的异常，目录清理验证通过。**这不是同社区证书签名或1000416→1000418安装验收。**

使用官方 `https://dl.google.com/android/repository/repository2-1.xml` 公布的 build-tools36 Linux包：63737259字节，SHA1 `b0b6376977657e8ad9b969bacf4093601da2c6fb`；实算SDK ZIP SHA256 `5d9ac77fb6ff43d9da518a337b4fcf8f9097113df531d99ccefe80ef7ce8250b`。演示程序不自动下载SDK，调用方须先验证SDK来源与字节。

原钥执行路径仍需：审查移植既有 signer/recovery → 固定新工作流/工具身份 → 即时复查公开恢复证据 → 在受控环境使用既有原身份 → 同证书输出验证 → 隔离ARM覆盖升级；在这些边界明确前不激活工作流或读取签名环境。

最新验证：9 个 unittest 方法（含门禁/归档及新增上传区间负例）通过；最终验证器对本次实际 GitHub 快照与原 ZIP 复跑通过。较早版本 live helper 前后实时快照通过；追加拒绝重定向与上传步骤严格检查后，最终 live helper 再请求遭 GitHub 未认证 API 配额耗尽（HTTP 403，remaining=0），已失败关闭，未把这次受限运行写成通过。激活前必须再完成最终版本的实时复验；不通过换凭据或绕过限额重试。
