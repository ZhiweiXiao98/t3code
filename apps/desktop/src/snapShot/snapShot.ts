// @effect-diagnostics globalTimers:off -- The Electron window-blur handshake uses a native timeout outside any Effect fiber.
// @effect-diagnostics nodeBuiltinImport:off -- This desktop-only platform check reads procfs and resolves Wayland socket paths with Node.

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  SNAP_SHOT_ACCESSIBILITY_MAX_NODES,
  SNAP_SHOT_ACCESSIBILITY_MAX_SERIALIZED_CHARS,
  isModifierPairShortcut,
  snapShotModifierPairLabel,
  snapShotShortcutModifierPair,
  type SnapShotAccessibilityNode,
  type SnapShotKeyChord,
  type SnapShotModifier,
  type SnapShotShortcut,
  type DesktopSnapShotState,
} from "@t3tools/contracts";

interface AccessibilityTreeNode {
  readonly name?: string;
  readonly value?: string;
  readonly children: ReadonlyArray<AccessibilityTreeNode>;
}

const MAX_ACCESSIBILITY_TREE_NODES = 10_000;

export const WINDOWS_MODIFIER_PAIR_VIRTUAL_KEYS: Record<
  SnapShotModifier,
  readonly [number, number]
> = {
  shift: [0xa0, 0xa1],
  control: [0xa2, 0xa3],
  alt: [0xa4, 0xa5],
  meta: [0x5b, 0x5c],
};

const SNAP_SHOT_SHORTCUT_MESSAGES: Readonly<Record<string, string>> = {
  "Capture shortcut registration closed.": "截取快捷键注册已关闭。",
  "Shortcut permission request timed out. Try again.": "快捷键权限请求超时。请重试。",
  "Missing shortcut portal reply.": "未收到快捷键门户回复。",
  "The desktop shortcut service restarted. Retry the shortcut request.":
    "桌面快捷键服务已重启。请重试快捷键请求。",
  "Your desktop closed the capture shortcut. Retry the shortcut request.":
    "桌面系统已关闭截取快捷键。请重试快捷键请求。",
  "Invalid shortcut request handle.": "快捷键请求句柄无效。",
  "Invalid shortcut session handle.": "快捷键会话句柄无效。",
  "This key isn't supported as a Wayland capture shortcut. Choose another key.":
    "此按键不支持用作 Wayland 截图快捷键。请选择其他按键。",
  "Waiting for shortcut permission. Approve the desktop prompt if one appears.":
    "正在等待快捷键权限。如出现桌面提示，请批准。",
  "Connecting to Hyprland shortcuts…": "正在连接 Hyprland 快捷键…",
  "Couldn't connect to Hyprland shortcuts. Make sure xdg-desktop-portal-hyprland is running, then restart T3 Code.":
    "无法连接 Hyprland 快捷键。请确认 xdg-desktop-portal-hyprland 正在运行，然后重启 T3 Code。",
  "Could not register the capture shortcut.": "无法注册截取快捷键。",
  "Shortcut permission wasn't granted. Open shortcut permissions to allow it.":
    "未授予快捷键权限。请打开快捷键权限设置并允许。",
  "Shortcut permission wasn't granted. Allow T3 Code in your desktop's shortcut settings.":
    "未授予快捷键权限。请在桌面快捷键设置中允许 T3 Code。",
  "Your desktop could not create a capture shortcut session.": "桌面系统无法创建截取快捷键会话。",
  "Managed by Hyprland. Add the binding to your config and save it.":
    "由 Hyprland 管理。请将快捷键绑定添加到配置并保存。",
  "Hyprland did not register the capture action. Check that xdg-desktop-portal-hyprland is running, then restart T3 Code.":
    "Hyprland 未注册截取操作。请确认 xdg-desktop-portal-hyprland 正在运行，然后重启 T3 Code。",
  "No shortcut is assigned. Open shortcut permissions to choose one.":
    "尚未分配快捷键。请打开快捷键权限设置以选择。",
  "No shortcut is assigned. Choose one in your desktop's shortcut settings.":
    "尚未分配快捷键。请在桌面快捷键设置中选择。",
  "Could not connect to your desktop's shortcut service.": "无法连接到桌面快捷键服务。",
  "The Niri capture endpoint disconnected. Restart T3 Code.":
    "Niri 截取端点已断开连接。请重启 T3 Code。",
  "Set up the shortcut to add it to your Niri config.": "请设置快捷键，将其添加到 Niri 配置。",
  "Could not start the Niri capture endpoint. Another T3 Code instance may be using it.":
    "无法启动 Niri 截取端点。另一个 T3 Code 实例可能正在使用它。",
  "Modifier-pair shortcuts aren't available in this Wayland session. Choose another shortcut or use Take snapshot from the command palette.":
    "此 Wayland 会话不支持双修饰键快捷键。请选择其他快捷键，或使用命令面板中的“截取快照”。",
};

