import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

vi.mock("../../i18n/mobileStrings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/mobileStrings")>();
  return {
    ...actual,
    localizeMobileString: (value: string) => actual.localizeMobileString(value, "zh-CN"),
  };
});
vi.mock("@effect/atom-react", () => ({ useAtomValue: vi.fn() }));
vi.mock("react", () => ({ useMemo: (factory: () => unknown) => factory() }));
vi.mock("@t3tools/client-runtime/state/threads", () => ({
  createArchivedThreadSnapshotsAtomFamily: () => () => "snapshots",
  makeArchivedThreadsEnvironmentKey: (ids: ReadonlyArray<string>) => ids.join(","),
}));
vi.mock("../../state/atom-registry", () => ({ appAtomRegistry: { refresh: vi.fn() } }));
vi.mock("../../state/orchestration", () => ({
  orchestrationEnvironment: { archivedShellSnapshot: vi.fn() },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: {} }));
vi.mock("../../state/threads", () => ({ environmentThreadShells: {} }));

import { useArchivedThreadSnapshots } from "./useArchivedThreadSnapshots";

it("localizes the shared owned failure without changing snapshots or loading state", () => {
  vi.mocked(useAtomValue).mockReset();
  const snapshots = [{ title: "Settings {0} $&", environment: "Open" }];
  for (const isLoading of [false, true]) {
    for (const error of [null, "Failed to load archived threads."]) {
      const original = { snapshots, isLoading, error };
      vi.mocked(useAtomValue).mockReturnValue(original);
      const result = useArchivedThreadSnapshots(["environment" as EnvironmentId]);
      expect(result.snapshots).toBe(snapshots);
      expect(result.isLoading).toBe(isLoading);
      expect(result.error).toBe(error === null ? null : "加载已归档对话失败。");
      expect(original).toEqual({ snapshots, isLoading, error });
      expect(snapshots[0]).toEqual({ title: "Settings {0} $&", environment: "Open" });
    }
  }
});
