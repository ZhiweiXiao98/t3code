# T3 Code 简体中文社区版

> [!IMPORTANT]
> 本 Fork / 简体中文社区版已恢复维护，跟进上游稳定版本并补齐汉化。客户端在 GitHub 云端构建，只有通过测试和构建验证的产物才会发布。

> [!IMPORTANT]
> 这是由社区维护的非官方汉化版本，与 T3 Code 官方团队没有隶属关系。维护范围为 Windows、macOS、Linux 和 Android；iOS 仅提供官方原版入口。

本分支为 T3 Code 增加简体中文界面，并保留英文和“跟随系统”选项。Provider 名称、模型名称、命令、快捷键、路径、URL、Git 标识符等技术内容保持原样，避免翻译影响实际操作。

## 下载中文版

当前桌面版本：**[v0.1.10-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.10-zh.1)**，发布于 **2026 年 11 月 18 日**，基于官方稳定版 **v0.1.10**。Android **[0.1.9-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.9-zh.1)** 仍为独立已发布版本（2026 年 11 月 12 日，ARM64），不是 0.1.10。

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

English summary: Desktop **0.1.10-zh.1** is released; Android remains **0.1.9-zh.1**. Use the platform-specific assets above. Back up server userdata before upgrading; older binaries must not open migrated databases. Windows is unsigned, macOS is ad-hoc signed but not notarized. No AppImage or Android 0.1.10 APK is published.

> **安装方式：** 下载对应系统的安装包并安装。当前暂不提供自动更新，请从本仓库下载安装新版本。

