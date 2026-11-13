import type { AlertButton, AlertOptions } from "react-native";
import { expect, it, vi } from "vite-plus/test";

const nativeAlert = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({ Alert: { alert: nativeAlert, prompt: vi.fn() } }));

it.each(["en", "zh-CN"] as const)(
  "localizes consent in %s without altering app data or approval, cancel and dismiss results",
  async (locale) => {
    vi.resetModules();
    const previous = process.env.EXPO_PUBLIC_APP_LOCALE;
    process.env.EXPO_PUBLIC_APP_LOCALE = locale;
    try {
      const { confirmMcpAppAction } = await import("./mcpAppConsent");
      const server = "Settings {0} $&";
      const cases = [
        {
          request: { kind: "tool", server, tool: "Open {1}", arguments: { Settings: "Open $&" } },
          title:
            locale === "en"
              ? "Allow Settings {0} $& to run Open {1}?"
              : "允许 Settings {0} $& 运行 Open {1}？",
          body: '{\n  "Settings": "Open $&"\n}',
          action: locale === "en" ? "Allow" : "允许",
        },
        {
          request: { kind: "link", server, url: "https://example.com/Settings?q=Open#save" },
          title:
            locale === "en"
              ? "Open a link from Settings {0} $&?"
              : "打开来自 Settings {0} $& 的链接？",
          body: "https://example.com/Settings?q=Open#save",
          action: locale === "en" ? "Open" : "打开",
        },
        {
          request: { kind: "message", server, text: "Settings" },
          title:
            locale === "en"
              ? "Send this message from Settings {0} $&?"
              : "发送来自 Settings {0} $& 的这条消息？",
          body: "Settings",
          action: locale === "en" ? "Send" : "发送",
        },
        {
          request: { kind: "file", server, names: ["Open", "Settings {0} $&.json"] },
          title:
            locale === "en"
              ? "Save a file from Settings {0} $&?"
              : "保存来自 Settings {0} $& 的文件？",
          body: "Open, Settings {0} $&.json",
          action: locale === "en" ? "Save" : "保存",
        },
      ] as const;
      for (const entry of cases) {
        for (const outcome of ["approve", "cancel", "dismiss"] as const) {
          const response = confirmMcpAppAction(entry.request);
          const [title, body, buttons, options] = nativeAlert.mock.lastCall as [
            string,
            string,
            AlertButton[],
            AlertOptions,
          ];
          expect(title).toBe(entry.title);
          expect(body).toBe(entry.body);
          expect(buttons.map((button) => button.text)).toEqual([
            locale === "en" ? "Cancel" : "取消",
            entry.action,
          ]);
          expect(options.cancelable).toBe(true);
          if (outcome === "dismiss") options.onDismiss?.();
          else buttons[outcome === "approve" ? 1 : 0]!.onPress?.();
          await expect(response).resolves.toBe(outcome === "approve");
        }
      }
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_APP_LOCALE;
      else process.env.EXPO_PUBLIC_APP_LOCALE = previous;
      vi.resetModules();
    }
  },
);
