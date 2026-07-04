/**
 * AI 导出：把整张命盘 + 当前运限序列化为 JSON / Markdown，
 * 供用户下载后上传给 AI 推理（结构参照 react-iztro 的 astrolabeToJson 并扩展）。
 */
import type { Astrolabe, Horoscope, Zwds } from "./useZwds";
import { MUTAGEN_CHARS, SCOPES, SCOPE_META, fixIndex, type Scope } from "./utils";
import { lunarToSolarStr } from "./lunar";

type AnyStar = {
  name: string;
  type?: string;
  scope?: string;
  brightness?: string;
  mutagen?: string;
};

function serializeStar(star: AnyStar) {
  return {
    name: star.name,
    type: star.type,
    scope: star.scope,
    ...(star.brightness ? { brightness: star.brightness } : {}),
    ...(star.mutagen ? { mutagen: star.mutagen } : {}),
  };
}

function serializeHoroscopeItem(item: Horoscope[Scope]) {
  return {
    index: item.index,
    name: item.name,
    heavenlyStem: item.heavenlyStem,
    earthlyBranch: item.earthlyBranch,
    palaceNames: item.palaceNames,
    mutagen: item.mutagen,
    ...(item.stars ? { stars: item.stars.map((g) => g.map(serializeStar)) } : {}),
  };
}

/** 十二大限一览（每限取运中年份计算一次运限） */
function getAllDecadals(z: Zwds) {
  const { astrolabe, decades } = z;
  if (!astrolabe) return [];
  const results: Record<string, unknown>[] = [];
  for (const d of decades) {
    const midYear = d.startYear + 5;
    const dateStr = lunarToSolarStr(midYear, 6, 15) ?? `${midYear}-7-15`;
    try {
      const h = astrolabe.horoscope(dateStr, 0);
      results.push({ ageRange: d.range, ...serializeHoroscopeItem(h.decadal) });
    } catch {
      /* 超出历法范围则跳过 */
    }
  }
  return results;
}

/** 当前流年的十二流月一览 */
function getMonthlyOfYear(z: Zwds) {
  const { astrolabe, pick, months } = z;
  if (!astrolabe) return [];
  const results: Record<string, unknown>[] = [];
  for (let m = 1; m <= 12; m++) {
    const dateStr = lunarToSolarStr(pick.year, m, 15);
    if (!dateStr) continue;
    try {
      const h = astrolabe.horoscope(dateStr, 0);
      results.push({
        month: m,
        label: months[m - 1]?.label,
        ganZhi: months[m - 1]?.gz,
        ...serializeHoroscopeItem(h.monthly),
      });
    } catch {
      /* skip */
    }
  }
  return results;
}

function schoolLabel(algorithm: string): string {
  return algorithm === "zhongzhou"
    ? "中州派（王亭之体系）"
    : "南派三合（《紫微斗数全书》通行版）";
}

