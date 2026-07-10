/**
 * 排盘主 Hook：iztro 负责全部命理计算，这里负责
 * 「大限/流年/流月/流日/流时」拨盘状态 → 目标公历日期 → horoscope。
 */
import { useEffect, useMemo, useState } from "react";
import { astro } from "iztro";
import type { GenderName } from "iztro/lib/i18n";
import {
  BRANCHES,
  LUNAR_DAYS,
  LUNAR_MONTHS,
  MUTAGEN_TABLES,
  MutagenTableKey,
  Scope,
  applyTrueSolar,
  hourGanZhi,
  monthGanZhi,
  yearGanZhi,
} from "./utils";
import {
  daysInLunarMonth,
  dayGanZhi,
  fmtSolar,
  leapMonthOf,
  lunarStrToSolarStr,
  lunarToSolarStr,
  todayLunar,
} from "./lunar";
import { resolveBirthPlace } from "./place";
import { buildLifeKline } from "./lifeKline";
import { analyzeChart } from "./analysis";

export type Astrolabe = ReturnType<typeof astro.bySolar>;
export type Horoscope = ReturnType<Astrolabe["horoscope"]>;
export type PalaceData = Astrolabe["palaces"][number];

export type BirthInput = {
  name: string;
  gender: "男" | "女";
  calendar: "solar" | "lunar";
  /** YYYY-MM-DD（阳历，或农历年月日数字） */
  date: string;
  /** 0~12（早子~晚子） */
  timeIndex: number;
  isLeapMonth: boolean;
  /** 精确出生时刻 HH:mm（真太阳时启用时使用） */
  exactTime: string;
  /** 按真太阳时排盘（勾选后展开时刻与出生地区） */
  useTrueSolar: boolean;
  /** 出生地模式：中国城市（省市区经度表+东八区）/ 海外（IANA 时区） */
  placeMode: "china" | "overseas";
  /** 出生地区（省/市/区三级，经度由此查表） */
  province: string;
  city: string;
  district: string;
  /** 海外出生时区（IANA 名，如 Asia/Tokyo；默认取浏览器系统时区） */
  timezone: string;
  /** 安星流派：通行版（南派）/ 中州派 */
  algorithm: "default" | "zhongzhou";
  /** 年分界：正月初一 / 立春（同时作用于运限分界）；随流派自动预设，可手动覆盖 */
  yearDivide: "normal" | "exact";
  /** 十干四化表：通行 / 中州（庚壬天府化科）；随流派自动预设，可手动覆盖 */
  mutagenTable: MutagenTableKey;
  /** 晚子时归日：forward=归次日（通行默认）/ current=归当日 */
  dayDivide: "forward" | "current";
  /** 盘型（中州派特有）：天盘 / 地盘（身宫起局重排）/ 人盘（福德宫起局重排） */
  astroType: "heaven" | "earth" | "human";
  /** 常居住地（可选，不参与排盘，随导出供 AI 做地域/方位参考） */
  residence: string;
};

export type TrueSolarInfo = {
  clockDate: string;
  clockTime: string;
  trueDate: string;
  trueTime: string;
  timeIndex: number;
  offsetMinutes: number;
  eotMinutes: number;
  longitude: number;
  /** 钟表基准偏移（分钟）：中国=480（东八）；海外=出生时刻该时区实际 UTC 偏移（含夏令时） */
  clockOffsetMinutes: number;
  /** 出生地标签（省市区，或 IANA 时区+UTC 偏移） */
  place: string;
};

export type PickState = { year: number; month: number; day: number; hour: number; leap: boolean };
export type ScopeVisible = Record<Scope, boolean>;

export type DecadeInfo = {
  palaceIndex: number;
  range: [number, number];
  heavenlyStem: string;
  earthlyBranch: string;
  startYear: number;
  endYear: number;
};

export type CellYear = { year: number; gz: string; age: number };
export type CellMonth = { month: number; leap: boolean; label: string; gz: string };
export type CellDay = { day: number; label: string; gz: string };
export type CellHour = { hour: number; label: string; gz: string };

function initPick(): PickState {
  const t = todayLunar();
  return { year: t.year, month: t.month, day: t.day, hour: t.hour, leap: t.leap };
}

/** 拨盘年份不早于出生农历年 */
function clampPick(p: PickState, birthLunarYear: number): PickState {
  return p.year < birthLunarYear ? { ...p, year: birthLunarYear } : p;
}

const DEFAULT_VISIBLE: ScopeVisible = {
  decadal: true,
  yearly: true,
  monthly: false,
  daily: false,
  hourly: false,
};

