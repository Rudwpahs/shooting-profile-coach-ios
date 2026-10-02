import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry) ? [path] : [];
  });
}

/**
 * react-native-web deprecates the `pointerEvents` prop ("props.pointerEvents is
 * deprecated. Use style.pointerEvents") and warns once per page load. Decorative
 * layers and pass-through containers declare it in style instead, which React
 * Native also supports, so the web console stays clean and the behaviour is
 * identical on native.
 */
describe("pointerEvents is declared in style, never as a prop", () => {
  it("has no JSX pointerEvents prop under app/ or components/", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components"]) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const source = readFileSync(file, "utf8");
        const lines = source.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (/\bpointerEvents=/.test(line)) offenders.push(`${relative(process.cwd(), file).replace(/\\/g, "/")}:${index + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
