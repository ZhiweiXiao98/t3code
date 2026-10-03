import { EDITORS, type EditorId } from "@t3tools/contracts";

import { getLocalFileManagerName } from "~/lib/utils";

const editorLabels = new Map<EditorId, string>(EDITORS.map((editor) => [editor.id, editor.label]));

export function editorLabelForPlatform(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return getLocalFileManagerName(platform);
  }

  return editorLabels.get(editorId) ?? "Editor";
}

export function openInEditorMenuLabel(
  editorId: EditorId | null,
  labels: {
    readonly defaultLabel: string;
    readonly namedLabel: (editor: string) => string;
  } = {
    defaultLabel: "Open in editor",
    namedLabel: (editor) => `Open in ${editor}`,
  },
): string {
  return editorId === null || editorId === "file-manager"
    ? labels.defaultLabel
    : labels.namedLabel(editorLabels.get(editorId) ?? "Editor");
}
