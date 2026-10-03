import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";

/**
 * The size a full-bleed feed inside a tab should fill: the tab scene's own
 * measured size (the tab bar sits below it), with the window standing in
 * until layout reports, so the first reel paints at once, including on the
 * static web render. Unchanged sizes never re-render.
 */
export function useTabSceneSize(): { width: number; height: number; onLayout: (event: LayoutChangeEvent) => void } {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = { width: Math.round(event.nativeEvent.layout.width), height: Math.round(event.nativeEvent.layout.height) };
    setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
  }, []);
  return {
    width: size.width > 0 ? size.width : Math.round(window.width),
    height: size.height > 0 ? size.height : Math.round(window.height),
    onLayout,
  };
}
