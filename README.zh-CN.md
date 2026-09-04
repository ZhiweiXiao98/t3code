# T3 Code 简体中文社区版

> [!IMPORTANT]
> 这是由社区维护的非官方汉化版本，与 T3 Code 官方团队没有隶属关系。项目会尽量跟进上游更新，但不承诺与官方版本同步发布。

本分支为 T3 Code 增加简体中文界面，并保留英文和“跟随系统”选项。Provider 名称、模型名称、命令、快捷键、路径、URL、Git 标识符等技术内容保持原样，避免翻译影响实际操作。

## 下载与安装

- [Windows x64 简体中文安装包](https://github.com/ZhiweiXiao98/t3code/releases/tag/zh-cn-v0.0.33-cn.1)
- [Android 简体中文 APK](https://github.com/ZhiweiXiao98/t3code/releases/tag/zh-cn-mobile-v1.0.4-cn.1)

两个社区安装包均未使用应用商店或商业代码签名。Windows SmartScreen 或 Android 系统可能显示安全提醒，请只从本仓库 Releases 下载，并在安装前核对发布页提供的 SHA-256。

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

选择“跟随系统”时，应用会根据浏览器或操作系统语言自动显示中文或英文。

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

- 汉化分支：`feature/i18n-zh-cn`
- 上游项目：[pingdotgg/t3code](https://github.com/pingdotgg/t3code)
- 实现与审查记录：[Fork PR #1](https://github.com/ZhiweiXiao98/t3code/pull/1)
- 问题反馈：[Issues](https://github.com/ZhiweiXiao98/t3code/issues)

本分支会继续吸收上游 `main` 的更新。由于改动范围较大，当前以社区 Fork 形式交付；如果官方维护者希望采用其中的国际化基础设施，可以再拆分成小型、可独立审查的提交。

## 从源码运行

需要 Node.js `^24.13.1` 和 Corepack。依赖使用项目锁定的 pnpm 版本安装：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec vp run dev --home-dir ./.t3
```

请根据启动日志中的完整 `pairingUrl` 打开本地界面。

## 许可证

本项目沿用上游的 [MIT License](./LICENSE)。汉化维护：肖志伟。
