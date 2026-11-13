import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MobileLocale } from "../i18n/mobileStrings";

const mocks = vi.hoisted(() => ({
  locale: "en" as MobileLocale,
  directories: new Set<string>(),
  deleted: vi.fn(),
  download: vi.fn(),
  copy: vi.fn(),
  share: vi.fn(),
  shareFromSource: vi.fn(),
  available: vi.fn(),
  open: vi.fn(),
  uuid: vi.fn(),
}));

vi.mock("expo-file-system", () => {
  class Directory {
    readonly uri: string;

    constructor(...parts: Array<string | Directory>) {
      this.uri = parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
    }

    get name(): string {
      return this.uri.split("/").at(-1)!;
    }

    get exists(): boolean {
      return mocks.directories.has(this.uri);
    }

    create(): void {
      mocks.directories.add(this.uri);
    }

    list(): Directory[] {
      const prefix = `${this.uri}/`;
      return [...mocks.directories]
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes("/"))
        .map((uri) => new Directory(uri));
    }

    delete(): void {
      mocks.deleted(this.uri);
      mocks.directories.delete(this.uri);
    }
  }

  class File {
    static downloadFileAsync = mocks.download;
    readonly uri: string;

    constructor(source: Directory | string, name?: string) {
      this.uri = typeof source === "string" ? source : `${source.uri}/${encodeURIComponent(name!)}`;
    }

    async copy(destination: File): Promise<void> {
      await mocks.copy(this.uri, destination.uri);
    }
  }

  return { Directory, File, Paths: { cache: "file:///cache" } };
});

vi.mock("expo", () => ({ requireNativeModule: () => ({ openFile: mocks.open }) }));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: mocks.available,
  shareAsync: mocks.share,
}));

vi.mock("./uuid", () => ({ uuidv4: mocks.uuid }));
vi.mock("./shareFileFromSource", () => ({ shareFileFromSource: mocks.shareFromSource }));

vi.mock("../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, mocks.locale),
  };
});

import {
  nativeViewerErrorMessage,
  downloadAndShareAttachment,
  downloadAttachmentForPreview,
  shareLocalAttachment,
} from "./attachmentDownload";
import { isForegroundHandoffActive } from "./foreground-handoff";

const NOW = 1_787_990_400_000;
const DAY_MS = 24 * 60 * 60_000;
const input = {
  url: "https://chosen-environment.example/api/assets/signed-token/report.pdf",
  attachment: { name: "report.pdf", mimeType: "application/pdf" },
};

beforeEach(() => {
  mocks.locale = "en";
  mocks.open.mockReset();
  mocks.open.mockResolvedValue(undefined);
  mocks.directories.clear();
  mocks.deleted.mockReset();
  mocks.download.mockReset();
  mocks.copy.mockReset();
  mocks.share.mockReset();
  mocks.shareFromSource.mockReset();
  mocks.available.mockReset();
  mocks.uuid.mockReset();
  mocks.download.mockImplementation(async (_url: string, file: { uri: string }) => file);
  mocks.copy.mockResolvedValue(undefined);
  mocks.share.mockResolvedValue(undefined);
  mocks.shareFromSource.mockResolvedValue(undefined);
  mocks.available.mockResolvedValue(true);
  let sequence = 0;
  mocks.uuid.mockImplementation(
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  );
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  expect(isForegroundHandoffActive()).toBe(false);
});

