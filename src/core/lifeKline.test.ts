/** 人生K线评分引擎不变量测试（固定生辰，确定性推演） */
import { describe, expect, it } from "vitest";
import { astro } from "iztro";
import { buildLifeKline, buildMonthlyKline } from "./lifeKline";
import { monthGanZhi } from "./utils";
import type { Astrolabe, DecadeInfo } from "./useZwds";

function makeChart(dateStr = "2000-08-16", timeIndex = 2, gender: "男" | "女" = "男"): Astrolabe {
  return astro.withOptions({
    type: "solar",
    dateStr,
    timeIndex,
    gender: gender as never,
    isLeapMonth: false,
    fixLeap: true,
    language: "zh-CN",
    config: { algorithm: "default", yearDivide: "normal", horoscopeDivide: "normal" },
  });
}

/** 与 useZwds 相同口径提取十二大限 */
function decadesOf(a: Astrolabe, birthLunarYear: number): DecadeInfo[] {
  return a.palaces
    .map((p) => ({
      palaceIndex: p.index,
      range: p.decadal.range as [number, number],
      heavenlyStem: p.decadal.heavenlyStem as string,
      earthlyBranch: p.decadal.earthlyBranch as string,
      startYear: birthLunarYear + p.decadal.range[0] - 1,
      endYear: birthLunarYear + p.decadal.range[1] - 1,
    }))
    .sort((x, y) => x.range[0] - y.range[0]);
}

