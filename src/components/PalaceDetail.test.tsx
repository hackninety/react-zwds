/**
 * 宫位详情弹层渲染冒烟（react-dom/server，无需浏览器）：
 * 三方四正/宫干四化/四化传导链/相关格局区块随真实盘数据齐全渲染。
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { astro } from "iztro";
import { analyzeChart } from "../core/analysis";
import type { Astrolabe, Zwds } from "../core/useZwds";
import { PalaceDetail } from "./PalaceDetail";

function makeZ(): { z: Zwds; a: Astrolabe } {
  const a: Astrolabe = astro.withOptions({
    type: "solar",
    dateStr: "2000-08-16",
    timeIndex: 2,
    gender: "男" as never,
    isLeapMonth: false,
    fixLeap: true,
    language: "zh-CN",
    config: { algorithm: "default", yearDivide: "normal", horoscopeDivide: "normal" },
  });
  return { z: { astrolabe: a, analysis: analyzeChart(a) } as unknown as Zwds, a };
}

describe("PalaceDetail 弹层渲染", () => {
  const { z, a } = makeZ();

  it("命宫弹层：三方四正/宫干四化/传导链（忌链文本与引擎一致）", () => {
    const soulIdx = a.palaces.findIndex((p) => p.name === "命宫");
    const html = renderToString(<PalaceDetail z={z} index={soulIdx} onClose={() => {}} />);
    expect(html).toContain("三方四正");
    expect(html).toContain("宫干四化");
    expect(html).toContain("四化传导链（本宫为链首，两转三转）");
    expect(html).toContain("命宫(壬)武曲忌入财帛");
    expect(html).toContain("pd-chain-ji");
    expect(html).toContain("pd-chain-lu");
  });

  it("官禄弹层：自化忌链终止文本", () => {
    const guanIdx = a.palaces.findIndex((p) => p.name === "官禄");
    const html = renderToString(<PalaceDetail z={z} index={guanIdx} onClose={() => {}} />);
    expect(html).toContain("官禄(丙)廉贞忌入本宫【自化忌】");
  });

  it("十二宫弹层全部可渲染且各含本宫链首", () => {
    for (const p of a.palaces) {
      const html = renderToString(<PalaceDetail z={z} index={p.index} onClose={() => {}} />);
      expect(html, `${p.name} 弹层缺传导链`).toContain(`${p.name}(${p.heavenlyStem})`);
    }
  });
});
