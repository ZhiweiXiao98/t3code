import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

// Consumers also load through model-selection helpers before connection atoms exist.
// Importing the settings-backed provider here would reintroduce that startup cycle.
vi.mock("../hooks/useSettings", () => {
  throw new Error("Locale consumers must not initialize the settings runtime");
});

import { useI18n, WebI18nContext } from "./WebI18nContext";
import { translateWebMessage } from "./messages";

function SpeedLabel() {
  const { t } = useI18n();
  return <>{t("composer.traits.ultrafastModeOn")}</>;
}

describe("WebI18nContext", () => {
  it("provides English copy without loading settings", () => {
    expect(renderToStaticMarkup(<SpeedLabel />)).toBe("Ultrafast mode on");
  });

  it("uses the supplied locale for consumer copy without loading settings", () => {
    expect(
      renderToStaticMarkup(
        <WebI18nContext
          value={{
            locale: "zh-CN",
            appLocale: "zh-CN",
            setAppLocale: () => undefined,
            t: (key, values) => translateWebMessage("zh-CN", key, values),
          }}
        >
          <SpeedLabel />
        </WebI18nContext>,
      ),
    ).toBe("已开启极速模式");
  });
});
