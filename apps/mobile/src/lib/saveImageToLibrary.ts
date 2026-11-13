import { requireNativeModule } from "expo";
import { Platform } from "react-native";
import { localizeMobileString } from "../i18n/mobileStrings";

const SAVABLE_IMAGE_MIME_TYPE = /^image\/(png|jpe?g|gif|webp|heic|heif)$/i;

function baseMimeType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim() ?? "";
}

// Android 9 and older need a storage permission to add photos, so they keep the share sheet.
export function canSaveImageToLibrary(mimeType: string): boolean {
  return (
    SAVABLE_IMAGE_MIME_TYPE.test(baseMimeType(mimeType)) &&
    (Platform.OS === "ios" || (Platform.OS === "android" && Platform.Version >= 29))
  );
}

const PHOTO_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  ERR_T3_PHOTOS_PERMISSION_DENIED: "Allow T3 Code to add photos in Settings.",
  ERR_T3_PHOTOS_SAVE_FAILED: "Photos could not save this image.",
  ERR_T3_PHOTOS_APP_INACTIVE: "The app is not active.",
  ERR_T3_PHOTOS_ANDROID_VERSION: "Saving images needs Android 10 or later.",
  ERR_T3_PHOTOS_CREATE_FAILED: "Could not create the image in Pictures.",
  ERR_T3_PHOTOS_IMAGE_UNAVAILABLE: "The image is no longer available.",
  ERR_T3_PHOTOS_WRITE_FAILED: "Could not write the image.",
};

// Old native clients erase error provenance. Keep their previous display behavior confined to
// errors from that legacy call, rather than applying it to every save/download failure.
const legacyPhotoErrors = new WeakSet<Error>();

export function isLegacyPhotoLibraryError(error: unknown): boolean {
  return error instanceof Error && legacyPhotoErrors.has(error);
}

/** Adds a local image file to Photos on iOS or Pictures/T3 Code on Android. */
export async function saveImageToLibrary(
  uri: string,
  mimeType: string,
  name: string,
): Promise<void> {
  const native = requireNativeModule<{
    saveImageToLibrary(uri: string, mimeType: string, name: string): Promise<void>;
    saveImageToLibraryWithErrorCodes?(uri: string, mimeType: string, name: string): Promise<void>;
  }>("T3NativeControls");
  if (typeof native.saveImageToLibraryWithErrorCodes !== "function") {
    try {
      await native.saveImageToLibrary(uri, baseMimeType(mimeType), name);
    } catch (error) {
      if (error instanceof Error) legacyPhotoErrors.add(error);
      throw error;
    }
    return;
  }
  try {
    await native.saveImageToLibraryWithErrorCodes(uri, baseMimeType(mimeType), name);
  } catch (error) {
    // A reused native Error must not inherit the provenance of a previous legacy invocation.
    if (error instanceof Error) legacyPhotoErrors.delete(error);
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      Object.hasOwn(PHOTO_FAILURE_MESSAGES, error.code)
    ) {
      throw new Error(localizeMobileString(PHOTO_FAILURE_MESSAGES[error.code]!), { cause: error });
    }
    throw error;
  }
}