describe("downloadAndShareAttachment", () => {
  it("downloads the chosen environment's signed URL and shares the local file", async () => {
    const controller = new AbortController();
    await downloadAndShareAttachment({ ...input, signal: controller.signal });

    expect(mocks.download).toHaveBeenCalledWith(
      input.url,
      expect.objectContaining({ uri: expect.stringMatching(/\/report\.pdf$/) }),
      { signal: controller.signal },
    );
    expect(mocks.share).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/.+\/report\.pdf$/),
      {
        mimeType: "application/pdf",
        dialogTitle: "report.pdf",
      },
    );
    expect(mocks.deleted).not.toHaveBeenCalled();
  });

  it.each([
    ["../../résumé.pdf", "résumé.pdf"],
    ["C:\\folder\\clip.mp4", "clip.mp4"],
    ["..", "attachment"],
    ["\ud800file\u0000.txt", "_file_.txt"],
  ])("uses a safe basename for %j", async (name, expected) => {
    await downloadAndShareAttachment({
      ...input,
      attachment: { ...input.attachment, name },
      signal: new AbortController().signal,
    });
    const file = mocks.download.mock.calls[0]![1] as { uri: string };
    expect(decodeURIComponent(file.uri.split("/").at(-1)!)).toBe(expected);
  });

  it("bounds the UTF-8 filename length while preserving its extension", async () => {
    await downloadAndShareAttachment({
      ...input,
      attachment: { name: `${"🙂".repeat(80)}.mp4`, mimeType: "video/mp4" },
      signal: new AbortController().signal,
    });
    const file = mocks.download.mock.calls[0]![1] as { uri: string };
    const name = decodeURIComponent(file.uri.split("/").at(-1)!);
    expect(name.endsWith(".mp4")).toBe(true);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
  });

  it.each(["en", "zh-CN"] as const)(
    "reports unavailable sharing before downloading or creating files in %s",
    async (locale) => {
      mocks.locale = locale;
      mocks.available.mockResolvedValue(false);
      await expect(
        downloadAndShareAttachment({ ...input, signal: new AbortController().signal }),
      ).rejects.toThrow(
        locale === "en"
          ? "Saving and sharing files is unavailable on this device."
          : "此设备不支持保存和共享文件。",
      );
      expect(mocks.download).not.toHaveBeenCalled();
      expect(mocks.directories.size).toBe(0);
    },
  );

  it("cleans an interrupted download only after the native request settles", async () => {
    const started = Promise.withResolvers<void>();
    const download = Promise.withResolvers<{ uri: string }>();
    mocks.download.mockImplementation(() => {
      started.resolve();
      return download.promise;
    });
    const controller = new AbortController();
    const task = downloadAndShareAttachment({ ...input, signal: controller.signal });
    await started.promise;
    controller.abort();
    expect(mocks.deleted).not.toHaveBeenCalled();
    download.reject(new Error("Canceled native request"));
    await task;
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("retains an export when its row unmounts during the native handoff", async () => {
    const opened = Promise.withResolvers<void>();
    const share = Promise.withResolvers<void>();
    mocks.share.mockImplementation(() => {
      expect(isForegroundHandoffActive()).toBe(true);
      opened.resolve();
      return share.promise;
    });
    const controller = new AbortController();
    const task = downloadAndShareAttachment({ ...input, signal: controller.signal });
    await opened.promise;
    controller.abort();
    share.resolve();
    await task;
    expect(mocks.deleted).not.toHaveBeenCalled();
  });

  it.each(["en", "zh-CN"] as const)(
    "cleans failed exports and releases the foreground handoff in %s",
    async (locale) => {
      mocks.locale = locale;
      const cause = new Error("Settings");
      mocks.share.mockRejectedValue(cause);
      await expect(
        downloadAndShareAttachment({ ...input, signal: new AbortController().signal }),
      ).rejects.toMatchObject({
        message:
          locale === "en"
            ? "Could not open the share sheet. Try again."
            : "无法打开共享菜单。请重试。",
        cause,
      });
      expect(mocks.deleted).toHaveBeenCalledTimes(1);
    },
  );

  it("does not prune an active export even if it passes the cache expiry", async () => {
    const opened = Promise.withResolvers<void>();
    const share = Promise.withResolvers<void>();
    mocks.share.mockImplementationOnce(() => {
      opened.resolve();
      return share.promise;
    });
    const first = downloadAndShareAttachment({ ...input, signal: new AbortController().signal });
    await opened.promise;
    vi.mocked(Date.now).mockReturnValue(NOW + DAY_MS + 1);

    await downloadAndShareAttachment({ ...input, signal: new AbortController().signal });
    expect(mocks.deleted).not.toHaveBeenCalled();
    share.resolve();
    await first;
  });
});

