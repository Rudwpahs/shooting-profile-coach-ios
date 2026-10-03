import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Likes and memos are device-local. The first 참조 동작 screen kept them under
 * `hoophub:reference:<id>:like|note`; the shared reel chrome keeps them under
 * `hoophub:reaction:v1:<reelId>:like|note`. A reference reel must still show
 * what the owner saved before, and carry it forward.
 */

const storage = new Map<string, string>();
const reads: string[] = [];
const status = { failWrite: false };
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => { reads.push(key); return storage.get(key) ?? null; },
    setItem: async (key: string, value: string) => { if (status.failWrite) throw new Error("write failed"); storage.set(key, value); },
    removeItem: async (key: string) => { storage.delete(key); },
  },
}));

const { useDeviceReactions, reactionStorageKey } = await import("@/hooks/use-device-reactions");

function Probe({ reelId }: { reelId: string }) {
  const reactions = useDeviceReactions(reelId);
  return (
    <div data-error={reactions.error} data-liked={String(reactions.liked)} data-ready={String(reactions.ready)} data-testid="probe">
      {reactions.note}
    </div>
  );
}

const REFERENCE = "reference:cmu-shoot-01";
const LEGACY = "hoophub:reference:cmu-shoot-01";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  storage.clear();
  reads.length = 0;
  status.failWrite = false;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const probe = () => container.querySelector('[data-testid="probe"]') as HTMLElement;
async function renderUntilReady(reelId: string) {
  await act(async () => { root.render(<Probe reelId={reelId} />); });
  for (let round = 0; round < 10 && probe().dataset.ready !== "true"; round += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

describe("device reactions and the legacy 참조 동작 keys", () => {
  it("prefers the v1 key whenever it exists, even when a legacy value disagrees", async () => {
    storage.set(reactionStorageKey(REFERENCE, "like"), "0");
    storage.set(reactionStorageKey(REFERENCE, "note"), "새 메모");
    storage.set(`${LEGACY}:like`, "1");
    storage.set(`${LEGACY}:note`, "옛 메모");
    await renderUntilReady(REFERENCE);
    expect(probe().dataset.ready).toBe("true");
    expect(probe().dataset.liked).toBe("false");
    expect(probe().textContent).toBe("새 메모");
  });

  it("restores a legacy like and memo for a reference reel when no v1 key exists, trimmed to the memo limit", async () => {
    storage.set(`${LEGACY}:like`, "1");
    storage.set(`${LEGACY}:note`, "옛 메모 ".repeat(400));
    await renderUntilReady(REFERENCE);
    expect(probe().dataset.liked).toBe("true");
    expect(probe().textContent).toHaveLength(2000);
    expect(probe().textContent?.startsWith("옛 메모")).toBe(true);
  });

  it("migrates the legacy values forward under the v1 keys without deleting the legacy entries", async () => {
    storage.set(`${LEGACY}:like`, "1");
    storage.set(`${LEGACY}:note`, "옛 메모");
    await renderUntilReady(REFERENCE);
    await act(async () => { await Promise.resolve(); });
    expect(storage.get(reactionStorageKey(REFERENCE, "like"))).toBe("1");
    expect(storage.get(reactionStorageKey(REFERENCE, "note"))).toBe("옛 메모");
    expect(storage.get(`${LEGACY}:like`)).toBe("1");
    expect(storage.get(`${LEGACY}:note`)).toBe("옛 메모");
  });

  it("still shows the legacy values when the migration write fails, with no error state", async () => {
    storage.set(`${LEGACY}:like`, "1");
    storage.set(`${LEGACY}:note`, "옛 메모");
    status.failWrite = true;
    await renderUntilReady(REFERENCE);
    expect(probe().dataset.ready).toBe("true");
    expect(probe().dataset.liked).toBe("true");
    expect(probe().textContent).toBe("옛 메모");
    expect(probe().dataset.error).toBe("");
    expect(storage.has(reactionStorageKey(REFERENCE, "like"))).toBe(false);
  });

  it("never looks at legacy keys for a profile or film reel", async () => {
    storage.set("hoophub:reference:demo-profile-1:like", "1");
    storage.set("hoophub:reference:film-shot-1:note", "memo");
    await renderUntilReady("profile:demo-profile-1");
    expect(probe().dataset.liked).toBe("false");
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderUntilReady("film:film-shot-1");
    expect(probe().textContent).toBe("");
    expect(reads.some((key) => key.startsWith("hoophub:reference:"))).toBe(false);
  });
});
