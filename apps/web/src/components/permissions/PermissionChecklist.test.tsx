import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  secretRequestDisplay,
  secretRequestPrivacyNote,
} from "@t3tools/client-runtime/secret-request";
import { WebI18nContext } from "../../i18n/WebI18nContext";
import { translateWebMessage, translateWebSource } from "../../i18n/messages";
import { PermissionChecklist, PermissionContinueButton } from "./PermissionChecklist";

vi.mock("../ui/button", () => ({
  Button: ({ children, disabled, onClick }: ComponentProps<"button">) =>
    createElement("button", { disabled, onClick }, children),
}));
const noop = () => undefined;
function render(locale: "en" | "zh-CN", children: ReactNode) {
  return renderToStaticMarkup(
    <WebI18nContext.Provider
      value={{
        locale,
        appLocale: locale,
        setAppLocale: noop,
        t: (key, values) => translateWebMessage(locale, key, values),
      }}
    >
      {children}
    </WebI18nContext.Provider>,
  );
}

describe("permission controls", () => {
  it("renders translated granted/request labels and leaves supplied content untouched", () => {
    for (const granted of [true, false])
      for (const busy of [true, false]) {
        const html = render(
          "zh-CN",
          <PermissionChecklist
            busy={busy}
            permissions={[
              {
                id: "a",
                icon: null,
                title: "Open",
                description: "Continue",
                granted,
                onAllow: noop,
              },
            ]}
          />,
        );
        expect(html).toContain(">Open<");
        expect(html).toContain(">Continue<");
        expect(html).toContain(granted ? "已允许" : "允许");
        expect(html.includes("disabled")).toBe(!granted && busy);
        expect(html.includes("<button")).toBe(!granted);
      }
  });
  it("preserves continue readiness and caller-provided children", () => {
    for (const ready of [true, false])
      for (const busy of [true, false]) {
        const html = render("zh-CN", <PermissionContinueButton ready={ready} busy={busy} />);
        expect(html).toContain("继续");
        expect(html.includes("disabled")).toBe(!ready || busy);
      }
    expect(render("en", <PermissionContinueButton ready />)).toContain("Continue");
    expect(
      render("zh-CN", <PermissionContinueButton ready>Open</PermissionContinueButton>),
    ).toContain(">Open<");
    expect(
      render("zh-CN", <PermissionContinueButton ready>{null}</PermissionContinueButton>),
    ).not.toContain("继续");
  });
});

describe("secret permission copy", () => {
  it("states file delivery can be read by agent commands for 24 hours", () => {
    const file = translateWebSource("zh-CN", secretRequestPrivacyNote({ delivery: "file" }));
    expect(file).toContain("24 小时");
    expect(file).toContain("智能体的命令");
    expect(file).not.toContain("绝不");
    expect(translateWebSource("zh-CN", secretRequestPrivacyNote({}))).toBe(
      "安全存储，绝不向智能体显示",
    );
  });
  it("translates every finite answered and inherited status without changing outcomes", () => {
    for (const secretStatus of ["pending", "saved", "declined", "cancelled"] as const)
      for (const visibility of ["local", "inherited", "synthetic"] as const) {
        const display = secretRequestDisplay({ secretStatus }, visibility);
        if (display.kind === "pending") {
          expect(secretStatus).toBe("pending");
          expect(visibility).toBe("local");
          continue;
        }
        expect(translateWebSource("en", display.label)).toBe(display.label);
        expect(translateWebSource("zh-CN", display.label)).not.toBe(display.label);
      }
  });
});
