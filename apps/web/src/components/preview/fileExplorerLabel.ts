import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export interface FileExplorerRevealLabels {
  finder: string;
  fileExplorer: string;
  files: string;
}

const DEFAULT_REVEAL_LABELS: FileExplorerRevealLabels = {
  finder: "Reveal in Finder",
  fileExplorer: "Reveal in File Explorer",
  files: "Reveal in Files",
};

export function revealInFileExplorerLabel(
  platform: string,
  labels: FileExplorerRevealLabels = DEFAULT_REVEAL_LABELS,
): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return labels.finder;
  if (normalized.includes("win")) return labels.fileExplorer;
  return labels.files;
}

/** Same wording keyed by an environment's reported OS rather than a
    navigator platform string, for actions that reveal on the server machine. */
export function revealInFileExplorerLabelForOs(
  os: ExecutionEnvironmentPlatformOs,
  labels: FileExplorerRevealLabels = DEFAULT_REVEAL_LABELS,
): string {
  if (os === "darwin") return labels.finder;
  if (os === "windows") return labels.fileExplorer;
  return labels.files;
}

/** Server-selected wording, including Windows File Explorer reached from WSL. */
export function revealInFileExplorerLabelForKind(
  kind: FileManagerRevealKind,
  labels: FileExplorerRevealLabels = DEFAULT_REVEAL_LABELS,
): string {
  if (kind === "finder") return labels.finder;
  if (kind === "file-explorer") return labels.fileExplorer;
  return labels.files;
}
