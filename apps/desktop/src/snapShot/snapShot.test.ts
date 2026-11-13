import {
  isSnapShotMessageOwned,
  snapShotMessage,
  snapShotMessageFromError,
  snapShotOwnedError,
  snapShotShortcutMessage,
} from "./snapShotMessageProvenance.ts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  accessibleWindowElementTree,
  accessibleWindowText,
  compactAccessibilityTree,
  findAccessibleWindow,
  isWaylandSession,
  localizeSnapShotStateMessages,
  toElectronAccelerator,
} from "./snapShot.ts";

describe("accessibleWindowText", () => {
  it("caps large text without splitting a surrogate pair", () => {
    expect(
      accessibleWindowText(
        {
          value: "abc😀def",
          children: [],
        },
        5,
      ),
    ).toBe("abc😀");
  });

  it("stops traversing very large trees", () => {
    expect(
      accessibleWindowText(
        {
          children: [
            ...Array.from({ length: 10_000 }, () => ({ children: [] })),
            { value: "past node limit", children: [] },
          ],
        },
        100,
      ),
    ).not.toContain("past node limit");
  });
});

describe("accessibleWindowElementTree", () => {
  it("maps element bounds into captured-image pixels and keeps semantic state", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        name: "Editor",
        bounds: { x: 100, y: 200, width: 800, height: 600 },
        active: true,
        children: async () => [
          {
            role: "button",
            name: "Save",
            description: "Save the document",
            bounds: { x: 300, y: 350, width: 100, height: 50 },
            focused: true,
            actions: ["press", "press"],
            children: async () => [],
          },
        ],
      },
      { x: 100, y: 200, width: 800, height: 600 },
      { width: 1_600, height: 1_200 },
    );

    expect(tree).toEqual({
      truncated: false,
      root: {
        role: "window",
        name: "Editor",
        bounds: { x: 0, y: 0, width: 1_600, height: 1_200 },
        state: { active: true },
        children: [
          {
            role: "button",
            name: "Save",
            description: "Save the document",
            bounds: { x: 400, y: 300, width: 200, height: 100 },
            state: { focused: true },
            actions: ["press"],
            children: [],
          },
        ],
      },
    });
  });

  it("uses null child bounds when a Wayland provider reports only the root origin", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        children: async () => [
          {
            role: "button",
            name: "Save",
            bounds: { x: 0, y: 0, width: 100, height: 50 },
            children: async () => [],
          },
        ],
      },
      { x: 0, y: 0, width: 800, height: 600 },
      { width: 1_600, height: 1_200 },
      { locationsReliable: true, verifyDescendantLocations: true },
    );

    expect(tree?.root.bounds).toEqual({ x: 0, y: 0, width: 1_600, height: 1_200 });
    expect(tree?.root.children[0]?.bounds).toBeNull();
  });

  it("keeps Wayland child bounds after observing real position variation", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        children: async () => [
          {
            role: "button",
            name: "Save",
            bounds: { x: 20, y: 30, width: 100, height: 50 },
            children: async () => [],
          },
        ],
      },
      { x: 0, y: 0, width: 800, height: 600 },
      { width: 1_600, height: 1_200 },
      { locationsReliable: true, verifyDescendantLocations: true },
    );

    expect(tree?.root.children[0]?.bounds).toEqual({ x: 40, y: 60, width: 200, height: 100 });
  });

  it("does not mistake a title-bar offset for varying descendant positions", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        bounds: { x: 100, y: 229, width: 800, height: 571 },
        children: async () => [
          {
            role: "button",
            name: "Save",
            bounds: { x: 100, y: 229, width: 100, height: 50 },
            children: async () => [],
          },
        ],
      },
      { x: 100, y: 200, width: 800, height: 600 },
      { width: 1_600, height: 1_200 },
      { locationsReliable: true, verifyDescendantLocations: true },
    );
    expect(tree?.root.children[0]?.bounds).toBeNull();
  });

  it("collapses anonymous wrapper chains and removes duplicate text fields", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        name: "Editor",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        children: async () => [
          {
            role: "group",
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            children: async () => [
              {
                role: "group",
                bounds: { x: 0, y: 0, width: 800, height: 600 },
                children: async () => [
                  {
                    role: "button",
                    name: "Save",
                    value: "Save",
                    description: "Save",
                    bounds: { x: 20, y: 30, width: 80, height: 24 },
                    actions: ["press"],
                    children: async () => [],
                  },
                  {
                    role: "group",
                    bounds: null,
                    children: async () => [],
                  },
                ],
              },
            ],
          },
        ],
      },
      { x: 0, y: 0, width: 800, height: 600 },
      { width: 800, height: 600 },
    );

    expect(tree?.root.children).toEqual([
      {
        role: "button",
        name: "Save",
        bounds: { x: 20, y: 30, width: 80, height: 24 },
        actions: ["press"],
        children: [],
      },
    ]);
  });

  it("marks trees truncated before their serialized payload grows without bound", async () => {
    const tree = await accessibleWindowElementTree(
      {
        role: "window",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        children: async () =>
          Array.from({ length: 10 }, (_, index) => ({
            role: "text",
            value: `${index}${"x".repeat(8_000)}`,
            bounds: null,
            children: async () => [],
          })),
      },
      { x: 0, y: 0, width: 800, height: 600 },
      { width: 800, height: 600 },
    );

    expect(tree?.truncated).toBe(true);
    expect(tree?.root.children.length).toBeLessThan(10);
    expect(JSON.stringify(tree).length).toBeLessThanOrEqual(32_000);
  });
});

