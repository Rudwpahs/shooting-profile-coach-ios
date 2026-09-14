import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { describeCameraYaw, type CaptureViewGuidance } from "@/lib/shooting-profile/capture-guidance";

type CaptureGuideProps = { views: readonly CaptureViewGuidance[] };

/**
 * Where to stand and where the camera goes, one row per view, rendered from
 * guidance data. A yaw line appears only when the protocol declares one.
 */
export function CaptureGuide({ views }: CaptureGuideProps) {
  return (
    <View style={styles.list}>
      {views.map((guidance) => {
        const yaw = describeCameraYaw(guidance);
        return (
          <View
            key={guidance.view}
            accessible
            accessibilityLabel={`${guidance.title}. 서는 곳: ${guidance.stand}. 카메라: ${guidance.camera}${yaw ? `. ${yaw}` : ""}`}
            style={styles.row}
          >
            <View style={styles.icon}>
              <MaterialCommunityIcons name={guidance.icon} size={22} color={tokens.primary} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.title}>{guidance.title}</Text>
              <Text numberOfLines={1} style={styles.line}>{guidance.stand}</Text>
              <Text numberOfLines={1} style={styles.line}>{guidance.camera}</Text>
              {yaw ? <Text numberOfLines={1} style={styles.yaw}>{yaw}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: { alignItems: "center", backgroundColor: tokens.surface, borderRadius: 14, flexDirection: "row", gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { alignItems: "center", backgroundColor: tokens.primarySoft, borderRadius: 12, height: 40, justifyContent: "center", width: 40 },
  copy: { flex: 1, gap: 1 },
  title: { ...typography.headline, color: tokens.foreground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  yaw: { ...typography.label, color: tokens.primary },
});
