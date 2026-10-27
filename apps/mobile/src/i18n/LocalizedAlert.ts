import { Alert as NativeAlert } from "react-native";

import { localizeAlertArguments, type LocalizedAlertApi } from "./mobileStrings";

export const LocalizedAlert: LocalizedAlertApi = {
  prompt(...args) {
    const [title, message, callbackOrButtons] = args;
    const localized = localizeAlertArguments(
      title ?? "",
      message ?? undefined,
      Array.isArray(callbackOrButtons) ? callbackOrButtons : undefined,
    );
    if (args.length > 0) args[0] = title == null ? title : localized.title;
    if (args.length > 1) args[1] = message == null ? message : localized.message;
    if (args.length > 2 && Array.isArray(callbackOrButtons)) args[2] = localized.buttons;
    NativeAlert.prompt(...args);
  },
  alert(...args) {
    const [title, message, buttons] = args;
    const localized = localizeAlertArguments(title, message, buttons);
    args[0] = localized.title;
    if (args.length > 1) args[1] = localized.message;
    if (args.length > 2) args[2] = localized.buttons;
    NativeAlert.alert(...args);
  },
};
