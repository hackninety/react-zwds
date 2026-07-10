/** 合盘核心测试：地支关系、双向因子、评分边界、同性通用、确定性 */
import { describe, expect, it } from "vitest";
import { astro } from "iztro";
import { buildSynastry, buildSynastryMd } from "./synastry";
import { branchRelation } from "./utils";
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

describe("地支关系判定", () => {
  it("合冲刑害优先级", () => {
    expect(branchRelation("子", "丑")).toBe("六合");
    expect(branchRelation("申", "子")).toBe("三合");
    expect(branchRelation("子", "午")).toBe("对冲");
    expect(branchRelation("寅", "巳")).toBe("相刑"); // 寅巳兼害，刑优先
    expect(branchRelation("子", "未")).toBe("相害");
    expect(branchRelation("午", "午")).toBe("自刑");
    expect(branchRelation("子", "子")).toBe("同支");
    expect(branchRelation("子", "寅")).toBe("无");
  });

  it("对称性：relation(x,y) === relation(y,x)", () => {
    const BR = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    for (const x of BR) for (const y of BR) expect(branchRelation(x, y)).toBe(branchRelation(y, x));
  });
});

describe("buildSynastry 合盘", () => {
  const A = chart("2000-08-16", 2, "男");
  const B = chart("1998-03-08", 6, "女");
  const r = buildSynastry(A, B, "甲", "乙");

  it("结构完整：双方信息/关系概览/三维分/因子/总评", () => {
    expect(r.a.name).toBe("甲");
    expect(r.b.yearGz).toHaveLength(2);
    expect(r.relations.length).toBeGreaterThanOrEqual(2);
    expect(r.factors.length).toBeGreaterThan(4);
    expect(r.summary.length).toBeGreaterThanOrEqual(1);
    for (const k of ["love", "career", "wealth"] as const) {
      expect(r.scores[k]).toBeGreaterThanOrEqual(5);
      expect(r.scores[k]).toBeLessThanOrEqual(95);
    }
  });

  it("四化互飞双向各四条（星在盘中必命中）且方向标注正确", () => {
    const ab = r.factors.filter((f) => f.dir === "A→B" && f.text.includes("生年化"));
    const ba = r.factors.filter((f) => f.dir === "B→A" && f.text.includes("生年化"));
    expect(ab).toHaveLength(4);
    expect(ba).toHaveLength(4);
    // A→B 的四化入的是乙方之宫；B→A 入甲方之宫
    for (const f of ab) expect(f.text).toContain("入乙的");
    for (const f of ba) expect(f.text).toContain("入甲的");
  });

  it("太岁入卦双向各一条", () => {
    expect(r.factors.filter((f) => f.text.includes("太岁"))).toHaveLength(2);
  });

  it("交换甲乙：对称因子不变，方向翻转（分数按方向重组）", () => {
    const r2 = buildSynastry(B, A, "乙", "甲");
    // 年支/命支/五行局等「互」类因子的净贡献一致
    const mutualSum = (x: typeof r) =>
      x.factors.filter((f) => f.dir === "互").reduce((s, f) => s + f.delta[0] + f.delta[1] + f.delta[2], 0);
    expect(mutualSum(r2)).toBeCloseTo(mutualSum(r), 5);
    // A→B 因子集合应等于翻转后的 B→A 集合（文本主体一致）
    const norm = (t: string) => t.replace(/甲|乙/g, "");
    const ab1 = r.factors.filter((f) => f.dir === "A→B").map((f) => norm(f.text)).sort();
    const ba2 = r2.factors.filter((f) => f.dir === "B→A").map((f) => norm(f.text)).sort();
    expect(ba2).toEqual(ab1);
  });

  it("同性合盘同样可用（性别不参与相性计算）", () => {
    const C = chart("1998-03-08", 6, "男"); // 与 B 同生辰不同性别
    const rSame = buildSynastry(A, C, "甲", "丙");
    expect(rSame.scores).toEqual(r.scores);
    expect(rSame.factors.length).toBe(r.factors.length);
  });

  it("确定性：同输入两次结果一致", () => {
    const again = buildSynastry(A, B, "甲", "乙");
    expect(JSON.stringify(again)).toBe(JSON.stringify(r));
  });

  it("合盘报告 MD 含关键章节", () => {
    const md = buildSynastryMd(r);
    expect(md).toContain("# 紫微斗数合盘：甲 × 乙");
    expect(md).toContain("## 三维评分");
    expect(md).toContain("## 互动明细");
    expect(md).toContain("## 总评");
  });
});
