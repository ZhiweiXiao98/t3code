import { expect, it } from "vite-plus/test";

import {
  isScheduledWeekdays,
  scheduledWeekdayLabel,
  scheduledRepeatLabel,
  formatNextScheduledTaskRun,
  formatScheduledTaskInterval,
} from "./scheduledTaskPresentation";

it("formats compound intervals without English units in Chinese and preserves English", () => {
  expect(formatScheduledTaskInterval(60_000, "en")).toBe("Every minute");
  expect(formatScheduledTaskInterval(60_000, "zh-CN")).toBe("每隔 1 分钟");
  expect(formatScheduledTaskInterval(90_001, "en")).toBe("Every 1 minute 30 seconds 1 millisecond");
  expect(formatScheduledTaskInterval(90_001, "zh-CN")).toBe("每隔 1 分钟 30 秒 1 毫秒");
});

it("formats next-run states and dates using the selected locale", () => {
  const now = new Date(2026, 10, 13, 12).getTime();
  expect(formatNextScheduledTaskRun("invalid", now, "zh-CN")).toBe("下次运行时间不可用");
  expect(formatNextScheduledTaskRun(new Date(now).toISOString(), now, "zh-CN")).toBe(
    "已到下次运行时间",
  );
  expect(formatNextScheduledTaskRun(new Date(now + 30_000).toISOString(), now, "zh-CN")).toBe(
    "下次运行在不到一分钟后",
  );
  expect(formatNextScheduledTaskRun(new Date(now + 120_000).toISOString(), now, "zh-CN")).toBe(
    "下次运行在 2 分钟后",
  );
  expect(formatNextScheduledTaskRun(new Date(now + 120_000).toISOString(), now, "en")).toBe(
    "Next run in 2 minutes",
  );
  const beforeMidnight = new Date(2026, 10, 13, 23, 59).getTime();
  const afterMidnight = new Date(2026, 10, 14, 0, 1);
  expect(formatNextScheduledTaskRun(afterMidnight.toISOString(), beforeMidnight, "zh-CN")).toBe(
    `下次运行在明天 ${afterMidnight.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" })}`,
  );
  const tomorrow = new Date(2026, 10, 14, 12);
  expect(formatNextScheduledTaskRun(tomorrow.toISOString(), now, "zh-CN")).toBe(
    `下次运行在明天 ${tomorrow.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" })}`,
  );
  const later = new Date(2026, 10, 16, 12);
  expect(formatNextScheduledTaskRun(later.toISOString(), now, "zh-CN")).toBe(
    `下次运行在 ${later.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} ${later.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" })}`,
  );
});

it("keeps weekday preset selection independent of translated display labels", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    expect(isScheduledWeekdays([5, 4, 3, 2, 1])).toBe(true);
    expect(isScheduledWeekdays([1, 3])).toBe(false);
    expect(scheduledRepeatLabel([1, 3], locale)).toBe(
      locale === "zh-CN" ? "周一, 周三" : "Mon, Wed",
    );
    expect(scheduledRepeatLabel([1, 2, 3, 4, 5], locale)).toBe(
      locale === "zh-CN" ? "工作日" : "Weekdays",
    );
    expect(scheduledWeekdayLabel(0, locale)).toBe(locale === "zh-CN" ? "周日" : "Sun");
  }
});