export function buildExportData(z: Zwds) {
  const a = z.astrolabe;
  if (!a) return null;
  const h = z.horoscope;

  const meta = {
    app: "react-zwds",
    engine: "iztro (https://github.com/SylarLong/iztro)",
    school: schoolLabel(z.input.algorithm),
    yearDivide: z.input.yearDivide === "exact" ? "立春分界" : "正月初一分界",
    exportedAt: new Date().toISOString(),
    note: "所有命盘分析解读请以 meta.school 指定流派为准；brightness=星耀亮度（庙旺得利平不陷），mutagen=生年四化，各运限四化见 horoscope 对应层级。",
  };

  const input = {
    name: z.input.name || "无名",
    gender: z.input.gender,
    calendar: z.input.calendar,
    date: z.input.date,
    timeIndex: z.input.timeIndex,
    isLeapMonth: z.input.isLeapMonth,
    exactTime: z.input.exactTime || null,
    trueSolar: z.trueSolar,
  };

  const basic = {
    gender: a.gender,
    solarDate: a.solarDate,
    lunarDate: a.lunarDate,
    chineseDate: a.chineseDate,
    time: a.time,
    timeRange: a.timeRange,
    sign: a.sign,
    zodiac: a.zodiac,
    earthlyBranchOfSoulPalace: a.earthlyBranchOfSoulPalace,
    earthlyBranchOfBodyPalace: a.earthlyBranchOfBodyPalace,
    soul: a.soul,
    body: a.body,
    fiveElementsClass: a.fiveElementsClass,
    startAge: z.decades[0]?.range[0] ?? null,
  };

  const palaces = a.palaces.map((p) => ({
    index: p.index,
    name: p.name,
    isBodyPalace: p.isBodyPalace,
    isOriginalPalace: p.isOriginalPalace,
    heavenlyStem: p.heavenlyStem,
    earthlyBranch: p.earthlyBranch,
    majorStars: p.majorStars.map(serializeStar),
    minorStars: p.minorStars.map(serializeStar),
    adjectiveStars: p.adjectiveStars.map(serializeStar),
    changsheng12: p.changsheng12,
    boshi12: p.boshi12,
    jiangqian12: p.jiangqian12,
    suiqian12: p.suiqian12,
    decadal: p.decadal,
    ages: p.ages,
  }));

  const horoscope = h
    ? {
        observedSolarDate: h.solarDate,
        observedLunarDate: h.lunarDate,
        nominalAge: h.age.nominalAge,
        pick: { ...z.pick, clampedDay: z.clampedDay },
        decadal: serializeHoroscopeItem(h.decadal),
        age: { ...serializeHoroscopeItem(h.age), nominalAge: h.age.nominalAge },
        yearly: {
          ...serializeHoroscopeItem(h.yearly),
          yearlyDecStar: h.yearly.yearlyDecStar,
        },
        monthly: serializeHoroscopeItem(h.monthly),
        daily: serializeHoroscopeItem(h.daily),
        hourly: serializeHoroscopeItem(h.hourly),
        yearsOfCurrentDecade: z.years,
        allDecadals: getAllDecadals(z),
        monthlyOfCurrentYear: getMonthlyOfYear(z),
      }
    : null;

  return { meta, input, basic, palaces, horoscope };
}

/* ─────────────── Markdown ─────────────── */

const starTxt = (s: AnyStar) =>
  `${s.name}${s.brightness ? `(${s.brightness})` : ""}${s.mutagen ? `【生年${s.mutagen}】` : ""}`;

const starList = (list: AnyStar[]) => (list.length ? list.map(starTxt).join("、") : "无");

function mutagenLine(mutagen: string[]): string {
  if (!mutagen?.length) return "无";
  return mutagen.map((m, i) => `化${MUTAGEN_CHARS[i]}=${m}`).join("，");
}

function scopeSection(
  a: Astrolabe,
  scope: Scope,
  item: Horoscope[Scope],
  extraTitle: string
): string {
  const meta = SCOPE_META[scope];
  const seat = a.palaces[item.index];
  const lines: string[] = [];
  lines.push(`### ${meta.rowLabel}${extraTitle}`);
  lines.push("");
  lines.push(`- ${meta.rowLabel}干支：${item.heavenlyStem}${item.earthlyBranch}`);
  lines.push(
    `- ${meta.rowLabel}命宫落于本命【${seat?.name ?? "?"}】宫（地支${seat?.earthlyBranch ?? "?"}）`
  );
  lines.push(`- ${meta.rowLabel}四化：${mutagenLine(item.mutagen as string[])}`);
  lines.push("");
  lines.push(`| 本命宫位（地支） | ${meta.rowLabel}十二宫 |`);
  lines.push("|---|---|");
  a.palaces.forEach((p, i) => {
    lines.push(`| ${p.name}（${p.earthlyBranch}） | ${meta.prefix}${item.palaceNames[i]} |`);
  });
  if (item.stars?.some((g) => g.length)) {
    lines.push("");
    lines.push(`- ${meta.rowLabel}流耀分布：`);
    item.stars.forEach((g, i) => {
      if (g.length)
        lines.push(
          `  - ${a.palaces[i].earthlyBranch}宫（本命${a.palaces[i].name}）：${g
            .map((s) => s.name)
            .join("、")}`
        );
    });
  }
  lines.push("");
  return lines.join("\n");
}

