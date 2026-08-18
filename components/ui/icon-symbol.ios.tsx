import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { OpaqueColorValue, StyleProp, ViewStyle } from "react-native";

export type IconSymbolName = "house.fill" | "target" | "book.closed.fill" | "gearshape.fill" | "chart.line.uptrend.xyaxis" | "basketball.fill" | "chevron.right";

export function IconSymbol({ name, size = 24, color, style, weight = "regular" }: { name: IconSymbolName; size?: number; color: string | OpaqueColorValue; style?: StyleProp<ViewStyle>; weight?: SymbolViewProps["weight"] }) {
  return <SymbolView name={name} tintColor={color} size={size} style={style} weight={weight} />;
}
