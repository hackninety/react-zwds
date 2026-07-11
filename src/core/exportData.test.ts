/**
 * 导出构建器测试：MD 章节结构与硬编码章节号引用、TOON 可解码往返、
 * AI 载荷组成、JSON 字段齐备、确定性（剔除时间戳后）。
 * Zwds 夹具见 testFixtures.ts（useZwds 同口径纯函数组装，固定观测点）。
 */
import { describe, expect, it } from "vitest";
import { decode } from "@toon-format/toon";
import { buildExportAiText, buildExportData, buildExportMd, buildExportToon } from "./exportData";
import { makeZwdsFixture } from "./testFixtures";

const stripTimestamps = (s: string) =>
  s.replace(/导出时间：[^\n|]+/g, "导出时间：X").replace(/exportedAt.*$/gm, "exportedAt: X");

describe("exportData 导出构建器", () => {
  const z = makeZwdsFixture();

  it("MD：十节 + 附录A~D 齐备且顺序正确；指引硬编码章节号有对应章节", () => {
    const md = buildExportMd(z)!;
    const headers = [
      "## 一、命主信息",
      "## 二、格局与关键结构",
      "## 三、十二宫详情",
      "## 四、三方四正快照",
      "## 五、飞宫四化全矩阵",
      "## 六、当前观测运限",
      "## 七、十年规划表",
      "## 八、2026 年十二流月总览",
      "## 九、人生K线",
      "## 十、AI 推理指引",
      "## 附录A",
      "## 附录B",
      "## 附录C",
      "## 附录D",
    ];
    let last = -1;
    for (const h of headers) {
      const i = md.indexOf(h);
      expect(i, `缺少或错序：${h}`).toBeGreaterThan(last);
      last = i;
    }
    // 指引里引用的章节号必须与真实章节共存（防改结构时错位）
    expect(md).toContain("第二/四/五节");
    expect(md).toContain("### 运限格局提示");
    expect(md).toContain("逐月细化（月K线）");
    expect(md).toContain("| 大限(虚岁) |");
    // 第五节的传导链小节
    expect(md).toContain("### 四化传导链（两转三转）");
    expect(md).toContain("- **忌链**（十二宫为链首）：");
    expect(md).toContain("- **禄链**（十二宫为链首）：");
    // 第八节流月表的格局提示列
    expect(md).toContain("| 格局提示 |");
  });

  it("TOON：可解码往返，剥离知识附录且 meta 注明", () => {
    const toon = buildExportToon(z)!;
    const parsed = decode(toon) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("rulebook");
    expect(Object.keys(parsed)).not.toContain("starEssentials");
    expect(Object.keys(parsed)).not.toContain("topicGuides");
    const meta = parsed.meta as Record<string, unknown>;
    expect(String(meta.note)).toContain("Markdown 导出附录");
    expect((parsed.palaces as unknown[]).length).toBe(12);
    expect((parsed.decadePlan as unknown[]).length).toBe(12);
    const horo = parsed.horoscope as Record<string, unknown>;
    const hp = horo.horoscopePatterns as Record<string, unknown>;
    expect(hp).toBeTruthy();
    expect(Array.isArray(hp.monthly)).toBe(true);
  });

  it("AI 载荷：指引 + toon 代码块 + 附录A/C/D 全在", () => {
    const ai = buildExportAiText(z)!;
    expect(ai).toContain("TOON 结构化命盘数据");
    expect(ai).toContain("```toon");
    expect(ai).toContain("## 附录A：紫微斗数推理规则速查");
    expect(ai).toContain("## 附录C：十四主星");
    expect(ai).toContain("## 附录D：分主题推理指引");
    expect(ai.length).toBeGreaterThan(50_000);
  });

  it("JSON：字段齐备", () => {
    const data = buildExportData(z)! as Record<string, unknown>;
    for (const k of [
      "meta",
      "input",
      "basic",
      "palaces",
      "analysis",
      "horoscope",
      "decadePlan",
      "lifeKline",
      "rulebook",
      "starEssentials",
      "topicGuides",
    ]) {
      expect(data[k], `缺字段 ${k}`).toBeTruthy();
    }
    const lk = data.lifeKline as Record<string, unknown>;
    const monthly = lk.monthlyOfSelectedYear as Record<string, unknown>;
    expect((monthly.domains as unknown[]).length).toBe(12);
    const an = data.analysis as Record<string, unknown>;
    const chains = an.mutagenChains as { ji: unknown[]; lu: unknown[] };
    expect(chains.ji).toHaveLength(12);
    expect(chains.lu).toHaveLength(12);
    const horo = data.horoscope as Record<string, unknown>;
    const hp = horo.horoscopePatterns as Record<string, unknown>;
    expect(Array.isArray(hp.monthly)).toBe(true);
    const rows = horo.monthlyOfCurrentYear as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const r of rows) expect(Array.isArray(r.patterns)).toBe(true);
  });

  it("确定性：剔除时间戳后两次构建一致", () => {
    expect(stripTimestamps(buildExportMd(z)!)).toBe(stripTimestamps(buildExportMd(z)!));
    expect(stripTimestamps(buildExportToon(z)!)).toBe(stripTimestamps(buildExportToon(z)!));
  });
});
