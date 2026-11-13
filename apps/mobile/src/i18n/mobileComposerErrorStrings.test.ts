import { expect, it } from "vite-plus/test";
import { fileAttachmentTooLargeMessage } from "@t3tools/client-runtime/state/attachments";
import { mobileAttachmentTooLargeMessage } from "./mobileComposerErrorStrings";
import { formatMobileMessage } from "./mobileDisplayStrings";

it("preserves attachment filenames and the English baseline at every size boundary", () => {
  for (const name of ["Settings", "Open", "{0} $& ' file.txt"]) {
    for (const size of [1, 513, 1024, 2 * 1024 * 1024]) {
      expect(mobileAttachmentTooLargeMessage(name, size, "en")).toBe(
        fileAttachmentTooLargeMessage(name, size),
      );
      const formattedSize =
        size === 1024
          ? "1 KB"
          : size === 2 * 1024 * 1024
            ? "2 MB"
            : formatMobileMessage("{0} bytes", [size], "zh-CN");
      expect(mobileAttachmentTooLargeMessage(name, size, "zh-CN")).toBe(
        formatMobileMessage(
          "'{0}' exceeds the {1} attachment limit.",
          [name, formattedSize],
          "zh-CN",
        ),
      );
      expect(mobileAttachmentTooLargeMessage(name, size, "zh-CN")).toContain(name);
    }
  }
});