describe("compactAccessibilityTree", () => {
  it("keeps anonymous groups that organize multiple semantic children", () => {
    const compacted = compactAccessibilityTree({
      role: "window",
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      children: [
        {
          role: "group",
          bounds: { x: 0, y: 0, width: 800, height: 100 },
          children: [
            { role: "button", name: "Back", bounds: null, children: [] },
            { role: "button", name: "Forward", bounds: null, children: [] },
          ],
        },
      ],
    });

    expect(compacted.root.children[0]?.role).toBe("group");
    expect(compacted.root.children[0]?.children).toHaveLength(2);
  });
});

describe("findAccessibleWindow", () => {
  const captured = {
    title: "Editor",
    bounds: { x: 100, y: 200, width: 800, height: 600 },
  };

  const chromeCapture = {
    title: "Issues · pingdotgg/t3code",
    bounds: captured.bounds,
    platform: "darwin" as const,
    bundleId: "com.google.Chrome",
  };
  const chromeWindow = {
    name: `${chromeCapture.title} - Google Chrome – Profile`,
    bounds: chromeCapture.bounds,
    active: true,
  };

  it("uses a browser suffix only when no exact title matches", () => {
    const exact = { name: chromeCapture.title, bounds: chromeCapture.bounds };
    expect(findAccessibleWindow([chromeWindow, exact], chromeCapture)).toBe(exact);
    expect(findAccessibleWindow([chromeWindow], chromeCapture)).toBe(chromeWindow);
  });

  it("rejects browser suffix matches with wrong bounds, page titles, or ambiguous windows", () => {
    expect(
      findAccessibleWindow(
        [{ ...chromeWindow, bounds: { ...chromeWindow.bounds, x: 0 } }],
        chromeCapture,
      ),
    ).toBeUndefined();
    expect(
      findAccessibleWindow([chromeWindow, { ...chromeWindow, active: false }], chromeCapture),
    ).toBeUndefined();
    expect(
      findAccessibleWindow([chromeWindow], { ...chromeCapture, title: "Issues" }),
    ).toBeUndefined();
    expect(
      findAccessibleWindow([chromeWindow], {
        ...chromeCapture,
        title: `${chromeCapture.title} - Google Chrome`,
      }),
    ).toBeUndefined();
  });

  it("keeps strict titles outside macOS Chrome and Chromium", () => {
    for (const identity of [
      { platform: "linux" as const, bundleId: "com.google.Chrome" },
      { platform: "win32" as const, bundleId: "com.google.Chrome" },
      { platform: "darwin" as const, bundleId: "com.example.Editor" },
      { platform: "darwin" as const, bundleId: undefined },
    ]) {
      expect(
        findAccessibleWindow([chromeWindow], { ...chromeCapture, ...identity }),
      ).toBeUndefined();
    }
  });

  it("matches one window by its captured bounds", () => {
    const windows = [
      { name: "Private", bounds: { x: 0, y: 0, width: 400, height: 300 } },
      { name: "Editor", bounds: { x: 101, y: 199, width: 800, height: 601 } },
    ];

    expect(findAccessibleWindow(windows, captured)).toBe(windows[1]);
  });

  it("uses the captured source title when the active title changed", () => {
    const windows = [{ name: "Editor — saved", bounds: captured.bounds }];

    expect(
      findAccessibleWindow(windows, {
        ...captured,
        title: "Editor — saving",
        sourceTitle: "Editor — saved",
      }),
    ).toBe(windows[0]);
  });

  it("uses the active match to disambiguate equal windows", () => {
    const windows = [
      { name: "Editor", bounds: captured.bounds, active: false },
      { name: "Editor", bounds: captured.bounds, active: true },
    ];

    expect(findAccessibleWindow(windows, captured)).toBe(windows[1]);
  });

  it("does not match equal bounds with a different title", () => {
    expect(
      findAccessibleWindow(
        [{ name: "Private", bounds: { x: 100, y: 200, width: 800, height: 600 } }],
        captured,
      ),
    ).toBeUndefined();
  });

  it("matches a Wayland window whose accessibility provider omits its screen position", () => {
    const captured = {
      title: "hello world (Draft) - Text Editor",
      bounds: { x: 479, y: 342, width: 700, height: 520 },
    };
    const windows = [{ name: captured.title, bounds: { x: 0, y: 0, width: 700, height: 520 } }];

    expect(findAccessibleWindow(windows, captured, "wayland")).toBe(windows[0]);
    expect(findAccessibleWindow(windows, captured)).toBeUndefined();
  });

  it("matches a decorated Wayland window by its verified client size", () => {
    const clientBounds = { x: 100, y: 229, width: 800, height: 571 };
    const windows = [{ name: captured.title, bounds: { ...clientBounds, x: 0, y: 0 } }];
    expect(findAccessibleWindow(windows, { ...captured, clientBounds }, "wayland")).toBe(
      windows[0],
    );
    expect(findAccessibleWindow(windows, { ...captured, clientBounds })).toBeUndefined();
    expect(findAccessibleWindow(windows, captured, "wayland")).toBeUndefined();
  });

  it("does not guess between client-size and frame-size matches", () => {
    const clientBounds = { x: 100, y: 229, width: 800, height: 571 };
    const windows = [
      { name: captured.title, bounds: clientBounds },
      { name: captured.title, bounds: captured.bounds },
    ];
    expect(findAccessibleWindow(windows, { ...captured, clientBounds }, "wayland")).toBeUndefined();
    expect(
      findAccessibleWindow(
        [
          { name: "Private", bounds: clientBounds },
          { name: captured.title, bounds: { ...clientBounds, height: 550 } },
        ],
        { ...captured, clientBounds },
        "wayland",
      ),
    ).toBeUndefined();
  });

  it("distinguishes same-title Wayland windows by size", () => {
    const windows = [
      { name: "Editor", bounds: { x: 0, y: 0, width: 400, height: 300 } },
      { name: "Editor", bounds: { x: 0, y: 0, width: 801, height: 599 } },
    ];

    expect(findAccessibleWindow(windows, captured, "wayland")).toBe(windows[1]);
  });

  it("does not match an untitled Wayland window by size alone", () => {
    const windows = [{ name: "", bounds: captured.bounds }];

    expect(findAccessibleWindow(windows, { ...captured, title: "" }, "wayland")).toBeUndefined();
  });

  it("accepts one PID-scoped untitled window whose bounds match", () => {
    const windows = [{ name: null, bounds: captured.bounds }];

    expect(
      findAccessibleWindow(windows, captured, "wayland", { allowUntitledUniqueBounds: true }),
    ).toBe(windows[0]);
    expect(findAccessibleWindow(windows, captured, "wayland")).toBeUndefined();
  });

  it("does not fall back to a differently titled PID-scoped window with matching bounds", () => {
    const windows = [{ name: "Preferences", bounds: captured.bounds }];

    expect(
      findAccessibleWindow(windows, captured, "wayland", { allowUntitledUniqueBounds: true }),
    ).toBeUndefined();
  });

  it("does not use unique bounds when a titled match is already ambiguous", () => {
    const windows = [
      { name: "Editor", bounds: captured.bounds },
      { name: "Editor", bounds: { ...captured.bounds, x: 0, y: 0 } },
    ];

    expect(
      findAccessibleWindow(windows, captured, "wayland", { allowUntitledUniqueBounds: true }),
    ).toBeUndefined();
  });

  it.each([
    ["⠋ t3code", "t3code"],
    ["t3code", "⠙ t3code"],
  ])("matches a Wayland spinner starting or stopping: %s → %s", (title, name) => {
    const windows = [{ name, bounds: captured.bounds }];

    expect(findAccessibleWindow(windows, { ...captured, title }, "wayland")).toBe(windows[0]);
  });

  it.each([
    ["⠋ t3code", "⠙ private"],
    ["t3code ⠋", "t3code ⠙"],
    ["⠋t3code", "⠙t3code"],
    ["⠁ t3code", "⠙ t3code"],
    ["⠋", "⠋"],
  ])("does not guess a Wayland title match: %s → %s", (title, name) => {
    expect(
      findAccessibleWindow([{ name, bounds: captured.bounds }], { ...captured, title }, "wayland"),
    ).toBeUndefined();
  });
});

