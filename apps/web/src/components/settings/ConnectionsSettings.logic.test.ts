import { translateWebMessage } from "../../i18n/messages";
import { type DesktopUpdateState, type DesktopWslState, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  resolveLocalVersionStatusLabel,
  savedBackendFailure,
  networkMutationFailure,
  accessMutationFailure,
  formatAccessMutationError,
  formatNetworkMutationError,
  formatSavedBackendError,
  formatDesktopSshConnectionError,
  parseManualDesktopSshTarget,
  parseRemotePairingFields,
  applyWslEnableSelection,
  resolveAccessEnvironmentId,
  resolveTailscaleServeBaseUrl,
  selectQrEndpointOption,
  togglePairingScopeSelection,
} from "./ConnectionsSettings.logic";

describe("togglePairingScopeSelection", () => {
  it.each([
    {
      label: "adds terminal:read when terminal:operate is selected",
      current: ["orchestration:read"],
      scope: "terminal:operate",
      checked: true,
      expected: ["orchestration:read", "terminal:operate", "terminal:read"],
    },
    {
      label: "drops terminal:operate when terminal:read is cleared",
      current: ["terminal:read", "terminal:operate", "relay:read"],
      scope: "terminal:read",
      checked: false,
      expected: ["relay:read"],
    },
    {
      label: "keeps terminal:read when terminal:operate is cleared",
      current: ["terminal:read", "terminal:operate"],
      scope: "terminal:operate",
      checked: false,
      expected: ["terminal:read"],
    },
    {
      label: "toggles unrelated scopes on their own",
      current: ["terminal:read"],
      scope: "filesystem:read",
      checked: true,
      expected: ["terminal:read", "filesystem:read"],
    },
  ] as const)("$label", ({ current, scope, checked, expected }) => {
    expect(togglePairingScopeSelection(current, scope, checked)).toEqual(expected);
  });
});

describe("resolveTailscaleServeBaseUrl", () => {
  it.each([
    ["https://host.tail.ts.net:441/", 443, "https://host.tail.ts.net"],
    ["https://host.tail.ts.net:441/", 444, "https://host.tail.ts.net:444"],
  ] as const)("previews %s on port %i", (httpBaseUrl, port, expected) => {
    expect(resolveTailscaleServeBaseUrl({ httpBaseUrl }, port, true)).toBe(expected);
  });

  it("returns null without a pending endpoint", () => {
    expect(resolveTailscaleServeBaseUrl(null, 443, true)).toBeNull();
  });

  it.each([
    ["https://host.tail.ts.net:441/", 0, false],
    ["not a URL", 443, true],
  ] as const)("preserves %s when port %i cannot be previewed", (httpBaseUrl, port, isPortValid) => {
    expect(resolveTailscaleServeBaseUrl({ httpBaseUrl }, port, isPortValid)).toBe(httpBaseUrl);
  });
});

const baseWslState: DesktopWslState = {
  enabled: false,
  distro: null,
  available: true,
  wslOnly: true,
  distros: [],
  preflightError: null,
};

