import { EnvironmentId, ORCHESTRATION_PROTOCOL_VERSION } from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse } from "@t3tools/contracts/relay";
import { expect, it } from "vite-plus/test";
import {
  connectionRowActionLabel,
  linkedEnvironmentStatus,
  connectionHostFreezeDisplay,
} from "./connectionDisplayStrings";
import { environmentStatusText } from "./environmentStatusText";
import { availableCloudEnvironmentPresentation } from "../cloud/cloudEnvironmentPresentation";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";

it("keeps opaque peer errors and host names literal while translating owned connection copy", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const detail of ["Settings", "Open", "Reachable", "", "{0} $&"]) {
      expect(linkedEnvironmentStatus({ kind: "unreachable", detail }, locale)).toBe(detail);
      expect(linkedEnvironmentStatus({ kind: "failing", detail }, locale)).toBe(detail);
      expect(
        environmentStatusText({ phase: "unsupported", error: detail, traceId: null }, locale),
      ).toBe(detail);
      const cloud = availableCloudEnvironmentPresentation(
        {
          isStatusPending: false,
          status: null,
          statusError: detail || null,
          statusErrorTraceId: "trace",
        },
        locale,
      );
      if (detail) {
        expect(cloud.statusText).toBe(detail);
        expect(cloud.connectionError).toBe(detail);
        expect(cloud.connectionErrorTraceId).toBe("trace");
      }
    }
    expect(linkedEnvironmentStatus({ kind: "unreachable", detail: null }, locale)).toBe(
      locale === "en" ? "Not answering right now." : "当前无响应。",
    );
    expect(linkedEnvironmentStatus({ kind: "reachable", expiresInDays: 1 }, locale)).toBe(
      locale === "en" ? "Expires in 1 day" : "1 天后过期",
    );
    expect(linkedEnvironmentStatus({ kind: "reachable", expiresInDays: 3 }, locale)).toBe(
      locale === "en" ? "Expires in 3 days" : "3 天后过期",
    );
    const host = "Settings {0} $&";
    expect(connectionRowActionLabel(host, true, false, locale)).toBe(
      locale === "en" ? `Manage ${host}` : `管理 ${host}`,
    );
    expect(connectionRowActionLabel(host, false, true, locale)).toBe(
      locale === "en" ? `Collapse details for ${host}` : `收起 ${host} 的详情`,
    );
    expect(connectionRowActionLabel(host, false, false, locale)).toBe(
      locale === "en" ? `Expand details for ${host}` : `展开 ${host} 的详情`,
    );
    expect(formatMobileMessage("Retrying · attempt {0}", [3], locale)).toBe(
      locale === "en" ? "Retrying · attempt 3" : "正在重试 · 第 3 次尝试",
    );
    expect(
      environmentStatusText({ phase: "error", error: "Settings {0} $&", traceId: null }, locale),
    ).toBe(
      locale === "en"
        ? "Connection failed. Reason: Settings {0} $&"
        : "连接失败。原因：Settings {0} $&",
    );
    expect(
      environmentStatusText({ phase: "reconnecting", error: "Open", traceId: null }, locale),
    ).toBe(
      locale === "en"
        ? "Failed to connect. Reconnecting... Reason: Open"
        : "连接失败，正在重新连接…原因：Open",
    );
    expect(
      availableCloudEnvironmentPresentation(
        { isStatusPending: true, status: null, statusError: null, statusErrorTraceId: null },
        locale,
      ).statusText,
    ).toBe(locale === "en" ? "Available · Checking relay status..." : "可用 · 正在检查中继状态…");
  }
});

it("formats only the host freeze display and preserves load and duration calculations", () => {
  const stall = {
    detectedAt: "2026-01-01T00:00:00Z",
    durationMs: 2600,
    cpuCount: 4,
    loadAverage: 8.2,
  };
  const before = JSON.stringify(stall);
  expect(connectionHostFreezeDisplay("Settings {0} $&", stall, "en")).toBe(
    "Settings {0} $& froze for 3s. Its CPU is overloaded (load 8 on 4 cores).",
  );
  expect(connectionHostFreezeDisplay("Settings {0} $&", stall, "zh-CN")).toBe(
    "Settings {0} $& 停顿了 3 秒. 其 CPU 负载过高（4 个核心上的负载为 8）。",
  );
  expect(connectionHostFreezeDisplay("Open", { ...stall, loadAverage: 1 }, "zh-CN")).toBe(
    "Open 停顿了 3 秒. Open 上的 T3 Code 太忙，未能响应。",
  );
  expect(connectionHostFreezeDisplay("Open", undefined, "zh-CN")).toBeNull();
  expect(JSON.stringify(stall)).toBe(before);
});

it("separates cloud status errors from owned relay and compatibility display", () => {
  const base: RelayEnvironmentStatusResponse = {
    environmentId: EnvironmentId.make("host"),
    endpoint: {
      httpBaseUrl: "https://host.test",
      wsBaseUrl: "wss://host.test/ws",
      providerKind: "t3_relay",
    },
    status: "offline",
    checkedAt: "2026-01-01T00:00:00Z",
  };
  const input = {
    isStatusPending: false,
    status: base,
    statusError: null,
    statusErrorTraceId: null,
  };
  for (const locale of ["en", "zh-CN"] as const) {
    const raw = availableCloudEnvironmentPresentation(
      { ...input, status: { ...base, error: "Settings" } },
      locale,
    );
    expect(raw.statusText).toBe("Settings");
    expect(raw.connectionError).toBe("Settings");
    const fallback = availableCloudEnvironmentPresentation(input, locale);
    expect(fallback.statusText).toBe(locale === "en" ? "Relay is offline." : "中继已离线。");
    expect(fallback.connectionError).toBe("Relay is offline.");
    const released = availableCloudEnvironmentPresentation(
      { ...input, status: { ...base, offlineReason: "tunnel_released", error: "Settings" } },
      locale,
    );
    expect(released.connectionError).toContain("Offline for a while");
    expect(released.statusText).toBe(
      locale === "en"
        ? released.connectionError
        : "由于离线了一段时间，其 T3 Connect 隧道已被移除。请在该电脑上启动 T3 Code 并更新到最新版本以重新连接。",
    );
    for (const version of [
      ORCHESTRATION_PROTOCOL_VERSION - 1,
      ORCHESTRATION_PROTOCOL_VERSION + 1,
    ]) {
      const source: RelayEnvironmentStatusResponse = {
        ...base,
        descriptor: {
          environmentId: base.environmentId,
          label: "Settings/{0}/$&",
          platform: { os: "darwin", arch: "arm64" },
          serverVersion: "Open",
          orchestrationProtocolVersion: version,
          capabilities: { repositoryIdentity: true },
        },
      };
      const before = JSON.stringify(source);
      const result = availableCloudEnvironmentPresentation({ ...input, status: source }, locale);
      expect(result.connectionState).toBe("unsupported");
      expect(result.statusText).toContain("Settings/{0}/$&");
      expect(result.connectionError).toContain("This client");
      if (locale === "en") expect(result.statusText).toBe(result.connectionError);
      else expect(result.statusText).toMatch(/此客户端|当前客户端/);
      expect(JSON.stringify(source)).toBe(before);
    }
  }
});
