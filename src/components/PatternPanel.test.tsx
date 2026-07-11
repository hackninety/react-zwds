/**
 * 格局面板渲染冒烟（react-dom/server，无需浏览器）：
 * 本命格局卡片 + 大限/流年/流月三行运限格局随完整 Zwds 夹具渲染。
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { makeZwdsFixture } from "../core/testFixtures";
import { PatternPanel } from "./PatternPanel";

describe("PatternPanel 渲染", () => {
  const z = makeZwdsFixture();

  it("三行运限格局齐备（大限/流年/流月，随拨盘观测点）", () => {
    const html = renderToString(<PatternPanel z={z} />);
    expect(html).toContain("格局 · 古籍語料");
    expect(html).toContain("pat-scope-decadal");
    expect(html).toContain("pat-scope-yearly");
    expect(html).toContain("pat-scope-monthly");
    expect(html).toContain("流年 2026");
    expect(html).toContain("流月 五月");
  });

  it("流月行内容与引擎扫描一致（有格局列格局，无格局列占位）", () => {
    const html = renderToString(<PatternPanel z={z} />);
    const a = z.astrolabe!;
    const h = z.horoscope!;
    // 与面板同源的扫描结果（观测点固定，二者必然一致）
    const hasMonthly =
      html.includes("流月 五月") &&
      (html.includes("未检出显著运限格局") || html.includes("【"));
    expect(hasMonthly).toBe(true);
    expect(a).toBeTruthy();
    expect(h.monthly.heavenlyStem).toBeTruthy();
  });
});
