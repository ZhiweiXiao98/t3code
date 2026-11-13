import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Text: () => null,
  TextInput: () => null,
}));
vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return { ...actual, localizeMobileString: vi.fn(actual.localizeMobileString) };
});
import { localizeMobileString } from "../../i18n/mobileStrings";
import { AppTextInput } from "./AppText";
import { SecretTextInput } from "./SecretTextInput";

it("preserves projected secret labels and placeholders but translates the explicit application fallback", async () => {
  const actual = await vi.importActual<typeof import("../../i18n/mobileStrings")>(
    "../../i18n/mobileStrings",
  );
  for (const locale of ["en", "zh-CN"] as const) {
    vi.mocked(localizeMobileString).mockImplementation((value) =>
      actual.localizeMobileString(value, locale),
    );
    for (const placeholder of [
      "Settings",
      actual.localizeMobileString("Paste the secret", locale),
    ]) {
      const onChangeText = vi.fn();
      const onSubmitEditing = vi.fn();
      const secret = SecretTextInput({
        accessibilityLabel: "Open",
        placeholder,
        value: "test-value",
        editable: true,
        onChangeText,
        onSubmitEditing,
      });
      const input = AppTextInput(secret.props);
      expect(input.props.accessibilityLabel).toBe("Open");
      expect(input.props.placeholder).toBe(placeholder);
      expect(input.props.secureTextEntry).toBe(true);
      expect(input.props.autoComplete).toBe("off");
      expect(input.props.importantForAutofill).toBe("no");
      input.props.onChangeText("replacement");
      input.props.onSubmitEditing({ nativeEvent: { text: "replacement" } });
      expect(onChangeText).toHaveBeenCalledWith("replacement");
      expect(onSubmitEditing).toHaveBeenCalledWith("replacement");
    }
    const ordinary = AppTextInput({ accessibilityLabel: "Open", placeholder: "Settings" });
    expect(ordinary.props.accessibilityLabel).toBe(locale === "zh-CN" ? "打开" : "Open");
    expect(ordinary.props.placeholder).toBe(locale === "zh-CN" ? "设置" : "Settings");
  }
});
