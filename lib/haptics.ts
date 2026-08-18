import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export const haptic = {
  light: () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  selection: () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
  },
  success: () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
