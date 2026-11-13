import * as Dialog from "../../components/ui/Dialog";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";

type McpAppConsentRequest = { readonly server: string } & (
  | { readonly kind: "tool"; readonly tool: string; readonly arguments: unknown }
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "file"; readonly names: readonly string[] }
);

export function confirmMcpAppAction(request: McpAppConsentRequest): Promise<boolean> {
  const content = (() => {
    switch (request.kind) {
      case "tool":
        return {
          title: formatMobileMessage("Allow {0} to run {1}?", [request.server, request.tool]),
          message: JSON.stringify(request.arguments, null, 2),
          action: "Allow",
        };
      case "link":
        return {
          title: formatMobileMessage("Open a link from {0}?", [request.server]),
          message: request.url,
          action: "Open",
        };
      case "message":
        return {
          title: formatMobileMessage("Send this message from {0}?", [request.server]),
          message: request.text,
          action: "Send",
        };
      case "file":
        return {
          title: formatMobileMessage("Save a file from {0}?", [request.server]),
          message: request.names.join(", "),
          action: "Save",
        };
    }
  })();
  return new Promise<boolean>((resolve) => {
    Dialog.alertWithLiteralContent(
      content.title,
      content.message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: content.action, onPress: () => resolve(true) },
      ],
      // Android dismisses earlier alerts when showing another; decline to release their slots.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
