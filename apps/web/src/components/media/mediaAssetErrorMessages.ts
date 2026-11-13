import {
  AssetAccessError,
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  AssetWorkspaceRootNormalizationError,
  AssetWorkspacePathValidationError,
  AssetPreviewTypeValidationError,
  AssetWorkspaceAssetInspectionError,
  AssetWorkspaceAssetNotFoundError,
  AssetWorkspaceResolutionError,
  AssetAttachmentNotFoundError,
  AssetSourceControlMediaUrlValidationError,
  AssetSigningKeyLoadError,
} from "@t3tools/contracts";
import type { ResolvedAppLocale } from "@t3tools/shared/appLocale";
import * as Schema from "effect/Schema";

const isAssetAccessError = Schema.is(AssetAccessError);

export function mediaAssetErrorMessage(locale: ResolvedAppLocale, error: unknown): string | null {
  if (!isAssetAccessError(error)) return null;
  const prototype = Object.getPrototypeOf(error);
  let translated: string;
  switch (error._tag) {
    case "AssetWorkspaceContextNotFoundError":
      if (
        prototype !== AssetWorkspaceContextNotFoundError.prototype ||
        (error.resource._tag !== "media-file" && error.resource._tag !== "workspace-file")
      ) {
        return null;
      }
      translated = "找不到工作区上下文。";
      break;
    case "AssetWorkspaceContextResolutionError":
      if (
        prototype !== AssetWorkspaceContextResolutionError.prototype ||
        (error.resource._tag !== "media-file" && error.resource._tag !== "workspace-file")
      ) {
        return null;
      }
      translated = "无法解析工作区上下文。";
      break;
    case "AssetWorkspaceRootNormalizationError":
      if (
        prototype !== AssetWorkspaceRootNormalizationError.prototype ||
        (error.resource._tag !== "media-file" &&
          error.resource._tag !== "workspace-file" &&
          error.resource._tag !== "draft-workspace-file")
      ) {
        return null;
      }
      translated = "无法规范化工作区根目录。";
      break;
    case "AssetWorkspacePathValidationError":
      if (
        prototype !== AssetWorkspacePathValidationError.prototype ||
        (error.resource._tag !== "workspace-file" && error.resource._tag !== "draft-workspace-file")
      ) {
        return null;
      }
      translated = "工作区文件路径必须相对于项目根目录。";
      break;
    case "AssetPreviewTypeValidationError":
      if (
        prototype !== AssetPreviewTypeValidationError.prototype ||
        (error.resource._tag !== "media-file" &&
          error.resource._tag !== "workspace-file" &&
          error.resource._tag !== "draft-workspace-file")
      ) {
        return null;
      }
      translated =
        error.resource._tag === "workspace-file"
          ? "只能预览浏览器文档和图片。"
          : "只能预览图片、视频、音频、HTML 和 PDF 文件。";
      break;
    case "AssetWorkspaceAssetInspectionError":
      if (
        prototype !== AssetWorkspaceAssetInspectionError.prototype ||
        (error.resource._tag !== "media-file" &&
          error.resource._tag !== "workspace-file" &&
          error.resource._tag !== "draft-workspace-file" &&
          error.resource._tag !== "tool-output-image")
      ) {
        return null;
      }
      translated =
        error.resource._tag === "media-file" ? "无法检查媒体文件。" : "无法检查工作区资源。";
      break;
    case "AssetWorkspaceAssetNotFoundError":
      if (
        prototype !== AssetWorkspaceAssetNotFoundError.prototype ||
        (error.resource._tag !== "media-file" &&
          error.resource._tag !== "workspace-file" &&
          error.resource._tag !== "draft-workspace-file" &&
          error.resource._tag !== "tool-output-image")
      ) {
        return null;
      }
      translated =
        error.resource._tag === "media-file"
          ? "找不到媒体文件。"
          : error.resource._tag === "tool-output-image"
            ? "找不到工具输出图片。"
            : "找不到工作区资源。";
      break;
    case "AssetWorkspaceResolutionError":
      if (
        prototype !== AssetWorkspaceResolutionError.prototype ||
        (error.resource._tag !== "workspace-file" && error.resource._tag !== "draft-workspace-file")
      ) {
        return null;
      }
      translated = "无法解析工作区。";
      break;
    case "AssetAttachmentNotFoundError":
      if (
        prototype !== AssetAttachmentNotFoundError.prototype ||
        error.resource._tag !== "attachment"
      ) {
        return null;
      }
      translated = "找不到附件。";
      break;
    case "AssetGitHubMediaUrlValidationError":
      if (prototype !== AssetSourceControlMediaUrlValidationError.prototype) {
        return null;
      }
      translated = "只能使用凭据获取源代码托管平台限制访问的媒体。";
      break;
    case "AssetSigningKeyLoadError":
      if (
        prototype !== AssetSigningKeyLoadError.prototype ||
        (error.resource._tag !== "media-file" &&
          error.resource._tag !== "workspace-file" &&
          error.resource._tag !== "draft-workspace-file" &&
          error.resource._tag !== "tool-output-image" &&
          error.resource._tag !== "attachment" &&
          error.resource._tag !== "github-media")
      ) {
        return null;
      }
      translated = "无法加载资源签名密钥。";
      break;
    default:
      return null;
  }
  return locale === "zh-CN" ? translated : error.message;
}
