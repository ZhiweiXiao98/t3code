import { expect, it } from "@effect/vitest";
import { desktopCliMessage, type DesktopCliMessageKey } from "./DesktopCliCommandMessages.ts";

it.each([
  ["readPath", []],
  ["writePath", []],
  ["notExecutable", ["target"]],
  ["launcher", ["launcher"]],
  ["installedApp", []],
  ["semicolon", ["directory", "launcher"]],
  ["recordPath", []],
  ["shadowInstall", ["shadow", "launcher"]],
  ["noDirectory", ["launcher"]],
  ["remove", ["link"]],
  ["installFirst", []],
  ["unsupportedShell", []],
  ["shadowPath", ["shadow"]],
  ["addFile", ["file"]],
] satisfies [DesktopCliMessageKey, string[]][])(
  "preserves literal values for the %s presentation template",
  (key, names) => {
    const values = Object.fromEntries(
      names.map((name) => [name, `C:\\${name}:\n{0}/{launcher}/$&`]),
    );
    const english = desktopCliMessage("en", key, values);
    const chinese = desktopCliMessage("zh-CN", key, values);
    expect(chinese).not.toBe(english);
    for (const value of Object.values(values)) {
      expect(english).toContain(value);
      expect(chinese).toContain(value);
    }
    // Rendering is repeatable and never mutates the opaque caller-owned parameters.
    expect(desktopCliMessage("en", key, values)).toBe(english);
    expect(values).toEqual(
      Object.fromEntries(names.map((name) => [name, `C:\\${name}:\n{0}/{launcher}/$&`])),
    );
  },
);
