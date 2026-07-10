/**
 * lunar-lite / lunar-typescript 封装：农历⇄公历、干支取值、闰月（全部带兜底，越界不抛出）。
 *
 * 注意：lunar-lite 的 getTotalDaysOfLunarMonth / getLeapMonth / getLeapDays 引用了
 * 不存在的 LUNAR_INFO 常量（0.2.x 已知损坏，调用必抛错），故月天数与闰月
 * 一律直接走其底层依赖 lunar-typescript 计算。
 */
import {
  solar2lunar,
  lunar2solar,
  getHeavenlyStemAndEarthlyBranchBySolarDate,
} from "lunar-lite";
import { LunarMonth, LunarYear } from "lunar-typescript";

export function fmtSolar(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 农历某年的闰月月份；无闰月或异常返回 0 */
export function leapMonthOf(year: number): number {
  try {
    return LunarYear.fromYear(year).getLeapMonth();
  } catch {
    return 0;
  }
}

/** 农历某月天数（isLeap=true 且该月确为闰月时取闰月天数），异常时按 29 */
export function daysInLunarMonth(year: number, month: number, isLeap = false): number {
  try {
    const key = isLeap && leapMonthOf(year) === month ? -month : month;
    return LunarMonth.fromYm(year, key)?.getDayCount() ?? 29;
  } catch {
    return 29;
  }
}

/** 农历 → 公历字符串 YYYY-M-D（支持闰月；非闰月时 isLeap 被忽略），失败返回 null */
export function lunarToSolarStr(
  year: number,
  month: number,
  day: number,
  isLeap = false
): string | null {
  try {
    const s = lunar2solar(`${year}-${month}-${day}`, isLeap);
    return `${s.solarYear}-${s.solarMonth}-${s.solarDay}`;
  } catch {
    return null;
  }
}

export function todayLunar(): {
  year: number;
  month: number;
  day: number;
  hour: number;
  leap: boolean;
} {
  const now = new Date();
  const hour = Math.floor((now.getHours() + 1) / 2) % 12; // 0~11 子~亥
  try {
    const l = solar2lunar(now);
    return { year: l.lunarYear, month: l.lunarMonth, day: l.lunarDay, hour, leap: l.isLeap };
  } catch {
    return { year: now.getFullYear(), month: 1, day: 1, hour, leap: false };
  }
}

/** 某公历日的日柱干支，失败返回空串 */
export function dayGanZhi(solarStr: string): string {
  try {
    return getHeavenlyStemAndEarthlyBranchBySolarDate(solarStr, 2).daily.join("");
  } catch {
    return "";
  }
}

/** 农历日期字符串（YYYY-M-D，支持闰月）→ 公历字符串，失败返回 null */
export function lunarStrToSolarStr(dateStr: string, isLeapMonth: boolean): string | null {
  try {
    const s = lunar2solar(dateStr, isLeapMonth);
    return `${s.solarYear}-${s.solarMonth}-${s.solarDay}`;
  } catch {
    return null;
  }
}
