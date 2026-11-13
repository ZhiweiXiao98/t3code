import { Children, isValidElement } from "react";
import { expect, it, vi } from "vite-plus/test";
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("./AppText", () => ({ AppText: "AppText" }));
vi.mock("./Button", () => ({ Button: "Button" }));
import { EmptyState } from "./EmptyState";

it("preserves opaque detail at both final text outlets without changing default localization", () => {
  for (const variant of ["plain", "card"] as const) {
    for (const localizeDetail of [undefined, false, true]) {
      for (const detail of ["Settings", "Open", "native/{0}/$&"]) {
        const result = EmptyState({
          title: "Title",
          detail,
          variant,
          localizeDetail,
          localizeTitle: localizeDetail,
        });
        const text = Children.toArray(result.props.children).filter(isValidElement);
        expect(text[0]?.props).toMatchObject({ children: "Title", localize: localizeDetail });
        expect(text[1]?.props).toMatchObject({
          children: detail,
          localize: localizeDetail ?? true,
        });
      }
    }
  }
});
