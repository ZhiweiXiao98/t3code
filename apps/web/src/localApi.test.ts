import { type ConfirmDialogOptions, type ContextMenuItem } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const showContextMenuFallbackMock =
  vi.fn<
    <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>
  >();
const dismissContextMenuMock = vi.fn<() => void>();

const requestConfirmDialogMock =
  vi.fn<(message: string, options?: ConfirmDialogOptions) => Promise<boolean> | undefined>();

vi.mock("./contextMenuFallback", () => ({
  showContextMenuFallback: showContextMenuFallbackMock,
  dismissContextMenu: dismissContextMenuMock,
}));

vi.mock("./confirmDialog", () => ({
  requestConfirmDialog: requestConfirmDialogMock,
}));

function createLocalStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function testWindow(): Window & typeof globalThis {
  return globalThis.window ?? (globalThis as unknown as Window & typeof globalThis);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  if (globalThis.window === undefined) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  }
  Reflect.deleteProperty(testWindow(), "desktopBridge");
  Object.defineProperty(testWindow(), "localStorage", {
    configurable: true,
    value: createLocalStorageStub(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LocalApi", () => {
  it("fails closed in a browser when no themed host is available", async () => {
    requestConfirmDialogMock.mockReturnValue(undefined);
    const { createLocalApi } = await import("./localApi");

    await expect(createLocalApi().dialogs.confirm("Delete this thread?")).resolves.toBe(false);
  });
});

describe("lazy browser context menus", () => {
  it("does not initialize the fallback for settings persistence or desktop menus", async () => {
    const initialized = vi.fn();
    vi.doMock("./contextMenuFallback", () => {
      initialized();
      return {
        showContextMenuFallback: showContextMenuFallbackMock,
        dismissContextMenu: dismissContextMenuMock,
      };
    });
    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();
    await expect(api.persistence.getClientSettings()).resolves.toBeNull();
    expect(initialized).not.toHaveBeenCalled();
    const show = vi.fn().mockResolvedValue("rename");
    Object.defineProperty(testWindow(), "desktopBridge", {
      configurable: true,
      value: { showContextMenu: show },
    });
    const items = [{ id: "rename", label: "Rename" }];
    await expect(api.contextMenu.show(items, { x: 10, y: 20 })).resolves.toBe("rename");
    await api.contextMenu.close();
    expect(show).toHaveBeenCalledWith(items, { x: 10, y: 20 });
    expect(initialized).not.toHaveBeenCalled();
  });

  it("preserves show, replacement and close order while the fallback is loading", async () => {
    const events: string[] = [];
    let finishLoading!: () => void;
    const loading = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    let dismiss: (() => void) | undefined;
    vi.doMock("./contextMenuFallback", async () => {
      await loading;
      return {
        showContextMenuFallback: (items: readonly ContextMenuItem<string>[]) => {
          events.push(`show:${items[0]?.id}`);
          dismiss?.();
          return new Promise<null>((resolve) => {
            dismiss = () => resolve(null);
          });
        },
        dismissContextMenu: () => {
          events.push("close");
          dismiss?.();
        },
      };
    });
    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();
    const first = api.contextMenu.show([{ id: "first", label: "First" }]);
    const second = api.contextMenu.show([{ id: "second", label: "Second" }]);
    const closed = api.contextMenu.close();
    expect(events).toEqual([]);
    finishLoading();
    await expect(Promise.all([first, second, closed])).resolves.toEqual([null, null, undefined]);
    expect(events).toEqual(["show:first", "show:second", "close"]);
  });
});
