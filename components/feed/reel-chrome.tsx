import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { reelLabel, reelLine, type ReelItem } from "@/lib/feed/reel-model";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ReelAction = { icon: IconName; label: string; onPress: () => void; disabled?: boolean };

/** Height of the bottom band that holds the label and the line; the stage ends above it. */
export const REEL_CHROME_BOTTOM_HEIGHT = 96;
/** Width of the trailing icon rail; it overlays only the lower part of the stage. */
export const REEL_RAIL_WIDTH = 56;
const RAIL_BUTTON = 44;

type ReelChromeProps = {
  item: ReelItem;
  paused: boolean;
  actions: readonly ReelAction[];
  width: number;
  height: number;
};

/**
 * Everything drawn over a Reel besides the motion: a small label and one line
 * at the bottom-left, an icon rail at the bottom-right, and a small pause mark
 * in the top-right corner. The centre of the stage is never covered.
 */
export function ReelChrome({ item, paused, actions, width, height }: ReelChromeProps) {
  const coach = item.kind === "coach";
  return (
    <View style={[styles.layer, { width, height }]} testID="reel-chrome">
      {paused ? (
        <View style={styles.pauseMark} testID="reel-pause-mark">
          <MaterialCommunityIcons name="play" size={22} color={tokens.stageForeground} />
        </View>
      ) : null}
      <View style={[styles.bottom, { height: REEL_CHROME_BOTTOM_HEIGHT, width: width - REEL_RAIL_WIDTH }]}>
        <View style={styles.labelRow}>
          {coach ? <View style={styles.coachDot} /> : null}
          <Text numberOfLines={1} style={[styles.label, coach && styles.coachLabel]}>{reelLabel(item)}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.line, coach && styles.coachLine]}>{reelLine(item)}</Text>
      </View>
      <View style={[styles.rail, { width: REEL_RAIL_WIDTH }]}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: action.disabled === true }}
            aria-disabled={action.disabled === true}
            disabled={action.disabled === true}
            onPress={action.onPress}
            style={({ pressed }) => [styles.railButton, action.disabled && styles.railDisabled, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={action.icon} size={26} color={tokens.stageForeground} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Touches fall through everything except the rail buttons.
  layer: { left: 0, pointerEvents: "box-none", position: "absolute", top: 0 },
  pauseMark: {
    alignItems: "center",
    backgroundColor: tokens.elevatedSurface,
    borderColor: tokens.border,
    borderRadius: 22,
    borderWidth: 1,
    height: RAIL_BUTTON,
    justifyContent: "center",
    opacity: 0.94,
    paddingLeft: 2,
    pointerEvents: "none",
    position: "absolute",
    right: 8,
    top: 8,
    width: RAIL_BUTTON,
  },
  bottom: { bottom: 0, justifyContent: "flex-end", left: 0, paddingBottom: 14, paddingHorizontal: 14, pointerEvents: "none", position: "absolute" },
  labelRow: { alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 4 },
  coachDot: { backgroundColor: tokens.primary, borderRadius: 3, height: 6, width: 6 },
  label: { ...typography.label, color: tokens.mutedForeground },
  coachLabel: { color: tokens.primary },
  line: { ...typography.callout, color: tokens.foreground },
  coachLine: { ...typography.headline, color: tokens.foreground },
  rail: { alignItems: "center", bottom: 12, gap: 6, pointerEvents: "box-none", position: "absolute", right: 0 },
  railButton: { alignItems: "center", height: RAIL_BUTTON, justifyContent: "center", width: RAIL_BUTTON },
  railDisabled: { opacity: 0.35 },
  pressed: { opacity: 0.5 },
});
