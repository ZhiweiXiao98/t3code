import { editorFailureMessage } from "./editorFailurePresentation";
import {
  AuthOrchestrationOperateScope,
  EnvironmentAuthorizationError,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  allowed: new Set<string>(),
  run: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
}));

vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("./state/shell", () => ({ shellEnvironment: { openInEditor: "openInEditor" } }));
vi.mock("./state/use-atom-command", () => ({ useAtomCommand: () => state.run }));
vi.mock("./state/session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.allowed.has(environmentId),
}));
vi.mock("./hooks/useLocalStorage", () => ({
  getLocalStorageItem: state.getPreference,
  setLocalStorageItem: state.setPreference,
  useLocalStorage: vi.fn(),
}));

import { useOpenInPreferredEditor } from "./editorPreferences";

const primary = EnvironmentId.make("primary");
const secondary = EnvironmentId.make("secondary");

beforeEach(() => {
  state.allowed.clear();
  state.run.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.getPreference.mockReset().mockReturnValue(null);
  state.setPreference.mockReset();
});

it("does not use another environment's grant or change preferences when denied", async () => {
  state.allowed.add(primary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  const result = await open("/work/readme.md");
  assert(result._tag === "Failure");
  const error = Cause.squash(result.cause);
  expect(error).toBeInstanceOf(EnvironmentAuthorizationError);
  expect(error).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
  expect(state.run).not.toHaveBeenCalled();
  expect(state.getPreference).not.toHaveBeenCalled();
  expect(state.setPreference).not.toHaveBeenCalled();
});

it("checks revocation and regrant when a retained editor callback is invoked", async () => {
  state.allowed.add(secondary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  state.allowed.delete(secondary);
  expect((await open("/work/readme.md:5"))._tag).toBe("Failure");
  expect(state.run).not.toHaveBeenCalled();

  state.allowed.add(secondary);
  expect(await open("/work/readme.md:5")).toMatchObject({ _tag: "Success", value: "vscode" });
  expect(state.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: secondary,
    input: { cwd: "/work/readme.md:5", editor: "vscode" },
  });
  expect(state.setPreference).toHaveBeenCalledTimes(1);
});

it("retains local precondition identity and parameters while leaving same-text upstream errors literal", async () => {
  const path = "/opaque/{0}/$&:9\nfile";
  const sources = [
    useOpenInPreferredEditor(null, []),
    useOpenInPreferredEditor(secondary, []),
    useOpenInPreferredEditor(primary, []),
  ];
  state.allowed.add(primary);
  for (const open of sources) {
    const result = await open(path);
    assert(result._tag === "Failure");
    const error = Cause.squash(result.cause);
    assert(error instanceof Error);
    const english = error.message;
    expect(editorFailureMessage(error, "en")).toBe(english);
    expect(editorFailureMessage(error, "zh-CN")).not.toBe(english);
    if ("targetPath" in error) expect(editorFailureMessage(error, "zh-CN")).toContain(path);
    expect(error.message).toBe(english);
    expect(editorFailureMessage(new Error(english), "zh-CN")).toBe(english);
    expect(editorFailureMessage({ ...error, message: english }, "zh-CN")).toBeUndefined();
  }
  expect(state.run).not.toHaveBeenCalled();
  const raw = new Error("This connection cannot open an editor on this environment.");
  state.run.mockResolvedValueOnce(AsyncResult.failure(Cause.fail(raw)));
  const result = await useOpenInPreferredEditor(primary, ["vscode"])(path);
  assert(result._tag === "Failure");
  expect(Cause.squash(result.cause)).toBe(raw);
  expect(editorFailureMessage(raw, "zh-CN")).toBe(raw.message);
});