describe("toElectronAccelerator", () => {
  // The settings recorder stores shortcuts through parseKeybindingShortcut, which lowercases keys.
  it.each([
    ["mod+shift+arrowup", "CommandOrControl+Shift+Up"],
    ["mod+shift+arrowdown", "CommandOrControl+Shift+Down"],
    ["ctrl+alt+arrowleft", "Control+Alt+Left"],
    ["ctrl+alt+arrowright", "Control+Alt+Right"],
    ["mod+shift+esc", "CommandOrControl+Shift+Esc"],
    ["mod+shift+space", "CommandOrControl+Shift+Space"],
    ["mod+shift+2", "CommandOrControl+Shift+2"],
  ])("maps a recorded %s to an Electron accelerator", (recorded, accelerator) => {
    expect(toElectronAccelerator(parseKeybindingShortcut(recorded)!)).toBe(accelerator);
  });
});

describe("isWaylandSession", () => {
  effectIt.effect(
    "falls back to a live runtime directory socket when session variables are stripped",
    () =>
      Effect.gen(function* () {
        if ((yield* HostProcess.Platform) !== "linux") return;
        yield* Effect.promise(async () => {
          const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
          const { createServer } = await import("node:net");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");
          const runtimeDirectory = await mkdtemp(join(tmpdir(), "t3-wayland-"));
          const socketPath = join(runtimeDirectory, "wayland-0");
          const server = createServer();
          try {
            expect(isWaylandSession("linux", { XDG_RUNTIME_DIR: runtimeDirectory })).toBe(false);
            await writeFile(socketPath, "");
            expect(isWaylandSession("linux", { XDG_RUNTIME_DIR: runtimeDirectory })).toBe(false);
            await rm(socketPath);
            await new Promise<void>((resolve, reject) => {
              server.once("error", reject);
              server.listen(socketPath, resolve);
            });
            expect(isWaylandSession("linux", { XDG_RUNTIME_DIR: runtimeDirectory })).toBe(true);
            expect(
              isWaylandSession("linux", {
                XDG_RUNTIME_DIR: runtimeDirectory,
                XDG_SESSION_TYPE: "x11",
              }),
            ).toBe(false);
            expect(isWaylandSession("linux", { XDG_RUNTIME_DIR: "/nonexistent-t3-test" })).toBe(
              false,
            );
          } finally {
            if (server.listening) {
              await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
              });
            }
            await rm(runtimeDirectory, { recursive: true, force: true });
          }
        });
      }),
  );
});

