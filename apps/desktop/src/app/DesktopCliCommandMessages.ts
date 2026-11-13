import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";

const MESSAGES = {
  readPath: ["Could not read your PATH, so it was left unchanged.", "无法读取 PATH，已保持原样。"],
  writePath: ["Could not update your PATH.", "无法更新 PATH。"],
  notExecutable: ["{target} is not executable.", "{target} 不可执行。"],
  launcher: [
    "Could not set up the t3 launcher at {launcher}.",
    "无法在 {launcher} 设置 t3 启动器。",
  ],
  installedApp: ["The t3 command needs an installed app.", "t3 命令需要已安装的应用。"],
  semicolon: [
    'T3 Code cannot put {directory} on PATH because it has a ";". Run {launcher} directly.',
    "T3 Code 无法将 {directory} 加入 PATH，因为其中包含“;”。请直接运行 {launcher}。",
  ],
  recordPath: [
    "Added t3 to your PATH but could not record it.",
    "已将 t3 加入 PATH，但无法记录此更改。",
  ],
  shadowInstall: [
    "Another t3 at {shadow} runs first in a new terminal. Remove it, or run the launcher directly at {launcher}.",
    "新终端会优先运行 {shadow} 中的另一个 t3。请将其移除，或直接运行启动器 {launcher}。",
  ],
  noDirectory: [
    "Another t3 command is already in ~/.local/bin and ~/bin, or neither is writable. Run the launcher directly at {launcher}.",
    "~/.local/bin 和 ~/bin 中已有另一个 t3 命令，或两个目录均不可写。请直接运行启动器 {launcher}。",
  ],
  remove: ["Could not remove {link}.", "无法移除 {link}。"],
  installFirst: ["Install the t3 command first.", "请先安装 t3 命令。"],
  unsupportedShell: [
    "T3 Code cannot add t3 to this shell's PATH.",
    "T3 Code 无法将 t3 加入此 Shell 的 PATH。",
  ],
  shadowPath: [
    "Another t3 at {shadow} runs first; T3 Code leaves it in place.",
    "系统会优先运行 {shadow} 中的另一个 t3；T3 Code 会保留它。",
  ],
  addFile: ["Could not add t3 to {file}.", "无法将 t3 加入 {file}。"],
} as const;

export type DesktopCliMessageKey = keyof typeof MESSAGES;

export function desktopCliMessage(
  locale: ResolvedAppLocale,
  key: DesktopCliMessageKey,
  values: Readonly<Record<string, string>> = {},
): string {
  return MESSAGES[key][locale === "zh-CN" ? 1 : 0].replace(
    /\{([A-Za-z]+)\}/g,
    (placeholder, name: string) => (Object.hasOwn(values, name) ? values[name]! : placeholder),
  );
}