const SNAP_SHOT_STATE_MESSAGES: Readonly<Record<string, string>> = {
  "GNOME did not respond. Sign in to a GNOME Wayland session and try again.":
    "GNOME 未响应。请登录 GNOME Wayland 会话后重试。",
  "GNOME returned no setup information.": "GNOME 未返回设置信息。",
  "KDE hasn't granted capture access. Reinstall the capture helper in setup, then try again.":
    "KDE 尚未授予截取权限。请在设置中重新安装截取辅助程序，然后重试。",
  "The KDE capture helper did not respond. Reopen capture setup and check access.":
    "KDE 截取辅助程序未响应。请重新打开截取设置并检查权限。",
  "Capture helper files must be regular files. Remove the conflicting link before trying again.":
    "截取辅助程序文件必须是常规文件。请移除冲突的链接后重试。",
  "Hyprland capture did not respond. Check capture setup and try again.":
    "Hyprland 截取未响应。请检查截取设置后重试。",
  "The capture helper must be a regular file, not a link.":
    "截取辅助程序必须是常规文件，不能是链接。",
  "Could not check desktop capture support. Check your desktop session and try again.":
    "无法检查桌面截取支持。请检查桌面会话后重试。",
  "Could not list pending snapshots.": "无法列出待处理的快照。",
  "Could not read the snapshot.": "无法读取快照。",
  "Could not remove the snapshot.": "无法移除快照。",
  "SnapShots are not supported here.": "此处不支持快照。",
  "Enable SnapShots in Settings first.": "请先在设置中启用快照。",
  "No window was selected.": "未选择窗口。",
  "The active window is not available for capture.": "无法截取当前活动窗口。",
  "Finish SnapShot setup in Settings → SnapShots.": "请在“设置 → 快照”中完成快照设置。",
  "Could not capture the active window.": "无法截取当前活动窗口。",
  "SnapShots require a Wayland session. X11 capture is not supported.":
    "快照需要 Wayland 会话。不支持 X11 截取。",
  "SnapShots are not supported on this platform.": "此平台不支持快照。",
  "Allow Screen Recording in System Settings, then restart T3 Code.":
    "请在系统设置中允许屏幕录制，然后重启 T3 Code。",
  "Allow Accessibility in System Settings, then restart T3 Code.":
    "请在系统设置中允许辅助功能权限，然后重启 T3 Code。",
  "Allow Accessibility and Screen Recording in System Settings, then restart T3 Code.":
    "请在系统设置中允许辅助功能和屏幕录制权限，然后重启 T3 Code。",
  "Install the bundled extension to capture the active window without a picker. No download or administrator password is needed.":
    "安装随应用附带的扩展，即可直接截取活动窗口，无需选择窗口。无需下载或管理员密码。",
  "Installed. Save your work, sign out of GNOME and sign back in, then return here to enable the extension. Restarting T3 Code alone is not enough.":
    "已安装。请保存工作，退出 GNOME 并重新登录，然后返回此处启用扩展。仅重启 T3 Code 不足以生效。",
  "A newer extension is bundled with this app. Install it, then sign out and back in to load the update.":
    "此应用附带更新版本的扩展。安装后，请退出并重新登录以加载更新。",
  "GNOME has disabled user extensions. Turn on Extensions in the GNOME Extensions app, then check again. T3 Code will not enable your other extensions for you.":
    "GNOME 已禁用用户扩展。请在 GNOME 扩展应用中打开扩展开关，然后重新检查。T3 Code 不会替你启用其他扩展。",
  "The T3 Code extension is running. Active-window snapshots are available.":
    "T3 Code 扩展正在运行。现在可以截取活动窗口。",
  "GNOME could not load the extension. Check GNOME Extensions for details, or sign out and back in.":
    "GNOME 无法加载扩展。请在 GNOME 扩展应用中查看详情，或退出后重新登录。",
  "Enable the T3 Code extension to allow active-window snapshots. You can disable it here at any time.":
    "启用 T3 Code 扩展以截取活动窗口。你可以随时在此禁用。",
  "Could not check GNOME extension setup.": "无法检查 GNOME 扩展设置。",
  "Install the bundled helper to capture the window you're using.":
    "安装随应用附带的辅助程序，以截取正在使用的窗口。",
  "Install the bundled helper to capture the window you're using without a picker.":
    "安装随应用附带的辅助程序，即可直接截取正在使用的窗口，无需选择窗口。",
  "The Hyprland capture helper is missing from this build. Update or reinstall T3 Code.":
    "此构建缺少 Hyprland 截取辅助程序。请更新或重新安装 T3 Code。",
  "The capture helper is missing from this build. Update or reinstall T3 Code.":
    "此构建缺少截取辅助程序。请更新或重新安装 T3 Code。",
  "Update the bundled capture helper to continue.": "请更新随应用附带的截取辅助程序以继续。",
  "Helper ready. Hyprland may ask for screen-sharing permission on your first capture.":
    "辅助程序已就绪。首次截取时，Hyprland 可能会请求屏幕共享权限。",
  "Couldn't check Hyprland capture access.": "无法检查 Hyprland 截取权限。",
  "Couldn't check KDE capture access.": "无法检查 KDE 截取权限。",
  "KDE capture access is ready. Next, choose your shortcut.":
    "KDE 截取权限已就绪。接下来请选择快捷键。",
};

