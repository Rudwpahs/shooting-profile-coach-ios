const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One short, honest recency label for a feed header: 오늘 · 어제 · N일 전 ·
 * N주 전 · a plain date beyond that. Never a fake "just now".
 */
export function relativeDayLabel(date: Date, now: Date = new Date()): string {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return date.toLocaleDateString("ko-KR");
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return date.toLocaleDateString("ko-KR");
}
