/**
 * 结构分析层冒烟测试：用固定生辰起盘，验证
 * 飞宫矩阵自洽、三方四正索引正确、格局/夹宫/借星输出结构完整。
 */
import { describe, expect, it } from "vitest";
import { astro, util } from "iztro";
import {
  analyzeChart,
  detectHoroscopePatterns,
  detectPatterns,
  getBorrowedStars,
  getFlyMatrix,
  getSanfangSnapshots,
  traceMutagenChains,
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

  it("四化传导链：链路自洽（连续性/落宫与星位一致/终止方式/与飞宫矩阵同源）", () => {
    const mc = traceMutagenChains(a);
    const fm = getFlyMatrix(a);
    const pos = new Map<string, number>();
    for (const p of a.palaces) {
      for (const st of [...p.majorStars, ...p.minorStars]) pos.set(st.name as string, p.index);
    }
    for (const list of [mc.ji, mc.lu]) {
      expect(list).toHaveLength(12);
      for (const c of list) {
        expect(c.steps.length).toBeGreaterThanOrEqual(1);
        expect(c.steps.length).toBeLessThanOrEqual(3);
        expect(["自化", "回头", "成环", "三转止"]).toContain(c.end);
        expect(c.steps[0].fromIndex).toBe(c.headIndex);
        c.steps.forEach((s, i) => {
          // 落宫与星的实际位置一致；星确为该宫干对应之化
          expect(pos.get(s.star)).toBe(s.toIndex);
          const table = util.getMutagensByHeavenlyStem(s.stem as never) as string[];
          expect(s.star).toBe(table[c.kind === "禄" ? 0 : 3]);
          // 连续性：上一步落宫 = 下一步出发宫
          if (i > 0) expect(s.fromIndex).toBe(c.steps[i - 1].toIndex);
          expect(s.isSelf).toBe(s.toIndex === s.fromIndex);
        });
        const last = c.steps[c.steps.length - 1];
        if (c.end === "自化") expect(last.isSelf).toBe(true);
        if (c.end === "回头") expect(last.toIndex).toBe(c.headIndex);
        // 首步与飞宫矩阵同一口径
        const pf = fm.palaces.find((x) => x.palaceIndex === c.headIndex)!;
        const f = pf.flies[c.kind === "禄" ? 0 : 3];
        expect(c.steps[0].star).toBe(f.star);
        expect(c.steps[0].toIndex).toBe(f.toIndex);
      }
    }
  });

  it("四化传导链：演示盘已知链路（三转止/自化终止）", () => {
    const mc = traceMutagenChains(a);
    const idxOf = (name: string) => a.palaces.findIndex((p) => p.name === name);
    expect(mc.ji.find((c) => c.headIndex === idxOf("命宫"))!.text).toBe(
      "命宫(壬)武曲忌入财帛 → 财帛(戊)天机忌入兄弟 → 兄弟(辛)文昌忌入福德【三转止】"
    );
    const guanJi = mc.ji.find((c) => c.headIndex === idxOf("官禄"))!;
    expect(guanJi.text).toBe("官禄(丙)廉贞忌入本宫【自化忌】");
    expect(guanJi.end).toBe("自化");
    expect(mc.lu.find((c) => c.headIndex === idxOf("迁移"))!.text).toBe(
      "迁移(戊)贪狼禄入本宫【自化禄】"
    );
  });

  it("四化传导链：回头链样例（忌链缠回链首宫）", () => {
    const c84 = makeChart("1984-03-15", 0, "男");
    const backs = traceMutagenChains(c84).ji.filter((c) => c.end === "回头");
    expect(backs.length).toBeGreaterThanOrEqual(3);
    for (const c of backs) {
      expect(c.steps[c.steps.length - 1].toIndex).toBe(c.headIndex);
      expect(c.text).toContain("【回头】");
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

  it("扩充格局条件自洽（多组生辰独立复核）", () => {
    const samples: [string, number, "男" | "女"][] = [
      ["2000-08-16", 2, "男"],
      ["1984-02-02", 0, "女"],
      ["1990-05-20", 7, "女"],
      ["1988-10-01", 4, "男"],
      ["1975-12-31", 11, "男"],
    ];
    for (const [ds, t, g] of samples) {
      const c = makeChart(ds, t, g);
      const soul = c.palaces.find((p) => p.name === "命宫")!;
      const br = soul.earthlyBranch as string;
      const all = new Set(
        [...soul.majorStars, ...soul.minorStars, ...soul.adjectiveStars].map((s) => s.name as string)
      );
      const names = detectPatterns(c).map((p) => p.name);
      expect(names.includes("擎羊入庙")).toBe(all.has("擎羊") && ["辰", "戌", "丑", "未"].includes(br));
      expect(names.includes("雄宿朝元")).toBe(
        soul.majorStars.some((s) => s.name === "廉贞") && ["寅", "申"].includes(br)
      );
      expect(names.includes("寿星入庙")).toBe(soul.majorStars.some((s) => s.name === "天梁") && br === "午");
      const prev = new Set(
        [...c.palaces[fixIndex(soul.index - 1)].majorStars].map((s) => s.name as string)
      );
      const next = new Set(
        [...c.palaces[fixIndex(soul.index + 1)].majorStars].map((s) => s.name as string)
      );
      expect(names.includes("紫府夹命")).toBe(
        (prev.has("紫微") && next.has("天府")) || (prev.has("天府") && next.has("紫微"))
      );
    }
  });

  it("运限格局扫描：60 个流年遍历结构自洽且覆盖多种格局", () => {
    const seen = new Set<string>();
    for (let year = 1997; year < 2057; year++) {
      const h = a.horoscope(`${year}-7-15`, 0);
      const pats = detectHoroscopePatterns(
        a,
        "yearly",
        h.yearly.index,
        h.yearly.heavenlyStem as string,
        h.yearly.earthlyBranch as string
      );
      for (const p of pats) {
        expect(p.scope).toBe("yearly");
        expect(["吉", "凶", "注意"]).toContain(p.kind);
        expect(p.basis).toBeTruthy();
        expect(p.meaning).toBeTruthy();
        seen.add(p.name);
      }
    }
    // 一甲子内应出现多种运限格局（杀破狼运/忌入·忌冲/双禄等）
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect([...seen].some((n) => n.includes("杀破狼") || n.includes("忌"))).toBe(true);
  });

  it("运限格局扫描：大限层可跑且确定性", () => {
    const h = a.horoscope("2026-7-10", 0);
    const run = () =>
      detectHoroscopePatterns(
        a,
        "decadal",
        h.decadal.index,
        h.decadal.heavenlyStem as string,
        h.decadal.earthlyBranch as string
      );
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
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
