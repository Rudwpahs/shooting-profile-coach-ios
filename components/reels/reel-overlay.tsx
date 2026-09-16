import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { REEL_PROGRESS_HEIGHT, ReelProgress } from "@/components/reels/reel-progress";
import type { RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { reelLine, reelTitle, type ReelItem } from "@/lib/reels/reel-model";

/** The virtual display views, in the order the Explore chips use. Display yaw only; never the capture protocol. */
export const REEL_VIEWS: readonly { id: RepresentativeViewId; label: string }[] = [
  { id: "front", label: "정면" },
  { id: "oblique", label: "사선" },
  { id: "side", label: "측면" },
];

const CONTROL = 44;
const INDICATOR = 60;

export type ReelOverlayInsets = { top: number; bottom: number };

type ReelOverlayProps = {
  item: ReelItem;
  /** Shows the small play indicator; the only playback chrome there is. */
  paused: boolean;
  view: RepresentativeViewId;
  onViewChange: (view: RepresentativeViewId) => void;
  onClose: () => void;
  /** `null` hides the action (a reference has no analysis of its own). */
  onOpenAnalysis: (() => void) | null;
  width: number;
  height: number;
  insets: ReelOverlayInsets;
  progress: Animated.Value;
};

/**
 * Everything drawn over a Reel besides the motion: a close affordance and the
 * view chips at the top, a label and one line at the bottom-left, the analysis
 * action at the bottom-right, the progress line along the bottom, and a play
 * indicator only while paused. The centre stays clear unless paused.
 */
export function ReelOverlay({ item, paused, view, onViewChange, onClose, onOpenAnalysis, width, height, insets, progress }: ReelOverlayProps) {
  const top = insets.top + 6;
  const progressBottom = insets.bottom + 8;
  return (
    <View pointerEvents="box-none" style={[styles.layer, { width, height }]} testID="reel-overlay">
      <View pointerEvents="box-none" style={[styles.topRow, { top, width }]}>
        <Pressable
          accessibilityLabel="릴 닫기"
          accessibilityRole="button"
          accessibilityState={{ disabled: false }}
          disabled={false}
          onPress={onClose}
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          testID="reel-close"
        >
          <MaterialCommunityIcons name="arrow-left" size={26} color={tokens.stageForeground} />
        </Pressable>
        <View style={styles.chips}>
          {REEL_VIEWS.map((candidate) => {
            const selected = candidate.id === view;
            return (
              <Pressable
                key={candidate.id}
                accessibilityLabel={`${candidate.label} 시점`}
                accessibilityRole="button"
                accessibilityState={{ disabled: false, selected }}
                aria-selected={selected}
                disabled={false}
                onPress={() => onViewChange(candidate.id)}
                style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
                testID={`reel-view-${candidate.id}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{candidate.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {paused ? (
        <View
          pointerEvents="none"
          style={[styles.indicator, { left: Math.round((width - INDICATOR) / 2), top: Math.round((height - INDICATOR) / 2) }]}
          testID="reel-pause-indicator"
        >
          <MaterialCommunityIcons name="play" size={30} color={tokens.stageForeground} />
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.bottomRow, { bottom: progressBottom + REEL_PROGRESS_HEIGHT + 10, width }]}>
        <View pointerEvents="none" style={styles.caption}>
          <Text numberOfLines={1} style={styles.title}>{reelTitle(item)}</Text>
          <Text numberOfLines={1} style={styles.line}>{reelLine(item)}</Text>
        </View>
        {onOpenAnalysis ? (
          <Pressable
            accessibilityLabel="이 슛폼 분석 열기"
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            disabled={false}
            onPress={onOpenAnalysis}
            style={({ pressed }) => [styles.rail, pressed && styles.pressed]}
            testID="reel-analysis"
          >
            <MaterialCommunityIcons name="chart-timeline-variant" size={26} color={tokens.stageForeground} />
            <Text style={styles.railText}>분석</Text>
          </Pressable>
        ) : null}
      </View>

      <ReelProgress bottom={progressBottom} progress={progress} width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { left: 0, position: "absolute", top: 0 },
  topRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", left: 0, paddingHorizontal: 6, position: "absolute" },
  control: { alignItems: "center", height: CONTROL, justifyContent: "center", minHeight: CONTROL, minWidth: CONTROL, width: CONTROL },
  chips: { flexDirection: "row", gap: 4, paddingRight: 6 },
  chip: { alignItems: "center", backgroundColor: tokens.elevatedSurface, borderRadius: 999, justifyContent: "center", minHeight: 30, opacity: 0.92, paddingHorizontal: 11 },
  chipSelected: { backgroundColor: tokens.foreground, opacity: 1 },
  chipText: { ...typography.label, color: tokens.foreground },
  chipTextSelected: { color: tokens.background },
  indicator: {
    alignItems: "center",
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.border,
    borderRadius: INDICATOR / 2,
    borderWidth: 1,
    height: INDICATOR,
    justifyContent: "center",
    opacity: 0.94,
    paddingLeft: 4,
    position: "absolute",
    width: INDICATOR,
  },
  bottomRow: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", left: 0, paddingHorizontal: 14, position: "absolute" },
  caption: { flex: 1, gap: 2, paddingRight: 12 },
  title: { ...typography.headline, color: tokens.stageForeground },
  line: { ...typography.callout, color: tokens.mutedForeground },
  rail: { alignItems: "center", gap: 2, justifyContent: "center", minHeight: CONTROL, minWidth: CONTROL, paddingHorizontal: 4 },
  railText: { ...typography.label, color: tokens.stageForeground },
  pressed: { opacity: 0.6 },
});
