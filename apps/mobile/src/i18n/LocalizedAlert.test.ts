import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Alert: { prompt: vi.fn(), alert: vi.fn() } }));

import { Alert } from "react-native";
import { LocalizedAlert } from "./LocalizedAlert";

describe("localized native prompts", () => {
  it("preserves omitted and explicitly undefined alert arguments", () => {
    LocalizedAlert.alert("Repository");
    expect(Alert.alert).toHaveBeenLastCalledWith("Repository");
    LocalizedAlert.alert("Repository", "Enter name");
    expect(Alert.alert).toHaveBeenLastCalledWith("Repository", "Enter name");
    LocalizedAlert.alert("Repository", undefined, undefined);
    expect(Alert.alert).toHaveBeenLastCalledWith("Repository", undefined, undefined);
    const onPress = vi.fn();
    const buttons = [{ text: "Continue", onPress }];
    const options = { cancelable: false };
    LocalizedAlert.alert("Repository", "Enter name", buttons, options);
    expect(Alert.alert).toHaveBeenLastCalledWith("Repository", "Enter name", buttons, options);
  });
  it("preserves React Native 0.88 nullable prompt arguments", () => {
    LocalizedAlert.prompt(null, null, null);
    expect(Alert.prompt).toHaveBeenLastCalledWith(null, null, null);
    LocalizedAlert.prompt(undefined);
    expect(Alert.prompt).toHaveBeenLastCalledWith(undefined);
  });

  it("preserves callbacks, entered defaults, and keyboard options", () => {
    const callback = vi.fn();
    const options = { userInterfaceStyle: "dark" as const };
    LocalizedAlert.prompt(
      "Repository",
      "Enter name",
      callback,
      "plain-text",
      "Settings",
      "default",
      options,
    );
    expect(Alert.prompt).toHaveBeenLastCalledWith(
      "Repository",
      "Enter name",
      callback,
      "plain-text",
      "Settings",
      "default",
      options,
    );
  });
});
