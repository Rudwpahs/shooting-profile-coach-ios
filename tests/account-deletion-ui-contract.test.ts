import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync("components/profile/account-deletion-panel.tsx", "utf8");
const controllerSource = readFileSync("components/profile/account-deletion-controller.tsx", "utf8");
const accountSource = readFileSync("components/profile/account-panel.tsx", "utf8");

describe("account deletion UI contract", () => {
  it("exposes one accessible destructive entry point for a signed-in account", () => {
    expect(panelSource).toContain('accessibilityLabel="계정 삭제"');
    expect(panelSource).toContain('accessibilityRole="button"');
    expect(panelSource).toContain("계정과 저장된 슛폼 데이터가 영구 삭제됩니다");
  });

  it("requires the current password only after opening the destructive flow", () => {
    expect(panelSource).toContain("deletionOpen");
    expect(panelSource).toContain('accessibilityLabel="계정 삭제용 현재 비밀번호"');
    expect(panelSource).toContain("secureTextEntry");
    expect(panelSource).toContain("현재 비밀번호");
  });

  it("uses one explicit final destructive confirmation", () => {
    expect(panelSource).toContain("Alert.alert");
    expect(panelSource).toContain("계정 영구 삭제");
    expect(panelSource).toContain('style: "destructive"');
    expect(panelSource).toContain("onDelete(password)");
  });

  it("keeps errors accessible and retryable", () => {
    expect(panelSource).toContain('accessibilityLiveRegion="assertive"');
    expect(panelSource).toContain("deleting");
    expect(panelSource).toContain("error");
  });

  it("is rendered from the signed-in AccountPanel through the controller", () => {
    expect(accountSource).toContain("AccountDeletionController");
  });

  it("deletes the remote account before clearing local profile data", () => {
    expect(controllerSource).toContain("deleteAccount");
    expect(controllerSource).toContain("clearProfile");
    const start = controllerSource.indexOf("const deleteCurrentAccount = async");
    expect(start).toBeGreaterThan(-1);
    const handler = controllerSource.slice(start);
    expect(handler.indexOf("await deleteAccount(")).toBeGreaterThan(-1);
    expect(handler.indexOf("await clearProfile()")).toBeGreaterThan(-1);
    expect(handler.indexOf("await deleteAccount(")).toBeLessThan(handler.indexOf("await clearProfile()"));
  });
});
