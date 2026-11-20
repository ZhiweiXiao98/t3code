# T3 Code 简体中文社区版

> [!IMPORTANT]
> **本社区汉化版已于 2026 年 11 月 20 日停止维护。** T3 Code 官方桌面稳定版 [v0.1.11](https://github.com/pingdotgg/t3code/releases/tag/v0.1.11) 已内置简体中文，覆盖应用界面和桌面菜单。建议从[官方网站下载](https://t3.codes/download)，安装后在「Settings → General → Language」选择「中文（简体）」。
>
> 本仓库保留源码、历史发布和旧版下载，不再跟进上游版本或发布新的社区安装包。桌面迁移前请关闭应用和后台服务，备份服务端 `userdata` 和桌面配置。官方 Android 应用与社区 APK 的包名不同，不能覆盖安装；换用官方版前请保留社区版，确认重新配对和所需设置可用后再决定是否卸载。官方 Android 的中文可用性以实际安装的商店版本为准。

**[官方下载](https://t3.codes/download) · [历史社区下载](#下载中文版) · [汉化范围与升级说明](./README.zh-CN.md)**

> 本项目是非官方社区汉化版，产品与核心能力来自 [pingdotgg/t3code](https://github.com/pingdotgg/t3code)。

## 下载中文版

最后发布的社区桌面版本：**[v0.1.10-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.10-zh.1)**，发布于 **2026 年 11 月 18 日**，基于官方稳定版 **v0.1.10**。Android **[0.1.9-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.9-zh.1)** 仍为独立已发布版本（2026 年 11 月 12 日，ARM64），不是 0.1.10。

| 你的系统                     | 直接下载                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64                  | [下载安装程序 .exe](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-x64.exe)                           |
| Mac：Apple Silicon（M 系列） | [下载 .dmg](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-arm64.dmg)                                 |
| Mac：Intel                   | [下载 .dmg](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-x64.dmg)                                   |
| Linux x64：Debian / Ubuntu   | [下载 .deb](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-amd64.deb)                                 |
| Linux x64：AppImage          | 固定禁用发布；请使用上方 .deb。                                                                                                                |
| Android ARM64                | [下载已签名 .apk](https://github.com/ZhiweiXiao98/t3code/releases/download/android-v0.1.9-zh.1/T3-Code-zh-CN-Android-0.1.9-zh.1-arm64-v8a.apk) |

[桌面文件与发布说明](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.10-zh.1) · [SHA-256 校验值](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/SHA256SUMS.txt) · [构建来源](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/BUILD-PROVENANCE.json)

备用 macOS ZIP：[Apple Silicon](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-arm64.zip) · [Intel](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/T3-Code-0.1.10-zh.1-x64.zip)。

Windows 未做 Authenticode 签名；Mac 仅 ad-hoc 完整性签名，没有 Developer ID 或 Apple 公证，Gatekeeper 可能阻止打开。[ARM 信任报告](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/MACOS-TRUST-arm64.txt) · [Intel 信任报告](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.10-zh.1/MACOS-TRUST-x64.txt)。不要通过关闭系统安全设置或沙箱来绕过限制。

English summary: This community fork is no longer maintained. The last desktop release is **0.1.10-zh.1**; the last Android release is **0.1.9-zh.1**. Use the platform-specific assets above. Back up server userdata before upgrading; older binaries must not open migrated databases. Windows is unsigned, macOS is ad-hoc signed but not notarized. No AppImage or Android 0.1.10 APK is published.

> **安装方式：** 下载对应系统的安装包并安装。历史安装包仅供有需要的用户下载；新用户请使用官方版。

**Android 已发布可安装的汉化 APK。** [Android 发布说明](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.9-zh.1) · [Android SHA-256 校验值](https://github.com/ZhiweiXiao98/t3code/releases/download/android-v0.1.9-zh.1/SHA256SUMS.txt)。此历史版本沿用已完成云端恢复验证的固定社区签名，**可覆盖安装 `android-v0.1.3-zh.1` 固定签名版**；更早使用其他签名的 APK 不能直接覆盖。需要卸载异签名旧版时，请先保存配置，卸载可能丢失本地数据。已通过云端构建、原生回归及签名验证，未宣称完成实体手机上的人工安装测试。**iOS 仅有[官方版（语言支持以官方说明为准）](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824)**，入口来自[官方下载页](https://t3.codes/download)，不属于本社区安装包，版本号与社区版独立。

## 为什么选择这个版本

- **常用工作流看中文：** 项目与会话、设置中心、命令面板、Pull Request、用量与常见提示等界面持续完善汉化。
- **保留准确的技术信息：** Provider 与模型名称、命令、快捷键、路径、URL、Git 标识符保留原文，方便操作与排错。
- **历史社区版：** 在当时的官方稳定版本基础上补齐简体中文。现已停止维护，新用户建议使用官方版。
- **下载与验证可查：** 桌面发布来自[精确源码 `2ed55016b6678ca997f204d9b7af4048ce0307e6`](https://github.com/ZhiweiXiao98/t3code/commit/2ed55016b6678ca997f204d9b7af4048ce0307e6)。[正式候选 44228163780](https://github.com/ZhiweiXiao98/t3code/actions/runs/44228163780) 首次尝试的 25 项门禁全部通过，包括六个桌面安装包分别完成干净首次启动（空白用户数据、正常沙箱；ARM 两格式在独立于构建机的验收 VM 顺序执行并隔离用户数据）；Mac ARM 在 macOS 26、Intel 在 macOS 15、Linux DEB 在 Ubuntu 24.04 验收。[字节审核](https://github.com/ZhiweiXiao98/t3code/actions/runs/44235684068)核对六包哈希后，[发布器](https://github.com/ZhiweiXiao98/t3code/actions/runs/44237587651)原样发布，没有重新构建。文档提交不是二进制来源。云端验收不等于所有系统上的人工安装测试。

Android 仍单独发布 `0.1.9-zh.1`，源码为 `042eacb54f19c3bbc452e4ae271794f4c5fc524e`；其历史 22 项门禁中 21 项通过、AppImage 失败未发布，不能套用新版桌面的 25 项通过结论。没有发布 Android 0.1.10 APK。

[正式构建与验收](https://github.com/ZhiweiXiao98/t3code/actions/runs/44228163780) · [桌面发布记录](https://github.com/ZhiweiXiao98/t3code/actions/runs/44237587651) · [Android 签名与发布](https://github.com/ZhiweiXiao98/t3code/actions/runs/43194813528) · [验证范围和签名限制](./README.zh-CN.md#当前版本的验证范围)

## 首次使用

1. **按上表选择系统与架构下载安装包。** 不确定 Mac 架构时，在“关于本机”查看“芯片”或“处理器”。
2. **在桌面端或服务端所在机器配置至少一个已安装并登录的智能体。** 例如 [Codex CLI](https://developers.openai.com/codex/cli) 或 [Claude Code](https://claude.com/product/claude-code)。本客户端不附送模型额度，也不替代服务提供方账号。
3. **打开应用，进入“设置 → 常规 → 语言”，选择“简体中文”。** 添加项目后，选择已配置的 Provider 开始使用。Windows 托盘菜单切换语言后需重启应用同步。Android 社区版固定使用简体中文，配对连接兼容的新版 T3 Code 服务端；不需要在手机上安装 Provider CLI。

当前版本还支持 [fx](https://fx.sh)：请在运行 T3 Code 服务端的机器上安装 fx 并运行 `fx login`，详见[设置指南](./docs/user/providers-fx.md)。

> 官方的 `t3.codes` 安装脚本、`npx t3@latest`、Homebrew、winget 等入口安装的是**官方原版**，不是本仓库的汉化安装包。官方桌面稳定版 v0.1.11 起已内置简体中文。本页安装步骤只适用于历史社区包。

## 从旧版升级：先备份

- 升级包含数据库迁移。请先停止实际运行的服务器并复制整个 `userdata` 目录（默认 `~/.t3/userdata`；自定义 `--base-dir` 或 `T3CODE_HOME` 对应目录下的 `userdata`），包括存在的 SQLite WAL/SHM 文件，远端/WSL 环境需在对应机器中备份。项目代码另行备份。回滚使用升级前备份，不让旧版直接打开升级后的数据库，也不要启动服务器写入唯一备份副本。
- V2 首次启动会复制并导入 V1 数据；之后两套数据**不会互相同步**。
- V1 与 V2 的服务器、桌面端和移动客户端**不能互连**，请同步升级连接的设备。
- V1 历史社区 Android APK 不能连接 V2 服务端；如需保留旧社区客户端，请查看上方最后发布的社区 Android APK。`android-v0.1.3-zh.1` 固定签名版可直接覆盖升级，更早异签名版本需先保存配置再卸载。
- OpenCode 2 会迁移共享数据库，不要与 OpenCode 1 在同一台机器上并行运行。

[详细升级说明](./README.zh-CN.md#升级前必读) · [上游迁移指南](https://github.com/pingdotgg/t3code/issues/14871)

## 反馈与维护

本社区版已停止维护。官方版的问题请按[上游贡献说明](https://github.com/pingdotgg/t3code/blob/main/CONTRIBUTING.md)反馈；请勿上传访问令牌、密钥或私人对话。

[历史 PR #2](https://github.com/ZhiweiXiao98/t3code/pull/2) 保留了社区版的迁移及验收记录，仍为草稿、未合并。已发布桌面源码固定为 `2ed55016b6678ca997f204d9b7af4048ce0307e6`；历史维护分支为 `maintenance/v0.1.10-zh-cloud`。

## 文档与源码

- [中文版说明、平台状态和语言设置](./README.zh-CN.md)
- [权限模式](./docs/user/permission-modes.md) · [键盘快捷键](./docs/user/keybindings.md) · [项目设置](./docs/user/project-settings.md)
- [远程访问](./docs/user/remote-access.md) · [服务端与客户端版本同步](./docs/user/updating.md)
- [上游项目与官方安装方式](https://github.com/pingdotgg/t3code) · [源码开发说明](./docs/internals/overview.md) · [贡献指南](./CONTRIBUTING.md)

本项目沿用上游的 [MIT License](./LICENSE)。感谢 T3 Code 上游团队及贡献者；汉化维护：肖志伟。
