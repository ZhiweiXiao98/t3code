import { expect, it, vi } from "vite-plus/test";
import { browserMicrophoneLabel, listBrowserMicrophones } from "./browserMicrophones";

it("localizes generated microphone names across locale changes while preserving real device labels", async () => {
  const enumerateDevices = vi.fn(async () => [
    { kind: "videoinput", deviceId: "camera", label: "" },
    { kind: "audioinput", deviceId: "unnamed", label: "" },
    { kind: "audioinput", deviceId: "named", label: "Microphone 1" },
    { kind: "audioinput", deviceId: "custom", label: "Settings {number} $&" },
  ]);
  vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices } });
  try {
    const devices = await listBrowserMicrophones();
    expect(devices.map((device) => device.deviceId)).toEqual(["unnamed", "named", "custom"]);
    expect(devices.map((device) => browserMicrophoneLabel(device, "zh-CN"))).toEqual([
      "麦克风 1",
      "Microphone 1",
      "Settings {number} $&",
    ]);
    expect(devices.map((device) => browserMicrophoneLabel(device, "en"))).toEqual([
      "Microphone 1",
      "Microphone 1",
      "Settings {number} $&",
    ]);
    expect(devices[1]).not.toHaveProperty("fallbackIndex");
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
