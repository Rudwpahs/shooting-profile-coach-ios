import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const LIQUID_DIR = "components/ui/liquid";
const SHOWCASE = "app/dev/liquid-lab.tsx";

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(entry) ? [path] : [];
  });
}

/** Module specifiers a file imports or re-exports at runtime (type-only imports are erased). */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  for (const match of source.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1]);
  return specifiers;
}

function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/^export\s+(?:const|function|let|class)\s+([A-Za-z0-9_]+)/gm)) names.add(match[1]);
  return [...names].sort();
}

const liquidFiles = sourceFiles(LIQUID_DIR).map((file) => relative(process.cwd(), file).replace(/\\/g, "/"));
const read = (file: string) => readFileSync(file, "utf8");
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("liquid interaction foundation: module boundaries", () => {
  it("ships the foundation primitives with narrow, single-purpose files", () => {
    for (const name of [
      "liquid-motion.ts",
      "magnetic-target.ts",
      "ripple-geometry.ts",
      "magnetic-field.ts",
      "magnetic-field.web.ts",
      "use-liquid-reduce-motion.ts",
      "liquid-ripple.tsx",
      "liquid-pressable.tsx",
      "index.ts",
    ]) {
      expect(existsSync(join(LIQUID_DIR, name)), name).toBe(true);
    }
  });

  it("keeps motion tokens and geometry platform-neutral: no React, React Native or Reanimated import", () => {
    for (const file of ["liquid-motion.ts", "magnetic-target.ts", "ripple-geometry.ts"]) {
      const imports = runtimeImports(read(join(LIQUID_DIR, file)));
      expect(imports.filter((spec) => !spec.startsWith("./")), file).toEqual([]);
    }
  });

  it("never touches DOM globals outside the .web implementation", () => {
    const offenders = liquidFiles
      .filter((file) => !/\.web\.tsx?$/.test(file))
      .filter((file) => /\b(window|document)\.|getBoundingClientRect|requestAnimationFrame|PointerEvent/.test(withoutComments(read(file))));
    expect(offenders).toEqual([]);
  });

  it("gives the web magnetic field the same public API as the native fallback", () => {
    const native = exportedNames(read(join(LIQUID_DIR, "magnetic-field.ts")));
    const web = exportedNames(read(join(LIQUID_DIR, "magnetic-field.web.ts")));
    expect(native).toEqual(["MAGNETIC_FIELD_SUPPORTED", "registerMagneticTarget"]);
    expect(web).toEqual(native);
    expect(read(join(LIQUID_DIR, "magnetic-field.ts"))).toMatch(/MAGNETIC_FIELD_SUPPORTED(?::\s*boolean)?\s*=\s*false/);
    // The web file also type-checks its exports against the native module.
    expect(read(join(LIQUID_DIR, "magnetic-field.web.ts"))).toMatch(/registerMagneticTarget satisfies typeof NativeField\.registerMagneticTarget/);
  });

  it("lets the bundler pick the platform file: nobody imports a .web/.native module by name", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(root)) {
        if (runtimeImports(read(file)).some((spec) => /\.(web|native|ios|android)$/.test(spec) && spec.includes("liquid"))) {
          offenders.push(relative(process.cwd(), file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("depends only on React, React Native, Reanimated, the colour tokens and its own files", () => {
    const allowed = new Set(["react", "react-native", "react-native-reanimated", "@/constants/tokens"]);
    const offenders: string[] = [];
    for (const file of liquidFiles) {
      for (const spec of runtimeImports(read(file))) {
        if (!spec.startsWith("./") && !allowed.has(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps rendering, shader and physics engines out of Liquid; Expo GL belongs only to Film Space", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const installed = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const forbidden = /^(@shopify\/react-native-skia|three|@react-three\/.*|expo-gl|expo-three|gl-react.*|react-native-webgl|pixi\.js|ogl|regl|glslify|matter-js|cannon(-es)?|@dimforge\/.*|planck(-js)?|box2d.*|p2|react-native-physics.*)$/;
    const installedEngines = installed.filter((name) => forbidden.test(name));

    expect(installedEngines.filter((name) => name !== "expo-gl")).toEqual([]);
    expect(installedEngines).toContain("expo-gl");

    const filmRenderer = read("components/shooting-profile/film-slice-gl-renderer.native.tsx");
    expect(runtimeImports(filmRenderer)).toContain("expo-gl");
    for (const file of liquidFiles) {
      expect(runtimeImports(read(file))).not.toContain("expo-gl");
    }
  });
});

describe("liquid lab showcase stays developer-only", () => {
  it("exists behind the same build-time-foldable gate as the UI demo and redirects otherwise", () => {
    const source = read(SHOWCASE);
    expect(source).toContain('__DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1"');
    expect(source).toContain('process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"');
    expect(source).toMatch(/if \(!LIQUID_LAB_ENABLED\) return <Redirect href="\/" \/>/);
    expect(runtimeImports(source).filter((spec) => /@\/lib\/dev\/|@\/tests\//.test(spec))).toEqual([]);
  });

  it("is not linked from, or imported by, any production screen or component", () => {
    const offenders: string[] = [];
    for (const root of ["app", "components", "hooks", "lib"]) {
      for (const file of sourceFiles(root)) {
        const rel = relative(process.cwd(), file).replace(/\\/g, "/");
        if (rel === SHOWCASE) continue;
        if (/liquid-lab/.test(read(file))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
