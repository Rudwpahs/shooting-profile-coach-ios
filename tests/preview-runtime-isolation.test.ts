import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("preview runtime isolation", () => {
  const layout = readFileSync("app/_layout.tsx", "utf8");
  const auth = readFileSync("lib/firebase-auth.tsx", "utf8");

  it("mounts the preview provider at the app root", () => {
    expect(layout).toContain('import { PreviewRuntimeProvider } from "@/lib/preview/preview-runtime-provider"');
    expect(layout).toContain("<PreviewRuntimeProvider>");
  });

  it("disables Firebase auth side effects in an explicit Pages preview build", () => {
    expect(layout).toContain("PREVIEW_RUNTIME_ENABLED");
    expect(layout).toMatch(/<FirebaseAuthProvider\s+disabled=\{PREVIEW_RUNTIME_ENABLED\}>/);
    expect(auth).toContain("disabled?: boolean");
    expect(auth).toMatch(/if \(disabled\)/);
  });

  it("keeps the preview fixture factory behind the build-time preview gate", () => {
    const providerPath = "lib/preview/preview-runtime-provider.tsx";
    expect(() => readFileSync(providerPath, "utf8")).not.toThrow();
    const provider = readFileSync(providerPath, "utf8");
    expect(provider).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(provider).toContain('require("@/lib/preview/preview-runtime-fixtures")');
    expect(provider).not.toMatch(/^import (?!type\b).*preview-runtime-fixtures/m);
  });
});
