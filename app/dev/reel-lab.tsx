import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { ReelAction } from "@/components/feed/reel-chrome";
import { ReelFeed } from "@/components/feed/reel-feed";
import type { ReelSavedMoment } from "@/components/feed/reel-item";
import { ScreenContainer } from "@/components/screen-container";
import { TopBar } from "@/components/ui/top-bar";
import { tokens } from "@/constants/tokens";
import { typography } from "@/constants/typography";
import { useReduceMotion } from "@/hooks/use-reduce-motion";
import type { MotionLiftPhase } from "@/lib/feed/motion-lift-state";
import { reelLabFixtures } from "@/lib/feed/reel-fixtures";
import type { ReelItem } from "@/lib/feed/reel-model";

const noop = () => {};

/** Harness actions: the rail exists so the layout is real; nothing navigates yet. */
function actionsFor(item: ReelItem): readonly ReelAction[] {
  if (item.kind === "coach") return [{ icon: "information-outline", label: "자세히", onPress: noop }];
  if (item.kind === "reference") return [{ icon: "arrow-expand", label: `${item.label} 참조 모션 열기`, onPress: noop }];
  return [{ icon: "human", label: "내 슛폼 프로필 열기", onPress: noop }];
}

/**
 * Dev-only harness for the vertical Reel shell and the held Motion Lift
 * (Waves C1-A and C1-B). Isolated from the Home tab on purpose: fixture
 * data, no provider, no persistence. The trailing badge reads the Motion
 * Lift phase and the saved count so device QA can see state without logs.
 */
export default function ReelLabScreen() {
  const items = useMemo(reelLabFixtures, []);
  const reducedMotion = useReduceMotion();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [phase, setPhase] = useState<MotionLiftPhase>("idle");
  const [saved, setSaved] = useState<ReelSavedMoment[]>([]);
  const measure = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width: Math.round(width), height: Math.round(height) });
  }, []);
  const onSave = useCallback((moment: ReelSavedMoment) => setSaved((current) => [...current, moment]), []);

  const badge = `fixture · ${phase}${saved.length > 0 ? ` · saved ${saved.length}` : ""}`;

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "left", "right", "bottom"]}>
      <TopBar right={<Text numberOfLines={1} style={styles.badge}>{badge}</Text>} wordmark="Reel Lab" />
      <View onLayout={measure} style={styles.viewport}>
        {viewport.height > 0 ? (
          <ReelFeed
            actionsFor={actionsFor}
            height={viewport.height}
            items={items}
            onLiftPhase={setPhase}
            onSave={onSave}
            reducedMotion={reducedMotion ?? true}
            width={viewport.width}
          />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  badge: { ...typography.label, color: tokens.mutedForeground, paddingRight: 8 },
});