function translateKnownStateMessage(message: string): string {
  return Object.hasOwn(SNAP_SHOT_STATE_MESSAGES, message)
    ? SNAP_SHOT_STATE_MESSAGES[message]!
    : message;
}

export function localizeSnapShotStateMessages(
  state: DesktopSnapShotState,
  platform: NodeJS.Platform,
  chinese: boolean,
): DesktopSnapShotState {
  if (!chinese) return state;
  const shortcutMessage =
    state.shortcutMessage === snapShotShortcutRegistrationFailureMessage(state.shortcut, platform)
      ? snapShotShortcutRegistrationFailureMessage(state.shortcut, platform, true)
      : state.shortcutMessage !== null &&
          Object.hasOwn(SNAP_SHOT_SHORTCUT_MESSAGES, state.shortcutMessage)
        ? SNAP_SHOT_SHORTCUT_MESSAGES[state.shortcutMessage]!
        : state.shortcutMessage;
  const extension = state.gnomeExtension;
  const versionMessage =
    extension?.status === "unsupported"
      ? /^The bundled extension supports GNOME ([0-9]+(?:, [0-9]+)*)\. This session runs GNOME ([0-9]+)\.$/.exec(
          extension.message,
        )
      : null;
  return {
    ...state,
    shortcutMessage:
      state.shortcutLabel !== undefined &&
      shortcutMessage === `Desktop shortcut: ${state.shortcutLabel}`
        ? `桌面快捷键：${state.shortcutLabel}`
        : shortcutMessage,
    message: state.message === null ? null : translateKnownStateMessage(state.message),
    ...(extension
      ? {
          gnomeExtension: {
            ...extension,
            message: versionMessage
              ? `随应用附带的扩展支持 GNOME ${versionMessage[1]}。当前会话运行 GNOME ${versionMessage[2]}。`
              : translateKnownStateMessage(extension.message),
          },
        }
      : {}),
    ...(state.kdeHelper
      ? {
          kdeHelper: {
            ...state.kdeHelper,
            message: translateKnownStateMessage(state.kdeHelper.message),
          },
        }
      : {}),
    ...(state.hyprlandHelper
      ? {
          hyprlandHelper: {
            ...state.hyprlandHelper,
            message: translateKnownStateMessage(state.hyprlandHelper.message),
          },
        }
      : {}),
  };
}

