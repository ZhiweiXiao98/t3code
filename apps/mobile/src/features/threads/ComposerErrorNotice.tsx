import { View } from "react-native";
import { Notice } from "../../components/ui/Notice";

export function ComposerErrorNotice(props: {
  readonly message: string;
  readonly localizeMessage?: boolean;
  readonly onDismiss: () => void;
}) {
  return (
    <View className="px-4 pb-3">
      <Notice
        message={props.message}
        localizeMessage={props.localizeMessage}
        icon="exclamationmark.circle"
        iconTone="danger"
        floating
        onDismiss={props.onDismiss}
        dismissLabel="Dismiss error"
      />
    </View>
  );
}
