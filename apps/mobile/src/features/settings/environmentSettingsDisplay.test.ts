import {
  BearerConnectionProfile,
  BearerConnectionTarget,
  connectionRouteId,
  connectionRouteKind,
  type ConnectionRoute,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId, type ServerProviderUpdateState } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { expect, it } from "vite-plus/test";
import {
  environmentRouteDisplay,
  environmentUpdateConfirmation,
  environmentMaintenanceFailure,
  environmentProviderVersion,
  environmentProviderUpdateState,
} from "./environmentSettingsDisplay";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";

function route(url: string, learned = false): ConnectionRoute {
  const environmentId = EnvironmentId.make("Settings");
  return {
    target: new BearerConnectionTarget({ environmentId, label: "Open", connectionId: "same-id" }),
    profile: Option.some(
      new BearerConnectionProfile({
        connectionId: "same-id",
        environmentId,
        label: "Open",
        httpBaseUrl: url,
        wsBaseUrl: url.replace(/^http/, "ws"),
        ...(learned ? { learned: true as const } : {}),
      }),
    ),
  };
}

it("localizes route copy while preserving addresses, hostnames, ordering and removal identity", () => {
  const source = route("https://Settings.example.com/path/{0}/$&", true);
  expect(connectionRouteKind(source)).toBe("public");
  const snapshot = JSON.stringify(source);
  const identity = connectionRouteId(source.target);
  for (const locale of ["en", "zh-CN"] as const) {
    const display = environmentRouteDisplay(source, 2, 3, true, locale);
    expect(display.label).toBe("settings.example.com");
    expect(display.address).toBe("https://Settings.example.com/path/{0}/$&");
    expect(display.detail).toBe(
      locale === "en"
        ? `${display.address} · found automatically`
        : `${display.address} · 自动发现`,
    );
    expect(display.removeTitle).toBe(
      locale === "en" ? "Remove settings.example.com?" : "移除 settings.example.com？",
    );
    expect(display.accessibilityLabel).toBe(
      locale === "en"
        ? `settings.example.com, ${display.address}, Found automatically, In use, Route 2 of 3`
        : `settings.example.com, ${display.address}, 自动发现, 使用中, 第 2 条路线，共 3 条`,
    );
    expect(connectionRouteId(source.target)).toBe(identity);
    expect(JSON.stringify(source)).toBe(snapshot);
    const lanRoute = route("http://192.168.1.10:3773", true);
    expect(connectionRouteKind(lanRoute)).toBe("lan");
    const lan = environmentRouteDisplay(lanRoute, 1, 1, false, locale);
    expect(lan.label).toBe("LAN");
    expect(lan.address).toBe("http://192.168.1.10:3773");
    const localRoute = route("http://localhost:3773");
    expect(connectionRouteKind(localRoute)).toBe("loopback");
    const local = environmentRouteDisplay(localRoute, 1, 1, false, locale);
    expect(local.label).toBe(locale === "en" ? "This device" : "此设备");
    expect(local.detail).toBe("http://localhost:3773");
    expect(environmentRouteDisplay(route("invalid"), 1, 1, false, locale).label).toBe(
      locale === "en" ? "Remote link" : "远程链接",
    );
  }
});

it("formats update confirmations with literal environment names and version identifiers", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const desktop of [false, true]) {
      const name = "Settings {0} $&";
      const version = "Open/{1}/$&";
      const result = environmentUpdateConfirmation(name, version, desktop, locale);
      expect(result.title).toBe(locale === "en" ? `Update ${name}?` : `更新 ${name}？`);
      expect(result.message).toBe(
        locale === "en"
          ? `Install T3 Code ${version}. ${desktop ? "The desktop app will close and relaunch." : "The server will restart and reconnect."} Running threads may be interrupted.`
          : `安装 T3 Code ${version}。${desktop ? "桌面应用将关闭并重新启动" : "服务器将重启并重新连接"}，运行中的任务可能会被中断。`,
      );
      expect(environmentUpdateConfirmation(undefined, version, desktop, locale).title).toBe(
        locale === "en" ? "Update environment?" : "更新 环境？",
      );
    }
    for (const value of ["Settings", "Open", "The action could not be completed. Try again.", ""]) {
      expect(environmentMaintenanceFailure(new Error(value), locale)).toBe(value);
      expect(environmentProviderVersion({ installed: true, version: value }, locale)).toBe(value);
      expect(environmentProviderUpdateState({ status: "failed", message: value }, locale)).toBe(
        value,
      );
    }
    expect(environmentMaintenanceFailure(null, locale)).toBe(
      locale === "en" ? "The action could not be completed. Try again." : "无法完成操作。请重试。",
    );
  }
});

it("localizes only owned provider status fallbacks and latest-version templates", () => {
  const statuses: ServerProviderUpdateState["status"][] = [
    "idle",
    "queued",
    "running",
    "succeeded",
    "failed",
    "unchanged",
  ];
  const translations = ["更新空闲", "更新已排队", "正在更新", "更新成功", "更新失败", "无需更新"];
  statuses.forEach((status, index) => {
    expect(environmentProviderUpdateState({ status, message: null }, "en")).toBe(
      `Update ${status}`,
    );
    expect(environmentProviderUpdateState({ status, message: null }, "zh-CN")).toBe(
      translations[index],
    );
  });
  expect(formatMobileMessage("Latest {0}", ["Settings/{0}/$&"], "zh-CN")).toBe(
    "最新版本 Settings/{0}/$&",
  );
  expect(formatMobileMessage("Update {0}", ["Open"], "zh-CN")).toBe("更新 Open");
});

it("translates every granted-scope title and unavailable-permission explanation without altering scope ids", async () => {
  const { AUTH_SCOPE_OPTIONS, sessionPermissionsUnavailableMessage } =
    await import("@t3tools/shared/authScopeOptions");
  const { localizeMobileString } = await import("../../i18n/mobileStrings");
  const before = JSON.stringify(AUTH_SCOPE_OPTIONS);
  for (const option of AUTH_SCOPE_OPTIONS) {
    expect(localizeMobileString(option.title, "en")).toBe(option.title);
    expect(localizeMobileString(option.title, "zh-CN")).not.toBe(option.title);
  }
  for (const input of [
    { connected: false, failed: false, rejected: false },
    { connected: true, failed: false, rejected: true },
    { connected: true, failed: true, rejected: false },
    { connected: true, failed: false, rejected: false },
  ]) {
    const message = sessionPermissionsUnavailableMessage(input);
    expect(localizeMobileString(message, "en")).toBe(message);
    expect(localizeMobileString(message, "zh-CN")).not.toBe(message);
  }
  expect(JSON.stringify(AUTH_SCOPE_OPTIONS)).toBe(before);
});
