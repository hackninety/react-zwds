/** 农历转换与闰月测试（lunar-lite 的月天数/闰月 API 已知损坏，验证改走 lunar-typescript 后的正确性） */
import { describe, expect, it } from "vitest";
import { dayGanZhi, daysInLunarMonth, leapMonthOf, lunarStrToSolarStr, lunarToSolarStr } from "./lunar";

describe("闰月", () => {
  it("闰月年份判定", () => {
    expect(leapMonthOf(2025)).toBe(6); // 乙巳闰六月
    expect(leapMonthOf(2023)).toBe(2); // 癸卯闰二月
    expect(leapMonthOf(1987)).toBe(6);
    expect(leapMonthOf(2026)).toBe(0); // 无闰
    expect(leapMonthOf(2024)).toBe(0);
  });

  it("月天数（修复 lunar-lite 恒 29 兜底的存量 BUG）", () => {
    expect(daysInLunarMonth(2025, 6, false)).toBe(30); // 正六月 30 天
    expect(daysInLunarMonth(2025, 6, true)).toBe(29); // 闰六月 29 天
    expect(daysInLunarMonth(2025, 1)).toBe(30);
    expect(daysInLunarMonth(2024, 11)).toBe(30);
    // 非闰月传 isLeap 应按普通月算
    expect(daysInLunarMonth(2025, 3, true)).toBe(daysInLunarMonth(2025, 3, false));
  });

  it("农历→公历（含闰月）", () => {
    expect(lunarToSolarStr(2025, 6, 1, false)).toBe("2025-6-25");
    expect(lunarToSolarStr(2025, 6, 1, true)).toBe("2025-7-25"); // 闰六月初一
    expect(lunarToSolarStr(2025, 6, 10, true)).toBe("2025-8-3");
    expect(lunarStrToSolarStr("2025-6-1", true)).toBe("2025-7-25");
  });

  it("非法/极端输入兜底而不抛出", () => {
    expect(lunarToSolarStr(2025, 13, 1)).toBeNull(); // 无 13 月
    expect(() => daysInLunarMonth(9999, 1)).not.toThrow();
    expect(() => leapMonthOf(-100)).not.toThrow();
  });
});

describe("日柱干支", () => {
  it("已知锚点与六十甲子周期", () => {
    const a = dayGanZhi("2000-1-1");
    expect(a).toHaveLength(2);
    // 同一日期 +60 天干支相同
    expect(dayGanZhi("2000-3-1")).toBe(dayGanZhi("2000-4-30"));
    expect(dayGanZhi("2024-2-10")).toBe(dayGanZhi("2024-4-10"));
  });
});
