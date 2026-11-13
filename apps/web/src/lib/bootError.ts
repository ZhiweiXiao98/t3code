import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";

const FALLBACK_TRIAGE_COMMAND = "npx t3 triage";
const DOWNLOAD_URL = "https://t3.codes/download";
const ISSUE_URL = "https://github.com/pingdotgg/t3code/issues/new";
const LAST_FAILURE_KEY = "t3code:boot-failed-at";
const REPEAT_FAILURE_MS = 5 * 60_000;
const MAX_CAUSES = 3;
const MAX_ERROR_CHARS = 6_000;
const COPY_BLOCKED = "Copy was blocked. The text is selected so you can copy it manually.";
const UPDATE_DOWNLOAD_FAILED = "The update download failed. Try Download update again.";
const UPDATE_INSTALL_FAILED = "The update install failed. Try Restart to update again.";

type BootLocale = "en" | "zh-CN";

const BOOT_MESSAGES: Readonly<Record<string, string>> = {
  "T3 Code failed to start": "T3 Code 启动失败",
  "This browser appears to be offline. Check the connection, then reload.":
    "此浏览器似乎已离线。请检查网络连接，然后重新加载。",
  "We are not sure why. Try a reload first.": "暂时无法确定原因。请先尝试重新加载。",
  Reload: "重新加载",
  "Download update": "下载更新",
  "Restart to update": "重启以更新",
  "Copy command": "复制命令",
  Copied: "已复制",
  "Copied to clipboard.": "已复制到剪贴板。",
  "Copy error details": "复制错误详情",
  "Press ⌘C to copy": "按 ⌘C 复制",
  "Press Ctrl+C to copy": "按 Ctrl+C 复制",
  [COPY_BLOCKED]: "复制被阻止。已选中文本，你可以手动复制。",
  [UPDATE_DOWNLOAD_FAILED]: "更新下载失败。请再次尝试“下载更新”。",
  [UPDATE_INSTALL_FAILED]: "更新安装失败。请再次尝试“重启以更新”。",
  "More options if it keeps failing": "如果仍然失败，查看更多选项",
  "Download and reinstall the latest nightly build": "下载并重新安装最新的每日构建版",
  "Download and reinstall T3 Code": "下载并重新安装 T3 Code",
  "Run this on the computer that runs T3 Code. Your agent can check the local logs and help you file a bug report.":
    "请在运行 T3 Code 的计算机上执行此命令。你的智能体可以检查本地日志，并帮助你提交错误报告。",
  "Details may include local file paths and names. Check before sharing.":
    "详情可能包含本地文件路径和名称。请在分享前检查。",
  "File a bug report on GitHub": "在 GitHub 上提交错误报告",
};

export function bootMessage(locale: BootLocale, source: string): string {
  if (locale === "en") return source;
  if (Object.hasOwn(BOOT_MESSAGES, source)) return BOOT_MESSAGES[source]!;
  const progress = /^Downloading update \((-?\d+(?:\.\d+)?|NaN|Infinity)%\)$/.exec(source);
  return progress ? `正在下载更新（${progress[1]}%）` : source;
}

// Bootstrap must remain independent of settings, React, and the main application bundle.
export function resolveBootLocale(
  preference: unknown,
  runtimeLocales: readonly string[],
): BootLocale {
  if (preference === "en" || preference === "zh-CN") return preference;
  for (const candidate of runtimeLocales) {
    try {
      const locale = new Intl.Locale(candidate.trim());
      if (locale.language === "en") return "en";
      if (locale.language === "zh") return locale.maximize().script === "Hans" ? "zh-CN" : "en";
    } catch {
      // An invalid language tag must not hide the startup error.
    }
  }
  return "en";
}

export function readBootBrowserPreference(storage: Pick<Storage, "getItem">): unknown {
  try {
    const value: unknown = JSON.parse(storage.getItem("t3code:client-settings:v1") ?? "null");
    return typeof value === "object" && value !== null && "appLocale" in value
      ? value.appLocale
      : undefined;
  } catch {
    return undefined;
  }
}

function bootRuntimeLocales(bridge: DesktopBridge | undefined): readonly string[] {
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language];
  try {
    const system = bridge?.getSystemLocale?.();
    return system ? [system, ...browser] : browser;
  } catch {
    return browser;
  }
}

/** The Windows launcher is a `.cmd` run from PowerShell, which needs `&` to run a quoted path. */
function launcherCommand(launcherPath: string) {
  if (launcherPath.endsWith(".cmd")) {
    return /^[\w:\\.-]+$/.test(launcherPath)
      ? launcherPath
      : `& '${launcherPath.replace(/['\u2018\u2019\u201A\u201B]/g, "$&$&")}'`;
  }
  return /^[\w@%+=:,./-]+$/.test(launcherPath)
    ? launcherPath
    : `'${launcherPath.replaceAll("'", `'"'"'`)}'`;
}

