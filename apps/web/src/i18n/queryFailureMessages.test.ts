// @effect-diagnostics nodeBuiltinImport:off - verifies display boundaries against their production sources.
import * as NodeFS from "node:fs";
import { AuthDiagnosticsReadScope, AuthFilesystemReadScope } from "@t3tools/contracts";
import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";
import { resolveFilesystemReadAccess } from "@t3tools/client-runtime/state/filesystem";
import { describe, expect, it } from "vite-plus/test";
import {
  localizeUsageError,
  ProjectAppearanceTimeoutError,
  projectAppearanceFailureMessage,
  resolveLocalizedFilesystemReadAccess,
} from "./queryFailureMessages";
import { translateWebMessage } from "./messages";

const source = (path: string) => NodeFS.readFileSync(new URL(path, import.meta.url), "utf8");

describe("query failure presentation boundaries", () => {
  it("translates actual usage access outcomes on every render without changing stored statuses", () => {
    const outcomes = [
      resolveUsageAccess({ connectionPhase: "offline", session: null, hasSessionError: false }),
      resolveUsageAccess({ connectionPhase: "connected", session: null, hasSessionError: true }),
      resolveUsageAccess({
        connectionPhase: "connected",
        session: { authenticated: true, scopes: [] },
        hasSessionError: false,
      }),
      resolveUsageAccess({
        connectionPhase: "connected",
        session: { authenticated: true, scopes: [AuthDiagnosticsReadScope] },
        hasSessionError: false,
      }),
    ];
    for (const outcome of outcomes) {
      const original = { ...outcome };
      for (const locale of ["en", "zh-CN", "en"] as const) {
        const display = localizeUsageError(locale, outcome.error);
        if (locale === "en" || outcome.error === null) expect(display).toBe(outcome.error);
        else expect(display).toMatch(/[\u3400-\u9fff]/);
      }
      expect(outcome).toEqual(original);
    }
    const reportFailure = "This environment could not report usage.";
    expect(source("../state/usage.ts")).toContain(JSON.stringify(reportFailure));
    expect(localizeUsageError("zh-CN", reportFailure)).toBe("此环境无法报告用量。");
    expect(localizeUsageError("zh-CN", "provider /路径/$&/{name}")).toBe(
      "provider /路径/$&/{name}",
    );
    expect(localizeUsageError("zh-CN", `${reportFailure}\nexternal`)).toBe(
      `${reportFailure}\nexternal`,
    );
  });

  it("localizes only the fallback produced by filesystem access, not same-text external failures", () => {
    const offline = {
      isCatalogReady: true,
      connection: { phase: "offline", error: null },
      session: null,
      sessionError: null,
    } as const;
    const text = resolveFilesystemReadAccess(offline).error;
    expect(text).toBe("This environment is not connected.");
    expect(resolveLocalizedFilesystemReadAccess("zh-CN", offline)).toEqual({
      canReadFiles: false,
      isPending: false,
      error: "此环境尚未连接。",
    });
    for (const error of [text!, "provider/path/$&/{name}"]) {
      for (const input of [
        { ...offline, sessionError: error },
        { ...offline, connection: { ...offline.connection, error } },
      ]) {
        expect(resolveLocalizedFilesystemReadAccess("zh-CN", input)).toEqual(
          resolveFilesystemReadAccess(input),
        );
      }
    }
    for (const input of [
      { ...offline, isCatalogReady: false },
      { ...offline, connection: { phase: "connecting", error: null } as const },
      { ...offline, session: { authenticated: true, scopes: [AuthFilesystemReadScope] } },
      { ...offline, session: { authenticated: true, scopes: [] } },
    ])
      expect(resolveLocalizedFilesystemReadAccess("zh-CN", input)).toEqual(
        resolveFilesystemReadAccess(input),
      );
  });

  it("recognizes only its own project timeout instance, preserving provider messages and same-shape objects", () => {
    const failure = new ProjectAppearanceTimeoutError({});
    expect(source("../state/entities.ts")).toContain(
      "reject(new ProjectAppearanceTimeoutError({}))",
    );
    expect(source("../hooks/useNewProject.ts")).toContain(
      "projectAppearanceFailureMessage(readWebI18n().locale, error)",
    );
    for (const locale of ["en", "zh-CN", "en"] as const) {
      expect(projectAppearanceFailureMessage(locale, failure)).toBe(
        translateWebMessage(locale, "audit11.projectTimeout"),
      );
    }
    for (const external of [
      new Error(failure.message),
      { _tag: failure._tag },
      null,
      "provider/$&/{path}",
    ]) {
      expect(projectAppearanceFailureMessage("zh-CN", external)).toBeNull();
    }
    expect(failure.message).toBe("The project did not appear in the desktop app.");
  });

  it("keeps opaque pagination values and the four complete usage empty-state sentences", () => {
    const opaque = "refs/$&/{name}/中文";
    expect(translateWebMessage("en", "coreResidual.refs", { shown: opaque, total: 7 })).toBe(
      `Showing ${opaque} of 7 refs`,
    );
    expect(
      translateWebMessage("zh-CN", "coreResidual.refs", { shown: opaque, total: 7 }),
    ).toContain(opaque);
    for (const key of [
      "audit11.connectLimits",
      "audit11.connectUsage",
      "audit11.selectLimits",
      "audit11.selectUsage",
    ] as const) {
      expect(translateWebMessage("en", key)).toMatch(
        /^(Connect|Select) an environment to see (limits|usage)\.$/,
      );
      expect(translateWebMessage("zh-CN", key)).toMatch(/[\u3400-\u9fff]/);
    }
  });
});
