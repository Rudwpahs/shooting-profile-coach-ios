/**
 * Magnetic field, web build. One shared, passive `pointermove` listener on
 * the window serves every registered target and is removed with the last one.
 * Pointer bursts are coalesced to a single update per animation frame, and
 * only mouse pointers attract: touch and pen get press feedback instead.
 * Scrolling under a still pointer re-measures, so drift never outlives the
 * pointer's real position.
 *
 * Targets are measured on their hit-area node, which never moves, so the
 * visual drift cannot feed back into the measurement. Each flush reads one
 * client rect per registered target: fine for a handful of controls (a dock);
 * cache rects before registering dozens.
 */
import type * as NativeField from "./magnetic-field";
import { distanceOutsideRect, type LiquidPoint, type LiquidSize } from "./magnetic-target";

export type MagneticListener = NativeField.MagneticListener;
export type MagneticTargetOptions = NativeField.MagneticTargetOptions;

type Target = {
  node: HTMLElement;
  radius: number;
  listener: MagneticListener;
  engaged: boolean;
  size: LiquidSize;
};

/** The platform supports hover attraction (constant, so render output never differs between server and browser). */
export const MAGNETIC_FIELD_SUPPORTED = true;

const targets = new Set<Target>();
let pointer: LiquidPoint | null = null;
let frame: number | null = null;

function flush() {
  frame = null;
  for (const target of targets) {
    if (!target.node.isConnected) continue;
    if (pointer === null) {
      if (target.engaged) {
        target.engaged = false;
        target.listener(null, target.size);
      }
      continue;
    }
    const rect = target.node.getBoundingClientRect();
    target.size = { width: rect.width, height: rect.height };
    const local = { x: pointer.x - rect.left, y: pointer.y - rect.top };
    if (distanceOutsideRect(local, target.size) < target.radius) {
      target.engaged = true;
      target.listener(local, target.size);
    } else if (target.engaged) {
      target.engaged = false;
      target.listener(null, target.size);
    }
  }
}

function schedule() {
  if (frame === null) frame = window.requestAnimationFrame(flush);
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType !== "mouse") {
    if (pointer !== null) {
      pointer = null;
      schedule();
    }
    return;
  }
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
}

function onScroll() {
  if (pointer !== null) schedule();
}

function onPointerGone() {
  pointer = null;
  schedule();
}

function onDocumentLeave(event: MouseEvent) {
  if (event.relatedTarget === null) onPointerGone();
}

function attach() {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  // Scroll does not bubble; listening in capture catches every scroll container.
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("blur", onPointerGone);
  document.addEventListener("mouseout", onDocumentLeave);
}

function detach() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("blur", onPointerGone);
  document.removeEventListener("mouseout", onDocumentLeave);
  if (frame !== null) window.cancelAnimationFrame(frame);
  frame = null;
  pointer = null;
}

export function registerMagneticTarget(node: unknown, options: MagneticTargetOptions, listener: MagneticListener): () => void {
  if (typeof HTMLElement === "undefined" || !(node instanceof HTMLElement)) return () => undefined;
  const target: Target = { node, radius: options.radius, listener, engaged: false, size: { width: 0, height: 0 } };
  targets.add(target);
  if (targets.size === 1) attach();
  return () => {
    if (!targets.delete(target)) return;
    if (targets.size === 0) detach();
  };
}

// Compile-time parity with the native build: same signature, same flag type.
registerMagneticTarget satisfies typeof NativeField.registerMagneticTarget;
MAGNETIC_FIELD_SUPPORTED satisfies typeof NativeField.MAGNETIC_FIELD_SUPPORTED;
