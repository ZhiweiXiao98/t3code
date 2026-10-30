# T3 Code 简体中文社区版

**用中文管理你的 AI 编程工作流。**

在 T3 Code 中使用已有的 Codex、Claude Code 等智能体，管理项目、对话与代码变更。本项目在官方稳定版基础上持续完善简体中文界面，保留英文和“跟随系统”选项。

**[下载中文版](#下载中文版) · [首次使用](#首次使用) · [汉化范围与升级说明](./README.zh-CN.md) · [反馈问题](https://github.com/ZhiweiXiao98/t3code/issues)**

> 非官方社区汉化版，与 T3 Code 官方团队没有隶属关系。产品与核心能力来自 [pingdotgg/t3code](https://github.com/pingdotgg/t3code)，本仓库负责中文适配与社区客户端维护。

## 下载中文版

当前桌面版本：**[v0.1.3-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.3-zh.1)**，发布于 **2026 年 10 月 28 日**，基于官方稳定版 **v0.1.3**。Android **[0.1.3-zh.1](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.3-zh.1)** 已正式发布，面向 ARM64 手机。

| 你的系统                     | 直接下载                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64                  | [下载安装程序 .exe](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/T3-Code-0.1.3-zh.1-x64.exe)                           |
| Mac：Apple Silicon（M 系列） | [下载 .dmg](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/T3-Code-0.1.3-zh.1-arm64.dmg)                                 |
| Mac：Intel                   | [下载 .dmg](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/T3-Code-0.1.3-zh.1-x64.dmg)                                   |
| Linux x64：Debian / Ubuntu   | [下载 .deb](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/T3-Code-0.1.3-zh.1-amd64.deb)                                 |
| Linux x64：AppImage          | [下载 .AppImage](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/T3-Code-0.1.3-zh.1-x86_64.AppImage)                      |
| Android ARM64                | [下载已签名 .apk](https://github.com/ZhiweiXiao98/t3code/releases/download/android-v0.1.3-zh.1/T3-Code-zh-CN-Android-0.1.3-zh.1-arm64-v8a.apk) |

[桌面文件与发布说明](https://github.com/ZhiweiXiao98/t3code/releases/tag/v0.1.3-zh.1) · [SHA-256 校验值](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/SHA256SUMS.txt) · [构建来源](https://github.com/ZhiweiXiao98/t3code/releases/download/v0.1.3-zh.1/BUILD-PROVENANCE.json)

> **安装前请知悉：** Windows 安装包未进行 Authenticode 签名；macOS 未进行 Developer ID 签名或公证，系统可能提示风险。请核对来源和校验值，不要为了安装而关闭系统安全保护。本版暂不提供自动更新源，请从本仓库手动下载更新。

**Android 已发布可安装的汉化 APK。** [Android 发布说明](https://github.com/ZhiweiXiao98/t3code/releases/tag/android-v0.1.3-zh.1) · [Android SHA-256 校验值](https://github.com/ZhiweiXiao98/t3code/releases/download/android-v0.1.3-zh.1/SHA256SUMS.txt)。新版使用已完成云端恢复验证的固定社区签名，**不能直接覆盖历史旧签名 APK**；卸载旧版前请保存需要的配置，卸载可能丢失本地数据。已通过云端构建、原生回归及签名验证，未宣称完成实体手机上的人工安装测试。**iOS 仅有[官方原版（未汉化）](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824)**，不属于本社区安装包。

## 为什么选择这个版本

- **常用工作流看中文：** 项目与会话、设置中心、命令面板、Pull Request、用量与常见提示等界面持续完善汉化。
- **保留准确的技术信息：** Provider 与模型名称、命令、快捷键、路径、URL、Git 标识符保留原文，方便操作与排错。
- **跟进官方稳定版：** 保留已有翻译，增量补齐新功能和新文案；通过验证后再发布，不把未发布的 main 或 nightly 当稳定更新。
- **下载与验证可查：** 已发布桌面对应源码 `9c964ab3`、Android 对应源码 `fb48ddad`，两者各自的 15 项云端验证任务全部通过；不是同一二进制提交。发布页分别提供文件校验值和构建来源。云端验证不等于所有系统上的人工安装测试。

[桌面构建记录](https://github.com/ZhiweiXiao98/t3code/actions/runs/40565836137) · [Android 构建记录](https://github.com/ZhiweiXiao98/t3code/actions/runs/40650302651) · [Android 签名与发布](https://github.com/ZhiweiXiao98/t3code/actions/runs/40655213271) · [查看汉化范围及已知限制](./README.zh-CN.md#已覆盖界面)

## 首次使用

1. **按上表选择系统与架构下载安装包。** 不确定 Mac 架构时，在“关于本机”查看“芯片”或“处理器”。
2. **在桌面端或服务端所在机器配置至少一个已安装并登录的智能体。** 例如 [Codex CLI](https://developers.openai.com/codex/cli) 或 [Claude Code](https://claude.com/product/claude-code)。本客户端不附送模型额度，也不替代服务提供方账号。
3. **打开应用，进入“设置 → 常规 → 语言”，选择“简体中文”。** 添加项目后，选择已配置的 Provider 开始使用。Windows 托盘菜单切换语言后需重启应用同步。Android 社区版固定使用简体中文，配对连接兼容的新版 T3 Code 服务端；不需要在手机上安装 Provider CLI。

> 官方的 `t3.codes` 安装脚本、`npx t3@latest`、Homebrew、winget 等入口安装的是**官方原版**，不是本仓库的汉化安装包。想使用中文版，请使用上方下载入口。

## 从旧版升级：先备份

- V2 首次启动会复制并导入 V1 数据；之后两套数据**不会互相同步**。
- V1 与 V2 的服务器、桌面端和移动客户端**不能互连**，请同步升级连接的设备。
- 历史社区 Android APK 不能连接新版；请使用上方新版 Android APK。新旧签名不同，不能直接覆盖安装，卸载前请保存配置。
- OpenCode 2 会迁移共享数据库，不要与 OpenCode 1 在同一台机器上并行运行。

[详细升级说明](./README.zh-CN.md#升级前必读) · [上游迁移指南](https://github.com/pingdotgg/t3code/issues/14871)

## 反馈与维护

发现漏译、翻译不自然或界面问题？欢迎[提交 Issue](https://github.com/ZhiweiXiao98/t3code/issues/new)，附上版本号、系统、复现步骤，以及已遮挡敏感信息的截图。请勿上传访问令牌、密钥或私人对话。

维护流程：**官方稳定版更新 → 同步改动 → 增量完善汉化 → 测试与构建 → 发布客户端**。历史分支和发布保留；默认分支以最新已验证的稳定版汉化维护分支为维护目标。[当前维护源码](https://github.com/ZhiweiXiao98/t3code/tree/maintenance/v0.1.3-zh-cloud)。

## 文档与源码

- [中文版说明、平台状态和语言设置](./README.zh-CN.md)
- [权限模式](./docs/user/permission-modes.md) · [键盘快捷键](./docs/user/keybindings.md) · [项目设置](./docs/user/project-settings.md)
- [远程访问](./docs/user/remote-access.md) · [服务端与客户端版本同步](./docs/user/updating.md)
- [上游项目与官方安装方式](https://github.com/pingdotgg/t3code) · [源码开发说明](./docs/internals/overview.md) · [贡献指南](./CONTRIBUTING.md)

本项目沿用上游的 [MIT License](./LICENSE)。感谢 T3 Code 上游团队及贡献者；汉化维护：肖志伟。
