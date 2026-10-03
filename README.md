# T3 Code

> [!IMPORTANT]
> 本非官方简体中文社区版已恢复维护。上游稳定版更新会先完成集成与验证，再发布客户端。请查看[社区版下载与各平台状态](./README.zh-CN.md)；构建在 GitHub 托管的运行器上完成。

> [简体中文社区版说明与下载](./README.zh-CN.md) · 社区维护的非官方版本

T3 Code 是一个“智能体运行环境的控制界面”。你可以通过出色的移动应用（[iOS](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824)、[Android](https://play.google.com/store/apps/details?id=com.t3tools.t3code)）、[网页应用](https://app.t3.codes)和[基于 Electron 的桌面应用](https://t3.codes)，控制自己电脑上的智能体。

T3 Code 可配合你已有的 Claude Code、Codex、Cursor、Grok Build、OpenCode 和 Google Antigravity 订阅使用。只要它们已在你的电脑上配置好，T3 Code 就能控制它们。

## “等等，你们到底想卖我什么？”

什么也不卖。我们打造 T3 Code，是因为我们希望获得尽可能好的智能体开发体验。Codex 桌面应用、Conductor、Claude Desktop 和 Cursor Glass 等现有方案给了我们启发，但都没有达到我们的要求。

我们想要的是性能出色、支持远程使用且真正开放的工具。如果有一天我们走错了方向，我们希望你拥有所需的一切，可以自行 Fork，打造你想要的编辑器。

## 安装

> [!WARNING]
> T3 Code 目前支持 Codex、Claude、Cursor、Grok Build、OpenCode 和 Antigravity。使用前，请至少安装并完成一个服务提供方的身份验证：
>
> - Codex：安装 [Codex CLI](https://developers.openai.com/codex/cli)，然后运行 `codex login`
> - Claude：安装 [Claude Code](https://claude.com/product/claude-code)，然后运行 `claude auth login`
> - Cursor：安装 [Cursor CLI](https://cursor.com/cli)，然后运行 `agent login`
> - Grok Build：安装 [Grok Build CLI](https://x.ai/cli)，然后运行 `grok login`
> - OpenCode：安装 [OpenCode](https://opencode.ai)，然后运行 `opencode auth login`
> - Antigravity：先在设置中启用，再使用 **Install Antigravity** 和 **Sign in with Google**。无需安装 CLI。

### 命令行

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

Windows 用户请在 PowerShell 中运行：

```powershell
irm https://t3.codes/install.ps1 | iex
```

随后运行 `t3`，即可启动服务器并打开本地网页应用。`t3 service install` 可让服务在后台持续运行，`t3 update` 可更新到较新版本，`t3 --help` 提供完整的命令参考。

如果只想试用一次而不安装，可以改为运行 `npx t3@latest`。

### 社区中文版客户端

Windows、macOS、Linux 和 Android 的维护进度记录在 [README.zh-CN.md](./README.zh-CN.md) 中。只有成功通过验证的客户端产物才会发布到[本 Fork 的 Releases](https://github.com/ZhiweiXiao98/t3code/releases)。前文的 iOS 链接指向未经汉化的官方应用。

### 官方桌面应用

可从 [GitHub Releases](https://github.com/pingdotgg/t3code/releases) 安装最新版桌面应用，也可以使用你习惯的软件包管理器：

#### Windows（`winget`）

```bash
winget install T3Tools.T3Code
```

#### macOS（Homebrew）

```bash
brew install --cask t3-code
```

#### Debian、Ubuntu（`.deb`）

从 [GitHub Releases](https://github.com/pingdotgg/t3code/releases) 下载 `.deb` 文件，然后运行：

```bash
sudo apt install ./T3-Code-*.deb
```

#### Arch Linux（AUR）

稳定版：

```bash
yay -S t3code-bin
```

每日构建版：

```bash
yay -S t3code-nightly-bin
```

AUR 打包文件在本仓库的 [`packaging/aur`](./packaging/aur) 目录中维护。

## 一些说明

这个项目仍处于非常早期的阶段，遇到 Bug 并不意外。

目前我们（基本上）还不接受贡献。小修复可能会被考虑，大型功能则不会。

## 文档

完整文档位于 [docs/](./docs)。目前还没有独立的文档网站。

- [安装与首次运行](./docs/user/install.md)
- [权限模式](./docs/user/permission-modes.md)
- [键盘快捷键](./docs/user/keybindings.md)
- [项目设置](./docs/user/project-settings.md)
- [从手机或另一台电脑远程访问](./docs/user/remote-access.md)
- [保持应用与服务器版本同步](./docs/user/updating.md)
- [源代码管理集成](./docs/user/source-control.md)
- 多账号：[Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- [将 T3 Code 作为后台服务运行](./docs/user/background-service.md)

想从源码构建？请先阅读 [docs/internals/overview.md](./docs/internals/overview.md)。

## 如果你仍然非常想参与贡献……请先阅读以下内容

### 安装 `vp`

T3 Code 使用 Vite+，因此你需要安装全局 `vp` 命令行工具。

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

更多信息请参阅其入门指南：https://viteplus.dev/guide/

### 安装依赖

```bash
vp i
```

报告 Bug 或发起 PR 前，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

有功能建议？请发起 [Ideas 讨论](https://github.com/pingdotgg/t3code/discussions/categories/ideas)。

需要帮助？欢迎加入 [Discord](https://discord.gg/jn4EGJjrvv)。
