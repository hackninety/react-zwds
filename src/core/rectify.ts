/**
 * 生时校正助手（定盘）：出生时辰不详时，同日十三个时辰（早子~晚子）并排起盘，
 * 给出关键差异 + 按「性格特征勾选」与「已发生大事年份反查（K线）」打匹配分。
 *
 * 口径：校时按标准时辰排盘（不作真太阳时校正——时辰不详即无可靠钟表时刻）；
 * 流派/四化表/子时界沿用当前输入设置。确定性推演，仅供缩小范围参考。
 */
import { astro } from "iztro";
import type { GenderName } from "iztro/lib/i18n";
import type { Astrolabe, BirthInput, DecadeInfo } from "./useZwds";
import { MUTAGEN_TABLES, TIME_OPTIONS } from "./utils";
import { util } from "iztro";
import { buildLifeKline } from "./lifeKline";

export type HourCandidate = {
  timeIndex: number;
  label: string;
  range: string;
  soulBranch: string;
  /** 命宫主星（空宫注借对宫） */
  soulMajors: string;
  bodyBranch: string;
  fiveElements: string;
  /** 命宫三方四正全部星名（特征判定用） */
  chart: Astrolabe;
};

export type LifeEvent = { year: number; kind: "good" | "turbulent" };

export type Trait = {
  id: string;
  label: string;
  test: (chart: Astrolabe) => boolean;
};

/* ── 特征判定工具 ── */

const starsOf = (chart: Astrolabe, name: string) => {
  const p = chart.palaces.find((x) => x.name === name);
  if (!p) return { majors: new Set<string>(), all: new Set<string>() };
  return {
    majors: new Set(p.majorStars.map((s) => s.name as string)),
    all: new Set(
      [...p.majorStars, ...p.minorStars, ...p.adjectiveStars].map((s) => s.name as string)
    ),
  };
};

const sanfangAll = (chart: Astrolabe, name: string) => {
  const p = chart.palaces.find((x) => x.name === name);
  const set = new Set<string>();
  if (!p) return set;
  for (const off of [0, 6, 4, -4]) {
    const q = chart.palaces[(((p.index + off) % 12) + 12) % 12];
    for (const s of [...q.majorStars, ...q.minorStars, ...q.adjectiveStars]) {
      set.add(s.name as string);
    }
  }
  return set;
};

const natalStar = (chart: Astrolabe, k: number) => {
  const stem = chart.chineseDate.split(" ")[0]?.charAt(0);
  if (!stem) return "";
  return (util.getMutagensByHeavenlyStem(stem as never) as string[])[k] ?? "";
};

const hasAny = (set: Set<string>, names: string[]) => names.some((n) => set.has(n));

/** 十个可勾选的性格/经历特征（按命理常识写判定，供缩小范围） */
export const TRAITS: Trait[] = [
  {
    id: "action",
    label: "行动派·坐不住·喜变化",
    test: (c) => {
      const s = starsOf(c, "命宫");
      return hasAny(s.majors, ["七杀", "破军", "贪狼"]) || hasAny(s.all, ["火星", "铃星"]);
    },
  },
  {
    id: "steady",
    label: "性子稳·求安稳·有耐性",
    test: (c) => hasAny(starsOf(c, "命宫").majors, ["天府", "天相", "天同", "天梁"]),
  },
  {
    id: "talk",
    label: "口才好·爱表达",
    test: (c) => {
      const s = starsOf(c, "命宫");
      return hasAny(s.majors, ["巨门", "太阳"]) || (s.all.has("文昌") && s.all.has("文曲"));
    },
  },
  {
    id: "sensitive",
    label: "心思细腻·敏感多虑",
    test: (c) => hasAny(starsOf(c, "命宫").majors, ["太阴", "天机"]),
  },
  {
    id: "lead",
    label: "主见强·喜欢主导",
    test: (c) => {
      const s = starsOf(c, "命宫");
      return hasAny(s.majors, ["紫微", "武曲", "天府"]) || s.all.has(natalStar(c, 1));
    },
  },
  {
    id: "study",
    label: "书卷气·爱学习钻研",
    test: (c) => hasAny(sanfangAll(c, "命宫"), ["文昌", "文曲"]),
  },
  {
    id: "charm",
    label: "人缘桃花旺·异性缘好",
    test: (c) => {
      const s = starsOf(c, "命宫");
      return hasAny(s.majors, ["贪狼", "廉贞"]) || hasAny(s.all, ["红鸾", "天喜", "天姚", "咸池"]);
    },
  },
  {
    id: "travel",
    label: "早年离家/常外出奔波",
    test: (c) => {
      const p = c.palaces.find((x) => x.name === "命宫");
      return sanfangAll(c, "命宫").has("天马") || ["寅", "申", "巳", "亥"].includes((p?.earthlyBranch as string) ?? "");
    },
  },
  {
    id: "health",
    label: "幼时体弱或有明显伤病",
    test: (c) => {
      const s = starsOf(c, "疾厄");
      const sha = ["擎羊", "陀罗", "火星", "铃星", "地空", "地劫"].filter((n) => s.all.has(n)).length;
      return sha >= 2 || s.all.has("天刑");
    },
  },
  {
    id: "money",
    label: "理财意识强·能攒钱",
    test: (c) => {
      const sf = sanfangAll(c, "命宫");
      return hasAny(sf, ["武曲", "太阴", "天府"]) && sf.has("禄存");
    },
  },
];

