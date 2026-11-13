import { expect, it } from "vite-plus/test";
import { localizeMenuActions } from "../../i18n/localizeMenuActions";
import { browserViewportLabel, browserZoomLabel } from "./browserPreviewDisplay";

it("keeps zoom rounding and viewport names intact through native menu localization", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const name of ["Settings", "Open", "{0} $&"]) {
      const actions = localizeMenuActions(
        [
          { id: "zoom", title: browserZoomLabel(1.256, locale), localize: false },
          {
            id: "viewport:stable",
            title: browserViewportLabel("Phone", name, locale),
            localize: false,
            state: "on",
          },
        ],
        locale,
      );
      expect(actions[0]).toMatchObject({
        id: "zoom",
        title: locale === "en" ? "Zoom (126%)" : "缩放（126%）",
      });
      expect(actions[1]).toMatchObject({
        id: "viewport:stable",
        title: locale === "en" ? `Phone (${name})` : `手机（${name}）`,
        state: "on",
      });
    }
  }
});
