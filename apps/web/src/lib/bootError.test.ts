import { resolveAppLocale } from "@t3tools/shared/appLocale";
import type { DesktopBridge, DesktopCliCommandState, DesktopUpdateState } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  type BootErrorEnvironment,
  buildErrorReport,
  bootMessage,
  resolveBootLocale,
  readBootBrowserPreference,
  resolveTriageCommand,
  updateActionFor,
} from "./bootError";

const desktopWith = (getState: () => Promise<DesktopCliCommandState>) =>
  ({ cliCommand: { getState } }) as unknown as DesktopBridge;

const notOnPath = (launcherPath: string | null): DesktopCliCommandState => ({
  supported: launcherPath !== null,
  installedPath: null,
  onPath: false,
  launcherPath,
});

describe("resolveTriageCommand", () => {
  it("prefers t3 on PATH, then the desktop launcher", async () => {
    const onPath = { ...notOnPath("/home/me/.t3/bin/t3"), onPath: true };
    await expect(resolveTriageCommand(desktopWith(async () => onPath))).resolves.toBe("t3 triage");
    await expect(
      resolveTriageCommand(desktopWith(async () => notOnPath("/home/me/.t3/bin/t3"))),
    ).resolves.toBe("/home/me/.t3/bin/t3 triage");
  });

  it("quotes launcher paths for the shell that runs them", async () => {
    await expect(
      resolveTriageCommand(desktopWith(async () => notOnPath("/Users/O'Neil/.t3/bin/t3"))),
    ).resolves.toBe(`'/Users/O'"'"'Neil/.t3/bin/t3' triage`);
    await expect(
      resolveTriageCommand(desktopWith(async () => notOnPath("C:\\Users\\Me\\.t3\\bin\\t3.cmd"))),
    ).resolves.toBe("C:\\Users\\Me\\.t3\\bin\\t3.cmd triage");
    await expect(
      resolveTriageCommand(
        desktopWith(async () => notOnPath("C:\\Users\\Jo O'Neil\\.t3\\bin\\t3.cmd")),
      ),
    ).resolves.toBe("& 'C:\\Users\\Jo O''Neil\\.t3\\bin\\t3.cmd' triage");
  });

  it("falls back to npx without a usable desktop launcher", async () => {
    using _warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(resolveTriageCommand(undefined)).resolves.toBe("npx t3 triage");
    await expect(resolveTriageCommand({} as DesktopBridge)).resolves.toBe("npx t3 triage");
    await expect(resolveTriageCommand(desktopWith(async () => notOnPath(null)))).resolves.toBe(
      "npx t3 triage",
    );
    const staleWindowsPathEntry = { ...notOnPath(null), supported: true, onPath: true };
    await expect(
      resolveTriageCommand(desktopWith(async () => staleWindowsPathEntry)),
    ).resolves.toBe("npx t3 triage");
    await expect(
      resolveTriageCommand(desktopWith(() => Promise.reject(new Error("ipc closed")))),
    ).resolves.toBe("npx t3 triage");
  });
});

const environment: BootErrorEnvironment = {
  version: "0.1.3-nightly.20261026.3707",
  channel: "nightly",
  surface: "web",
  platform: "MacIntel",
  userAgent: "Test",
  time: "2026-10-26T00:00:00.000Z",
};

describe("buildErrorReport", () => {
  it("drops hosts and tokens from URLs in the error", () => {
    const error = new TypeError(
      "Failed to fetch dynamically imported module: http://studio.tail1234.ts.net:3773/assets/a.js?pair=SECRET#token=SECRET",
      {
        cause: new Error(
          "ws://studio.tail1234.ts.net:3773/ws?token=SECRET closed, main-a.js?sig=SECRET",
        ),
      },
    );
    error.stack = `TypeError: ${error.message}\n    at http://studio.tail1234.ts.net:3773/src/main.tsx?t=1:10:5`;
    const report = buildErrorReport(error, environment);
    expect(report).not.toContain("SECRET");
    expect(report).not.toContain("tail1234");
    expect(report).toContain("module: /assets/a.js\n    at /src/main.tsx:10:5");
    expect(report).toContain("Caused by: Error: /ws closed, main-a.js");
    expect(report).toContain("Version: 0.1.3-nightly.20261026.3707");
  });

  it("keeps the header when a Firefox stack frame starts with the error name", () => {
    const error = new Error("boot failed");
    error.stack = "ErrorBoundary@/assets/main.js:1:2";
    expect(buildErrorReport(error, environment)).toMatch(
      /^Error: boot failed\nErrorBoundary@\/assets\/main.js:1:2\n/,
    );
    const unnamed = new Error();
    unnamed.stack = "ErrorBoundary@/assets/main.js:1:2";
    expect(buildErrorReport(unnamed, environment)).toMatch(/^Error\nErrorBoundary@/);
  });

  it("stops at cause cycles and survives values that are not errors", () => {
    const loop = new Error("outer");
    loop.cause = loop;
    expect(buildErrorReport(loop, environment).match(/outer/g)).toHaveLength(1);
    expect(buildErrorReport("plain text", environment)).toMatch(/^plain text\n/);
    expect(buildErrorReport({ code: 42 }, environment)).toMatch(/^\{"code":42\}\n/);
    expect(buildErrorReport(Object.create(null), environment)).toMatch(/^\{\}\n/);
    expect(buildErrorReport(undefined, environment)).toMatch(/^\(no error message\)\n/);
  });

  it("cuts long errors but keeps the environment", () => {
    const report = buildErrorReport("x".repeat(20_000), environment);
    expect(report).toContain("[truncated]");
    expect(report.length).toBeLessThan(7_000);
    expect(report).toContain("Time: 2026-10-26T00:00:00.000Z");
  });
});

