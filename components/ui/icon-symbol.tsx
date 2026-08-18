import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { SymbolWeight } from "expo-symbols";
import type { ComponentProps } from "react";
import type { OpaqueColorValue, StyleProp, TextStyle } from "react-native";

const MAPPING = {
  "house.fill": "home",
  "target": "my-location",
  "book.closed.fill": "menu-book",
  "gearshape.fill": "settings",
  "chart.line.uptrend.xyaxis": "trending-up",
  "basketball.fill": "sports-basketball",
  "chevron.right": "chevron-right",
} as const satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

export type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({ name, size = 24, color, style, weight: _weight }: { name: IconSymbolName; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; weight?: SymbolWeight }) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