export function buildExportMd(z: Zwds): string | null {
  const a = z.astrolabe;
  if (!a) return null;
  const h = z.horoscope;
  const L: string[] = [];

  L.push(`# 紫微斗数命盘（AI 分析用）`);
  L.push("");
  L.push(`> 排盘引擎：iztro · 安星流派：**${schoolLabel(z.input.algorithm)}** · 年/运限分界：${
    z.input.yearDivide === "exact" ? "立春" : "正月初一"
  } · 导出时间：${new Date().toLocaleString("zh-CN")}`);
  L.push(`> 星名后括号为亮度（庙旺得利平不陷），【生年X】为生年四化；各运限四化在对应章节单列。`);
  L.push("");

  /* 一、命主信息 */
  L.push(`## 一、命主信息`);
  L.push("");
  L.push(`| 项目 | 内容 |`);
  L.push(`|---|---|`);
  L.push(`| 姓名 | ${z.input.name || "无名"} |`);
  L.push(`| 性别 | ${a.gender === "女" ? "坤造" : "乾造"} ${a.gender} |`);
  L.push(`| 阳历生日 | ${a.solarDate} |`);
  L.push(`| 农历生日 | ${a.lunarDate}${z.input.isLeapMonth ? "（闰月）" : ""} |`);
  L.push(`| 出生时辰 | ${a.time}（${a.timeRange}） |`);
  if (z.trueSolar) {
    L.push(
      `| 真太阳时 | ${z.trueSolar.trueDate} ${z.trueSolar.trueTime}（钟表 ${z.trueSolar.clockDate} ${z.trueSolar.clockTime}，经度 ${z.trueSolar.longitude}°，偏移 ${z.trueSolar.offsetMinutes.toFixed(1)} 分，其中均时差 ${z.trueSolar.eotMinutes.toFixed(1)} 分）→ 已按真太阳时排盘 |`
    );
  }
  L.push(`| 四柱干支 | ${a.chineseDate} |`);
  L.push(`| 五行局 | ${a.fiveElementsClass}（${z.decades[0]?.range[0] ?? "?"} 岁上运，虚岁） |`);
  L.push(`| 命主 / 身主 | ${a.soul} / ${a.body} |`);
  L.push(`| 命宫 / 身宫 | ${a.earthlyBranchOfSoulPalace} / ${a.earthlyBranchOfBodyPalace} |`);
  const origin = a.palaces.find((p) => p.isOriginalPalace);
  if (origin) L.push(`| 来因宫 | ${origin.name}（${origin.earthlyBranch}） |`);
  L.push(`| 生肖 / 星座 | ${a.zodiac} / ${a.sign} |`);
  L.push("");

  /* 二、十二宫详情（命宫起，逆布） */
  L.push(`## 二、十二宫详情`);
  L.push("");
  const soul = z.soulPalaceIndex >= 0 ? z.soulPalaceIndex : 0;
  for (let k = 0; k < 12; k++) {
    const p = a.palaces[fixIndex(soul - k)];
    if (!p) continue;
    const marks = [p.isBodyPalace ? "【身宫】" : "", p.isOriginalPalace ? "【来因宫】" : ""].join("");
    L.push(`### ${k + 1}. ${p.name}${marks}（${p.heavenlyStem}${p.earthlyBranch}）`);
    L.push("");
    L.push(`- 主星：${starList(p.majorStars)}`);
    L.push(`- 辅星：${starList(p.minorStars)}`);
    L.push(`- 杂耀：${starList(p.adjectiveStars)}`);
    L.push(`- 长生十二神：${p.changsheng12}；博士十二神：${p.boshi12}`);
    L.push(`- 岁前十二神：${p.suiqian12}；将前十二神：${p.jiangqian12}`);
    L.push(`- 大限：${p.decadal.range.join("~")} 岁（${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}）；小限岁数：${p.ages.join("、")}`);
    L.push("");
  }

  /* 三、当前观测运限 */
  if (h) {
    L.push(`## 三、当前观测运限`);
    L.push("");
    L.push(
      `- 观测点：公历 ${h.solarDate}（农历 ${h.lunarDate}），虚岁 ${h.age.nominalAge}`
    );
    const dec = z.activeDecadeIdx >= 0 ? z.decades[z.activeDecadeIdx] : null;
    L.push(
      `- 当前序列：${
        dec ? `大限 ${dec.range[0]}~${dec.range[1]}（${dec.heavenlyStem}${dec.earthlyBranch}）` : "童限"
      } → 流年 ${z.pick.year} → 流月 ${z.months[z.pick.month - 1]?.label ?? z.pick.month}（${
        z.months[z.pick.month - 1]?.gz ?? ""
      }） → 流日 ${z.days[z.clampedDay - 1]?.label ?? z.clampedDay}（${
        z.days[z.clampedDay - 1]?.gz ?? ""
      }） → 流时 ${z.hours[z.pick.hour]?.label ?? ""}（${z.hours[z.pick.hour]?.gz ?? ""}）`
    );
    L.push("");
    L.push(scopeSection(a, "decadal", h.decadal, `（${dec ? `${dec.range[0]}~${dec.range[1]}岁` : "童限"}）`));
    const ageSeat = a.palaces[h.age.index];
    L.push(`### 小限（虚岁 ${h.age.nominalAge}）`);
    L.push("");
    L.push(`- 小限落于本命【${ageSeat?.name ?? "?"}】宫（地支${ageSeat?.earthlyBranch ?? "?"}）`);
    if (h.age.palaceNames?.length) {
      L.push("");
      L.push(`| 本命宫位（地支） | 小限十二宫 |`);
      L.push(`|---|---|`);
      a.palaces.forEach((p, i) => {
        L.push(`| ${p.name}（${p.earthlyBranch}） | 小${h.age.palaceNames[i]} |`);
      });
    }
    L.push("");
    L.push(scopeSection(a, "yearly", h.yearly, `（${z.pick.year} 年）`));
    L.push(`- 流年岁前十二神：${h.yearly.yearlyDecStar.suiqian12.join("、")}（按宫位索引 0~11 排列，0=寅宫）`);
    L.push(`- 流年将前十二神：${h.yearly.yearlyDecStar.jiangqian12.join("、")}（同上）`);
    L.push("");
    L.push(scopeSection(a, "monthly", h.monthly, `（${z.months[z.pick.month - 1]?.label ?? ""}）`));
    L.push(scopeSection(a, "daily", h.daily, `（${z.days[z.clampedDay - 1]?.label ?? ""}）`));
    L.push(scopeSection(a, "hourly", h.hourly, `（${z.hours[z.pick.hour]?.label ?? ""}）`));
  }

  /* 四、十二大限总览 */
  const all = getAllDecadals(z);
  if (all.length) {
    L.push(`## 四、十二大限总览`);
    L.push("");
    L.push(`| 年龄段（虚岁） | 大限干支 | 大限命宫落宫 | 四化（禄/权/科/忌） |`);
    L.push(`|---|---|---|---|`);
    for (const d of all) {
      const range = d.ageRange as [number, number];
      const idx = d.index as number;
      const seat = a.palaces[idx];
      L.push(
        `| ${range[0]}~${range[1]} | ${d.heavenlyStem}${d.earthlyBranch} | ${seat?.name}（${seat?.earthlyBranch}） | ${(d.mutagen as string[]).join(" / ")} |`
      );
    }
    L.push("");
  }

  /* 五、当年十二流月总览 */
  const my = getMonthlyOfYear(z);
  if (my.length) {
    L.push(`## 五、${z.pick.year} 年十二流月总览`);
    L.push("");
    L.push(`| 流月 | 干支 | 流月命宫落宫 | 四化（禄/权/科/忌） |`);
    L.push(`|---|---|---|---|`);
    for (const m of my) {
      const idx = m.index as number;
      const seat = a.palaces[idx];
      L.push(
        `| ${m.label} | ${m.ganZhi} | ${seat?.name}（${seat?.earthlyBranch}） | ${(m.mutagen as string[]).join(" / ")} |`
      );
    }
    L.push("");
  }

  L.push(`## 六、使用说明`);
  L.push("");
  L.push(
    `将本文件整体提供给 AI，并附上您的问题（如性格、事业、婚姻、某年吉凶等）。分析时请 AI 严格依照本文件数据与 meta 中标注的流派口径推理，不要自行改星改宫。`
  );
  L.push("");

  return L.join("\n");
}

/* ─────────────── 下载 ─────────────── */

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function baseFilename(z: Zwds): string {
  const name = (z.input.name || "无名").replace(/[\\/:*?"<>|\s]/g, "");
  return `紫微斗数_${name}_${z.astrolabe?.solarDate ?? ""}`;
}

export function downloadJson(z: Zwds) {
  const data = buildExportData(z);
  if (!data) return;
  download(`${baseFilename(z)}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

export function downloadMd(z: Zwds) {
  const md = buildExportMd(z);
  if (!md) return;
  download(`${baseFilename(z)}.md`, md, "text/markdown;charset=utf-8");
}
