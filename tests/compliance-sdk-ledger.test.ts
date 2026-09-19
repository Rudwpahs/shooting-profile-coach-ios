import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => existsSync(path) ? readFileSync(path, "utf8") : "";
const inventory = read("docs/compliance/third-party-sdk-inventory.md");
const transfers = read("docs/compliance/data-transfer-ledger.md");
describe("compliance SDK ledger", () => {
  it("covers release-relevant providers", () => {
    for (const token of ["Firebase Authentication", "Cloud Firestore", "MediaPipeTasksVision 0.10.21", "ExpoModulesCore", "expo-image-picker", "expo-secure-store", "@react-native-async-storage/async-storage"]) expect(inventory).toContain(token);
  });
  it("records known and blocked transfer locations truthfully", () => {
    expect(transfers).toContain("Firebase Authentication");
    expect(transfers).toContain("United States");
    expect(transfers).toContain("Cloud Firestore");
    expect(transfers).toContain("BLOCKED — verify production project");
  });
});
