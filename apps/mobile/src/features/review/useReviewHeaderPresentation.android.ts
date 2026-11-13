import { localizeMobileString } from "../../i18n/mobileStrings";
import type { useReviewHeaderPresentation as useIosReviewHeaderPresentation } from "./useReviewHeaderPresentation";

// oxlint-disable-next-line t3code/no-hookless-use-function -- Android stub of a hook; the iOS file calls hooks.
export function useReviewHeaderPresentation(
  props: Parameters<typeof useIosReviewHeaderPresentation>[0],
): ReturnType<typeof useIosReviewHeaderPresentation> {
  return {
    title: "Review changes",
    subtitle: props.androidSubtitle || localizeMobileString("Select a diff"),
    gitMenu: null,
    menuIcon: "ellipsis.circle",
    refreshAction: {
      id: "refresh",
      title: "Refresh current diff",
      disabled: !props.selectedSection || props.selectedSection.isLoading,
      onPress: () => {
        void props.onRefresh();
      },
    },
  };
}