export function snapShotShortcutRegistrationFailureMessage(
  shortcut: SnapShotShortcut,
  platform: NodeJS.Platform,
  chinese = false,
): string {
  return isModifierPairShortcut(shortcut)
    ? `${snapShotModifierPairLabel(
        snapShotShortcutModifierPair(shortcut),
        platform === "darwin",
      )}${chinese ? " 在此系统上不可用。" : " is not available on this system."}`
    : chinese
      ? "此快捷键已被系统或其他应用占用。"
      : "This shortcut is already used by the system or another app.";
}

const COMMON_MOD_ACTIONS: Readonly<Record<string, readonly [string, string]>> = {
  a: ["Select All", "全选"],
  c: ["Copy", "复制"],
  f: ["Find", "查找"],
  n: ["New", "新建"],
  o: ["Open", "打开"],
  p: ["Print", "打印"],
  q: ["Quit", "退出"],
  s: ["Save", "保存"],
  t: ["New Tab", "新建标签页"],
  v: ["Paste", "粘贴"],
  w: ["Close Window", "关闭窗口"],
  x: ["Cut", "剪切"],
  z: ["Undo", "撤销"],
};

export function snapShotShortcutSystemConflict(
  shortcut: SnapShotKeyChord,
  chinese = false,
): string | null {
  const modifierCount = [
    shortcut.modKey,
    shortcut.metaKey,
    shortcut.ctrlKey,
    shortcut.altKey,
    shortcut.shiftKey,
  ].filter(Boolean).length;
  if (modifierCount !== 1) return null;
  if (shortcut.shiftKey) {
    return chinese
      ? "Shift 组合键用于输入和选择文字。请再添加一个修饰键。"
      : "Shift combinations are used for typing and text selection. Add another modifier.";
  }
  const key = shortcut.key.toLowerCase();
  if (shortcut.modKey) {
    const action = COMMON_MOD_ACTIONS[key];
    return action
      ? chinese
        ? `此快捷键在大多数应用中用于“${action[1]}”。`
        : `This shortcut is ${action[0]} in most apps.`
      : null;
  }
  if (shortcut.ctrlKey && ["c", "d", "z"].includes(key)) {
    return chinese
      ? "此快捷键用于控制终端中正在运行的命令。"
      : "This shortcut controls running commands in terminals.";
  }
  if (shortcut.altKey && key === "tab")
    return chinese ? "系统使用 Alt+Tab 切换应用。" : "The system uses Alt+Tab to switch apps.";
  if (shortcut.metaKey && ["l", " "].includes(key)) {
    return chinese ? "系统已占用此快捷键。" : "The system already uses this shortcut.";
  }
  return null;
}

export function accessibleWindowText(root: AccessibilityTreeNode, maxChars: number): string {
  const seen = new Set<string>();
  const stack = [root];
  let text = "";
  let visited = 0;
  while (stack.length > 0 && text.length < maxChars && visited < MAX_ACCESSIBILITY_TREE_NODES) {
    const node = stack.pop()!;
    visited += 1;
    for (const value of [node.name, node.value]) {
      const candidate = value?.replaceAll("\0", "").trim();
      if (!candidate || seen.has(candidate)) continue;

      const separator = text ? "\n" : "";
      const remaining = maxChars - text.length - separator.length;
      if (remaining <= 0) return text;
      const candidateEnd =
        candidate.length <= remaining
          ? candidate.length
          : /[\uD800-\uDBFF]/.test(candidate[remaining - 1] ?? "")
            ? remaining - 1
            : remaining;
      if (candidateEnd === 0) return text;
      text += separator + candidate.slice(0, candidateEnd);
      if (candidateEnd < candidate.length) return text;
      seen.add(candidate);
    }
    stack.push(...node.children.toReversed());
  }
  return text;
}

