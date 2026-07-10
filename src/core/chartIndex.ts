/**
 * 盘面索引原语：星→宫映射、三方四正、星文本——结构分析（analysis）与
 * 格局检测（patterns）共用的底层。整盘只建一次索引，向下传参复用。
 */
import { util } from "iztro";
import type { Astrolabe } from "./useZwds";
import { MUTAGEN_CHARS, fixIndex } from "./utils";

export const AUSPICIOUS_MINORS = ["左辅", "右弼", "天魁", "天钺", "文昌", "文曲", "禄存", "天马"];
export const SHA_STARS = ["擎羊", "陀罗", "火星", "铃星", "地空", "地劫"];

export type ChartIndex = {
  a: Astrolabe;
  soulIdx: number;
  /** 星名 → 宫索引（主星+辅星+杂耀） */
  pos: Map<string, number>;
  /** 星名 → 亮度（有则填） */
  bright: Map<string, string>;
  /** 生年四化星 [禄,权,科,忌] */
  natal: string[];
  yearStem: string;
};

export function starNamesAt(a: Astrolabe, i: number): string[] {
  const p = a.palaces[fixIndex(i)];
  return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars].map((s) => s.name as string);
}

export function buildChartIndex(a: Astrolabe): ChartIndex {
  const pos = new Map<string, number>();
  const bright = new Map<string, string>();
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
      pos.set(s.name as string, p.index);
      if (s.brightness) bright.set(s.name as string, s.brightness as string);
    }
  }
  const yearStem = a.chineseDate.split(" ")[0]?.charAt(0) ?? "";
  const natal = yearStem ? (util.getMutagensByHeavenlyStem(yearStem as never) as string[]) : [];
  return {
    a,
    soulIdx: a.palaces.findIndex((p) => p.name === "命宫"),
    pos,
    bright,
    natal,
    yearStem,
  };
}

/** P 的三方四正索引：[本宫, 对宫, 三合, 三合] */
export const sanfangIdx = (P: number) => [
  fixIndex(P),
  fixIndex(P + 6),
  fixIndex(P + 4),
  fixIndex(P - 4),
];

export const SEAT_ROLES = ["本宫", "对宫", "三合", "三合"] as const;

/** 星名带亮度与生年四化标记 */
export const starTxt = (ix: ChartIndex, name: string) => {
  const b = ix.bright.get(name);
  const k = ix.natal.indexOf(name);
  return `${name}${b ? `(${b})` : ""}${k >= 0 ? `【生年${MUTAGEN_CHARS[k]}】` : ""}`;
};
