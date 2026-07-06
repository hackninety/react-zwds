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
  lunarStrToSolarStr,
  lunarToSolarStr,
  todayLunar,
} from "./lunar";
import { getLongitude } from "./cities";
import { buildLifeKline } from "./lifeKline";

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
  /** 出生地区（省/市/区三级，经度由此查表） */
  province: string;
  city: string;
  district: string;
  /** 安星流派：通行版（南派）/ 中州派 */
  algorithm: "default" | "zhongzhou";
  /** 年分界：正月初一 / 立春（同时作用于运限分界）；随流派自动预设，可手动覆盖 */
  yearDivide: "normal" | "exact";
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
  /** 出生地区（省市区） */
  place: string;
};

export type PickState = { year: number; month: number; day: number; hour: number };
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
export type CellMonth = { month: number; label: string; gz: string };
export type CellDay = { day: number; label: string; gz: string };
export type CellHour = { hour: number; label: string; gz: string };

function initPick(): PickState {
  const t = todayLunar();
  return { year: t.year, month: t.month, day: t.day, hour: t.hour };
}

/** 拨盘年份不早于出生农历年 */
function clampPick(p: PickState, birthLunarYear: number): PickState {
  return p.year < birthLunarYear ? { ...p, year: birthLunarYear } : p;
}

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
    const longitude = getLongitude(input.province, input.city, input.district) ?? 120;
    const adj = applyTrueSolar(solarStr, input.exactTime, longitude);
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
        longitude,
        place:
          input.province === input.city
            ? `${input.city}${input.district}`
            : `${input.province}${input.city}${input.district}`,
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

  const [pick, setPick] = useState<PickState>(initPick);
  const [visible, setVisible] = useState<ScopeVisible>({
    decadal: true,
    yearly: true,
    monthly: false,
    daily: false,
    hourly: false,
  });

  // 换盘后回到今天（不早于出生年，避免出生前无效运限）
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

  const monthDays = useMemo(
    () => daysInLunarMonth(pick.year, pick.month),
    [pick.year, pick.month]
  );
  const clampedDay = Math.min(pick.day, monthDays);

  /** 流月（五虎遁干支） */
  const months = useMemo<CellMonth[]>(
    () =>
      LUNAR_MONTHS.map((label, i) => ({
        month: i + 1,
        label,
        gz: monthGanZhi(pick.year, i + 1),
      })),
    [pick.year]
  );

  /** 流日（含日柱干支） */
  const days = useMemo<CellDay[]>(() => {
    const list: CellDay[] = [];
    for (let d = 1; d <= monthDays; d++) {
      const solar = lunarToSolarStr(pick.year, pick.month, d);
      list.push({ day: d, label: LUNAR_DAYS[d - 1], gz: solar ? dayGanZhi(solar) : "" });
    }
    return list;
  }, [pick.year, pick.month, monthDays]);

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
    () => lunarToSolarStr(pick.year, pick.month, clampedDay) ?? fmtSolar(new Date()),
    [pick.year, pick.month, clampedDay]
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
    pickMonth(m: number) {
      setPick((p) => ({ ...p, month: m }));
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
    pick,
    visible,
    targetSolar,
    trueSolar: effective.trueSolar,
    soulPalaceIndex,
    lifeKline,
    actions,
  };
}

export type Zwds = ReturnType<typeof useZwds>;