type AccessibilityElement = {
  readonly role?: string;
  readonly name?: string | null;
  readonly value?: string | null;
  readonly description?: string | null;
  readonly bounds?: WindowBounds | null;
  readonly actions?: ReadonlyArray<string>;
  readonly active?: boolean;
  readonly busy?: boolean;
  readonly checked?: "on" | "off" | "mixed" | null;
  readonly editable?: boolean;
  readonly enabled?: boolean;
  readonly expanded?: boolean | null;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly visible?: boolean;
  readonly children?: () => Promise<ReadonlyArray<AccessibilityElement>>;
};

type MutableAccessibilityNode = Omit<SnapShotAccessibilityNode, "children"> & {
  children: Array<MutableAccessibilityNode>;
};

type CapturedImageSize = { readonly width: number; readonly height: number };

function safeProperty<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export function boundedSnapShotString(
  value: unknown,
  maxChars: number,
  onTruncated?: () => void,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.replaceAll("\0", "").trim();
  if (!candidate) return undefined;
  if (candidate.length <= maxChars) return candidate;
  onTruncated?.();
  const end = /[\uD800-\uDBFF]/.test(candidate[maxChars - 1] ?? "") ? maxChars - 1 : maxChars;
  return candidate.slice(0, end).trimEnd();
}

