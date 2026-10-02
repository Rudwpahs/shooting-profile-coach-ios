import type { ReactNode } from "react";

/**
 * Native: the preview runtime adds nothing around the app. The desktop frame
 * and the browser-only bridges live in the `.web` implementation.
 */
export function PreviewRuntimeRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
