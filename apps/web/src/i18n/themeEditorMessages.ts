import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import type { ThemeColorRole } from "@t3tools/shared/themePalettes";

const ZH_CN_THEME_ROLES = {
  canvas: "背景",
  chrome: "界面框架",
  toolbar: "工具栏背景",
  toolbarForeground: "工具栏文本",
  toolbarBorder: "工具栏边框",
  toolbarControl: "工具栏控件",
  toolbarControlForeground: "工具栏控件文本",
  toolbarControlHover: "工具栏控件悬停",
  surface: "表面",
  surfaceRaised: "凸起表面",
  surfaceOverlay: "浮层表面",
  text: "文本",
  textMuted: "弱化文本",
  border: "边框",
  input: "输入框",
  focus: "焦点",
  accent: "强调色",
  accentForeground: "强调色前景",
  secondary: "次要颜色",
  secondaryForeground: "次要前景",
  muted: "弱化颜色",
  mutedForeground: "弱化前景",
  placeholder: "占位文本",
  secondaryLabel: "次要标签",
  iconMuted: "弱化图标",
  error: "错误",
  errorForeground: "错误文本",
  errorSurface: "错误背景",
  warning: "警告",
  warningForeground: "警告文本",
  warningSurface: "警告背景",
  update: "更新",
  updateForeground: "更新文本",
  updateSurface: "更新背景",
  accentSurface: "强调色表面",
  accentSurfaceForeground: "强调色表面前景",
  messageSurface: "消息背景",
  messageForeground: "消息前景",
  messageAction: "消息操作",
  messageActionForeground: "消息操作前景",
  messageActionHover: "消息操作悬停",
  codeBackground: "代码背景",
  codeForeground: "代码前景",
  searchMatchBackground: "搜索匹配背景",
  searchMatchForeground: "搜索匹配前景",
  searchMatchActiveBackground: "当前搜索匹配背景",
  searchMatchActiveForeground: "当前搜索匹配前景",
  sidebar: "侧边栏",
  sidebarForeground: "侧边栏前景",
  sidebarMutedForeground: "侧边栏弱化前景",
  sidebarControlSurface: "侧边栏控件背景",
  sidebarRowHover: "侧边栏行悬停",
  sidebarRowActive: "侧边栏活动行",
  sidebarRowSelected: "侧边栏选中行",
  sidebarBorder: "侧边栏边框",
  terminalBackground: "终端背景",
  terminalForeground: "终端前景",
  terminalCursor: "终端光标",
  terminalSelection: "终端选择区域",
  terminalScrollbar: "终端滚动条",
  terminalScrollbarHover: "终端滚动条悬停",
} as const satisfies Readonly<Record<ThemeColorRole, string>>;

const ZH_CN_THEME_EDITOR_SOURCE: Readonly<Record<string, string>> = {
  Saturation: "饱和度",
  Brightness: "亮度",
  "Name your theme first.": "请先为主题命名。",
  "Theme saved, but it could not be made active. Try again.": "主题已保存，但无法启用。请重试。",
  "Could not save the theme.": "无法保存主题。",
  "Could not create the theme.": "无法创建主题。",
};

/** English and unknown roles retain the caller's existing English-label fallback. */
export function getThemeRoleTranslation(
  locale: ResolvedAppLocale,
  role: ThemeColorRole,
): string | undefined {
  return locale === "zh-CN" && Object.hasOwn(ZH_CN_THEME_ROLES, role)
    ? ZH_CN_THEME_ROLES[role]
    : undefined;
}

/** Only known UI copy is translated; theme names and raw error messages stay opaque. */
export function translateThemeEditorSource(locale: ResolvedAppLocale, source: string): string {
  return locale === "zh-CN" && Object.hasOwn(ZH_CN_THEME_EDITOR_SOURCE, source)
    ? ZH_CN_THEME_EDITOR_SOURCE[source]!
    : source;
}
