import type { PreviewStreamDownload } from "@t3tools/client-runtime/preview/server-browser-stream";
import * as Dialog from "../../components/ui/Dialog";
import { formatMobileMessage } from "../../i18n/mobileDisplayStrings";
import { downloadAndShareAttachment } from "../../lib/attachmentDownload";

export function offerPreviewDownload(download: PreviewStreamDownload) {
  Dialog.alertWithLiteralMessage(
    formatMobileMessage("Downloaded {0}", [download.fileName]),
    undefined,
    [
      { text: "Not now", style: "cancel" },
      {
        text: "Save or share",
        onPress: () =>
          downloadAndShareAttachment({
            url: download.url,
            attachment: { name: download.fileName, mimeType: "application/octet-stream" },
            signal: new AbortController().signal,
          }).catch((cause: unknown) =>
            Dialog.alertWithLiteralMessage(
              "Could not save the download",
              cause instanceof Error ? cause.message : undefined,
            ),
          ),
      },
    ],
  );
}
