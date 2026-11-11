import { localizeMobileString } from "../../i18n/mobileStrings";
import { View } from "react-native";
import { Text } from "@expo/ui/jetpack-compose";
import { IconButton } from "../../components/ui/IconButton";
import { NativeAppBar } from "../../components/ui/NativeAppBar.android";

export function NativeAppBarExample() {
  return (
    <NativeAppBar
      title={<Text style={{ fontSize: 21 }}>Native app bar</Text>}
      navigationIcon={
        <IconButton
          icon="arrow.left"
          accessibilityLabel={localizeMobileString("Example back")}
          onPress={() => {}}
        />
      }
      actions={
        <View className="flex-row">
          <IconButton
            icon="magnifyingglass"
            accessibilityLabel={localizeMobileString("Example search")}
            onPress={() => {}}
          />
        </View>
      }
    />
  );
}
