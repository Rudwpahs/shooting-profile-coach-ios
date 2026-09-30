/**
 * Magnetic field, native and default build. There is no hover pointer on
 * touch devices, so nothing registers here: native surfaces get the touch
 * lean and spring feedback instead. The web build (`magnetic-field.web.ts`)
 * shares this API (checked at compile time); the bundler picks the platform
 * file.
 */
import type { LiquidPoint, LiquidSize } from "./magnetic-target";

export type MagneticListener = (pointer: LiquidPoint | null, size: LiquidSize) => void;
export type MagneticTargetOptions = { radius: number };

export const MAGNETIC_FIELD_SUPPORTED: boolean = false;

const release = () => undefined;

export function registerMagneticTarget(_node: unknown, _options: MagneticTargetOptions, _listener: MagneticListener): () => void {
  return release;
}
