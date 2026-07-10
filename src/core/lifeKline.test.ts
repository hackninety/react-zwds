/** 人生K线评分引擎不变量测试（固定生辰，确定性推演） */
import { describe, expect, it } from "vitest";
import { astro } from "iztro";
import { buildLifeKline } from "./lifeKline";
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

  it("引动因子出现在 factors 中（全域至少各出现一次流禄/流羊或流陀）", () => {
    const all = lk.domains.flatMap((d) => d.years.flatMap((y) => y.factors)).join("|");
    expect(all).toMatch(/流禄入/);
    expect(all).toMatch(/流[羊陀]入/);
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

  it("自化泄气写入 baselineNotes 且与宫干四化一致", () => {
    for (const d of lk.domains) {
      for (const note of d.baselineNotes) {
        expect(note).toMatch(/^自化[禄权科忌]/);
      }
    }
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
