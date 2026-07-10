/** 干支/五虎遁/五鼠遁/时辰/真太阳时 边界测试 */
import { describe, expect, it } from "vitest";
import {
  applyTrueSolar,
  equationOfTime,
  hourGanZhi,
  isYangStem,
  monthGanZhi,
  timeIndexFromClock,
  yearGanZhi,
} from "./utils";

describe("干支推算", () => {
  it("年干支：1984 甲子起元", () => {
    expect(yearGanZhi(1984)).toBe("甲子");
    expect(yearGanZhi(2024)).toBe("甲辰");
    expect(yearGanZhi(2025)).toBe("乙巳");
    expect(yearGanZhi(2026)).toBe("丙午");
    expect(yearGanZhi(1900)).toBe("庚子");
  });

  it("五虎遁月干支（正月建寅）", () => {
    expect(monthGanZhi(2024, 1)).toBe("丙寅"); // 甲己丙作首
    expect(monthGanZhi(2025, 1)).toBe("戊寅"); // 乙庚戊为头
    expect(monthGanZhi(2026, 1)).toBe("庚寅"); // 丙辛庚上起
    expect(monthGanZhi(2024, 12)).toBe("丁丑");
    expect(monthGanZhi(2025, 11)).toBe("戊子");
  });

  it("五鼠遁时干支", () => {
    expect(hourGanZhi("甲", 0)).toBe("甲子"); // 甲己还加甲
    expect(hourGanZhi("乙", 0)).toBe("丙子"); // 乙庚丙作初
    expect(hourGanZhi("癸", 0)).toBe("壬子"); // 戊癸壬子是真途
    expect(hourGanZhi("甲", 11)).toBe("乙亥");
  });

  it("阳干判断", () => {
    expect(isYangStem("甲")).toBe(true);
    expect(isYangStem("乙")).toBe(false);
    expect(isYangStem("壬")).toBe(true);
  });
});

describe("时辰与真太阳时", () => {
  it("钟表小时 → timeIndex（23 点为晚子时 12）", () => {
    expect(timeIndexFromClock(0)).toBe(0); // 早子
    expect(timeIndexFromClock(1)).toBe(1); // 丑
    expect(timeIndexFromClock(6)).toBe(3); // 卯
    expect(timeIndexFromClock(12)).toBe(6); // 午
    expect(timeIndexFromClock(22)).toBe(11); // 亥
    expect(timeIndexFromClock(23)).toBe(12); // 晚子
  });

  it("均时差在 ±17 分钟内", () => {
    for (let d = 1; d <= 365; d += 7) {
      expect(Math.abs(equationOfTime(d))).toBeLessThan(17);
    }
  });

  it("真太阳时校正：东经 120 度只剩均时差；西部经度大幅回拨", () => {
    const r120 = applyTrueSolar("2000-6-15", "12:00", 120)!;
    expect(Math.abs(r120.offsetMinutes - r120.eotMinutes)).toBeLessThan(1e-9);
    const r90 = applyTrueSolar("2000-6-15", "12:00", 90)!; // 经度差 -120 分钟
    expect(r90.offsetMinutes).toBeLessThan(-100);
    expect(r90.timeIndex).toBe(5); // 约 10:00 → 巳时
  });

  it("真太阳时跨日回拨：凌晨出生向西校正跌回前一日", () => {
    const r = applyTrueSolar("2000-6-15", "00:30", 90)!;
    expect(r.dateStr).toBe("2000-6-14");
    expect(r.timeIndex).toBe(11); // 约 22:30 → 亥时
  });

  it("非法输入返回 null", () => {
    expect(applyTrueSolar("bad", "12:00", 120)).toBeNull();
    expect(applyTrueSolar("2000-6-15", "xx", 120)).toBeNull();
  });
});