export function useZwds(input: BirthInput) {
  /** 真太阳时校正后的实际排盘参数 */
  const effective = useMemo(() => {
    const base = {
      calendar: input.calendar,
      dateStr: input.date,
      timeIndex: input.timeIndex,
      trueSolar: null as TrueSolarInfo | null,
    };
    if (!input.useTrueSolar || !input.exactTime) return base;
    const solarStr =
      input.calendar === "lunar"
        ? lunarStrToSolarStr(input.date, input.isLeapMonth)
        : input.date;
    if (!solarStr) return base;
    const resolved = resolveBirthPlace(input, solarStr, input.exactTime);
    const adj = applyTrueSolar(
      solarStr,
      input.exactTime,
      resolved.longitude,
      resolved.clockOffsetMinutes
    );
    if (!adj) return base;
    return {
      calendar: "solar" as const,
      dateStr: adj.dateStr,
      timeIndex: adj.timeIndex,
      trueSolar: {
        clockDate: solarStr,
        clockTime: input.exactTime,
        trueDate: adj.dateStr,
        trueTime: adj.timeStr,
        timeIndex: adj.timeIndex,
        offsetMinutes: adj.offsetMinutes,
        eotMinutes: adj.eotMinutes,
        longitude: resolved.longitude,
        clockOffsetMinutes: resolved.clockOffsetMinutes,
        place: resolved.place,
      },
    };
  }, [input]);

  const astrolabe = useMemo<Astrolabe | null>(() => {
    try {
      return astro.withOptions({
        type: effective.calendar,
        dateStr: effective.dateStr,
        timeIndex: effective.timeIndex,
        gender: input.gender as unknown as GenderName,
        isLeapMonth: input.isLeapMonth,
        fixLeap: true,
        language: "zh-CN",
        // 地盘/人盘为中州派特有，通行版强制天盘
        astroType: input.algorithm === "zhongzhou" ? input.astroType : "heaven",
        config: {
          algorithm: input.algorithm,
          yearDivide: input.yearDivide,
          horoscopeDivide: input.yearDivide,
          dayDivide: input.dayDivide,
          // 整表注入（iztro 全局配置按干合并且不清除，整表覆盖避免切换残留）
          mutagens: MUTAGEN_TABLES[input.mutagenTable] as never,
        },
      });
    } catch (e) {
      console.error("[zwds] 排盘失败", e);
      return null;
    }
  }, [
    effective,
    input.gender,
    input.isLeapMonth,
    input.algorithm,
    input.yearDivide,
    input.astroType,
    input.mutagenTable,
    input.dayDivide,
  ]);

  const birthLunarYear = astrolabe?.rawDates.lunarDate.lunarYear ?? new Date().getFullYear();

  /** 十二大限，按起限年龄升序 */
  const decades = useMemo<DecadeInfo[]>(() => {
    if (!astrolabe) return [];
    return astrolabe.palaces
      .map((p) => ({
        palaceIndex: p.index,
        range: p.decadal.range,
        heavenlyStem: p.decadal.heavenlyStem as string,
        earthlyBranch: p.decadal.earthlyBranch as string,
        startYear: birthLunarYear + p.decadal.range[0] - 1,
        endYear: birthLunarYear + p.decadal.range[1] - 1,
      }))
      .sort((a, b) => a.range[0] - b.range[0]);
  }, [astrolabe, birthLunarYear]);

  /** 童限（出生 ~ 起运前一年） */
  const childhood = useMemo(() => {
    if (!decades.length) return null;
    const first = decades[0].range[0];
    if (first <= 1) return null;
    return {
      startYear: birthLunarYear,
      endYear: birthLunarYear + first - 2,
      label: `1~${first - 1}岁`,
    };
  }, [decades, birthLunarYear]);

  // 拨盘导航不持久化：命盘由存储的起盘参数直接渲染，拨盘位置每次刷新/起盘回默认（今天）
  const [pick, setPick] = useState<PickState>(initPick);
  const [visible, setVisible] = useState<ScopeVisible>(DEFAULT_VISIBLE);

  // 换盘（起盘/改输入致 astrolabe 变化）或刷新挂载后回到今天（不早于出生年）
  useEffect(() => {
    setPick(clampPick(initPick(), birthLunarYear));
  }, [astrolabe, birthLunarYear]);

  /** 当前流年所落的大限序号；-1 = 童限 */
  const activeDecadeIdx = useMemo(() => {
    if (!decades.length) return -1;
    const age = pick.year - birthLunarYear + 1;
    if (age < decades[0].range[0]) return -1;
    const i = decades.findIndex((d) => age >= d.range[0] && age <= d.range[1]);
    return i >= 0 ? i : decades.length - 1;
  }, [decades, pick.year, birthLunarYear]);

  /** 当前大限（或童限）内的流年列表 */
  const years = useMemo<CellYear[]>(() => {
    let start: number | undefined;
    let end: number | undefined;
    if (activeDecadeIdx === -1) {
      if (!childhood) return [];
      start = childhood.startYear;
      end = childhood.endYear;
    } else {
      const d = decades[activeDecadeIdx];
      if (!d) return [];
      start = d.startYear;
      end = d.endYear;
    }
    const list: CellYear[] = [];
    for (let y = start; y <= end; y++) {
      list.push({ year: y, gz: yearGanZhi(y), age: y - birthLunarYear + 1 });
    }
    return list;
  }, [activeDecadeIdx, decades, childhood, birthLunarYear]);

  /** 当年闰月（0=无）；拨盘的闰月选择仅当与当年闰月吻合时生效 */
  const yearLeapMonth = useMemo(() => leapMonthOf(pick.year), [pick.year]);
  const effLeap = pick.leap && pick.month === yearLeapMonth;

  const monthDays = useMemo(
    () => daysInLunarMonth(pick.year, pick.month, effLeap),
    [pick.year, pick.month, effLeap]
  );
  const clampedDay = Math.min(pick.day, monthDays);

  /** 流月（五虎遁干支；有闰月时插入闰月位，闰月无独立月建、沿用本月干支） */
  const months = useMemo<CellMonth[]>(() => {
    const list: CellMonth[] = LUNAR_MONTHS.map((label, i) => ({
      month: i + 1,
      leap: false,
      label,
      gz: monthGanZhi(pick.year, i + 1),
    }));
    if (yearLeapMonth > 0) {
      list.splice(yearLeapMonth, 0, {
        month: yearLeapMonth,
        leap: true,
        label: `闰${LUNAR_MONTHS[yearLeapMonth - 1]}`,
        gz: monthGanZhi(pick.year, yearLeapMonth),
      });
    }
    return list;
  }, [pick.year, yearLeapMonth]);

  /** 流日（含日柱干支） */
  const days = useMemo<CellDay[]>(() => {
    const list: CellDay[] = [];
    for (let d = 1; d <= monthDays; d++) {
      const solar = lunarToSolarStr(pick.year, pick.month, d, effLeap);
      list.push({ day: d, label: LUNAR_DAYS[d - 1], gz: solar ? dayGanZhi(solar) : "" });
    }
    return list;
  }, [pick.year, pick.month, monthDays, effLeap]);

  /** 流时（五鼠遁干支） */
  const hours = useMemo<CellHour[]>(() => {
    const dayStem = days[clampedDay - 1]?.gz.charAt(0) ?? "";
    return BRANCHES.map((b, i) => ({
      hour: i,
      label: `${b}时`,
      gz: dayStem ? hourGanZhi(dayStem, i) : "",
    }));
  }, [days, clampedDay]);

  /** 拨盘目标（公历） */
  const targetSolar = useMemo(
    () => lunarToSolarStr(pick.year, pick.month, clampedDay, effLeap) ?? fmtSolar(new Date()),
    [pick.year, pick.month, clampedDay, effLeap]
  );

  const horoscope = useMemo<Horoscope | null>(() => {
    if (!astrolabe) return null;
    try {
      return astrolabe.horoscope(targetSolar, pick.hour);
    } catch (e) {
      console.error("[zwds] 运限计算失败", e);
      return null;
    }
  }, [astrolabe, targetSolar, pick.hour]);

  const show = (s: Scope) => setVisible((v) => (v[s] ? v : { ...v, [s]: true }));

  const actions = {
    pickDecade(i: number) {
      const y = i === -1 ? childhood?.startYear ?? birthLunarYear : decades[i]?.startYear;
      if (y != null) setPick((p) => ({ ...p, year: y }));
      show("decadal");
    },
    pickYear(y: number) {
      setPick((p) => ({ ...p, year: y }));
      show("yearly");
    },
    pickMonth(m: number, leap = false) {
      setPick((p) => ({ ...p, month: m, leap }));
      show("monthly");
    },
    pickDay(d: number) {
      setPick((p) => ({ ...p, day: d }));
      show("daily");
    },
    pickHour(h: number) {
      setPick((p) => ({ ...p, hour: h }));
      show("hourly");
    },
    resetToday() {
      setPick(clampPick(initPick(), birthLunarYear));
    },
    toggleScope(s: Scope) {
      setVisible((v) => ({ ...v, [s]: !v[s] }));
    },
    showNatal() {
      setVisible({ decadal: false, yearly: false, monthly: false, daily: false, hourly: false });
    },
  };

  /** 本命命宫索引 */
  const soulPalaceIndex = useMemo(
    () => astrolabe?.palaces.findIndex((p) => p.name === "命宫") ?? -1,
    [astrolabe]
  );

  /** 人生K线（确定性量化，随盘重算） */
  const lifeKline = useMemo(
    () => buildLifeKline(astrolabe, decades, birthLunarYear),
    [astrolabe, decades, birthLunarYear]
  );

  /** 结构分析（格局/飞宫/三方四正快照/夹宫/借星）：盘面弹层与 AI 导出共用 */
  const analysis = useMemo(() => (astrolabe ? analyzeChart(astrolabe) : null), [astrolabe]);

  return {
    input,
    astrolabe,
    horoscope,
    birthLunarYear,
    decades,
    childhood,
    activeDecadeIdx,
    years,
    months,
    days,
    hours,
    monthDays,
    clampedDay,
    /** 当前拨盘月是否为有效闰月位 */
    effLeap,
    pick,
    visible,
    targetSolar,
    trueSolar: effective.trueSolar,
    soulPalaceIndex,
    lifeKline,
    analysis,
    actions,
  };
}

export type Zwds = ReturnType<typeof useZwds>;
