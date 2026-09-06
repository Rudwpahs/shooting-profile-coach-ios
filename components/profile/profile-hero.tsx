import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getRepresentativeFocusStyle, getRepresentativeViewPresets, type RepresentativeViewId } from "@/components/shooting-profile/sequence-viewer";
import { representativeConfidence } from "@/components/skeleton/representative-glyph";
import { SkeletonGlyph } from "@/components/skeleton/skeleton-glyph";
import { SkeletonLoop } from "@/components/skeleton/skeleton-loop";
import { tokens } from "@/constants/tokens";
import { ANONYMOUS_POSE_REFERENCES } from "@/lib/anonymous-pose-library";
import type { ShootingProfileViewerRecordV2 } from "@/lib/firebase-shooting-profiles";
import { poseMotionGlyph } from "@/lib/skeleton/pose-motion-glyph";

export type ProfileHeroState = "signed-out" | "loading" | "empty" | "ready";

type ProfileHeroProps = {
  width: number;
  state: ProfileHeroState;
  record?: ShootingProfileViewerRecordV2;
  view: RepresentativeViewId;
  onViewChange: (view: RepresentativeViewId) => void;
};

/** A faint anonymous figure (the CMU reference at release) so the empty hero still reads as a skeleton's place, never as a photo slot. */
const SILHOUETTE = poseMotionGlyph(ANONYMOUS_POSE_REFERENCES[0].motion, { view: "oblique", progress: 0.75 });

const PLACEHOLDER: Record<ProfileHeroState, string> = {
  "signed-out": "로그인 후 촬영",
  loading: "대표 슛폼을 불러오는 중",
  empty: "첫 슛폼을 촬영해 보세요",
  ready: "",
};

/**
 * The identity element: the owner's latest representative skeleton looping on
 * the stage, with three view dots. Nothing else. States without a skeleton
 * keep the same frame so the profile always has a face-shaped hole filled by
 * motion, never by a photo or a letter.
 */
export function ProfileHero({ width, state, record, view, onViewChange }: ProfileHeroProps) {
  const height = Math.round(width * 0.9);
  const [focused, setFocused] = useState<string | null>(null);
  const presets = record ? getRepresentativeViewPresets(record.shootingHand) : getRepresentativeViewPresets("right");
  const confidence = record ? representativeConfidence(record.profile) : "basic";

  return (
    <View style={[styles.frame, { width, height }]}>
      {state === "ready" && record ? (
        <SkeletonLoop
          accessibilityLabel={`내 대표 슛폼 skeleton, ${presets.find((preset) => preset.id === view)?.label ?? view} 시점 재생`}
          confidence={confidence}
          height={height}
          profile={record.profile}
          shootingHand={record.shootingHand}
          view={view}
          width={width}
        />
      ) : (
        <View accessible accessibilityLabel={PLACEHOLDER[state]} style={[styles.placeholder, { width, height }]}>
          <View pointerEvents="none" style={styles.silhouette}>
            <SkeletonGlyph
              accessible={false}
              accessibilityLabel=""
              data={SILHOUETTE}
              ground={false}
              height={height}
              padding={Math.round(height * 0.14)}
              width={width}
            />
          </View>
          {state === "loading" ? <ActivityIndicator color={tokens.mutedForeground} /> : <Text style={styles.placeholderText}>{PLACEHOLDER[state]}</Text>}
        </View>
      )}
      {state === "ready" ? (
        <>
          <View pointerEvents="none" style={[styles.badge, confidence === "high" && styles.badgeHigh, confidence === "recapture" && styles.badgeRecapture]} />
          <View style={styles.dots}>
            {presets.map((preset) => {
              const selected = preset.id === view;
              const key = `view:${preset.id}`;
              return (
                <Pressable
                  key={preset.id}
                  accessibilityLabel={`${preset.label} 시점`}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: false }}
                  disabled={false}
                  focusable
                  onBlur={() => setFocused((current) => current === key ? null : current)}
                  onFocus={() => setFocused(key)}
                  onPress={() => onViewChange(preset.id)}
                  style={({ pressed }) => [styles.dotTarget, getRepresentativeFocusStyle(focused === key, "light"), pressed && styles.pressed]}
                >
                  <View style={[styles.dot, selected && styles.dotSelected]} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: tokens.stage, overflow: "hidden", position: "relative" },
  placeholder: { alignItems: "center", justifyContent: "flex-end", paddingBottom: 22 },
  silhouette: { left: 0, opacity: 0.16, position: "absolute", top: 0 },
  placeholderText: { color: tokens.mutedForeground, fontSize: 13 },
  badge: { backgroundColor: tokens.mutedForeground, borderRadius: 5, height: 10, position: "absolute", right: 12, top: 12, width: 10 },
  badgeHigh: { backgroundColor: tokens.analysisHighConfidence },
  badgeRecapture: { backgroundColor: tokens.warning },
  dots: { bottom: 4, flexDirection: "row", position: "absolute", right: 4 },
  dotTarget: { alignItems: "center", height: 44, justifyContent: "center", minHeight: 44, minWidth: 44, width: 44 },
  dot: { backgroundColor: tokens.stageForeground, borderRadius: 4, height: 7, opacity: 0.35, width: 7 },
  dotSelected: { backgroundColor: tokens.skeletonSecondary, opacity: 1 },
  pressed: { opacity: 0.7 },
});
