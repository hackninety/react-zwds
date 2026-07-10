/** 十年规划表与流年合参测试 */
import { describe, expect, it } from "vitest";
import { astro } from "iztro";
import { buildDecadePlan } from "./decadePlan";
import { buildLifeKline, decadesOfChart } from "./lifeKline";
import { buildYearlySynastry } from "./synastry";
import type { Astrolabe } from "./useZwds";

function chart(dateStr: string, timeIndex: number, gender: "男" | "女"): Astrolabe {
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

describe("decadePlan 十年规划表", () => {
  const a = chart("2000-08-16", 2, "男");
  const by = a.rawDates.lunarDate.lunarYear;
  const decades = decadesOfChart(a, by);
  const lk = buildLifeKline(a, decades, by);
  const plan = buildDecadePlan(a, decades, lk);

  it("十二限齐全，字段与命盘一致", () => {
    expect(plan).toHaveLength(12);
    plan.forEach((r, i) => {
      expect(r.idx).toBe(i);
      expect(r.gz).toBe(`${decades[i].heavenlyStem}${decades[i].earthlyBranch}`);
      expect(r.seatName).toBe(a.palaces[decades[i].palaceIndex].name);
      expect(r.mutagens).toHaveLength(4);
      expect(r.patterns).toBeInstanceOf(Array);
    });
  });

  it("均值与K线大限均值一致；高光≥低谷；越界限均值为空", () => {
    const soul = lk!.domains.find((d) => d.palaceName === "命宫")!;
    for (const r of plan) {
      const band = soul.decadeAvg.find((b) => b.startYear === r.startYear);
      if (band) expect(r.avg).toBe(band.avg);
      if (r.best && r.worst) {
        expect(r.best.score).toBeGreaterThanOrEqual(r.worst.score);
        expect(r.best.age).toBeGreaterThanOrEqual(decades[r.idx].range[0]);
        expect(r.best.age).toBeLessThanOrEqual(decades[r.idx].range[1]);
      }
      if (decades[r.idx].range[0] > lk!.lastAge) {
        expect(r.avg).toBeNull();
        expect(r.best).toBeNull();
      }
    }
  });

  it("确定性", () => {
    const again = buildDecadePlan(a, decades, lk);
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });
});

describe("buildYearlySynastry 流年合参", () => {
  const A = chart("2000-08-16", 2, "男"); // 庚辰年生
  const B = chart("1998-03-08", 6, "女"); // 戊寅年生
  const aBy = A.rawDates.lunarDate.lunarYear;
  const bBy = B.rawDates.lunarDate.lunarYear;
  const aLk = buildLifeKline(A, decadesOfChart(A, aBy), aBy);
  const bLk = buildLifeKline(B, decadesOfChart(B, bBy), bBy);

  it("结构完整且流年干支正确", () => {
    const r = buildYearlySynastry(A, B, "甲", "乙", 2026, aLk, bLk)!;
    expect(r.gz).toBe("丙午");
    expect(r.a.name).toBe("甲");
    expect(r.a.mutagenLines).toHaveLength(4);
    expect(r.a.kline).not.toBeNull();
    expect(r.b.kline).not.toBeNull();
    expect(r.jiLine).toContain("流年化忌");
    expect(r.conclusions.length).toBeGreaterThanOrEqual(1);
  });

  it("太岁关系正确（2028 戊申：申冲寅=乙冲太岁；2024 甲辰：辰=甲值太岁）", () => {
    const r28 = buildYearlySynastry(A, B, "甲", "乙", 2028, aLk, bLk)!;
    expect(r28.b.taisui).toBe("冲太岁"); // 乙 戊寅年生，申冲寅
    const r24 = buildYearlySynastry(A, B, "甲", "乙", 2024, aLk, bLk)!;
    expect(r24.a.taisui).toBe("值太岁"); // 甲 庚辰年生，辰年值太岁（辰辰自刑亦归值）
  });

  it("K线取值与各自命宫域一致", () => {
    const r = buildYearlySynastry(A, B, "甲", "乙", 2026, aLk, bLk)!;
    const aYear = aLk!.domains.find((d) => d.palaceName === "命宫")!.years.find((y) => y.year === 2026)!;
    expect(r.a.kline!.score).toBe(aYear.score);
    expect(r.a.kline!.pattern).toBe(aYear.pattern);
  });

  it("确定性", () => {
    const r1 = buildYearlySynastry(A, B, "甲", "乙", 2030, aLk, bLk);
    const r2 = buildYearlySynastry(A, B, "甲", "乙", 2030, aLk, bLk);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
