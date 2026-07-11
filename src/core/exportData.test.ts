/**
 * 导出构建器测试：MD 章节结构与硬编码章节号引用、TOON 可解码往返、
 * AI 载荷组成、JSON 字段齐备、确定性（剔除时间戳后）。
 * Zwds 夹具按 useZwds 同口径的纯函数手工组装（固定观测点）。
 */
import { describe, expect, it } from "vitest";
import { astro } from "iztro";
import { decode } from "@toon-format/toon";
import { buildExportAiText, buildExportData, buildExportMd, buildExportToon } from "./exportData";
import { analyzeChart } from "./analysis";
import { buildLifeKline, decadesOfChart } from "./lifeKline";
import { dayGanZhi, daysInLunarMonth, lunarToSolarStr } from "./lunar";
import { BRANCHES, LUNAR_DAYS, LUNAR_MONTHS, hourGanZhi, monthGanZhi, yearGanZhi } from "./utils";
import type { Astrolabe, BirthInput, Zwds } from "./useZwds";

function makeZwdsFixture(): Zwds {
  const input: BirthInput = {
    name: "导出测试",
    gender: "男",
    calendar: "solar",
    date: "2000-08-16",
    timeIndex: 2,
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
    residence: "广东深圳",
  };
  const a: Astrolabe = astro.withOptions({
    type: "solar",
    dateStr: input.date,
    timeIndex: input.timeIndex,
    gender: "男" as never,
    isLeapMonth: false,
    fixLeap: true,
    language: "zh-CN",
    astroType: "heaven",
    config: { algorithm: "default", yearDivide: "normal", horoscopeDivide: "normal" },
  });
  const birthLunarYear = a.rawDates.lunarDate.lunarYear;
  const decades = decadesOfChart(a, birthLunarYear);

  // 固定观测点：2026 年农历五月十五 午时（demo 盘 23~32 限内）
  const pick = { year: 2026, month: 5, day: 15, hour: 6, leap: false };
  const monthDays = daysInLunarMonth(pick.year, pick.month);
  const clampedDay = Math.min(pick.day, monthDays);
  const months = LUNAR_MONTHS.map((label, i) => ({
    month: i + 1,
    leap: false,
    label,
    gz: monthGanZhi(pick.year, i + 1),
  }));
  const days = Array.from({ length: monthDays }, (_, i) => {
    const solar = lunarToSolarStr(pick.year, pick.month, i + 1);
    return { day: i + 1, label: LUNAR_DAYS[i], gz: solar ? dayGanZhi(solar) : "" };
  });
  const dayStem = days[clampedDay - 1].gz.charAt(0);
  const hours = BRANCHES.map((b, i) => ({ hour: i, label: `${b}时`, gz: hourGanZhi(dayStem, i) }));
  const targetSolar = lunarToSolarStr(pick.year, pick.month, clampedDay)!;
  const horoscope = a.horoscope(targetSolar, pick.hour);

  const age = pick.year - birthLunarYear + 1;
  const activeDecadeIdx = decades.findIndex((d) => age >= d.range[0] && age <= d.range[1]);
  const dec = decades[activeDecadeIdx];
  const years = Array.from({ length: 10 }, (_, i) => {
    const y = dec.startYear + i;
    return { year: y, gz: yearGanZhi(y), age: y - birthLunarYear + 1 };
  });

  const fixture = {
    input,
    astrolabe: a,
    horoscope,
    birthLunarYear,
    decades,
    childhood: null,
    activeDecadeIdx,
    years,
    months,
    days,
    hours,
    monthDays,
    clampedDay,
    effLeap: false,
    pick,
    visible: { decadal: true, yearly: true, monthly: false, daily: false, hourly: false },
    targetSolar,
    trueSolar: null,
    soulPalaceIndex: a.palaces.findIndex((p) => p.name === "命宫"),
    lifeKline: buildLifeKline(a, decades, birthLunarYear),
    analysis: analyzeChart(a),
    actions: {},
  };
  return fixture as unknown as Zwds;
}

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
    expect(horo.horoscopePatterns).toBeTruthy();
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
  });

  it("确定性：剔除时间戳后两次构建一致", () => {
    expect(stripTimestamps(buildExportMd(z)!)).toBe(stripTimestamps(buildExportMd(z)!));
    expect(stripTimestamps(buildExportToon(z)!)).toBe(stripTimestamps(buildExportToon(z)!));
  });
});