describe("snapshot service message provenance", () => {
  const base = {
    mode: "portal" as const,
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: null,
    message: null,
  };

  it("keeps message fields independent across spreads and removes internal metadata in both locales", () => {
    const message = "Could not capture the active window.";
    const shortcutMessage = "Could not register the capture shortcut.";
    const state = {
      ...base,
      ...snapShotMessage(message),
      ...snapShotShortcutMessage(shortcutMessage),
      kdeHelper: { status: "error" as const, ...snapShotMessage(message, false) },
    };
    for (const chinese of [false, true]) {
      const result = localizeSnapShotStateMessages(state, "linux", chinese);
      expect(result).toEqual({
        ...base,
        message: chinese ? "无法截取当前活动窗口。" : message,
        shortcutMessage: chinese ? "无法注册截取快捷键。" : shortcutMessage,
        kdeHelper: { status: "error", message },
      });
      expect(Object.getOwnPropertySymbols(result)).toEqual([]);
      expect(Object.getOwnPropertySymbols(result.kdeHelper!)).toEqual([]);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
    const replaced = { ...state, ...snapShotMessageFromError(new Error(message), "fallback") };
    expect(isSnapShotMessageOwned(replaced, "message")).toBe(false);
    expect(isSnapShotMessageOwned(replaced, "shortcutMessage")).toBe(true);
    expect(localizeSnapShotStateMessages(replaced, "linux", true).message).toBe(message);
    const reset = { ...state, ...snapShotMessage(null), ...snapShotShortcutMessage(null) };
    expect(isSnapShotMessageOwned(reset, "message")).toBe(false);
    expect(isSnapShotMessageOwned(reset, "shortcutMessage")).toBe(false);
    expect(localizeSnapShotStateMessages(reset, "linux", true)).toEqual({
      ...base,
      kdeHelper: { status: "error", message },
    });
    expect(state.message).toBe(message);
    expect(state.shortcutMessage).toBe(shortcutMessage);
  });

  it("does not infer ownership from a matching dictionary entry, template, or prototype key", () => {
    for (const message of [
      "Could not capture the active window.",
      "constructor",
      "The bundled extension supports GNOME 46, 47. This session runs GNOME 49.",
    ]) {
      const state = {
        ...base,
        message,
        gnomeExtension: { status: "unsupported" as const, message },
      };
      expect(localizeSnapShotStateMessages(state, "linux", true)).toEqual(state);
      expect(localizeSnapShotStateMessages(state, "linux", false)).toBe(state);
    }
    const owned = snapShotOwnedError("Could not capture the active window.");
    expect(
      localizeSnapShotStateMessages(
        { ...base, ...snapShotMessageFromError(owned, "fallback") },
        "linux",
        true,
      ).message,
    ).toBe("无法截取当前活动窗口。");
    expect(owned.message).toBe("Could not capture the active window.");
  });
});
