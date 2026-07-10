/**
 * 十年规划表：十二大限一限一行的人生总览——
 * 大限命宫叠本命何宫（十年主题）+ 大限四化 + 运限格局扫描
 * + 命宫域 K 线大限均值与限内高光/低谷年。
 * 盘面面板与 AI 导出共用同一构建。
 */
import { util } from "iztro";
import type { Astrolabe, DecadeInfo } from "./useZwds";
import type { LifeKlineData } from "./lifeKline";
import { buildChartIndex } from "./chartIndex";
import { detectHoroscopePatterns, type HoroPattern } from "./patterns";

export type DecadeYearMark = { year: number; age: number; score: number };

export type DecadePlanRow = {
  /** decades[] 中的序号（联动拨盘 pickDecade 用） */
  idx: number;
  ageRange: string;
  gz: string;
  startYear: number;
  endYear: number;
  /** 大限命宫叠本命宫 */
  seatName: string;
  seatBranch: string;
  /** 大限四化星（禄权科忌） */
  mutagens: string[];
  /** 命宫域该限均分（超出 K 线范围的限为 null） */
  avg: number | null;
  best: DecadeYearMark | null;
  worst: DecadeYearMark | null;
  /** 该限运限格局扫描 */
  patterns: HoroPattern[];
};

export function buildDecadePlan(
  a: Astrolabe,
  decades: DecadeInfo[],
  lk: LifeKlineData | null
): DecadePlanRow[] {
  const soulDomain = lk?.domains.find((d) => d.palaceName === "命宫") ?? null;
  const ix = buildChartIndex(a); // 十二限共享一份索引
  return decades.map((d, idx) => {
    const seat = a.palaces[d.palaceIndex];
    const years =
      soulDomain?.years.filter((y) => y.age >= d.range[0] && y.age <= d.range[1]) ?? [];
    const sorted = [...years].sort((x, y) => y.score - x.score);
    const mark = (y: (typeof years)[number] | undefined): DecadeYearMark | null =>
      y ? { year: y.year, age: y.age, score: y.score } : null;
    const avgEntry = soulDomain?.decadeAvg.find((b) => b.startYear === d.startYear) ?? null;
    return {
      idx,
      ageRange: `${d.range[0]}~${d.range[1]}`,
      gz: `${d.heavenlyStem}${d.earthlyBranch}`,
      startYear: d.startYear,
      endYear: d.endYear,
      seatName: (seat?.name as string) ?? "?",
      seatBranch: (seat?.earthlyBranch as string) ?? "?",
      mutagens: util.getMutagensByHeavenlyStem(d.heavenlyStem as never) as string[],
      avg: avgEntry?.avg ?? (years.length ? Math.round(years.reduce((s, y) => s + y.score, 0) / years.length) : null),
      best: mark(sorted[0]),
      worst: mark(sorted[sorted.length - 1]),
      patterns: detectHoroscopePatterns(a, "decadal", d.palaceIndex, d.heavenlyStem, d.earthlyBranch, ix),
    };
  });
}
