/** lunar-lite 封装：农历⇄公历、干支取值（全部带兜底，越界不抛出） */
import {
  solar2lunar,
  lunar2solar,
  getHeavenlyStemAndEarthlyBranchBySolarDate,
} from "lunar-lite";
import { getTotalDaysOfLunarMonth } from "lunar-lite/lib/days";

export function fmtSolar(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 农历某月（非闰）天数，异常时按 29 */
export function daysInLunarMonth(year: number, month: number): number {
  try {
    return getTotalDaysOfLunarMonth(year, month);
  } catch {
    return 29;
  }
}

/** 农历 → 公历字符串 YYYY-M-D，失败返回 null */
export function lunarToSolarStr(year: number, month: number, day: number): string | null {
  try {
    const s = lunar2solar(`${year}-${month}-${day}`, false);
    return `${s.solarYear}-${s.solarMonth}-${s.solarDay}`;
  } catch {
    return null;
  }
}

export function todayLunar(): { year: number; month: number; day: number; hour: number } {
  const now = new Date();
  const hour = Math.floor((now.getHours() + 1) / 2) % 12; // 0~11 子~亥
  try {
    const l = solar2lunar(now);
    return { year: l.lunarYear, month: Math.abs(l.lunarMonth), day: l.lunarDay, hour };
  } catch {
    return { year: now.getFullYear(), month: 1, day: 1, hour };
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