function capturedImageBounds(
  bounds: WindowBounds | null | undefined,
  sourceBounds: WindowBounds,
  imageSize: CapturedImageSize,
): SnapShotAccessibilityNode["bounds"] {
  if (
    bounds === null ||
    bounds === undefined ||
    sourceBounds.width <= 0 ||
    sourceBounds.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0 ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  ) {
    return null;
  }
  const scaleX = imageSize.width / sourceBounds.width;
  const scaleY = imageSize.height / sourceBounds.height;
  const left = Math.max(0, Math.round((bounds.x - sourceBounds.x) * scaleX));
  const top = Math.max(0, Math.round((bounds.y - sourceBounds.y) * scaleY));
  const right = Math.min(
    imageSize.width,
    Math.round((bounds.x + bounds.width - sourceBounds.x) * scaleX),
  );
  const bottom = Math.min(
    imageSize.height,
    Math.round((bounds.y + bounds.height - sourceBounds.y) * scaleY),
  );
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

function accessibilityNode(
  element: AccessibilityElement,
  elementBounds: WindowBounds | null | undefined,
  sourceBounds: WindowBounds,
  imageSize: CapturedImageSize,
  isRoot: boolean,
  locationsReliable: boolean,
  onTruncated: () => void,
): MutableAccessibilityNode {
  const name = boundedSnapShotString(
    safeProperty(() => element.name),
    1_000,
    onTruncated,
  );
  const value = boundedSnapShotString(
    safeProperty(() => element.value),
    8_000,
    onTruncated,
  );
  const description = boundedSnapShotString(
    safeProperty(() => element.description),
    2_000,
    onTruncated,
  );
  const checked = safeProperty(() => element.checked);
  const expanded = safeProperty(() => element.expanded);
  const state = {
    ...(safeProperty(() => element.active) === true ? { active: true } : {}),
    ...(safeProperty(() => element.busy) === true ? { busy: true } : {}),
    ...(checked === "on" || checked === "off" || checked === "mixed" ? { checked } : {}),
    ...(safeProperty(() => element.editable) === true ? { editable: true } : {}),
    ...(safeProperty(() => element.enabled) === false ? { enabled: false } : {}),
    ...(typeof expanded === "boolean" ? { expanded } : {}),
    ...(safeProperty(() => element.focused) === true ? { focused: true } : {}),
    ...(safeProperty(() => element.selected) === true ? { selected: true } : {}),
    ...(safeProperty(() => element.visible) === false ? { visible: false } : {}),
  };
  const actions = Array.from(
    new Set(
      (safeProperty(() => element.actions) ?? [])
        .map((action) => boundedSnapShotString(action, 100))
        .filter((action): action is string => action !== undefined),
    ),
  ).slice(0, 32);
  return {
    role:
      boundedSnapShotString(
        safeProperty(() => element.role),
        100,
      ) ?? "unknown",
    ...(name ? { name } : {}),
    ...(value && value !== name ? { value } : {}),
    ...(description && description !== name && description !== value ? { description } : {}),
    bounds: isRoot
      ? { x: 0, y: 0, width: imageSize.width, height: imageSize.height }
      : locationsReliable
        ? capturedImageBounds(elementBounds, sourceBounds, imageSize)
        : null,
    ...(Object.keys(state).length > 0 ? { state } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    children: [],
  };
}

function isAnonymousGroup(node: SnapShotAccessibilityNode): boolean {
  return (
    node.role === "group" &&
    node.name === undefined &&
    node.value === undefined &&
    node.description === undefined &&
    node.state === undefined &&
    node.actions === undefined
  );
}

function compactAccessibilityNodes(
  node: SnapShotAccessibilityNode,
  isRoot: boolean,
  descendantLocationsReliable: boolean,
): Array<MutableAccessibilityNode> {
  const children = node.children.flatMap((child) =>
    compactAccessibilityNodes(child, false, descendantLocationsReliable),
  );
  const compacted: MutableAccessibilityNode = {
    ...node,
    ...(!isRoot && !descendantLocationsReliable ? { bounds: null } : {}),
    children,
  };
  if (!isRoot && isAnonymousGroup(compacted)) {
    if (children.length === 0) return [];
    if (children.length === 1) return children;
  }
  return [compacted];
}

export function compactAccessibilityTree(
  root: SnapShotAccessibilityNode,
  options: { readonly descendantLocationsReliable?: boolean } = {},
): {
  readonly root: SnapShotAccessibilityNode;
  readonly truncated: boolean;
} {
  const compactedRoot = compactAccessibilityNodes(
    root,
    true,
    options.descendantLocationsReliable !== false,
  )[0]!;
  let nodes = 0;
  let serializedChars = 256;
  let truncated = false;

  const visit = (
    node: SnapShotAccessibilityNode,
    required: boolean,
  ): MutableAccessibilityNode | undefined => {
    const copy: MutableAccessibilityNode = { ...node, children: [] };
    const nodeChars = JSON.stringify(copy).length + 1;
    if (
      !required &&
      (nodes >= SNAP_SHOT_ACCESSIBILITY_MAX_NODES ||
        serializedChars + nodeChars > SNAP_SHOT_ACCESSIBILITY_MAX_SERIALIZED_CHARS)
    ) {
      truncated = true;
      return undefined;
    }
    nodes += 1;
    serializedChars += nodeChars;
    for (const child of node.children) {
      const childCopy = visit(child, false);
      if (!childCopy) break;
      copy.children.push(childCopy);
    }
    return copy;
  };

  return { root: visit(compactedRoot, true)!, truncated };
}

type AccessibleWindowElementTreeOptions = {
  readonly locationsReliable?: boolean;
  readonly onProgress?: (
    root: SnapShotAccessibilityNode,
    truncated: boolean,
    descendantLocationsReliable: boolean,
  ) => void;
  readonly shouldContinue?: () => boolean;
  readonly verifyDescendantLocations?: boolean;
};

export async function accessibleWindowElementTree(
  element: AccessibilityElement,
  sourceBounds: WindowBounds,
  imageSize: CapturedImageSize,
  options: AccessibleWindowElementTreeOptions = {},
): Promise<{ readonly root: SnapShotAccessibilityNode; readonly truncated: boolean } | undefined> {
  if (typeof element.children !== "function") return undefined;
  let nodes = 0;
  let truncated = false;
  let root: MutableAccessibilityNode | undefined;
  const shouldContinue = options.shouldContinue ?? (() => true);
  let descendantLocationVaries = false;
  let rootBounds = sourceBounds;

  const descendantLocationsReliable = () =>
    options.locationsReliable !== false &&
    (options.verifyDescendantLocations !== true || descendantLocationVaries);

  const visit = async (
    current: AccessibilityElement,
    required: boolean,
  ): Promise<MutableAccessibilityNode | undefined> => {
    if (!shouldContinue()) {
      truncated = true;
      return undefined;
    }
    if (nodes >= SNAP_SHOT_ACCESSIBILITY_MAX_NODES) {
      truncated = true;
      return undefined;
    }
    const elementBounds = safeProperty(() => current.bounds);
    if (required && elementBounds) rootBounds = elementBounds;
    if (
      !required &&
      elementBounds !== null &&
      elementBounds !== undefined &&
      (Math.abs(elementBounds.x - rootBounds.x) > 2 || Math.abs(elementBounds.y - rootBounds.y) > 2)
    ) {
      descendantLocationVaries = true;
    }
    const node = accessibilityNode(
      current,
      elementBounds,
      sourceBounds,
      imageSize,
      required,
      options.locationsReliable !== false,
      () => {
        truncated = true;
      },
    );
    nodes += 1;
    root ??= node;
    options.onProgress?.(root, true, descendantLocationsReliable());

    const readChildren = safeProperty(() => current.children);
    if (typeof readChildren !== "function") return node;
    let children: ReadonlyArray<AccessibilityElement>;
    try {
      children = await readChildren.call(current);
    } catch {
      truncated = true;
      return node;
    }
    if (!shouldContinue()) {
      truncated = true;
      return node;
    }
    for (const child of children) {
      const childNode = await visit(child, false);
      if (!childNode) break;
      node.children.push(childNode);
      options.onProgress?.(root, true, descendantLocationsReliable());
    }
    return node;
  };

  const completedRoot = await visit(element, true);
  if (!completedRoot) return undefined;
  const locationsReliable = descendantLocationsReliable();
  const compacted = compactAccessibilityTree(completedRoot, {
    descendantLocationsReliable: locationsReliable,
  });
  const completedTruncated = truncated || compacted.truncated;
  options.onProgress?.(compacted.root, completedTruncated, locationsReliable);
  return { root: compacted.root, truncated: completedTruncated };
}

type WindowBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export function findAccessibleWindow<
  T extends {
    readonly name: string | null;
    readonly bounds: WindowBounds | null;
    readonly active?: boolean;
  },
>(
  windows: readonly T[],
  captured: {
    readonly title: string;
    readonly sourceTitle?: string;
    readonly bounds: WindowBounds;
    readonly clientBounds?: WindowBounds | undefined;
    readonly platform?: NodeJS.Platform;
    readonly bundleId?: string | undefined;
  },
  matchMode: "screen-bounds" | "wayland" = "screen-bounds",
  options: { readonly allowUntitledUniqueBounds?: boolean } = {},
): T | undefined {
  const normalizeTitle = (value: string) => {
    const title = value.trim();
    // Terminal apps can animate a leading CLI spinner between capture and AT-SPI lookup.
    return matchMode === "wayland" ? title.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?:\s+|$)/u, "") : title;
  };
  const titles = new Set(
    [captured.title, captured.sourceTitle ?? ""].map(normalizeTitle).filter(Boolean),
  );
  // Wayland accessibility providers can expose window size without a screen position.
  const boundsKeys =
    matchMode === "wayland"
      ? (["width", "height"] as const)
      : (["x", "y", "width", "height"] as const);
  const candidateBounds =
    matchMode === "wayland" && captured.clientBounds
      ? [captured.bounds, captured.clientBounds]
      : [captured.bounds];
  const matchesBounds = (window: T) => {
    const bounds = window.bounds;
    return (
      bounds !== null &&
      candidateBounds.some((candidate) =>
        boundsKeys.every((key) => Math.abs(bounds[key] - candidate[key]) <= 2),
      )
    );
  };
  if (titles.size > 0) {
    const matches = windows.filter(
      (window) => titles.has(normalizeTitle(window.name ?? "")) && matchesBounds(window),
    );
    if (matches.length === 1) return matches[0];
    const activeMatches = matches.filter((window) => safeProperty(() => window.active) === true);
    if (activeMatches.length === 1) return activeMatches[0];
    if (matches.length > 1) return undefined;
    const browserMatch = findBrowserTitleMatch(windows, titles, captured, matchMode, matchesBounds);
    if (browserMatch) return browserMatch;
  }
  // GTK4 frames may be unnamed; accept only a PID-scoped unique bounds match, never size alone.
  if (!options.allowUntitledUniqueBounds) return undefined;
  const boundsMatches = windows.filter(
    (window) => normalizeTitle(window.name ?? "") === "" && matchesBounds(window),
  );
  return boundsMatches.length === 1 ? boundsMatches[0] : undefined;
}

