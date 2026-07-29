/**
 * 导出构建器测试：MD 章节结构与硬编码章节号引用、TOON 可解码往返、
 * AI 载荷组成、JSON 字段齐备、确定性（剔除时间戳后）。
 * Zwds 夹具见 testFixtures.ts（useZwds 同口径纯函数组装，固定观测点）。
 */
import { describe, expect, it } from "vitest";
import { decode } from "@toon-format/toon";
import {
  baseFilename,
  buildExportAiText,
  buildExportData,
  buildExportMd,
  buildExportToon,
} from "./exportData";
import { makeZwdsFixture } from "./testFixtures";
import type { Zwds } from "./useZwds";

const stripTimestamps = (s: string) =>
  s.replace(/导出时间：[^\n|]+/g, "导出时间：X").replace(/exportedAt.*$/gm, "exportedAt: X");

describe("exportData 导出构建器", () => {
  const z = makeZwdsFixture();

  it("MD：九节 + 附录A~D 齐备且顺序正确；指引硬编码章节号有对应章节", () => {
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
      "## 九、AI 推理指引",
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
    expect(md).toContain("| 大限(虚岁) |");
    // 人生K线量化数据不随导出（自定分值易被 AI 当命理定论，致误报）
    expect(md).not.toContain("## 十、");
    expect(md).not.toContain("人生K线（分域量化参考）");
    expect(md).not.toContain("月K线");
    expect(md).not.toContain("| 均值 | 高光年 | 低谷年 |");
    // 杂耀权重分档 + 小限口径备注 + 四化视角指引
    expect(md).toContain("- 杂耀·中权重：");
    expect(md).toContain("星耀权重三档");
    expect(md).toContain("小限为辅助年系统");
    expect(md).toContain("飞宫四化视角");
    // 第五节的传导链小节
    expect(md).toContain("### 四化传导链（两转三转）");
    expect(md).toContain("- **忌链**（十二宫为链首）：");
    expect(md).toContain("- **禄链**（十二宫为链首）：");
    // 第八节流月表的格局提示列
    expect(md).toContain("| 格局提示 |");
    // 附录A 命主身主诠释节（与第一节的命主/身主行呼应）
    expect(md).toContain("| 命主 / 身主 |");
    expect(md).toContain("### H. 命主身主");
  });

  it("TOON：可解码往返，剥离知识附录与人生K线且 meta 注明", () => {
    const toon = buildExportToon(z)!;
    const parsed = decode(toon) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("rulebook");
    expect(Object.keys(parsed)).not.toContain("starEssentials");
    expect(Object.keys(parsed)).not.toContain("topicGuides");
    expect(Object.keys(parsed)).not.toContain("lifeKline");
    const meta = parsed.meta as Record<string, unknown>;
    expect(String(meta.note)).toContain("Markdown 导出附录");
    expect(String(meta.note)).toContain("不含任何量化评分数据");
    expect((parsed.palaces as unknown[]).length).toBe(12);
    const plan = parsed.decadePlan as Record<string, unknown>[];
    expect(plan.length).toBe(12);
    // 十年规划表仅保留确定性列，K线衍生的均值/高光/低谷不随导出
    for (const r of plan) {
      expect(r.avg).toBeUndefined();
      expect(r.best).toBeUndefined();
      expect(r.worst).toBeUndefined();
    }
    const horo = parsed.horoscope as Record<string, unknown>;
    const hp = horo.horoscopePatterns as Record<string, unknown>;
    expect(hp).toBeTruthy();
    expect(Array.isArray(hp.monthly)).toBe(true);
    // allDecadals 与 decadePlan 重叠，已删；流日/流时默认不导出
    expect(Object.keys(horo)).not.toContain("allDecadals");
    expect(Object.keys(horo)).not.toContain("daily");
    expect(Object.keys(horo)).not.toContain("hourly");
    // 小限口径备注随 age 携带；杂耀带权重档位
    expect(String((horo.age as Record<string, unknown>).note)).toContain("辅助年系统");
    const palaces = parsed.palaces as { adjectiveStars: { weight?: string }[] }[];
    const adjs = palaces.flatMap((p) => p.adjectiveStars);
    expect(adjs.length).toBeGreaterThan(0);
    for (const s of adjs) expect(["中", "低"]).toContain(s.weight);
  });

  it("流日/流时：默认不导出，勾选后附带", () => {
    const md = buildExportMd(z)!;
    expect(md).not.toContain("### 流日");
    expect(md).not.toContain("### 流时");
    const md2 = buildExportMd(z, { withDaily: true, withHourly: true })!;
    expect(md2).toContain("### 流日");
    expect(md2).toContain("### 流时");
    const data2 = buildExportData(z, { withDaily: true, withHourly: true })! as Record<
      string,
      unknown
    >;
    const horo2 = data2.horoscope as Record<string, unknown>;
    expect(horo2.daily).toBeTruthy();
    expect(horo2.hourly).toBeTruthy();
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

  it("JSON：字段齐备，人生K线不随导出", () => {
    const data = buildExportData(z)! as Record<string, unknown>;
    for (const k of [
      "meta",
      "input",
      "basic",
      "palaces",
      "analysis",
      "horoscope",
      "decadePlan",
      "rulebook",
      "starEssentials",
      "topicGuides",
    ]) {
      expect(data[k], `缺字段 ${k}`).toBeTruthy();
    }
    expect(data.lifeKline, "人生K线量化数据不应随导出").toBeUndefined();
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

  it("文件名：日期补零 + 出生时刻（真太阳时优先，否则时辰名）", () => {
    // 未启用真太阳时：无精确时刻，用时辰名而非编造分钟
    expect(baseFilename(z)).toBe("紫微斗数_导出测试_2000-08-16_寅时");
    // 启用真太阳时：用校正后的实际排盘时刻，冒号换连字符（文件名非法字符）
    const zTrue = { ...z, trueSolar: { trueTime: "04:37" } } as unknown as Zwds;
    expect(baseFilename(zTrue)).toBe("紫微斗数_导出测试_2000-08-16_04-37");
    // 姓名中的空白与路径字符剔除；缺省姓名
    const zName = { ...z, input: { ...z.input, name: "张 三/李" } } as Zwds;
    expect(baseFilename(zName)).toBe("紫微斗数_张三李_2000-08-16_寅时");
    const zAnon = { ...z, input: { ...z.input, name: "" } } as Zwds;
    expect(baseFilename(zAnon)).toBe("紫微斗数_无名_2000-08-16_寅时");
  });

  it("文件名：勾选流日/流时时追加观测点（多份导出不重名）", () => {
    const base = "紫微斗数_导出测试_2000-08-16_寅时";
    // 夹具观测点：2026 农历五月十五 午时 → 公历 2026-06-29
    expect(baseFilename(z, { withDaily: true })).toBe(`${base}_流日2026-06-29`);
    expect(baseFilename(z, { withHourly: true })).toBe(`${base}_流时午时`);
    expect(baseFilename(z, { withDaily: true, withHourly: true })).toBe(
      `${base}_流日2026-06-29_流时午时`
    );
    // 三种组合与不勾选各不相同，同一张盘的多份导出不会互相覆盖
    const names = new Set(
      [{}, { withDaily: true }, { withHourly: true }, { withDaily: true, withHourly: true }].map(
        (o) => baseFilename(z, o)
      )
    );
    expect(names.size).toBe(4);
  });

  it("确定性：剔除时间戳后两次构建一致", () => {
    expect(stripTimestamps(buildExportMd(z)!)).toBe(stripTimestamps(buildExportMd(z)!));
    expect(stripTimestamps(buildExportToon(z)!)).toBe(stripTimestamps(buildExportToon(z)!));
  });
});
