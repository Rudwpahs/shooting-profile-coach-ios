import * as FileSystem from "expo-file-system/legacy";

import type { RealVideoEvaluationFilePreparer } from "@/lib/shooting-profile/real-video-evaluation";

export type RealVideoEvaluationFileSystem = Readonly<{
  cacheDirectory: string | null;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
  deleteAsync: (uri: string, options: { idempotent: boolean }) => Promise<void>;
}>;

let reportFileCounter = 0;

function opaqueReportFileSuffix(): string {
  reportFileCounter += 1;
  return `${reportFileCounter.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function createRealVideoEvaluationFilePreparer(
  fileSystem: RealVideoEvaluationFileSystem,
  suffix: () => string = opaqueReportFileSuffix,
): RealVideoEvaluationFilePreparer {
  return async (json) => {
    if (fileSystem.cacheDirectory === null) {
      throw new Error("evaluation_report_cache_unavailable");
    }
    const cacheRoot = fileSystem.cacheDirectory.endsWith("/")
      ? fileSystem.cacheDirectory
      : `${fileSystem.cacheDirectory}/`;
    const uri = `${cacheRoot}formpath-derived-evaluation-${suffix()}.json`;
    try {
      await fileSystem.writeAsStringAsync(uri, json);
    } catch (error) {
      try {
        await fileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // Preserve the original write failure; the caller already fails closed.
      }
      throw error;
    }
    return Object.freeze({
      uri,
      cleanup: () => fileSystem.deleteAsync(uri, { idempotent: true }),
    });
  };
}

export const prepareRealVideoEvaluationFile = createRealVideoEvaluationFilePreparer({
  cacheDirectory: FileSystem.cacheDirectory,
  writeAsStringAsync: FileSystem.writeAsStringAsync,
  deleteAsync: FileSystem.deleteAsync,
});
