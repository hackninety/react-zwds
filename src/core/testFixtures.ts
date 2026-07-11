/**
 * 测试共享夹具（仅测试引用，不进应用包）：
 * 按 useZwds 同口径的纯函数手工组装完整 Zwds（固定观测点 2026 农历五月十五午时）。
 */
import { astro } from "iztro";
import { analyzeChart } from "./analysis";
import { buildLifeKline, decadesOfChart } from "./lifeKline";
import { dayGanZhi, daysInLunarMonth, lunarToSolarStr } from "./lunar";
import { BRANCHES, LUNAR_DAYS, LUNAR_MONTHS, hourGanZhi, monthGanZhi, yearGanZhi } from "./utils";
import type { Astrolabe, BirthInput, Zwds } from "./useZwds";

export function makeZwdsFixture(): Zwds {
  const input: BirthInput = {
    name: "导出测试",
    gender: "男",
    calendar: "solar",
    date: "2000-08-16",
    timeIndex: 2,
    isLeapMonth: false,
    exactTime: "",
    useTrueSolar: false,
    placeMode: "china",
    province: "北京",
    city: "北京",
    district: "市区",
    timezone: "",
    algorithm: "default",
    yearDivide: "normal",
    mutagenTable: "default",
    dayDivide: "forward",
    astroType: "heaven",
    residence: "广东深圳",
  };
  const a: Astrolabe = astro.withOptions({
    type: "solar",
    dateStr: input.date,
    timeIndex: input.timeIndex,
    gender: "男" as never,
    isLeapMonth: false,
    fixLeap: true,
    language: "zh-CN",
    astroType: "heaven",
    config: { algorithm: "default", yearDivide: "normal", horoscopeDivide: "normal" },
  });
  const birthLunarYear = a.rawDates.lunarDate.lunarYear;
  const decades = decadesOfChart(a, birthLunarYear);

  // 固定观测点：2026 年农历五月十五 午时（demo 盘 23~32 限内）
  const pick = { year: 2026, month: 5, day: 15, hour: 6, leap: false };
  const monthDays = daysInLunarMonth(pick.year, pick.month);
  const clampedDay = Math.min(pick.day, monthDays);
  const months = LUNAR_MONTHS.map((label, i) => ({
    month: i + 1,
    leap: false,
    label,
    gz: monthGanZhi(pick.year, i + 1),
  }));
  const days = Array.from({ length: monthDays }, (_, i) => {
    const solar = lunarToSolarStr(pick.year, pick.month, i + 1);
    return { day: i + 1, label: LUNAR_DAYS[i], gz: solar ? dayGanZhi(solar) : "" };
  });
  const dayStem = days[clampedDay - 1].gz.charAt(0);
  const hours = BRANCHES.map((b, i) => ({ hour: i, label: `${b}时`, gz: hourGanZhi(dayStem, i) }));
  const targetSolar = lunarToSolarStr(pick.year, pick.month, clampedDay)!;
  const horoscope = a.horoscope(targetSolar, pick.hour);

  const age = pick.year - birthLunarYear + 1;
  const activeDecadeIdx = decades.findIndex((d) => age >= d.range[0] && age <= d.range[1]);
  const dec = decades[activeDecadeIdx];
  const years = Array.from({ length: 10 }, (_, i) => {
    const y = dec.startYear + i;
    return { year: y, gz: yearGanZhi(y), age: y - birthLunarYear + 1 };
  });

  const fixture = {
    input,
    astrolabe: a,
    horoscope,
    birthLunarYear,
    decades,
    childhood: null,
    activeDecadeIdx,
    years,
    months,
    days,
    hours,
    monthDays,
    clampedDay,
    effLeap: false,
    pick,
    visible: { decadal: true, yearly: true, monthly: false, daily: false, hourly: false },
    targetSolar,
    trueSolar: null,
    soulPalaceIndex: a.palaces.findIndex((p) => p.name === "命宫"),
    lifeKline: buildLifeKline(a, decades, birthLunarYear),
    analysis: analyzeChart(a),
    actions: {},
  };
  return fixture as unknown as Zwds;
}
