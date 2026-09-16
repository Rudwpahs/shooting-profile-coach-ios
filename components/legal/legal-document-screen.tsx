import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { getRepresentativeFocusStyle } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/compliance/legal-config";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

type LegalDocumentScreenProps = {
  title: string;
  intro?: string;
  sections: LegalSection[];
};

export function LegalDocumentScreen({ title, intro, sections }: LegalDocumentScreenProps) {
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="법적 정보 화면으로 돌아가기"
          accessibilityRole="button"
          focusable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, getRepresentativeFocusStyle(false, "light"), pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color={tokens.foreground} />
          <Text style={styles.backText}>뒤로</Text>
        </Pressable>

        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.version}>버전 {LEGAL_DOCUMENT_VERSION}</Text>
          {intro ? <Text style={styles.intro}>{intro}</Text> : null}
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.body}>{paragraph}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 32, paddingHorizontal: 18, paddingTop: 12 },
  backButton: { alignItems: "center", alignSelf: "flex-start", borderRadius: 10, flexDirection: "row", gap: 4, minHeight: 44, minWidth: 44, paddingHorizontal: 6 },
  backText: { color: tokens.foreground, fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  header: { gap: 8 },
  title: { color: tokens.foreground, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  version: { color: tokens.mutedForeground, fontSize: 12 },
  intro: { color: tokens.mutedForeground, fontSize: 14, lineHeight: 21 },
  section: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 14, borderWidth: 1, gap: 9, padding: 16 },
  sectionTitle: { color: tokens.foreground, fontSize: 17, fontWeight: "800" },
  body: { color: tokens.mutedForeground, fontSize: 14, lineHeight: 22 },
});
