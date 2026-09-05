import { describe, expect, it, vi } from "vitest";

import { createRealVideoEvaluationFilePreparer } from "@/lib/shooting-profile/real-video-evaluation-file";

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: null,
  writeAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

describe("real-video evaluation report file", () => {
  it("writes the exact derived JSON to an opaque cache file and removes it idempotently", async () => {
    const writeAsStringAsync = vi.fn(async () => undefined);
    const deleteAsync = vi.fn(async () => undefined);
    const prepare = createRealVideoEvaluationFilePreparer({
      cacheDirectory: "file:///private/cache/",
      writeAsStringAsync,
      deleteAsync,
    }, () => "opaque-test-token");
    const json = '{"schemaVersion":1,"sourceClass":"consented_self_capture"}';

    const prepared = await prepare(json);

    expect(prepared.uri).toBe("file:///private/cache/formpath-derived-evaluation-opaque-test-token.json");
    expect(writeAsStringAsync).toHaveBeenCalledOnce();
    expect(writeAsStringAsync).toHaveBeenCalledWith(prepared.uri, json);

    await prepared.cleanup();
    expect(deleteAsync).toHaveBeenCalledOnce();
    expect(deleteAsync).toHaveBeenCalledWith(prepared.uri, { idempotent: true });
  });

  it("fails before writing when the platform has no cache directory", async () => {
    const writeAsStringAsync = vi.fn(async () => undefined);
    const prepare = createRealVideoEvaluationFilePreparer({
      cacheDirectory: null,
      writeAsStringAsync,
      deleteAsync: vi.fn(async () => undefined),
    }, () => "unused");

    await expect(prepare("{}"))
      .rejects.toThrow("evaluation_report_cache_unavailable");
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("removes a partial cache item when writing the report fails", async () => {
    const writeFailure = new Error("disk full");
    const deleteAsync = vi.fn(async () => undefined);
    const prepare = createRealVideoEvaluationFilePreparer({
      cacheDirectory: "file:///private/cache",
      writeAsStringAsync: vi.fn(async () => { throw writeFailure; }),
      deleteAsync,
    }, () => "partial");

    await expect(prepare("{}"))
      .rejects.toBe(writeFailure);
    expect(deleteAsync).toHaveBeenCalledOnce();
    expect(deleteAsync).toHaveBeenCalledWith(
      "file:///private/cache/formpath-derived-evaluation-partial.json",
      { idempotent: true },
    );
  });
});
