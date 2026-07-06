/**
 * 人生K线（紫微斗数版）：把大限/流年运势量化为 0-100 评分，生成 K 线（OHLC）数据。
 * 参照 react-8char 的量化思路，换用斗数口径（确定性模型，与 iztro 安星/四化同源，仅供参考）：
 *
 *   1) 大限基调（每限恒定，形成十年段落）：
 *      大限干四化星落入大限命宫三方四正（禄+6 权+4 科+3 忌-6）+ 大限宫星情（权重×0.6）。
 *   2) 逐年计分：50 为基准，叠加——
 *      · 大限基调
 *      · 流年四化落宫：流年干四化星入流年命宫三方四正（禄+8 权+5 科+4 忌-8），忌居对宫再计「忌冲命」
 *      · 生年四化会照：生年禄权科忌入流年命宫三方四正（+3/+2/+2/-4）
 *      · 流年命宫星情：主星亮度（庙3旺2得利1平0不-1陷-2，封顶±6）、吉星会聚（封顶+6）、煞星会聚（封顶-8）
 *      · 流年支冲本命命宫 -4 / 冲大限宫 -3；岁限并临（流年干支=大限干支）-4
 *      结果收敛到 [8, 92]。
 *   3) K 线：open=上年 close，close=当年评分，high/low 由当年动荡度（冲/忌/煞聚/并临）撑开。
 */
import { util } from "iztro";
import type { Astrolabe, DecadeInfo } from "./useZwds";
import { BRANCHES, MUTAGEN_CHARS, fixIndex, mod, yearGanZhi } from "./utils";

// 地支六冲
const CHONG: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

const BRIGHT_SCORE: Record<string, number> = { 庙: 3, 旺: 2, 得: 1, 利: 1, 平: 0, 不: -1, 陷: -2 };
const GOOD_STARS: Record<string, number> = {
  左辅: 1.5, 右弼: 1.5, 天魁: 1.5, 天钺: 1.5, 文昌: 1, 文曲: 1, 禄存: 2, 天马: 1,
};
const BAD_STARS: Record<string, number> = {
  擎羊: -2, 陀罗: -2, 火星: -2, 铃星: -2, 地空: -2.5, 地劫: -2.5,
};
const MUT_YEARLY = [8, 5, 4, -8]; // 流年四化 禄权科忌
const MUT_DECADAL = [6, 4, 3, -6]; // 大限四化
const MUT_NATAL = [3, 2, 2, -4]; // 生年四化会照

export type KlineYear = {
  /** 农历年（干支纪年） */
  year: number;
  /** 虚岁 */
  age: number;
  ganZhi: string;
  /** 所属大限文案（童限 / 癸巳限 3-12） */
  decadeLabel: string;
  open: number;
  close: number;
  high: number;
  low: number;
  score: number;
  delta: number;
  /** 计分因素明细（中文，可展示/喂 AI） */
  factors: string[];
};

export type KlineDecadeBand = {
  label: string;
  startYear: number;
  endYear: number;
  avg: number;
};

