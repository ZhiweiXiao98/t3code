import { Alert as NativeAlert } from "react-native";

import { localizeAlertArguments, type LocalizedAlertApi } from "./mobileStrings";

export const LocalizedAlert: LocalizedAlertApi = {
  alert(title, message, buttons, options) {
    const localized = localizeAlertArguments(title, message, buttons);
    NativeAlert.alert(localized.title, localized.message, localized.buttons, options);
  },
};