describe("applyWslEnableSelection", () => {
  it("clears WSL-only and updates the distro before enabling both backends", async () => {
    const calls: Array<string> = [];
    let persistedWslOnly = true;
    let persistedDistro: string | null = "Ubuntu";
    const setWslDistro = vi.fn(async (distro: string | null) => {
      calls.push(`setWslDistro:${distro ?? "default"}`);
      persistedDistro = distro;
      return { ...baseWslState, distro, wslOnly: persistedWslOnly };
    });
    const setWslBackendEnabled = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslBackendEnabled:${enabled}`);
      return {
        ...baseWslState,
        enabled,
        distro: persistedDistro,
        wslOnly: persistedWslOnly,
      };
    });
    const setWslOnly = vi.fn(async (enabled: boolean) => {
      calls.push(`setWslOnly:${enabled}`);
      persistedWslOnly = enabled;
      return { ...baseWslState, distro: persistedDistro, wslOnly: enabled };
    });

    const state = await applyWslEnableSelection({
      bridge: { setWslDistro, setWslBackendEnabled, setWslOnly },
      mode: "both",
      nextDistro: "Debian",
      persistedDistro: "Ubuntu",
    });

    expect(calls).toEqual(["setWslOnly:false", "setWslDistro:Debian", "setWslBackendEnabled:true"]);
    expect(state).toMatchObject({ enabled: true, distro: "Debian", wslOnly: false });
  });
});

describe("selectQrEndpointOption", () => {
  const options = [
    {
      id: "desktop-loopback:4780",
      preferenceKey: "desktop-core:loopback:http",
      qrShareable: false,
    },
    {
      id: "tailscale-ip:http://100.84.12.7:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "tailscale-ip:http://100.84.12.8:4780",
      preferenceKey: "tailscale:ip:http",
      qrShareable: true,
    },
    {
      id: "desktop-lan:http://192.168.1.42:4780",
      preferenceKey: "desktop-core:lan:http",
      qrShareable: true,
    },
  ];

  it("resolves an explicit selection by unique endpoint id, not the shared preference key", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:http://100.84.12.8:4780", null)?.id).toBe(
      "tailscale-ip:http://100.84.12.8:4780",
    );
  });

  it("skips non-QR-shareable options in the fallback so the panel never opens on loopback", () => {
    expect(selectQrEndpointOption(options, "tailscale-ip:gone", "nope")?.id).toBe(
      "tailscale-ip:http://100.84.12.7:4780",
    );
  });
});

describe("localized local version status", () => {
  const baseState: DesktopUpdateState = {
    enabled: true,
    status: "idle",
    channel: "latest",
    currentVersion: "1.0.0",
    hostArch: "x64",
    appArch: "x64",
    runningUnderArm64Translation: false,
    availableVersion: null,
    downloadedVersion: null,
    releaseNotes: [],
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
  it.each([
    { patch: null, english: "Up to date", chinese: "已是最新版本" },
    { patch: { status: "downloading" }, english: "Downloading update", chinese: "正在下载更新" },
    {
      patch: { status: "downloading", availableVersion: "v1.2.3-test" },
      english: "Downloading update v1.2.3-test",
      chinese: "正在下载更新 v1.2.3-test",
    },
    { patch: { status: "downloaded" }, english: "Update downloaded", chinese: "更新已下载" },
    {
      patch: { status: "checking", downloadedVersion: "1.2.3" },
      english: "Update 1.2.3 downloaded",
      chinese: "更新 1.2.3 已下载",
    },
    {
      patch: { status: "available", availableVersion: "1.2.4" },
      english: "Update 1.2.4 available",
      chinese: "有可用更新 1.2.4",
    },
    {
      patch: {
        status: "error",
        availableVersion: "1.2.4",
        errorContext: "download",
        canRetry: true,
      },
      english: "Update 1.2.4 available",
      chinese: "有可用更新 1.2.4",
    },
  ] as const)("preserves update state and version: $english", ({ patch, english, chinese }) => {
    const state = patch === null ? null : { ...baseState, ...patch };
    expect(resolveLocalVersionStatusLabel(state)).toBe(english);
    expect(
      resolveLocalVersionStatusLabel(state, (key, values) =>
        translateWebMessage("zh-CN", key, values),
      ),
    ).toBe(chinese);
  });
});

describe("resolveAccessEnvironmentId", () => {
  const primary = EnvironmentId.make("primary");
  const service = EnvironmentId.make("service");
  const laptop = EnvironmentId.make("laptop");
  it.each([
    {
      label: "defaults to the primary environment",
      primaryEnvironmentId: primary,
      environments: [
        { environmentId: primary, connected: true },
        { environmentId: service, connected: true },
      ],
      selected: null,
      expected: primary,
    },
    {
      label: "falls back to a connected saved environment without a primary",
      primaryEnvironmentId: null,
      environments: [
        { environmentId: laptop, connected: false },
        { environmentId: service, connected: true },
      ],
      selected: null,
      expected: service,
    },
    {
      label: "keeps an explicit choice",
      primaryEnvironmentId: primary,
      environments: [
        { environmentId: primary, connected: true },
        { environmentId: laptop, connected: false },
      ],
      selected: laptop,
      expected: laptop,
    },
    {
      label: "drops a choice that is no longer listed",
      primaryEnvironmentId: null,
      environments: [{ environmentId: service, connected: true }],
      selected: laptop,
      expected: service,
    },
    {
      label: "has nothing to show without environments",
      primaryEnvironmentId: null,
      environments: [],
      selected: null,
      expected: null,
    },
  ])("$label", ({ primaryEnvironmentId, environments, selected, expected }) => {
    expect(resolveAccessEnvironmentId({ primaryEnvironmentId, environments, selected })).toBe(
      expected,
    );
  });
});

describe("saved backend owned errors", () => {
  it("keeps cached fallback identities separate from exact raw collisions", () => {
    const cases = [
      ["enable", "Failed to switch the backend on.", "开启后端失败。"],
      ["disable", "Failed to switch the backend off.", "关闭后端失败。"],
      ["remove", "Failed to remove backend.", "移除后端失败。"],
      ["add", "Failed to add backend.", "添加后端失败。"],
      ["route", "Could not add the route.", "无法添加路由。"],
      ["ssh", "Failed to connect SSH host.", "连接 SSH 主机失败。"],
    ] as const;
    for (const [code, english, chinese] of cases) {
      const owned = savedBackendFailure(null, code);
      const raw = savedBackendFailure(new Error(english), code);
      for (const locale of ["en", "zh-CN", "en"] as const) {
        expect(formatSavedBackendError(locale, owned)).toBe(locale === "en" ? english : chinese);
        expect(formatSavedBackendError(locale, raw)).toBe(english);
        expect(formatSavedBackendError(locale, savedBackendFailure(new Error(""), code))).toBe("");
      }
    }
  });
  it("marks only real parser errors without changing parser messages or successful values", () => {
    const cases = [
      [
        () => parseManualDesktopSshTarget({ host: "", username: "", port: "" }),
        "SSH host or alias is required.",
        "请输入 SSH 主机或别名。",
      ],
      [
        () =>
          parseManualDesktopSshTarget({ host: "opaque/$&/{host}", username: "", port: "65536" }),
        "SSH port must be between 1 and 65535.",
        "SSH 端口必须介于 1 和 65535 之间。",
      ],
      [
        () => parseRemotePairingFields({ host: "", pairingCode: "opaque" }),
        "Enter a backend host.",
        "请输入后端主机。",
      ],
      [
        () => parseRemotePairingFields({ host: "opaque/$&/{host}", pairingCode: "" }),
        "Enter a pairing code.",
        "请输入配对码。",
      ],
    ] as const;
    for (const [parse, english, chinese] of cases) {
      let failure: unknown;
      try {
        parse();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(english);
      const value = savedBackendFailure(failure, "add");
      for (const locale of ["en", "zh-CN", "en"] as const) {
        expect(formatSavedBackendError(locale, value)).toBe(locale === "en" ? english : chinese);
        expect(
          formatSavedBackendError(locale, savedBackendFailure(new Error(english), "add")),
        ).toBe(english);
        expect(
          formatSavedBackendError(locale, formatDesktopSshConnectionError(new Error(english))),
        ).toBe(english);
      }
    }
    let emptyHost: unknown;
    try {
      parseManualDesktopSshTarget({ host: "person@", username: "", port: "" });
    } catch (error) {
      emptyHost = error;
    }
    expect(formatSavedBackendError("zh-CN", formatDesktopSshConnectionError(emptyHost))).toBe(
      "请输入 SSH 主机或别名。",
    );
    const forged = Object.assign(new Error("SSH host or alias is required."), { code: "sshHost" });
    expect(formatSavedBackendError("zh-CN", savedBackendFailure(forged, "add"))).toBe(
      forged.message,
    );
    expect(
      parseManualDesktopSshTarget({ host: "devbox", username: "person", port: "2222" }),
    ).toEqual({ alias: "devbox", hostname: "devbox", username: "person", port: 2222 });
    expect(
      parseRemotePairingFields({ host: " opaque/$&/{host} ", pairingCode: " literal/$&/{token} " }),
    ).toEqual({ host: "opaque/$&/{host}", pairingCode: "literal/$&/{token}" });
  });
  it("preserves existing SSH cleanup and owns only generated fallbacks", () => {
    for (const input of [
      null,
      new Error("  "),
      new Error("Error invoking remote method 'desktop:ensure-ssh-environment': SshConnectError: "),
    ]) {
      expect(formatSavedBackendError("zh-CN", formatDesktopSshConnectionError(input))).toBe(
        "连接 SSH 主机失败。",
      );
    }
    const raw = "literal/$&/{host} 外部";
    expect(
      formatSavedBackendError(
        "zh-CN",
        formatDesktopSshConnectionError(
          new Error(
            `Error invoking remote method 'desktop:ensure-ssh-environment': SshConnectError: ${raw}  `,
          ),
        ),
      ),
    ).toBe(raw);
  });
});

it("keeps owned network mutation notices live while leaving raw and empty errors opaque", () => {
  for (const [code, english, chinese] of [
    ["exposure", "Failed to update network exposure.", "更新网络访问设置失败。"],
    ["tailscaleEnable", "Failed to configure Tailscale HTTPS.", "配置 Tailscale HTTPS 失败。"],
    ["tailscaleDisable", "Failed to disable Tailscale HTTPS.", "停用 Tailscale HTTPS 失败。"],
  ] as const) {
    const owned = networkMutationFailure(null, code);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      expect(formatNetworkMutationError(locale, owned)).toBe(locale === "en" ? english : chinese);
      for (const raw of [english, "", "opaque/$&/{host}"])
        expect(
          formatNetworkMutationError(locale, networkMutationFailure(new Error(raw), code)),
        ).toBe(raw);
    }
  }
});

it("retains owned revocation identities and exact raw or empty failures", () => {
  for (const [code, english, chinese] of [
    ["pairing", "Failed to revoke pairing link.", "撤销配对链接失败。"],
    ["client", "Failed to revoke client access.", "撤销客户端访问权限失败。"],
    ["others", "Failed to revoke other clients.", "撤销其他客户端失败。"],
  ] as const) {
    const owned = accessMutationFailure(null, code);
    for (const locale of ["en", "zh-CN", "en"] as const) {
      expect(formatAccessMutationError(locale, owned)).toBe(locale === "en" ? english : chinese);
      for (const raw of [english, "", "literal/$&/{client}"])
        expect(formatAccessMutationError(locale, accessMutationFailure(new Error(raw), code))).toBe(
          raw,
        );
    }
  }
});
