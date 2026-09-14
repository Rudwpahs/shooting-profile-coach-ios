import { describe, expect, it } from "vitest";

import { relativeDayLabel } from "@/lib/format/relative-day";

const now = new Date(2026, 8, 6, 15, 30);

describe("relativeDayLabel", () => {
  it("labels today, yesterday, days and weeks by calendar day", () => {
    expect(relativeDayLabel(new Date(2026, 8, 6, 1, 0), now)).toBe("오늘");
    expect(relativeDayLabel(new Date(2026, 8, 5, 23, 59), now)).toBe("어제");
    expect(relativeDayLabel(new Date(2026, 8, 3), now)).toBe("3일 전");
    expect(relativeDayLabel(new Date(2026, 7, 30), now)).toBe("1주 전");
    expect(relativeDayLabel(new Date(2026, 7, 10), now)).toBe("3주 전");
  });

  it("falls back to a plain date beyond a month or for a future timestamp", () => {
    const old = new Date(2026, 6, 1);
    expect(relativeDayLabel(old, now)).toBe(old.toLocaleDateString("ko-KR"));
    const future = new Date(2026, 8, 9);
    expect(relativeDayLabel(future, now)).toBe(future.toLocaleDateString("ko-KR"));
  });
});