// Chrome's macOS AX title can append the browser and profile to the captured page title.
function findBrowserTitleMatch<T extends { readonly name?: string | null }>(
  windows: readonly T[],
  titles: ReadonlySet<string>,
  captured: { readonly platform?: NodeJS.Platform; readonly bundleId?: string | undefined },
  matchMode: "screen-bounds" | "wayland",
  matchesBounds: (window: T) => boolean,
): T | undefined {
  if (captured.platform !== "darwin" || matchMode !== "screen-bounds") return undefined;
  const browserName = /^com\.google\.Chrome(?:\.(?:beta|dev|canary))?$/.test(
    captured.bundleId ?? "",
  )
    ? "Google Chrome"
    : captured.bundleId === "org.chromium.Chromium"
      ? "Chromium"
      : undefined;
  if (!browserName) return undefined;
  const browserMatches = windows.filter((window) => {
    if (!matchesBounds(window)) return false;
    const name = window.name?.trim() ?? "";
    return [...titles].some((title) => {
      const prefix = `${title} - ${browserName}`;
      return (
        name === prefix ||
        (name.startsWith(prefix) && /^ [–—-] \S.*$/u.test(name.slice(prefix.length)))
      );
    });
  });
  return browserMatches.length === 1 ? browserMatches[0] : undefined;
}