describe("lifeKline 评分引擎", () => {
  const a = makeChart();
  const birthYear = a.rawDates.lunarDate.lunarYear;
  const decades = decadesOf(a, birthYear);
  const lk = buildLifeKline(a, decades, birthYear)!;

  it("十二域齐全且按优先级排序（命宫第一）", () => {
    expect(lk.domains).toHaveLength(12);
    expect(lk.domains[0].palaceName).toBe("命宫");
  });

  it("大限段 bands 不越界（回归：超出 lastAge 的大限段曾堆叠在最左侧）", () => {
    const lastYear = birthYear + lk.lastAge - 1;
    for (const b of lk.bands) {
      expect(b.startYear).toBeLessThanOrEqual(lastYear);
      expect(b.endYear).toBeGreaterThanOrEqual(b.startYear);
    }
    // 起限岁超过 lastAge 的大限不应出现
    const over = decades.filter((d) => d.range[0] > lk.lastAge);
    for (const d of over) {
      expect(lk.bands.some((b) => b.label.includes(`${d.range[0]}-${d.range[1]}`))).toBe(false);
    }
    expect(over.length).toBeGreaterThan(0); // 该盘确实存在越界大限（113-122 等），保证回归有效
  });

  it("逐年数值不变量：范围/进出净/动能/OHLC 影线", () => {
    for (const d of lk.domains) {
      expect(d.baseline).toBeGreaterThanOrEqual(-18);
      expect(d.baseline).toBeLessThanOrEqual(18);
      expect(d.years.length).toBe(lk.lastAge);
      for (const y of d.years) {
        expect(y.score).toBeGreaterThanOrEqual(8);
        expect(y.score).toBeLessThanOrEqual(92);
        expect(y.gain).toBeGreaterThanOrEqual(0);
        expect(y.drain).toBeGreaterThanOrEqual(0);
        // 净/动能与进出自洽（各自独立取整，容差 1）
        expect(Math.abs(y.net - (y.gain - y.drain))).toBeLessThanOrEqual(1);
        expect(Math.abs(y.magnitude - (y.gain + y.drain))).toBeLessThanOrEqual(1);
        // 上影承进、下影承出
        expect(y.high).toBeGreaterThanOrEqual(Math.max(y.open, y.close));
        expect(y.low).toBeLessThanOrEqual(Math.min(y.open, y.close));
        expect(["顺遂", "大进大出", "破耗", "平稳", "平"]).toContain(y.pattern);
        expect(y.close).toBe(y.score);
        expect(y.delta).toBe(y.close - y.open);
      }
      // K 线连续性：open = 上一年 close
      for (let i = 1; i < d.years.length; i++) {
        expect(d.years[i].open).toBe(d.years[i - 1].close);
      }
    }
  });

  it("确定性：同一输入两次构建结果一致", () => {
    const lk2 = buildLifeKline(makeChart(), decades, birthYear)!;
    expect(JSON.stringify(lk2.domains[0].years)).toBe(JSON.stringify(lk.domains[0].years));
  });

  it("引动因子出现在 factors 中（流曜十颗：禄羊陀之外应见昌曲魁钺鸾喜）", () => {
    const all = lk.domains.flatMap((d) => d.years.flatMap((y) => y.factors)).join("|");
    expect(all).toMatch(/流禄入/);
    expect(all).toMatch(/流[羊陀]入/);
    expect(all).toMatch(/流[昌曲]入/);
    expect(all).toMatch(/流[魁钺]入/);
    expect(all).toMatch(/流[鸾喜]入/);
    expect(all).toMatch(/化忌→/);
  });

  it("双忌叠加只在大限忌+流年忌同引时出现，且当年 drain 显著", () => {
    for (const d of lk.domains) {
      for (const y of d.years) {
        const hasDouble = y.factors.some((f) => f.includes("双忌叠加"));
        if (hasDouble) {
          const jiCount = y.factors.filter((f) => /^(大限|流年).*化忌→/.test(f)).length;
          expect(jiCount).toBeGreaterThanOrEqual(2);
          expect(y.drain).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });

  it("baselineNotes 仅含自化泄气与杂曜域调两类注记", () => {
    for (const d of lk.domains) {
      for (const note of d.baselineNotes) {
        expect(note).toMatch(/^(自化[禄权科忌]|杂曜域调 )/);
      }
    }
  });

  it("同星叠象因子（叠禄/忌上加忌/禄逢冲破）与交限之年/童限标注出现", () => {
    const all = lk.domains.flatMap((d) => d.years.flatMap((y) => y.factors)).join("|");
    expect(all).toMatch(/叠禄（生年禄星/);
    expect(all).toMatch(/忌上加忌（生年忌星/);
    expect(all).toMatch(/禄逢冲破/);
    // 交限之年：每个大限首年在所有域标注
    const soul = lk.domains[0];
    for (const d of decades.slice(0, 3)) {
      const y = soul.years.find((x) => x.age === d.range[0]);
      expect(y?.factors.some((f) => f.includes("交限之年"))).toBe(true);
    }
    // 童限年（该盘 3 岁上运 → 1~2 岁童限）
    const first = soul.years.find((x) => x.age === 1);
    expect(first?.factors.some((f) => f.includes("童限"))).toBe(true);
  });

  it("小限落宫公式与 iztro 各宫 ages 一致（男顺女逆交叉验证）", () => {
    // 与 lifeKline 内部同一公式：生年支三合起宫，男顺女逆
    const AGE_START: Record<string, string> = {
      寅: "辰", 午: "辰", 戌: "辰", 申: "戌", 子: "戌", 辰: "戌",
      巳: "未", 酉: "未", 丑: "未", 亥: "丑", 卯: "丑", 未: "丑",
    };
    const BR = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    const fix = (n: number) => ((n % 12) + 12) % 12;
    for (const g of ["男", "女"] as const) {
      const c = makeChart("2000-08-16", 2, g);
      const yearBranch = c.chineseDate.split(" ")[0].charAt(1);
      const start = fix(BR.indexOf(AGE_START[yearBranch]) - 2);
      const dir = g === "女" ? -1 : 1;
      for (let age = 1; age <= 24; age++) {
        const idx = fix(start + dir * (age - 1));
        expect(c.palaces[idx].ages).toContain(age);
      }
    }
  });

  it("小限因子出现在 factors", () => {
    const all = lk.domains.flatMap((d) => d.years.flatMap((y) => y.factors)).join("|");
    expect(all).toMatch(/小限入本宫/);
    expect(all).toMatch(/小限冲本宫/);
  });

  it("月K线：非闰年 12 根、闰年 13 根（含闰月位），链续/边界/形态自洽", () => {
    const soul = a.palaces.find((p) => p.name === "命宫")!;
    const anchor = { open: 50, close: 56 };

    const m2024 = buildMonthlyKline(a, soul.index, 2024, anchor)!;
    expect(m2024.months).toHaveLength(12);

    const m2025 = buildMonthlyKline(a, soul.index, 2025, anchor)!;
    expect(m2025.months).toHaveLength(13);
    const leapCell = m2025.months.find((m) => m.leap)!;
    expect(leapCell.label).toBe("闰六月");
    // 闰月沿用本月干支
    expect(leapCell.gz).toBe(m2025.months.find((m) => m.month === 6 && !m.leap)!.gz);

    for (const mk of [m2024, m2025]) {
      expect(mk.months[0].open).toBe(anchor.open);
      expect(mk.months[0].gz).toBe(monthGanZhi(mk.year, 1));
      for (let i = 0; i < mk.months.length; i++) {
        const m = mk.months[i];
        if (i > 0) expect(m.open).toBe(mk.months[i - 1].close);
        expect(m.score).toBeGreaterThanOrEqual(5);
        expect(m.score).toBeLessThanOrEqual(95);
        expect(m.gain).toBeGreaterThanOrEqual(0);
        expect(m.drain).toBeGreaterThanOrEqual(0);
        expect(m.high).toBeGreaterThanOrEqual(Math.max(m.open, m.close));
        expect(m.low).toBeLessThanOrEqual(Math.min(m.open, m.close));
        expect(["顺遂", "大进大出", "破耗", "平稳", "平"]).toContain(m.pattern);
        expect(m.delta).toBe(m.close - m.open);
      }
      // 月干四化/月曜/冲合至少出现引动因子
      const all = mk.months.flatMap((m) => m.factors).join("|");
      expect(all).toMatch(/月.*化[禄权科忌]→|月支[冲合]本宫|月[禄羊陀昌曲魁钺马鸾喜]入/);
    }

    // 确定性
    const again = buildMonthlyKline(a, soul.index, 2025, anchor)!;
    expect(JSON.stringify(again)).toBe(JSON.stringify(m2025));
  });

  it("多组生辰跑通不抛错", () => {
    const samples: [string, number, "男" | "女"][] = [
      ["1984-02-02", 0, "女"],
      ["1996-02-29", 12, "男"],
      ["2024-06-15", 6, "女"],
    ];
    for (const [ds, t, g] of samples) {
      const c = makeChart(ds, t, g);
      const by = c.rawDates.lunarDate.lunarYear;
      expect(() => buildLifeKline(c, decadesOf(c, by), by)).not.toThrow();
    }
  });
});