describe("updateActionFor", () => {
  it("offers an action only when a newer build exists", () => {
    const state = (status: DesktopUpdateState["status"], downloadPercent: number | null = null) =>
      ({ status, downloadPercent }) as DesktopUpdateState;
    expect(updateActionFor(state("available"))).toEqual({ kind: "download" });
    expect(updateActionFor(state("downloading", 41.6))).toEqual({
      kind: "downloading",
      percent: 42,
    });
    expect(updateActionFor(state("downloaded"))).toEqual({ kind: "install" });
    for (const status of ["disabled", "idle", "checking", "up-to-date", "error"] as const) {
      expect(updateActionFor(state(status))).toBeNull();
    }
    expect(updateActionFor(undefined)).toBeNull();
  });
});

describe("bootstrap-only localization", () => {
  it("matches the shared locale resolver for every supported preference", () => {
    const runtimeLists: readonly (readonly string[])[] = [
      [],
      ["en-US"],
      ["zh"],
      ["zh-CN"],
      ["zh-SG"],
      ["zh-Hans-CN"],
      ["zh-TW"],
      ["zh-HK"],
      ["zh-Hant"],
      ["zh-CN", "en-US"],
      ["en-US", "zh-CN"],
      ["zh-TW", "zh-CN"],
      ["zh-CN", "zh-TW"],
      ["fr-FR", "zh-SG", "en-US"],
      ["invalid_tag", "", "  zh-CN  "],
      ["fr-FR", "de-DE"],
    ];
    for (const preference of ["en", "zh-CN", "system"] as const) {
      for (const runtimeLocales of runtimeLists) {
        expect(resolveBootLocale(preference, runtimeLocales)).toBe(
          resolveAppLocale(preference, runtimeLocales),
        );
      }
    }
  });

  it("uses explicit preferences and matches system locale fallback semantics", () => {
    expect(resolveBootLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveBootLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans-CN"]) {
      expect(resolveBootLocale("system", [tag, "en"])).toBe("zh-CN");
    }
    for (const tag of ["zh-TW", "zh-Hant", "zh-HK", "en-US"]) {
      expect(resolveBootLocale("system", [tag, "zh-CN"])).toBe("en");
    }
    expect(resolveBootLocale(undefined, ["invalid_tag", "fr-FR", "zh-CN"])).toBe("zh-CN");
    expect(resolveBootLocale("invalid", [])).toBe("en");
  });

  it("reads only the browser preference and survives blocked or malformed storage", () => {
    const getItem = vi.fn(() => '{"appLocale":"zh-CN","unrelated":"literal"}');
    expect(readBootBrowserPreference({ getItem })).toBe("zh-CN");
    expect(getItem).toHaveBeenCalledWith("t3code:client-settings:v1");
    for (const value of ["{", "null", '"en"', "[]", "{}"])
      expect(readBootBrowserPreference({ getItem: () => value })).toBeUndefined();
    expect(
      readBootBrowserPreference({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeUndefined();
  });

  it("translates recovery statuses without changing English or opaque content", () => {
    const cases = [
      ["T3 Code failed to start", "T3 Code 启动失败"],
      ["Downloading update (42%)", "正在下载更新（42%）"],
      [
        "The update download failed. Try Download update again.",
        "更新下载失败。请再次尝试“下载更新”。",
      ],
      [
        "The update install failed. Try Restart to update again.",
        "更新安装失败。请再次尝试“重启以更新”。",
      ],
      ["Press ⌘C to copy", "按 ⌘C 复制"],
      ["Press Ctrl+C to copy", "按 Ctrl+C 复制"],
      [
        "Copy was blocked. The text is selected so you can copy it manually.",
        "复制被阻止。已选中文本，你可以手动复制。",
      ],
    ] as const;
    for (const [source, translated] of cases) {
      expect(bootMessage("en", source)).toBe(source);
      expect(bootMessage("zh-CN", source)).toBe(translated);
    }
    for (const value of [
      "constructor",
      "provider/{message}/$&",
      "npx t3 triage",
      "external: Downloading update (42%)",
    ])
      expect(bootMessage("zh-CN", value)).toBe(value);
  });
});
