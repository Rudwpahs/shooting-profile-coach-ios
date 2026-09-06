import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { tokens } from "@/constants/tokens";
import { fitGlyphPoints, type GlyphBounds, type SkeletonGlyphData } from "@/lib/skeleton/pose-motion-glyph";

/**
 * How much the skeleton may be trusted, shown in form rather than as a number:
 * `recapture` draws dashed, dimmed bones so a session that needs a retake is
 * distinct from a saved one even at thumbnail size.
 */
export type SkeletonConfidence = "high" | "basic" | "recapture";

type SkeletonGlyphProps = {
  data: SkeletonGlyphData;
  width: number;
  height: number;
  confidence?: SkeletonConfidence;
  /** Set to false when a parent Pressable already carries the label. */
  accessible?: boolean;
  accessibilityLabel: string;
  ground?: boolean;
  padding?: number;
  /** Fit against these bounds (e.g. a whole loop) instead of this frame alone. */
  bounds?: GlyphBounds;
};

/**
 * Static skeleton drawing shared by tiles, feed cards and avatars: observed
 * joints filled, derived joints hollow, the shooting arm in the accent colour,
 * always on the stage surface.
 */
export function SkeletonGlyph({
  data,
  width,
  height,
  confidence = "basic",
  accessible = true,
  accessibilityLabel,
  ground = true,
  padding,
  bounds,
}: SkeletonGlyphProps) {
  const fitted = useMemo(
    () => fitGlyphPoints(data.points, width, height, padding ?? Math.max(4, Math.min(width, height) * 0.1), bounds),
    [data.points, width, height, padding, bounds],
  );
  const weight = Math.max(0.45, Math.min(1.4, Math.min(width, height) / 300));
  const recapture = confidence === "recapture";
  const derived = new Set(data.derivedJoints);
  const arm = new Set(data.armJoints);
  const dash = recapture ? "5 5" : undefined;
  const opacity = recapture ? 0.6 : 1;

  return (
    <View
      accessible={accessible}
      accessibilityRole={accessible ? "image" : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      style={[styles.stage, { width, height }]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {ground ? (
          <Line
            x1={padding ?? 8}
            y1={fitted.groundY + 2}
            x2={width - (padding ?? 8)}
            y2={fitted.groundY + 2}
            stroke={tokens.skeletonDerived}
            strokeWidth={1}
            strokeDasharray="3 4"
            opacity={0.6}
          />
        ) : null}
        {data.bones.map(([from, to]) => {
          const a = fitted.points[from];
          const b = fitted.points[to];
          if (!a || !b) return null;
          const isDerived = derived.has(from) || derived.has(to);
          const isArm = arm.has(from) && arm.has(to);
          return (
            <Line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isArm ? tokens.skeletonSecondary : isDerived ? tokens.skeletonDerived : tokens.skeletonPrimary}
              strokeWidth={(isDerived ? 2.2 : isArm ? 4.2 : 3.4) * weight}
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={opacity}
            />
          );
        })}
        {Object.entries(fitted.points).map(([joint, point]) => {
          if (joint === data.headJoint) {
            return (
              <Circle
                key={joint}
                cx={point.x}
                cy={point.y}
                r={6.5 * weight}
                fill={tokens.skeletonPrimary}
                opacity={opacity}
              />
            );
          }
          if (derived.has(joint)) {
            return (
              <Circle
                key={joint}
                cx={point.x}
                cy={point.y}
                r={2.6 * weight}
                fill={tokens.stage}
                stroke={tokens.skeletonDerived}
                strokeWidth={1.2 * weight}
                opacity={opacity}
              />
            );
          }
          return (
            <Circle
              key={joint}
              cx={point.x}
              cy={point.y}
              r={(arm.has(joint) ? 3.6 : 3.1) * weight}
              fill={arm.has(joint) ? tokens.skeletonSecondary : tokens.skeletonPrimary}
              opacity={opacity}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: tokens.stage, overflow: "hidden" },
});
