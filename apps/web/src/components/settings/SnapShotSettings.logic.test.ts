import { assert, expect, it } from "vite-plus/test";
import { translateWebSource } from "../../i18n/messages";
import { DEFAULT_CLIENT_SETTINGS, type DesktopSnapShotState } from "@t3tools/contracts";

import {
  createRecordingRequestTracker,
  snapShotStatus,
  snapShotShortcutStatus,
  snapShotSetupSummary,
  snapShotSetupButtonLabel,
  snapShotSetupComplete,
} from "./SnapShotSettings.logic";

it("ignores a stale request after a newer request starts", () => {
  const requests = createRecordingRequestTracker();
  const firstRequest = requests.tryBegin();
  assert(firstRequest);

  requests.clear();
  const secondRequest = requests.tryBegin();
  assert(secondRequest);

  expect(requests.owns(firstRequest)).toBe(false);
  expect(requests.owns(secondRequest)).toBe(true);
  expect(requests.tryBegin()).toBeNull();
});

it.each(["gnome-extension", "picker"] as const)(
  "waits for opt-in before presenting %s setup requirements",
  (linuxBackend) => {
    const state: DesktopSnapShotState = {
      mode: "portal",
      linuxBackend,
      shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
      shortcutRegistered: false,
      shortcutMessage: "Shortcut permission needed",
      message: "Capture needs attention",
      gnomeExtension: { status: "not-installed", message: "Install the extension" },
    };

    expect(DEFAULT_CLIENT_SETTINGS.snapShotEnabled).toBe(false);
    expect(snapShotStatus(state, false)).toBe("Turn this on to set up snapshots.");
    expect(snapShotStatus(state, true)).toBe("Capture needs attention");
  },
);

it("distinguishes saved shortcuts from observed delivery without making users repeat setup", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "gnome-extension",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: "Requested",
    message: null,
    gnomeExtension: { status: "enabled", message: "Running" },
  };
  expect(snapShotSetupSummary(state, true)).toBe("Shortcut saved");
  expect(snapShotSetupButtonLabel(state)).toBe("Manage capture");
  expect(snapShotSetupSummary({ ...state, shortcutVerified: true }, true)).toBe("Ready to capture");
  expect(snapShotSetupButtonLabel({ ...state, shortcutVerified: true })).toBe("Manage capture");
  expect(snapShotSetupButtonLabel({ ...state, shortcutRegistered: false })).toBe("Manage capture");
  expect(
    snapShotSetupButtonLabel({
      ...state,
      gnomeExtension: { status: "disabled", message: "Enable the extension" },
    }),
  ).toBe("Set up GNOME capture");
  expect(snapShotSetupSummary({ ...state, shortcutVerified: true }, false)).toContain(
    "Enable capture",
  );
  expect(
    snapShotSetupSummary(
      {
        ...state,
        gnomeExtension: { status: "restart-required", message: "Sign out" },
        shortcutVerified: true,
      },
      true,
    ),
  ).toBe("Set up active-window snapshots");
  expect(
    snapShotSetupSummary(
      { ...state, linuxBackend: "niri", gnomeExtension: undefined, shortcutRegistered: false },
      true,
    ),
  ).toBe("Finish shortcut setup");
  expect(
    snapShotSetupSummary(
      { ...state, linuxBackend: "picker", gnomeExtension: undefined, shortcutVerified: true },
      true,
    ),
  ).toBe("Manual capture only. You'll choose a window each time");
  expect(
    snapShotSetupSummary(
      {
        ...state,
        linuxBackend: "screenshot-portal",
        gnomeExtension: { status: "not-installed", message: "Optional extension" },
        shortcutVerified: true,
      },
      true,
    ),
  ).toBe("Ready to capture");
});