/** Desktop can run its bundled launcher without Node; everything else falls back to npx. */
export async function resolveTriageCommand(bridge: DesktopBridge | undefined) {
  try {
    const state = await bridge?.cliCommand.getState();
    // Windows reports onPath from its PATH entry alone; only an existing launcher proves it runs.
    if (state?.launcherPath) {
      return state.onPath ? "t3 triage" : `${launcherCommand(state.launcherPath)} triage`;
    }
  } catch (error) {
    console.warn("Could not read the desktop CLI state.", error);
  }
  return FALLBACK_TRIAGE_COMMAND;
}

/** The update button only appears when the desktop updater has a newer build to offer. */
export function updateActionFor(state: DesktopUpdateState | null | undefined) {
  switch (state?.status) {
    case "available":
      return { kind: "download" } as const;
    case "downloading":
      return { kind: "downloading", percent: Math.round(state.downloadPercent ?? 0) } as const;
    case "downloaded":
      return { kind: "install" } as const;
    default:
      return null;
  }
}

function safeString(value: unknown) {
  try {
    return String(value);
  } catch {
    return "";
  }
}

function describeOne(value: unknown) {
  if (value instanceof Error) {
    const header = value.message ? `${value.name}: ${value.message}` : value.name;
    // V8 stacks start with the header; Safari and Firefox stacks do not.
    const stack = typeof value.stack === "string" ? value.stack : "";
    return stack === header || stack.startsWith(`${header}\n`)
      ? stack
      : [header, stack].filter(Boolean).join("\n");
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? safeString(value);
  } catch {
    return safeString(value);
  }
}

