import { Alert as NativeAlert } from "react-native";

import { localizeAlertArguments, type LocalizedAlertApi } from "./mobileStrings";

export const LocalizedAlert: LocalizedAlertApi = {
  prompt(title, message, callbackOrButtons, type, defaultValue, keyboardType, options) {
    const localized = localizeAlertArguments(
      title ?? "",
      message ?? undefined,
      Array.isArray(callbackOrButtons) ? callbackOrButtons : undefined,
    );
    NativeAlert.prompt(
      title == null ? title : localized.title,
      message == null ? message : localized.message,
      typeof callbackOrButtons === "function" || callbackOrButtons == null
        ? callbackOrButtons
        : localized.buttons,
      type,
      defaultValue,
      keyboardType,
      options,
    );
  },
  alert(title, message, buttons, options) {
    const localized = localizeAlertArguments(title, message, buttons);
    NativeAlert.alert(localized.title, localized.message, localized.buttons, options);
  },
};