it("reports pending, denied, and assigned shortcuts without inferring consent from saved keys", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "screenshot-portal",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutPending: true,
    shortcutMessage: null,
    message: null,
  };
  expect(snapShotStatus(state, true)).toContain("Waiting for shortcut permission");
  expect(snapShotShortcutStatus(state)).toContain("Approve the shortcut permission prompt");
  const denied = { ...state, shortcutPending: false, shortcutMessage: "Permission wasn't granted" };
  expect(snapShotShortcutStatus(denied)).toBe("Permission wasn't granted");
  const approved = {
    ...denied,
    shortcutRegistered: true,
    shortcutLabel: "Press <Shift><Control>2",
    shortcutMessage: "Desktop shortcut: Press <Shift><Control>2",
  };
  expect(snapShotStatus(approved, true)).toBe("Ready to capture");
  expect(snapShotShortcutStatus(approved)).toBeNull();
  expect(snapShotShortcutStatus({ ...approved, shortcutPending: true })).toContain(
    "Approve the shortcut permission prompt",
  );
  expect(
    snapShotShortcutStatus({
      ...approved,
      shortcutRegistered: false,
      shortcutMessage: "Permission wasn't granted",
    }),
  ).toBe("Permission wasn't granted");
});

it("hides macOS setup only while permissions and the shortcut are all in place", () => {
  const ready: DesktopSnapShotState = {
    mode: "direct",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: null,
    message: null,
    macPermissions: { screenRecording: true, accessibility: true },
  };
  expect(snapShotSetupComplete(ready, true)).toBe(true);
  expect(snapShotSetupComplete({ ...ready, macPermissions: undefined }, true)).toBe(false);
  expect(snapShotSetupComplete({ ...ready, shortcutRegistered: false }, true)).toBe(false);
  const revoked = {
    ...ready,
    macPermissions: { screenRecording: true, accessibility: false },
    message: "Allow Accessibility in System Settings, then restart T3 Code.",
  };
  expect(snapShotSetupComplete(revoked, true)).toBe(false);
  expect(snapShotStatus(revoked, true)).toBe("Capture needs attention");
  expect(snapShotSetupButtonLabel(revoked)).toBe("Continue setup");
  expect(snapShotSetupComplete({ ...revoked, message: null }, false)).toBe(true);
  expect(
    snapShotSetupComplete(
      { ...ready, windows: true, macPermissions: undefined, shortcutRegistered: false },
      true,
    ),
  ).toBe(true);
});

it.each(["Open", "Ready to save.", "Shortcut saved."])(
  "preserves raw shortcut messages that match translated UI copy: %s",
  (message) => {
    const state: DesktopSnapShotState = {
      mode: "direct",
      shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
      shortcutRegistered: false,
      shortcutMessage: message,
      message: null,
    };
    const translatedLabels: string[] = [];
    const formatLabel = (label: string) => {
      translatedLabels.push(label);
      return translateWebSource("zh-CN", label);
    };

    expect(translateWebSource("zh-CN", message)).not.toBe(message);
    expect(snapShotShortcutStatus(state, formatLabel)).toBe(message);
    expect(
      snapShotShortcutStatus(
        { ...state, mode: "portal", linuxBackend: "hyprland", shortcutPending: true },
        formatLabel,
      ),
    ).toBe(message);
    expect(translatedLabels).toEqual([]);
  },
);

it("formats only fixed shortcut labels and preserves the default English output", () => {
  const state: DesktopSnapShotState = {
    mode: "direct",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: "Open",
    message: null,
  };
  const formatLabel = (label: string) => translateWebSource("zh-CN", label);

  expect(snapShotShortcutStatus(state)).toBe("Shortcut saved.");
  expect(snapShotShortcutStatus(state, formatLabel)).toBe("快捷键已保存。");
  expect(snapShotShortcutStatus({ ...state, shortcutPending: true })).toBe(
    "Approve the shortcut permission prompt to continue.",
  );
  expect(snapShotShortcutStatus({ ...state, shortcutPending: true }, formatLabel)).toBe(
    "批准快捷键权限提示以继续。",
  );
  expect(snapShotShortcutStatus({ ...state, mode: "portal" }, formatLabel)).toBeNull();
});
