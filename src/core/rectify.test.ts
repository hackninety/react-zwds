/** 生时校正助手测试：候选完整性、特征判定自洽、大事年份反查、评分 */
import { describe, expect, it } from "vitest";
import { TRAITS, buildHourCandidates, matchEvents, scoreCandidate, traitHits } from "./rectify";
import { buildLifeKline } from "./lifeKline";
import type { BirthInput, DecadeInfo } from "./useZwds";

const input: BirthInput = {
  name: "校时测试",
  gender: "男",
  calendar: "solar",
  date: "2000-08-16",
  timeIndex: 0,
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
  residence: "",
};

describe("rectify 生时校正", () => {
  const cands = buildHourCandidates(input);

  it("十三时辰候选齐全且字段完整", () => {
    expect(cands).toHaveLength(13);
    expect(cands.map((c) => c.timeIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const c of cands) {
      expect(c.soulBranch).toBeTruthy();
      expect(c.soulMajors).toBeTruthy();
      expect(c.fiveElements).toMatch(/[金木水火土][二三四五六]局/);
    }
    // 不同时辰命宫应有差异（同日十三盘不可能全同宫）
    expect(new Set(cands.map((c) => c.soulBranch)).size).toBeGreaterThan(3);
  });

  it("特征判定与盘面独立复核一致", () => {
    for (const c of cands.slice(0, 6)) {
      const hits = traitHits(c.chart);
      const soul = c.chart.palaces.find((p) => p.name === "命宫")!;
      const majors = new Set(soul.majorStars.map((s) => s.name as string));
      const expectAction =
        ["七杀", "破军", "贪狼"].some((n) => majors.has(n)) ||
        soul.minorStars.some((s) => ["火星", "铃星"].includes(s.name as string));
      expect(hits[TRAITS.findIndex((t) => t.id === "action")]).toBe(expectAction);
      const expectSteady = ["天府", "天相", "天同", "天梁"].some((n) => majors.has(n));
      expect(hits[TRAITS.findIndex((t) => t.id === "steady")]).toBe(expectSteady);
    }
  });

  it("大事年份反查与该盘 K 线一致", () => {
    const c = cands[2];
    const birthYear = c.chart.rawDates.lunarDate.lunarYear;
    const decades: DecadeInfo[] = c.chart.palaces
      .map((p) => ({
        palaceIndex: p.index,
        range: p.decadal.range as [number, number],
        heavenlyStem: p.decadal.heavenlyStem as string,
        earthlyBranch: p.decadal.earthlyBranch as string,
        startYear: birthYear + p.decadal.range[0] - 1,
        endYear: birthYear + p.decadal.range[1] - 1,
      }))
      .sort((a, b) => a.range[0] - b.range[0]);
    const lk = buildLifeKline(c.chart, decades, birthYear)!;
    const soulYears = lk.domains.find((d) => d.palaceName === "命宫")!.years;
    const goodYear = soulYears.find((y) => y.pattern === "顺遂");
    const badYear = soulYears.find((y) => y.pattern === "破耗");
    if (goodYear && badYear) {
      const hits = matchEvents(c.chart, [
        { year: goodYear.year, kind: "good" },
        { year: badYear.year, kind: "turbulent" },
        { year: goodYear.year, kind: "turbulent" }, // 顺遂年按动荡查未必命中
      ]);
      expect(hits[0]).toBe(true);
      expect(hits[1]).toBe(true);
    }
  });

  it("评分 = 勾选特征命中×1 + 年份命中×2", () => {
    const hits = TRAITS.map((_, i) => i % 2 === 0); // 偶数位命中
    const checked = new Set([TRAITS[0].id, TRAITS[1].id, TRAITS[2].id]);
    // 勾了 0/1/2，命中的是 0/2 → 2 分；两条年份命中 → +4
    expect(scoreCandidate(hits, checked, [true, true, false])).toBe(6);
    expect(scoreCandidate(hits, new Set(), [])).toBe(0);
  });

  it("确定性：同输入两次候选一致", () => {
    const again = buildHourCandidates(input);
    expect(again.map((c) => c.soulBranch + c.soulMajors).join("|")).toBe(
      cands.map((c) => c.soulBranch + c.soulMajors).join("|")
    );
  });
});
