import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { filePreviewGallery, filePreviewName } from "../../lib/filePreviewGallery";
import { pullRequestImageSource, pullRequestMediaName } from "./pullRequestMediaSource";

const location = {
  environmentId: EnvironmentId.make("test"),
  cwd: "/repo",
  repository: "enterprise/private",
};
const url = "https://github.com/user-attachments/assets/abc-123";

describe("PR media previews", () => {
  it("keeps every gallery image resolvable and the tapped image appears only once", () => {
    const first = pullRequestImageSource(url, location);
    const second = pullRequestImageSource(`${url}-second`, location);
    const selected = { ...second, sourceIdentifier: "tapped" };
    const gallery = filePreviewGallery(selected, [first, second]);
    expect(gallery).toEqual([first, selected]);
    expect(gallery).toMatchObject([
      { resource: { url, repository: location.repository } },
      { resource: { url: `${url}-second`, repository: location.repository } },
    ]);
  });

  it("localizes only missing media names, preserving caption and URL-name precedence", () => {
    const rootUrl = "https://example.test/?name=Settings";
    for (const locale of ["en", "zh-CN"] as const) {
      for (const name of ["Settings", "Attachment", "Image", "{0}$&", "Link custom"]) {
        expect(pullRequestMediaName(rootUrl, name, "Attachment", locale)).toBe(name);
        expect(
          pullRequestMediaName(`https://example.test/${name}`, undefined, "Image", locale),
        ).toBe(new URL(`https://example.test/${name}`).pathname.split("/").pop());
        expect(
          pullRequestMediaName(`https://example.test/${name}`, "caption", "Image", locale),
        ).toBe("caption");
      }
      expect(pullRequestMediaName(rootUrl, "", "Attachment", locale)).toBe(
        locale === "zh-CN" ? "附件" : "Attachment",
      );
      expect(pullRequestMediaName(rootUrl, undefined, "Image", locale)).toBe(
        locale === "zh-CN" ? "图片" : "Image",
      );
    }
    // Image preview names also select Quick Look's temporary/share filename, not only its title.
    const image = {
      ...pullRequestImageSource(rootUrl, location),
      name: pullRequestMediaName(rootUrl, undefined, "Attachment", "en"),
    };
    expect(filePreviewName(image)).toBe("Attachment");
    expect(filePreviewName({ ...image, name: "Image" })).toBe("Image");
    expect(image).toEqual({ ...pullRequestImageSource(rootUrl, location), name: "Attachment" });
    expect(rootUrl).toBe("https://example.test/?name=Settings");
  });
});
