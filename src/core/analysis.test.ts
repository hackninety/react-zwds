/**
 * 结构分析层冒烟测试：用固定生辰起盘，验证
 * 飞宫矩阵自洽、三方四正索引正确、格局/夹宫/借星输出结构完整。
 */
import { describe, expect, it } from "vitest";
import { astro, util } from "iztro";
import {
  analyzeChart,
  detectPatterns,
  getBorrowedStars,
  getFlyMatrix,
  getSanfangSnapshots,
} from "./analysis";
import { fixIndex } from "./utils";

function makeChart(dateStr = "2000-08-16", timeIndex = 2, gender: "男" | "女" = "男") {
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

describe("analysis 结构分析层", () => {
  const a = makeChart();

  it("三方四正快照：十二宫齐全，座次索引正确", () => {
    const snaps = getSanfangSnapshots(a);
    expect(snaps).toHaveLength(12);
    for (const s of snaps) {
      expect(s.seats).toHaveLength(4);
      expect(s.seats.map((x) => x.role)).toEqual(["本宫", "对宫", "三合", "三合"]);
      // 对宫 = +6，三合 = ±4
      const opp = a.palaces[fixIndex(s.palaceIndex + 6)];
      expect(s.seats[1].palaceName).toBe(opp.name);
      const trines = [fixIndex(s.palaceIndex + 4), fixIndex(s.palaceIndex - 4)].map(
        (i) => a.palaces[i].name
      );
      expect(trines).toContain(s.seats[2].palaceName);
      expect(trines).toContain(s.seats[3].palaceName);
      expect(s.shaCount).toBe(s.inauspicious.length);
    }
  });

  it("飞宫矩阵：每宫四化落宫与星的实际位置一致，自化标记自洽", () => {
    const fm = getFlyMatrix(a);
    expect(fm.palaces).toHaveLength(12);
    expect(fm.sentences).toHaveLength(12);
    // 星名 → 实际宫位
    const pos = new Map<string, number>();
    for (const p of a.palaces) {
      for (const st of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
        pos.set(st.name as string, p.index);
      }
    }
    for (const pf of fm.palaces) {
      expect(pf.flies).toHaveLength(4);
      const expectStars = util.getMutagensByHeavenlyStem(pf.stem as never) as string[];
      expect(pf.flies.map((f) => f.star)).toEqual(expectStars);
      for (const f of pf.flies) {
        if (f.toIndex >= 0) {
          expect(pos.get(f.star)).toBe(f.toIndex);
          expect(f.isSelf).toBe(f.toIndex === pf.palaceIndex);
          expect(f.isOpposite).toBe(f.toIndex === fixIndex(pf.palaceIndex + 6));
        }
      }
      // 离心自化列表 = isSelf 的飞化
      expect(pf.selfOutward).toEqual(
        pf.flies.filter((f) => f.isSelf).map((f) => `${f.star}化${f.mutagen}`)
      );
      // 向心自化 = 对宫飞入本宫
      const opp = fm.palaces.find((x) => x.palaceIndex === fixIndex(pf.palaceIndex + 6))!;
      expect(pf.selfInward.length).toBe(opp.flies.filter((f) => f.toIndex === pf.palaceIndex).length);
    }
  });

  it("生年四化取年干（2000 庚辰 → 阳武阴同）", () => {
    const yearStem = a.chineseDate.split(" ")[0]?.charAt(0);
    expect(yearStem).toBe("庚");
    expect(util.getMutagensByHeavenlyStem("庚" as never)).toEqual(["太阳", "武曲", "太阴", "天同"]);
  });

  it("格局检测：输出结构完整，杀破狼判定与命宫主星一致", () => {
    const pats = detectPatterns(a);
    for (const p of pats) {
      expect(p.name).toBeTruthy();
      expect(["吉", "凶", "注意"]).toContain(p.kind);
      expect(p.where).toBeTruthy();
      expect(p.basis).toBeTruthy();
      expect(p.meaning).toBeTruthy();
    }
    const soul = a.palaces.find((p) => p.name === "命宫")!;
    const hasSbl = soul.majorStars.some((s) => ["七杀", "破军", "贪狼"].includes(s.name as string));
    expect(pats.some((p) => p.name === "杀破狼")).toBe(hasSbl);
  });

  it("空宫借星：与各宫主星有无一致", () => {
    const borrowed = getBorrowedStars(a);
    const emptyCount = a.palaces.filter((p) => !p.majorStars.length).length;
    expect(borrowed).toHaveLength(emptyCount);
    for (const b of borrowed) {
      expect(a.palaces[b.palaceIndex].majorStars).toHaveLength(0);
    }
  });

  it("analyzeChart 汇总入口各字段齐备（另抽多组生辰不抛错）", () => {
    const an = analyzeChart(a);
    expect(an.patterns).toBeInstanceOf(Array);
    expect(an.sanfang).toHaveLength(12);
    expect(an.flyMatrix.palaces).toHaveLength(12);
    expect(an.jiaGong).toBeInstanceOf(Array);
    expect(an.borrowed).toBeInstanceOf(Array);
    // 多组随机代表性生辰跑通（含女命、晚子时、闰年）
    const samples: [string, number, "男" | "女"][] = [
      ["1984-02-02", 0, "女"],
      ["1996-02-29", 12, "男"],
      ["2024-06-15", 6, "女"],
      ["1955-11-11", 9, "男"],
    ];
    for (const [d, t, g] of samples) {
      expect(() => analyzeChart(makeChart(d, t, g))).not.toThrow();
    }
  });
});
