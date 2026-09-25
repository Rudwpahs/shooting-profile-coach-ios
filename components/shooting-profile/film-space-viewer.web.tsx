import { StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

type FilmSpaceViewerProps = Readonly<{
  clip: LocalFilmClipRefV1;
}>;

export function FilmSpaceViewer({ clip: _clip }: FilmSpaceViewerProps) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.stateTitle}>Film Space는 iPhone 기기에서 지원됩니다</Text>
      <Text style={styles.stateCopy}>
        웹에서는 로컬 영상 프레임을 열지 않습니다. Motion과 Phase 보기는 계속 사용할 수 있습니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: { alignItems: "center", backgroundColor: tokens.stage, justifyContent: "center", minHeight: 220, padding: 24 },
  stateTitle: { color: tokens.stageForeground, fontSize: 16, fontWeight: "700", textAlign: "center" },
  stateCopy: { color: tokens.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 420, textAlign: "center" },
});