export type LifeKlineData = {
  note: string;
  years: KlineYear[];
  decades: KlineDecadeBand[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}`;

/** 年支 → 宫位索引（宫 0 = 寅） */
function palaceIndexOfBranch(branch: string): number {
  return fixIndex(BRANCHES.indexOf(branch as (typeof BRANCHES)[number]) - 2);
}

/** i 的三方四正（本宫、三合两宫、对宫） */
function trineSquare(i: number): Set<number> {
  return new Set([fixIndex(i), fixIndex(i + 4), fixIndex(i - 4), fixIndex(i + 6)]);
}

/** 宫内星情分：[主星亮度, 吉星, 煞星] */
function palaceStarScore(a: Astrolabe, idx: number): { bright: number; good: number; bad: number; badNames: string[] } {
  const p = a.palaces[idx];
  let bright = 0;
  for (const s of p.majorStars) bright += BRIGHT_SCORE[(s.brightness as string) ?? ""] ?? 0;
  bright = clamp(bright, -6, 6);
  let good = 0;
  let bad = 0;
  const badNames: string[] = [];
  for (const s of p.minorStars) {
    const g = GOOD_STARS[s.name as string];
    if (g) good += g;
    const b = BAD_STARS[s.name as string];
    if (b) {
      bad += b;
      badNames.push(s.name as string);
    }
  }
  return { bright, good: clamp(good, 0, 6), bad: clamp(bad, -8, 0), badNames };
}

export function buildLifeKline(
  astrolabe: Astrolabe | null,
  decades: DecadeInfo[],
  birthLunarYear: number
): LifeKlineData | null {
  if (!astrolabe || !decades.length) return null;
  const a = astrolabe;

  /* 星名 → 宫位索引 */
  const starPalace = new Map<string, number>();
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) starPalace.set(s.name as string, p.index);
  }

  const soulIdx = a.palaces.findIndex((p) => p.name === "命宫");
  const soulBranch = soulIdx >= 0 ? (a.palaces[soulIdx].earthlyBranch as string) : "";

  /* 生年四化星（跟随流派 config） */
  const yearStemOfBirth = a.chineseDate.split(" ")[0]?.charAt(0) ?? "";
  const natalMuts = yearStemOfBirth
    ? (util.getMutagensByHeavenlyStem(yearStemOfBirth as never) as string[])
    : [];

  /* 每限基调（恒定十年） */
  const decadeTone = decades.map((d) => {
    const seat = trineSquare(d.palaceIndex);
    let tone = 0;
    const muts = util.getMutagensByHeavenlyStem(d.heavenlyStem as never) as string[];
    muts.forEach((star, k) => {
      const idx = starPalace.get(star);
      if (idx != null && seat.has(idx)) tone += MUT_DECADAL[k];
    });
    const ss = palaceStarScore(a, d.palaceIndex);
    tone += (ss.bright + ss.good + ss.bad) * 0.6;
    return clamp(tone, -15, 15);
  });

  const lastAge = Math.min(100, decades[decades.length - 1].range[1]);
  const years: KlineYear[] = [];

  for (let age = 1; age <= lastAge; age++) {
    const year = birthLunarYear + age - 1;
    const gz = yearGanZhi(year);
    const yStem = gz.charAt(0);
    const yBranch = gz.charAt(1);
    const mingIdx = palaceIndexOfBranch(yBranch); // 流年命宫 = 年支宫
    const seat = trineSquare(mingIdx);
    const factors: string[] = [];
    let score = 50;
    let turb = 0;

    /* 大限基调 */
    const di = decades.findIndex((d) => age >= d.range[0] && age <= d.range[1]);
    const decade = di >= 0 ? decades[di] : null;
    const decadeLabel = decade
      ? `${decade.heavenlyStem}${decade.earthlyBranch}限 ${decade.range[0]}-${decade.range[1]}`
      : "童限";
    if (decade && decadeTone[di] !== 0) {
      score += decadeTone[di];
      factors.push(`大限${decade.heavenlyStem}${decade.earthlyBranch}基调 ${fmt(decadeTone[di])}`);
    }

    /* 流年四化落宫 */
    const muts = util.getMutagensByHeavenlyStem(yStem as never) as string[];
    muts.forEach((star, k) => {
      const idx = starPalace.get(star);
      if (idx == null) return;
      if (seat.has(idx)) {
        score += MUT_YEARLY[k];
        turb += k === 3 ? 2 : 0;
        factors.push(`流年${star}化${MUTAGEN_CHARS[k]}入命财官迁 ${fmt(MUT_YEARLY[k])}`);
        if (k === 3 && idx === fixIndex(mingIdx + 6)) {
          score += -2;
          turb += 2;
          factors.push(`流年忌坐迁移冲命 -2`);
        }
      }
    });

    /* 生年四化会照 */
    natalMuts.forEach((star, k) => {
      const idx = starPalace.get(star);
      if (idx != null && seat.has(idx)) {
        score += MUT_NATAL[k];
        if (k === 3) turb += 1;
        factors.push(`生年${MUTAGEN_CHARS[k]}（${star}）会流年命宫 ${fmt(MUT_NATAL[k])}`);
      }
    });

    /* 流年命宫星情 */
    const ss = palaceStarScore(a, mingIdx);
    if (ss.bright !== 0) {
      score += ss.bright;
      factors.push(`流年命宫主星星情 ${fmt(ss.bright)}`);
    }
    if (ss.good > 0) {
      score += ss.good;
      factors.push(`吉星会聚流年命宫 ${fmt(ss.good)}`);
    }
    if (ss.bad < 0) {
      score += ss.bad;
      turb += ss.badNames.length * 1.2;
      factors.push(`煞星聚（${ss.badNames.join("、")}）${fmt(ss.bad)}`);
    }

    /* 支冲 */
    if (soulBranch && CHONG[yBranch] === soulBranch) {
      score += -4;
      turb += 2;
      factors.push("流年支冲本命命宫 -4");
    }
    if (decade && CHONG[yBranch] === decade.earthlyBranch) {
      score += -3;
      turb += 1.5;
      factors.push("流年支冲大限宫 -3");
    }

    /* 岁限并临 */
    if (decade && gz === `${decade.heavenlyStem}${decade.earthlyBranch}`) {
      score += -4;
      turb += 3;
      factors.push(`岁限并临（${gz}）-4`);
    }

    score = clamp(Math.round(score), 8, 92);
    years.push({
      year,
      age,
      ganZhi: gz,
      decadeLabel,
      open: 0,
      close: score,
      high: 0,
      low: 0,
      score,
      delta: 0,
      factors,
    });
  }

  /* OHLC 串联 */
  let prevClose = 50;
  for (const y of years) {
    y.open = prevClose;
    y.delta = y.close - y.open;
    const vol = clamp(3 + y.factors.filter((f) => /冲|忌|煞|并临/.test(f)).length * 2, 3, 14);
    y.high = clamp(Math.max(y.open, y.close) + vol * 0.6, 2, 98);
    y.low = clamp(Math.min(y.open, y.close) - vol * 0.6, 2, 98);
    prevClose = y.close;
  }

  /* 大限均分段 */
  const bands: KlineDecadeBand[] = [];
  for (const y of years) {
    const last = bands[bands.length - 1];
    if (!last || last.label !== y.decadeLabel) {
      bands.push({ label: y.decadeLabel, startYear: y.year, endYear: y.year, avg: y.score });
    } else {
      last.endYear = y.year;
    }
  }
  for (const b of bands) {
    const pts = years.filter((y) => y.year >= b.startYear && y.year <= b.endYear);
    b.avg = Math.round(pts.reduce((s, y) => s + y.score, 0) / pts.length);
  }

  return {
    note: "紫微量化模型：大限四化基调 + 流年四化落宫（命财官迁）+ 生年四化会照 + 流年命宫星情 + 支冲/岁限并临；确定性推演，仅供参考娱乐。",
    years,
    decades: bands,
  };
}