/** 同日十三时辰并排起盘（不作真太阳时校正，流派设置沿用输入） */
export function buildHourCandidates(input: BirthInput): HourCandidate[] {
  const out: HourCandidate[] = [];
  for (const t of TIME_OPTIONS) {
    let chart: Astrolabe | null = null;
    try {
      chart = astro.withOptions({
        type: input.calendar,
        dateStr: input.date,
        timeIndex: t.index,
        gender: input.gender as unknown as GenderName,
        isLeapMonth: input.isLeapMonth,
        fixLeap: true,
        language: "zh-CN",
        astroType: input.algorithm === "zhongzhou" ? input.astroType : "heaven",
        config: {
          algorithm: input.algorithm,
          yearDivide: input.yearDivide,
          horoscopeDivide: input.yearDivide,
          dayDivide: input.dayDivide,
          mutagens: MUTAGEN_TABLES[input.mutagenTable] as never,
        },
      });
    } catch {
      continue;
    }
    if (!chart) continue;
    const soul = chart.palaces.find((p) => p.name === "命宫");
    const majors = soul?.majorStars.map((s) => s.name as string) ?? [];
    const borrowed =
      majors.length === 0
        ? chart.palaces[(((soul?.index ?? 0) + 6) % 12 + 12) % 12].majorStars
            .map((s) => s.name as string)
            .join("、")
        : "";
    out.push({
      timeIndex: t.index,
      label: t.label,
      range: t.range,
      soulBranch: (soul?.earthlyBranch as string) ?? "?",
      soulMajors: majors.length ? majors.join("、") : `空宫（借${borrowed || "对宫"}）`,
      bodyBranch: chart.earthlyBranchOfBodyPalace as string,
      fiveElements: chart.fiveElementsClass as string,
      chart,
    });
  }
  return out;
}

/** 单张盘的特征命中位图（与 TRAITS 顺序对应） */
export function traitHits(chart: Astrolabe): boolean[] {
  return TRAITS.map((t) => {
    try {
      return t.test(chart);
    } catch {
      return false;
    }
  });
}

/** 与 useZwds 相同口径取十二大限 */
function decadesOf(chart: Astrolabe, birthLunarYear: number): DecadeInfo[] {
  return chart.palaces
    .map((p) => ({
      palaceIndex: p.index,
      range: p.decadal.range as [number, number],
      heavenlyStem: p.decadal.heavenlyStem as string,
      earthlyBranch: p.decadal.earthlyBranch as string,
      startYear: birthLunarYear + p.decadal.range[0] - 1,
      endYear: birthLunarYear + p.decadal.range[1] - 1,
    }))
    .sort((a, b) => a.range[0] - b.range[0]);
}

/** 大事年份反查：该盘命宫域 K 线在事件年份是否呈相应形态 */
export function matchEvents(chart: Astrolabe, events: LifeEvent[]): boolean[] {
  const valid = events.filter((e) => e.year > 1900);
  if (!valid.length) return events.map(() => false);
  const birthYear = chart.rawDates.lunarDate.lunarYear;
  const lk = buildLifeKline(chart, decadesOf(chart, birthYear), birthYear);
  const soulDomain = lk?.domains.find((d) => d.palaceName === "命宫");
  return events.map((e) => {
    if (!soulDomain || e.year <= 1900) return false;
    const y = soulDomain.years.find((x) => x.year === e.year);
    if (!y) return false;
    if (e.kind === "good") return y.pattern === "顺遂" || y.net >= 3;
    return y.pattern === "破耗" || y.pattern === "大进大出" || y.drain >= 6 || Math.abs(y.delta) >= 6;
  });
}

/** 匹配分：勾选特征命中 ×1 + 大事年份命中 ×2 */
export function scoreCandidate(hits: boolean[], checkedIds: Set<string>, eventHits: boolean[]): number {
  let s = 0;
  TRAITS.forEach((t, i) => {
    if (checkedIds.has(t.id) && hits[i]) s += 1;
  });
  for (const h of eventHits) if (h) s += 2;
  return s;
}
