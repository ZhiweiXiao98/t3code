import { readWebI18n } from "~/i18n/readWebI18n";
import { terminalCloseMessage } from "~/i18n/confirmationMessages";
import { readLocalApi } from "~/localApi";

let pendingConfirmations = 0;

export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
): Promise<boolean> {
  const localApi = readLocalApi();
  if (!localApi) return true;
  pendingConfirmations += 1;
  try {
    return await localApi.dialogs.confirm(terminalCloseMessage(readWebI18n().locale, labels), {
      variant: "destructive",
    });
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}