// Keyed by the lowercase tokens parseKeybindingShortcut stores; Electron has no `ArrowUp` token.
const ELECTRON_KEY_NAMES: Readonly<Record<string, string>> = {
  " ": "Space",
  "+": "Plus",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  escape: "Esc",
};

export function sameSnapShotShortcut(left: SnapShotShortcut, right: SnapShotShortcut): boolean {
  if (isModifierPairShortcut(left) || isModifierPairShortcut(right)) {
    return (
      isModifierPairShortcut(left) &&
      isModifierPairShortcut(right) &&
      snapShotShortcutModifierPair(left) === snapShotShortcutModifierPair(right)
    );
  }
  return toElectronAccelerator(left) === toElectronAccelerator(right);
}

export function toElectronAccelerator(shortcut: SnapShotKeyChord): string {
  const parts: string[] = [];
  if (shortcut.modKey) parts.push("CommandOrControl");
  if (shortcut.metaKey) parts.push("Super");
  if (shortcut.ctrlKey) parts.push("Control");
  if (shortcut.altKey) parts.push("Alt");
  if (shortcut.shiftKey) parts.push("Shift");
  parts.push(ELECTRON_KEY_NAMES[shortcut.key] ?? shortcut.key.toUpperCase());
  return parts.join("+");
}

export function isWaylandSession(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): boolean {
  if (platform !== "linux") return false;
  if (
    environment.XDG_SESSION_TYPE?.toLowerCase() === "wayland" ||
    Boolean(environment.WAYLAND_DISPLAY)
  ) {
    return true;
  }
  if (environment.XDG_SESSION_TYPE?.toLowerCase() === "x11") return false;
  const runtimeDirectory = environment.XDG_RUNTIME_DIR;
  if (!runtimeDirectory) return false;
  try {
    const liveSockets = new Set(
      NodeFS.readFileSync("/proc/net/unix", "utf8")
        .split("\n")
        .flatMap((line) => line.match(/\s(\/.*)$/)?.[1] ?? []),
    );
    return NodeFS.readdirSync(runtimeDirectory, { withFileTypes: true }).some(
      (entry) =>
        /^wayland-\d+$/.test(entry.name) &&
        entry.isSocket() &&
        liveSockets.has(NodePath.join(runtimeDirectory, entry.name)),
    );
  } catch {
    return false;
  }
}