**Android 已发布可安装的汉化 APK。** [Android 发布说明](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.9-zh.1) · [Android SHA-256 校验值](https://github.com/ZhiweiXiao98/t3code/releases/download/android-v0.1.9-zh.1/SHA256SUMS.txt)。新版沿用已完成云端恢复验证的固定社区签名，**可覆盖安装 `android-v0.1.3-zh.1` 固定签名版**；更早使用其他签名的 APK 不能直接覆盖。需要卸载异签名旧版时，请先保存配置，卸载可能丢失本地数据。已通过云端构建、原生回归及签名验证，未宣称完成实体手机上的人工安装测试。**iOS 仅有[官方版（语言支持以官方说明为准）](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824)**，入口来自[官方下载页](https://t3.codes/download)，不属于本社区安装包，版本号与社区版独立。

## 升级前必读

当前 `v0.1.10-zh.1` 桌面社区版已于 2026 年 11 月 18 日正式发布，上游基线为官方稳定版 `v0.1.10`。

- 升级包含数据库迁移。请先停止实际运行的服务器并复制整个 `userdata` 目录（默认 `~/.t3/userdata`；自定义 `--base-dir` 或 `T3CODE_HOME` 对应目录下的 `userdata`），包括存在的 SQLite WAL/SHM 文件，远端/WSL 环境需在对应机器中备份。项目代码另行备份。回滚使用升级前备份，不让旧版直接打开升级后的数据库，也不要启动服务器写入唯一备份副本。
- 请先备份数据。V2 首次启动会复制并导入 V1 数据；两个版本此后的数据不会互相同步。
- V1 与 V2 的服务器和客户端不能互连，连接的所有机器、桌面端和移动端都需要更新。
- V1 历史社区 Android APK 不能连接 V2 服务器。新版 Android 汉化 APK 已发布，请从上方入口下载；`android-v0.1.3-zh.1` 固定签名版可直接覆盖升级，更早异签名版本需先保存配置再卸载。
- OpenCode 2 会迁移自己的共享数据库，不要与 OpenCode 1 在同一台机器上并行运行。
- 详见[官方 v0.1.0 升级说明](https://github.com/pingdotgg/t3code/releases/tag/v0.1.0)和[迁移指南](https://github.com/pingdotgg/t3code/issues/14871)。

### 当前版本的验证范围

桌面发布来自[精确源码 `2ed55016b6678ca997f204d9b7af4048ce0307e6`](https://github.com/ZhiweiXiao98/t3code/commit/2ed55016b6678ca997f204d9b7af4048ce0307e6)。[正式候选 44228163780](https://github.com/ZhiweiXiao98/t3code/actions/runs/44228163780) 首次尝试的 25 项门禁全部通过，包括六个桌面安装包分别完成干净首次启动（空白用户数据、正常沙箱；ARM 两格式在独立于构建机的验收 VM 顺序执行并隔离用户数据）；Mac ARM 在 macOS 26、Intel 在 macOS 15、Linux DEB 在 Ubuntu 24.04 验收。[字节审核](https://github.com/ZhiweiXiao98/t3code/actions/runs/44235684068)核对六包哈希后，[发布器](https://github.com/ZhiweiXiao98/t3code/actions/runs/44237587651)原样发布，没有重新构建。文档提交不是二进制来源。云端验收不等于所有系统上的人工安装测试。

Android 仍单独发布 `0.1.9-zh.1`，源码为 `042eacb54f19c3bbc452e4ae271794f4c5fc524e`；其历史 22 项门禁中 21 项通过、AppImage 失败未发布，不能套用新版桌面的 25 项通过结论。没有发布 Android 0.1.10 APK。

**AppImage 固定禁用发布，后续不纳入发布门禁。** 历史 Debian 13 虚拟机验收发生渲染进程崩溃，尚未通过验收；禁用发布不代表问题已修复，也不声称该门禁通过。Linux DEB 在原生 Ubuntu 24.04 验收通过。

Windows 未做 Authenticode 签名；macOS 已做 ad-hoc 完整性签名并通过严格校验，但没有 Developer ID 商业签名或 Apple 公证。Gatekeeper 仍可能因未公证而阻止打开，这与安装包损坏不同；发布页附有 `MACOS-TRUST-*.txt` 实际信任检查记录。没有关闭沙箱或降低宿主系统安全设置。云端验证不是人工 Finder 操作验收，也不等于所有系统上的人工安装测试；SHA-256 和构建来源记录不等于商业代码签名。

Android [独立签名与发布](https://github.com/ZhiweiXiao98/t3code/actions/runs/43194813528)验证了固定证书、包名、版本号 `1000416`、ARM64 架构和 APK 签名。沿用 `android-v0.1.3-zh.1` 的固定签名身份，证书 SHA-256 为 `82f2437cbceb94fe6fe4a60a1c0de99f643124c64a648a27de9ce92bd39ecd88`；versionCode 递增，可覆盖该固定签名旧版。签名密钥加密备份已通过[新 runner 恢复验证](https://github.com/ZhiweiXiao98/t3code/actions/runs/40649758501)。未宣称完成所有实体手机上的人工安装与界面测试。文档后续更新不改变以上二进制源码和验证记录。

### 历史社区安装包

- [Windows x64 历史版 `0.0.39-cn.3`](https://github.com/ZhiweiXiao98/t3code/releases/tag/zh-cn-v0.0.39-cn.3)
- [Android 历史版 `1.0.4-cn.10`（旧签名）](https://github.com/ZhiweiXiao98/t3code/releases/tag/zh-cn-mobile-v1.0.4-cn.10)

这些历史社区安装包并非通过应用商店分发；Windows 没有商业代码签名，新版 Android 与这些历史 APK 使用不同签名。Windows SmartScreen 或 Android 系统可能显示安全提醒，请只从本仓库 Releases 下载，并在安装前核对发布页提供的 SHA-256。

新版 Android 沿用 `android-v0.1.3-zh.1` 的固定发布签名，可覆盖该版本；不能直接覆盖上列更早的异签名历史 APK。卸载旧版前请先备份设置；卸载可能丢失本地数据。加密备份已通过新云端 runner 恢复验证，后续发布沿用此身份。

Android 版使用独立应用标识 `com.zhiweixiao.t3code.zhcn`，可以与官方版同时安装，并已关闭官方 OTA 更新，避免汉化界面被英文更新覆盖。它支持与本地 T3 Code 后端配对；依赖官方应用签名或云端凭据的 T3 Connect 登录、推送通知等功能可能受限。

T3 Code 需要至少一个已安装并完成登录的 Provider CLI：

- Codex：安装 [Codex CLI](https://developers.openai.com/codex/cli)，运行 `codex login`
- Claude：安装 [Claude Code](https://claude.com/product/claude-code)，运行 `claude auth login`
- Cursor：安装 [Cursor CLI](https://cursor.com/cli)，运行 `agent login`
- Grok Build：安装 [Grok Build CLI](https://x.ai/cli)，运行 `grok login`
- OpenCode：安装 [OpenCode](https://opencode.ai)，运行 `opencode auth login`

## 切换语言

打开 `设置 → 常规 → 语言`，选择：

- `跟随系统`
- `English`
- `简体中文`

选择“跟随系统”时，应用会根据浏览器或操作系统语言自动显示中文或英文。Windows 托盘菜单目前在启动时读取语言；切换语言后重启应用即可同步托盘文字。

## 已覆盖界面

- 首页、侧栏、任务列表、编辑器与常用操作
- 设置中心、快捷键、服务提供方、连接和源代码管理
- 命令面板、项目添加与项目操作弹窗
- Pull Request、用量统计和常见空状态
- 配对、更新提醒、确认提示和错误提示
- Windows 桌面原生菜单

少量 Provider 返回的动态状态、第三方错误信息和底层技术值会继续显示原文。

Android 社区安装包固定使用简体中文；桌面版仍可在设置中切换语言。

## 开发状态

- 最新已验收桌面源码：[`review/v0.1.10-zh`](https://github.com/ZhiweiXiao98/t3code/tree/review/v0.1.10-zh)，已发布提交 `2ed55016`；[PR #2](https://github.com/ZhiweiXiao98/t3code/pull/2) 仍为草稿、未合并。
- 正式维护分支为 `maintenance/v0.1.10-zh-cloud`；GitHub 当前默认分支以仓库设置为准，切换前须审查工作流影响。
- 当前已发布桌面版：[`v0.1.10-zh.1`](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.10-zh.1)（社区正式发布）
- 上游项目：[pingdotgg/t3code](https://github.com/pingdotgg/t3code)
- 早期国际化实现记录：[Fork PR #1](https://github.com/ZhiweiXiao98/t3code/pull/1)（不是当前发布版本的完整审查记录）
- 问题反馈：[Issues](https://github.com/ZhiweiXiao98/t3code/issues)

本分支恢复跟进上游稳定发布，先在维护分支迁移和验证，再发布对应客户端。由于改动范围较大，当前以社区 Fork 形式交付；如果官方维护者希望采用其中的国际化基础设施，可以再拆分成小型、可独立审查的提交。

## 从源码运行

复现已发布桌面源码请检出精确提交 `2ed55016b6678ca997f204d9b7af4048ce0307e6`；后续开发请明确使用正式维护分支 `maintenance/v0.1.10-zh-cloud`，历史验收仍保留在 `review/v0.1.10-zh`。请使用该提交锁定的工具链和依赖。环境要求与命令以仓库配置及[源码开发说明](./docs/internals/overview.md)为准。

官方 `t3.codes` 安装脚本、`npx t3@latest`、Homebrew 和 winget 安装的是官方原版，不是本仓库的汉化安装包；普通使用者请直接使用本页下载表。

## 反馈与后续更新

欢迎[提交汉化或安装问题](https://github.com/ZhiweiXiao98/t3code/issues/new)，注明版本、系统和复现步骤。截图请先遮挡私人对话、令牌和密钥。

维护跟进官方稳定 Release，保留既有翻译并增量完善新增、变动和遗漏的文案。未发布的 main 和 nightly 不直接作为稳定版发布。新版源码与维护分支说明见上方“开发状态”；后续变更通过 PR 展示，历史分支和发布保留。

## 许可证

本项目沿用上游的 [MIT License](./LICENSE)。汉化维护：肖志伟。
