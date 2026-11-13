import { filePreviewFailure, pdfHttpFailure } from "../features/files/filePreviewDisplay";
import { useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { FilePreviewLoading, FilePreviewNotice } from "../features/files/FilePreviewFeedback";

export function PdfPreview(props: { readonly uri: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <View className="flex-1 bg-card">
      {error ? (
        <FilePreviewNotice title="Could not load PDF" localizeChildren={false}>
          {error}
        </FilePreviewNotice>
      ) : null}
      <WebView
        source={{ uri: props.uri }}
        originWhitelist={["*"]}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        startInLoadingState
        onError={(event) => setError(filePreviewFailure(event.nativeEvent.description, "pdf"))}
        onHttpError={(event) => setError(pdfHttpFailure(event.nativeEvent.statusCode))}
        renderLoading={() => <FilePreviewLoading message="Loading PDF..." background="card" />}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />
    </View>
  );
}
