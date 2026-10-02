import { renderToStaticMarkup } from "react-dom/server";
import { Text } from "react-native";
import { afterEach, describe, expect, it } from "vitest";

import { GlassSurface } from "@/components/glass/glass-surface.web";

const originalCss = Object.getOwnPropertyDescriptor(globalThis, "CSS");

afterEach(() => {
  if (originalCss) Object.defineProperty(globalThis, "CSS", originalCss);
  else Reflect.deleteProperty(globalThis, "CSS");
});

function directChildCount(backdropFilterSupported: boolean): number {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { supports: () => backdropFilterSupported },
  });

  const markup = renderToStaticMarkup(
    <GlassSurface variant="bar">
      <Text>Hoop Hub</Text>
    </GlassSurface>,
  );
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.firstElementChild?.childElementCount ?? -1;
}

describe("GlassSurface static-web hydration contract", () => {
  it("keeps the DOM child shape stable when server and browser glass capabilities differ", () => {
    const serverShape = directChildCount(false);
    const browserShape = directChildCount(true);

    expect(serverShape).toBeGreaterThan(0);
    expect(browserShape).toBe(serverShape);
  });
});
