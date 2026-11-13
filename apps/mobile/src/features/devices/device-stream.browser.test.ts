import { describe, expect, it, vi } from "vite-plus/test";

import { start, stop } from "./device-stream.browser";

const envelope = (tag: number, payload: number[]) => {
  const length = 1 + payload.length;
  return [
    length >>> 24,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    tag,
    ...payload,
  ];
};

function viewerFixture(supported: boolean, locale: "en" | "zh-CN" = "en") {
  vi.useFakeTimers();
  const configured: string[] = [];
  vi.stubGlobal(
    "VideoDecoder",
    class {
      static isConfigSupported = async () => ({ supported });
      state = "unconfigured";
      decodeQueueSize = 0;
      configure(config: VideoDecoderConfig) {
        configured.push(config.codec);
        this.state = "configured";
      }
      decode() {}
      close() {
        this.state = "closed";
      }
    },
  );
  vi.stubGlobal("EncodedVideoChunk", vi.fn());
  vi.stubGlobal(
    "WebSocket",
    class {
      static OPEN = 1;
      readyState = 0;
      send() {}
      close() {}
    },
  );
  const videoBodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  const requested: string[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    requested.push(new URL(url).pathname);
    if (!url.includes("stream.avcc")) return Promise.resolve(new Response(null));
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(body) {
            videoBodies.push(body);
            init.signal?.addEventListener("abort", () => body.error(new Error("aborted")));
          },
        }),
      ),
    );
  });
  vi.stubGlobal("ReactNativeWebView", { postMessage() {} });
  start({
    locale,
    platform: "ios",
    deviceId: "sim",
    access: {
      httpBase: "https://environment.test/api/device-hub",
      wsBase: "wss://environment.test/api/device-hub",
      credentials: false,
      query: {},
    },
    colors: {
      background: "black",
      foreground: "white",
      muted: "gray",
      buttonBackground: "black",
      buttonForeground: "white",
      buttonBorder: "gray",
    },
  });
  return { configured, requested, videoBodies };
}

describe("native iOS simulator viewer", () => {
  it.each([
    { supported: true, image: "", locale: "en" as const },
    {
      supported: false,
      image: "/api/device-hub/vendor/serve-sim/helper/sim/stream.mjpeg",
      locale: "zh-CN" as const,
    },
  ])(
    "streams H.264 when WebCodecs decodes it, else MJPEG (supported: $supported)",
    async ({ supported, image, locale }) => {
      try {
        const { configured, requested, videoBodies } = viewerFixture(supported, locale);
        expect(document.querySelector('[role="application"]')?.getAttribute("aria-label")).toBe(
          locale === "zh-CN" ? "iOS 模拟器屏幕" : "iOS Simulator screen",
        );
        expect(document.querySelector('[role="status"]')?.textContent).toBe(
          locale === "zh-CN" ? "正在重新连接设备控制…" : "Reconnecting device controls...",
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(requested).toContain("/api/device-hub/vendor/serve-sim/helper/sim/stream.avcc");
        videoBodies[0]!.enqueue(new Uint8Array(envelope(1, [1, 0x64, 0x00, 0x33])));
        await vi.advanceTimersByTimeAsync(0);
        expect(configured).toEqual(supported ? ["avc1.640033"] : []);
        const img = document.querySelector("img")!;
        expect(img.src && new URL(img.src).pathname).toBe(image);
        expect(img.style.display).toBe(supported ? "none" : "block");
      } finally {
        stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    },
  );
});