describe("attachment preview files", () => {
  it("does not start a native request after cancellation during setup", async () => {
    const controller = new AbortController();
    const loading = downloadAttachmentForPreview({ ...input, signal: controller.signal });
    controller.abort();
    await expect(loading).resolves.toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("downloads for playback without requiring a share sheet and removes the file on close", async () => {
    mocks.available.mockResolvedValue(false);
    const file = await downloadAttachmentForPreview({
      ...input,
      signal: new AbortController().signal,
    });
    expect(file?.uri.endsWith("/report.pdf")).toBe(true);
    expect(mocks.available).not.toHaveBeenCalled();
    expect(mocks.deleted).not.toHaveBeenCalled();
    file?.dispose();
    file?.dispose();
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "share-button"])(
    "keeps a shared preview after its owner closes (source: %s)",
    async (sourceIdentifier) => {
      const opened = Promise.withResolvers<void>();
      const sharing = Promise.withResolvers<void>();
      const nativeShare = sourceIdentifier ? mocks.shareFromSource : mocks.share;
      nativeShare.mockImplementationOnce(() => {
        opened.resolve();
        return sharing.promise;
      });
      const file = await downloadAttachmentForPreview({
        ...input,
        signal: new AbortController().signal,
      });
      const share = file!.share(new AbortController().signal, sourceIdentifier);
      await opened.promise;
      file!.dispose();
      expect(mocks.deleted).not.toHaveBeenCalled();
      expect(isForegroundHandoffActive()).toBe(true);
      sharing.resolve();
      await share;
      expect(isForegroundHandoffActive()).toBe(false);
      expect(mocks.deleted).not.toHaveBeenCalled();
      expect(mocks.download).toHaveBeenCalledTimes(1);
      expect(mocks.copy).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "share-button"])(
    "does not share a disposed preview after availability checking (source: %s)",
    async (sourceIdentifier) => {
      const checking = Promise.withResolvers<void>();
      const available = Promise.withResolvers<boolean>();
      mocks.available.mockImplementation(() => {
        checking.resolve();
        return available.promise;
      });
      const file = await downloadAttachmentForPreview({
        ...input,
        signal: new AbortController().signal,
      });
      const share = file!.share(new AbortController().signal, sourceIdentifier);
      await checking.promise;
      file!.dispose();
      available.resolve(true);
      await share;
      expect(mocks.share).not.toHaveBeenCalled();
      expect(mocks.shareFromSource).not.toHaveBeenCalled();
      expect(mocks.deleted).toHaveBeenCalledTimes(1);
    },
  );

  it("copies a local original before sharing without downloading or deleting the source", async () => {
    const uri = "file:///documents/draft/report.pdf";
    await shareLocalAttachment({
      uri,
      attachment: input.attachment,
      signal: new AbortController().signal,
    });
    expect(mocks.copy).toHaveBeenCalledWith(
      uri,
      expect.stringMatching(/^file:\/\/\/cache\/.+\/report\.pdf$/),
    );
    expect(mocks.share).toHaveBeenCalledWith(mocks.copy.mock.calls[0]![1], expect.any(Object));
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.deleted).not.toHaveBeenCalled();
  });

  it("waits for a local copy to finish before cleaning up a canceled share", async () => {
    const copying = Promise.withResolvers<void>();
    const copied = Promise.withResolvers<void>();
    mocks.copy.mockImplementation(() => {
      copying.resolve();
      return copied.promise;
    });
    const controller = new AbortController();
    const task = shareLocalAttachment({
      uri: "file:///documents/draft/report.pdf",
      attachment: input.attachment,
      signal: controller.signal,
    });
    await copying.promise;
    controller.abort();
    expect(mocks.deleted).not.toHaveBeenCalled();
    copied.resolve();
    await task;
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
  });
});

it.each(["en", "zh-CN"] as const)(
  "localizes owned preparation failures in %s without changing causes or file inputs",
  async (locale) => {
    mocks.locale = locale;
    const cause = new Error("Settings\n{0} $&");
    mocks.download.mockRejectedValueOnce(cause);
    await expect(
      downloadAttachmentForPreview({ ...input, signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      message:
        locale === "en"
          ? "Could not download the attachment. Check the connection and try again."
          : "无法下载附件。请检查连接后重试。",
      cause,
    });
    expect(mocks.deleted).toHaveBeenCalledOnce();
    expect(mocks.share).not.toHaveBeenCalled();
    mocks.copy.mockRejectedValueOnce(cause);
    const uri = "file:///Settings%20%7B0%7D%20$&";
    await expect(
      shareLocalAttachment({
        uri,
        attachment: input.attachment,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      message:
        locale === "en"
          ? "Could not prepare the attachment for sharing."
          : "无法准备要共享的附件。",
      cause,
    });
    expect(mocks.copy).toHaveBeenCalledWith(uri, expect.any(String));
    expect(mocks.deleted).toHaveBeenCalledTimes(2);
    expect(mocks.share).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh-CN"] as const)(
  "preserves raw availability errors and attachment identity in %s",
  async (locale) => {
    mocks.locale = locale;
    const cause = new Error("Settings");
    mocks.available.mockRejectedValueOnce(cause);
    await expect(
      downloadAndShareAttachment({ ...input, signal: new AbortController().signal }),
    ).rejects.toBe(cause);
    expect(mocks.download).not.toHaveBeenCalled();
    const attachment = { name: "Settings {0} $&", mimeType: "application/pdf; charset=utf-8" };
    const sourceIdentifier = "Settings";
    await downloadAndShareAttachment({
      ...input,
      attachment,
      sourceIdentifier,
      signal: new AbortController().signal,
    });
    expect(mocks.download).toHaveBeenCalledWith(input.url, expect.any(Object), expect.any(Object));
    expect(mocks.shareFromSource).toHaveBeenCalledWith(
      expect.any(String),
      { mimeType: "application/pdf", dialogTitle: attachment.name },
      sourceIdentifier,
    );
    expect(decodeURIComponent(mocks.shareFromSource.mock.lastCall![0].split("/").at(-1)!)).toBe(
      attachment.name,
    );
    expect(mocks.deleted).not.toHaveBeenCalled();
  },
);

it.each(["en", "zh-CN"] as const)(
  "uses owned viewer guidance in %s without exposing native diagnostics",
  (locale) => {
    mocks.locale = locale;
    for (const cause of [new Error("ActivityNotFound Settings"), "cannot be previewed"]) {
      expect(nativeViewerErrorMessage(cause)).toBe(
        locale === "en"
          ? "No app on this device can show this format. Save or share it to open it elsewhere."
          : "此设备上没有应用能显示此格式。请保存或分享后在其他位置打开。",
      );
    }
    for (const cause of [new Error("Settings"), { message: "ActivityNotFound" }, null]) {
      expect(nativeViewerErrorMessage(cause)).toBe(
        locale === "en"
          ? "The file could not be opened. Check the connection and try again."
          : "无法打开文件。请检查连接后重试。",
      );
    }
  },
);