/** Hosts can name private machines, and pairing tokens live in query strings and hashes. */
function redact(text: string) {
  return text
    .replace(/\b[a-z][\w+.-]*:\/\/[^\s/?#'"()]+/gi, "")
    .replace(/[?#][^\s'"()]*=[^\s'"()]*?((?::\d+){1,2})?(?=[\s'"()]|$)/g, "$1");
}

export interface BootErrorEnvironment {
  readonly version: string;
  readonly channel: string;
  readonly surface: "desktop" | "web";
  readonly platform: string;
  readonly userAgent: string;
  readonly time: string;
}

/** Plain text that is shown and copied as-is, so users see exactly what they share. */
export function buildErrorReport(error: unknown, environment: BootErrorEnvironment) {
  const parts: Array<string> = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current != null && !seen.has(current) && parts.length <= MAX_CAUSES) {
    seen.add(current);
    const text = describeOne(current);
    parts.push(parts.length === 0 ? text : `Caused by: ${text}`);
    current = current instanceof Error ? current.cause : undefined;
  }
  let details = redact(parts.join("\n") || "(no error message)");
  if (details.length > MAX_ERROR_CHARS) {
    details = `${details.slice(0, MAX_ERROR_CHARS)}\n[truncated]`;
  }
  return [
    details,
    "",
    `Version: ${environment.version}`,
    `Channel: ${environment.channel}`,
    `Surface: ${environment.surface}`,
    `Platform: ${environment.platform}`,
    `User agent: ${environment.userAgent}`,
    `Time: ${environment.time}`,
  ].join("\n");
}

function clientPlatform(bridge: DesktopBridge | undefined) {
  try {
    return bridge?.getClientPlatform() ?? navigator.platform;
  } catch {
    return navigator.platform;
  }
}

function readEnvironment(bridge: DesktopBridge | undefined): BootErrorEnvironment {
  const version = import.meta.env.APP_VERSION;
  return {
    version,
    channel:
      import.meta.env.VITE_RELEASE_CHANNEL || /-(nightly|preview)\./.exec(version)?.[1] || "stable",
    surface: bridge ? "desktop" : "web",
    platform: clientPlatform(bridge),
    userAgent: navigator.userAgent,
    time: new Date().toISOString(),
  };
}

/** Opens More options by default when startup already failed in this tab a moment ago. */
function isRepeatFailure(now: number) {
  try {
    const previous = Number(sessionStorage.getItem(LAST_FAILURE_KEY));
    sessionStorage.setItem(LAST_FAILURE_KEY, String(now));
    return now - previous < REPEAT_FAILURE_MS;
  } catch {
    return false;
  }
}

const icon = (paths: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const COPY_ICON = icon(
  '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
);
const CHECK_ICON = icon('<path d="M20 6 9 17l-5-5"/>');

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: ReadonlyArray<Node | string> = [],
) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function selectContents(target: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function copySelection() {
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** Plain http has no Clipboard API, but the legacy copy command still works on a selection. */
function copyText(target: HTMLElement, onCopied: () => void, onBlocked: (hint: string) => void) {
  const fallback = () => {
    selectContents(target);
    if (copySelection()) return onCopied();
    onBlocked(
      /Mac|iPhone|iPad/.test(navigator.platform) ? "Press ⌘C to copy" : "Press Ctrl+C to copy",
    );
  };
  const clipboard = window.isSecureContext ? navigator.clipboard : undefined;
  if (typeof clipboard?.writeText !== "function") return fallback();
  clipboard.writeText(target.textContent ?? "").then(onCopied, fallback);
}

function mountUpdateButton(
  bridge: DesktopBridge,
  button: HTMLButtonElement,
  note: HTMLParagraphElement,
  announce: (text: string) => void,
  setText: (node: HTMLElement, source: string) => void,
) {
  let action: ReturnType<typeof updateActionFor> = null;
  let previousFailure = "";
  const render = (state: DesktopUpdateState) => {
    action = updateActionFor(state);
    button.hidden = action === null;
    // aria-disabled keeps keyboard focus on the button while the download runs.
    button.setAttribute("aria-disabled", String(action?.kind === "downloading"));
    if (action?.kind === "download") setText(button, "Download update");
    if (action?.kind === "downloading") setText(button, `Downloading update (${action.percent}%)`);
    if (action?.kind === "install") setText(button, "Restart to update");
    const failure = !action
      ? ""
      : state.errorContext === "download"
        ? UPDATE_DOWNLOAD_FAILED
        : state.errorContext === "install"
          ? UPDATE_INSTALL_FAILED
          : "";
    if (failure === previousFailure) return;
    previousFailure = failure;
    setText(note, failure);
    note.hidden = !failure;
    if (failure) announce(failure);
  };
  button.addEventListener("click", () => {
    const run =
      action?.kind === "install"
        ? bridge.installUpdate()
        : action?.kind === "download"
          ? bridge.downloadUpdate()
          : undefined;
    run?.then(
      (result) => render(result.state),
      (error: unknown) => console.warn("Could not update T3 Code.", error),
    );
  });
  // A pushed state is newer than the initial read, so the read must not overwrite it.
  let pushed = false;
  try {
    bridge.onUpdateState((state) => {
      pushed = true;
      render(state);
    });
    bridge.getUpdateState().then(
      (state) => pushed || render(state),
      (error: unknown) => console.warn("Could not read the desktop update state.", error),
    );
  } catch (error) {
    console.warn("Could not read the desktop update state.", error);
  }
}

export function showBootError(error: unknown) {
  console.error("T3 Code failed to start.", error);
  const bootShell = document.getElementById("boot-shell");
  if (!bootShell) return;

  const bridge = window.desktopBridge;
  const environment = readEnvironment(bridge);
  const offline = !bridge && navigator.onLine === false;
  const runtimeLocales = bootRuntimeLocales(bridge);
  let preference: unknown;
  if (!bridge) {
    try {
      preference = readBootBrowserPreference(window.localStorage);
    } catch {
      // Accessing localStorage itself can fail in restricted browser contexts.
    }
  }
  let locale = resolveBootLocale(preference, runtimeLocales);
  bootShell.lang = locale;
  const bindings = new Map<HTMLElement, Map<"textContent" | "title" | "aria-label", string>>();
  const setCopy = (
    node: HTMLElement,
    property: "textContent" | "title" | "aria-label",
    source: string,
  ) => {
    let properties = bindings.get(node);
    if (!properties) bindings.set(node, (properties = new Map()));
    properties.set(property, source);
    const value = bootMessage(locale, source);
    if (property === "aria-label") node.setAttribute(property, value);
    else node[property] = value;
  };
  const setText = (node: HTMLElement, source: string) => setCopy(node, "textContent", source);
  const localElement: typeof element = (tag, props = {}, children = []) => {
    const node = element(tag, props, children);
    if (tag !== "pre" && tag !== "code" && typeof props.textContent === "string")
      setText(node, props.textContent);
    if (typeof props.title === "string") setCopy(node, "title", props.title);
    return node;
  };

  const status = localElement("span", { className: "boot-error-sr" });
  status.setAttribute("aria-live", "polite");
  // Clearing first makes screen readers announce a repeated message.
  let announcement: ReturnType<typeof setTimeout> | undefined;
  const announce = (text: string) => {
    clearTimeout(announcement);
    setText(status, "");
    announcement = setTimeout(() => setText(status, text), 100);
  };

  const message = localElement("div", {}, [
    localElement("h1", { textContent: "T3 Code failed to start" }),
    localElement("p", {
      textContent: offline
        ? "This browser appears to be offline. Check the connection, then reload."
        : "We are not sure why. Try a reload first.",
    }),
  ]);
  message.setAttribute("role", "alert");

  const reload = localElement("button", {
    id: "boot-error-reload",
    type: "button",
    textContent: "Reload",
  });
  reload.addEventListener("click", () => window.location.reload());
  const update = localElement("button", { id: "boot-error-update", type: "button", hidden: true });
  const updateNote = localElement("p", { id: "boot-error-update-note", hidden: true });
  if (bridge) mountUpdateButton(bridge, update, updateNote, announce, setText);

  const command = localElement("code", { textContent: FALLBACK_TRIAGE_COMMAND });
  const copyCommand = localElement("button", {
    className: "boot-error-icon",
    type: "button",
    title: "Copy command",
    innerHTML: COPY_ICON,
  });
  setCopy(copyCommand, "aria-label", "Copy command");
  copyCommand.addEventListener("click", () =>
    copyText(
      command,
      () => {
        bindings.get(copyCommand)?.delete("textContent");
        copyCommand.innerHTML = CHECK_ICON;
        setCopy(copyCommand, "title", "Copied");
        setCopy(copyCommand, "aria-label", "Copied");
        announce("Copied to clipboard.");
      },
      (hint) => {
        setText(copyCommand, hint);
        setCopy(copyCommand, "title", hint);
        setCopy(copyCommand, "aria-label", hint);
        announce(COPY_BLOCKED);
      },
    ),
  );
  void resolveTriageCommand(bridge).then((value) => (command.textContent = value));

  let report = "(no error message)";
  try {
    report = buildErrorReport(error, environment);
  } catch (reportError) {
    console.warn("Could not describe the startup error.", reportError);
  }
  const details = localElement("pre", {
    id: "boot-error-details",
    tabIndex: 0,
    textContent: report,
  });
  const copyDetails = localElement("button", { type: "button", textContent: "Copy error details" });
  copyDetails.addEventListener("click", () =>
    copyText(
      details,
      () => {
        setText(copyDetails, "Copied");
        announce("Copied to clipboard.");
      },
      (hint) => {
        setText(copyDetails, hint);
        announce(COPY_BLOCKED);
      },
    ),
  );

  const issue = new URL(ISSUE_URL);
  issue.searchParams.set("template", "bug_report.yml");
  issue.searchParams.set("title", "T3 Code failed to start");
  issue.searchParams.set("area", "apps/web");
  issue.searchParams.set("version", `${environment.version} (${environment.channel})`);
  issue.searchParams.set("environment", `${environment.surface}, ${environment.platform}`);
  const link = (href: string, textContent: string) =>
    localElement("a", { href, textContent, target: "_blank", rel: "noreferrer" });
  const nightly = environment.channel === "nightly";

  const more = localElement("details", { open: isRepeatFailure(Date.now()) }, [
    localElement("summary", { textContent: "More options if it keeps failing" }),
    ...(bridge
      ? [
          link(
            nightly ? `${DOWNLOAD_URL}?channel=nightly` : DOWNLOAD_URL,
            nightly
              ? "Download and reinstall the latest nightly build"
              : "Download and reinstall T3 Code",
          ),
        ]
      : []),
    localElement("div", {}, [
      localElement("p", {
        textContent:
          "Run this on the computer that runs T3 Code. Your agent can check the local logs and help you file a bug report.",
      }),
      localElement("div", { id: "boot-error-command" }, [command, copyCommand]),
    ]),
    localElement("div", {}, [
      details,
      localElement("p", {
        textContent: "Details may include local file paths and names. Check before sharing.",
      }),
      localElement("div", { id: "boot-error-report" }, [
        copyDetails,
        link(issue.href, "File a bug report on GitHub"),
      ]),
    ]),
  ]);

  bootShell.replaceChildren(
    localElement("div", { id: "boot-error" }, [
      message,
      localElement("div", { id: "boot-error-actions" }, [reload, update]),
      updateNote,
      more,
      status,
    ]),
  );
  if (bridge) {
    try {
      void bridge.getClientSettings().then(
        (settings) => {
          locale = resolveBootLocale(settings?.appLocale, runtimeLocales);
          bootShell.lang = locale;
          for (const [node, properties] of bindings) {
            for (const [property, source] of properties) {
              const value = bootMessage(locale, source);
              if (property === "aria-label") node.setAttribute(property, value);
              else if (property === "title") node.title = value;
              else node.textContent = value;
            }
          }
        },
        () => undefined,
      );
    } catch {
      // A missing or broken bridge must not prevent the already rendered recovery UI.
    }
  }
}
