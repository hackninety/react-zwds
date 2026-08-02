/**
 * AI 导出：把整张命盘 + 当前运限序列化为 JSON / Markdown，
 * 供用户下载后上传给 AI 推理（结构参照 react-iztro 的 astrolabeToJson 并扩展）。
 * 注：人生K线（含月K线、十年规划表的均值/高光/低谷列）为盘面自研量化参考，
 * 不随任何导出携带——自定分值易被 AI 当作命理定论引用，造成误报。
 */
import { util } from "iztro";
import type { Astrolabe, Horoscope, Zwds } from "./useZwds";
import {
  MUTAGEN_CHARS,
  MUTAGEN_TABLE_LABEL,
  SCOPE_META,
  STEMS,
  bodyPalaceBranchOf,
  fixIndex,
  type Scope,
} from "./utils";
import { lunarToSolarStr } from "./lunar";
import { encode as toonEncode } from "@toon-format/toon";
import {
  analyzeChart,
  buildChartIndex,
  detectHoroscopePatterns,
  scanHoroscopePatterns,
  type ChartAnalysis,
  type HoroPattern,
} from "./analysis";
import { buildDecadePlan } from "./decadePlan";
import { RULEBOOK_MD, STAR_MUTAGEN_MD, topicGuidesMd } from "./knowledge";

/** 本宫自化（离心）：宫干四化命中本宫主星/辅星 */
function getSelfMutagens(p: Astrolabe["palaces"][number]) {
  const table = util.getMutagensByHeavenlyStem(p.heavenlyStem) as string[];
  const own = new Set([...p.majorStars, ...p.minorStars].map((s) => s.name as string));
  return table
    .map((star, k) => ({ star, mutagen: MUTAGEN_CHARS[k] }))
    .filter((x) => own.has(x.star));
}

/** 导出选项：流日/流时默认不导出（无关层级稀释 AI 注意力，择日择时场景再勾选） */
export type ExportOptions = {
  /** 附当前观测流日（择日用） */
  withDaily?: boolean;
  /** 附当前观测流时（择时用） */
  withHourly?: boolean;
};

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

/**
 * 杂耀·中权重名单（乙级辅曜，可参与断事）：桃花四曜、刑姚巫月煞、台座光贵、辅诰池阁、华盖孤寡。
 * 未列入的杂耀（解神/年解/天官/天福/天厨/天才/天寿/天哭/天虚/天德/月德/蜚廉/破碎/
 * 天空/旬空/截空/空亡/截路/天伤/天使等）为低权重，仅作叠加参考。
 */
const ADJ_MID_WEIGHT = new Set([
  "红鸾", "天喜", "天姚", "咸池",
  "天刑", "天巫", "天月", "阴煞",
  "三台", "八座", "恩光", "天贵",
  "台辅", "封诰", "龙池", "凤阁",
  "华盖", "孤辰", "寡宿",
]);

/** 星耀权重口径（写入 meta 与 MD，供 AI 按权重取舍） */
const STAR_WEIGHT_NOTE =
  "星耀权重三档：主星（majorStars）＞辅星（minorStars，六吉六煞禄存天马）＞杂耀（adjectiveStars）。" +
  "杂耀再分两档——中权重（可参与断事）：红鸾天喜天姚咸池·天刑天巫天月阴煞·三台八座恩光天贵·台辅封诰龙池凤阁·华盖孤辰寡宿；" +
  "其余为低权重，仅在与主辅星同宫时作叠加参考，切勿以低权重杂耀独立断大事。";

function serializeAdjStar(star: AnyStar) {
  return { ...serializeStar(star), weight: ADJ_MID_WEIGHT.has(star.name) ? "中" : "低" };
}

/** 小限口径备注（防 AI 把小限与流年两套年系统混同） */
const AGE_NOTE =
  "小限为辅助年系统（生年支三合起、男顺女逆），与流年并行；论某年吉凶以流年四化引动为主，小限仅作叠加参考——勿把小限宫当作流年命宫，勿以小限单独断吉凶。";

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

/** 当前流年的流月一览（含闰月位、逐月格局扫描） */
function getMonthlyOfYear(z: Zwds) {
  const { astrolabe, pick, months } = z;
  if (!astrolabe) return [];
  const ix = buildChartIndex(astrolabe); // 十二流月共享一份索引
  const results: Record<string, unknown>[] = [];
  for (const cell of months) {
    const dateStr = lunarToSolarStr(pick.year, cell.month, 15, cell.leap);
    if (!dateStr) continue;
    try {
      const h = astrolabe.horoscope(dateStr, 0);
      const pats = detectHoroscopePatterns(
        astrolabe,
        "monthly",
        h.monthly.index,
        h.monthly.heavenlyStem as string,
        h.monthly.earthlyBranch as string,
        ix
      );
      results.push({
        month: cell.month,
        isLeapMonth: cell.leap,
        label: cell.label,
        ganZhi: cell.gz,
        ...serializeHoroscopeItem(h.monthly),
        patterns: pats.map((p) => `${p.name}(${p.kind})`),
      });
    } catch {
      /* skip */
    }
  }
  return results;
}

/** 当前拨盘所指的流月单元（含闰月判定） */
function currentMonthCell(z: Zwds) {
  return z.months.find((m) => m.month === z.pick.month && m.leap === z.effLeap);
}

function schoolLabel(algorithm: string): string {
  return algorithm === "zhongzhou"
    ? "中州派（王亭之体系）"
    : "南派三合（《紫微斗数全书》通行版）";
}

/** 当前大限+流年+流月的运限格局扫描（以运限命宫三方为中心，与盘面面板共用入口） */
function horoscopePatternsOf(
  z: Zwds
): { decadal: HoroPattern[]; yearly: HoroPattern[]; monthly: HoroPattern[] } | null {
  const a = z.astrolabe;
  const h = z.horoscope;
  if (!a || !h) return null;
  return scanHoroscopePatterns(a, h);
}

export function buildExportData(z: Zwds, opts: ExportOptions = {}) {
  const a = z.astrolabe;
  if (!a) return null;
  const h = z.horoscope;

  const meta = {
    app: "react-zwds",
    engine: "iztro (https://github.com/SylarLong/iztro)",
    school: schoolLabel(z.input.algorithm),
    yearDivide: z.input.yearDivide === "exact" ? "立春分界" : "正月初一分界",
    astroType:
      z.input.algorithm !== "zhongzhou" || z.input.astroType === "heaven"
        ? "天盘"
        : z.input.astroType === "earth"
          ? "地盘（身宫起局重排）"
          : "人盘（福德宫起局重排）",
    mutagenTable: MUTAGEN_TABLE_LABEL[z.input.mutagenTable],
    /** 实际生效的十干四化全表（禄/权/科/忌），生年与运限四化均依此 */
    mutagenTableDetail: Object.fromEntries(
      STEMS.map((s) => [s, util.getMutagensByHeavenlyStem(s as never) as string[]])
    ),
    dayDivide: z.input.dayDivide === "current" ? "晚子时归当日" : "晚子时归次日",
    exportedAt: new Date().toISOString(),
    note: "所有命盘分析解读请以 meta.school 指定流派为准；brightness=星耀亮度（庙旺得利平不陷），mutagen=生年四化，selfMutagens=自化（宫干四化入本宫·离心），各运限四化见 horoscope 对应层级。analysis 字段为确定性结构分析（格局/三方四正快照/飞宫矩阵/四化传导链/夹宫/借星），推理时请直接引用，勿自行重算宫位关系。本导出不含任何量化评分数据（如人生K线），吉凶请依星耀、四化、格局本身推断。palaces[].ages=各宫小限岁数（虚岁）——" + AGE_NOTE,
    starWeightNote: STAR_WEIGHT_NOTE,
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
    /** 常居住地：不参与排盘，供 AI 结合地域背景（气候、方位、迁移）辅助分析 */
    residence: z.input.residence || null,
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
    earthlyBranchOfBodyPalace: bodyPalaceBranchOf(a.palaces, a.earthlyBranchOfBodyPalace),
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
    /** weight=杂耀权重（中=可参与断事，低=仅叠加参考），口径见 meta.starWeightNote */
    adjectiveStars: p.adjectiveStars.map(serializeAdjStar),
    changsheng12: p.changsheng12,
    boshi12: p.boshi12,
    jiangqian12: p.jiangqian12,
    suiqian12: p.suiqian12,
    decadal: p.decadal,
    ages: p.ages,
    selfMutagens: getSelfMutagens(p),
  }));

  const horoscope = h
    ? {
        observedSolarDate: h.solarDate,
        observedLunarDate: h.lunarDate,
        nominalAge: h.age.nominalAge,
        pick: { ...z.pick, clampedDay: z.clampedDay },
        decadal: serializeHoroscopeItem(h.decadal),
        age: { ...serializeHoroscopeItem(h.age), nominalAge: h.age.nominalAge, note: AGE_NOTE },
        yearly: {
          ...serializeHoroscopeItem(h.yearly),
          yearlyDecStar: h.yearly.yearlyDecStar,
        },
        monthly: serializeHoroscopeItem(h.monthly),
        /* 流日/流时默认不导出：与所问主题无关时纯属噪音，择日择时场景由用户勾选附加 */
        ...(opts.withDaily ? { daily: serializeHoroscopeItem(h.daily) } : {}),
        ...(opts.withHourly ? { hourly: serializeHoroscopeItem(h.hourly) } : {}),
        yearsOfCurrentDecade: z.years,
        monthlyOfCurrentYear: getMonthlyOfYear(z),
        /** 运限格局扫描：以大限/流年命宫三方为中心（本命星曜+运限四化+运限流曜） */
        horoscopePatterns: horoscopePatternsOf(z),
      }
    : null;

  return {
    meta,
    input,
    basic,
    palaces,
    analysis: z.analysis ?? analyzeChart(a),
    horoscope,
    /** 十年规划表：一限一行（叠宫/四化/运限格局）；K线量化列不随导出 */
    decadePlan: exportDecadePlan(z),
    /** L1 知识层：推理规则速查（Markdown 文本，供 AI 直接遵循） */
    rulebook: RULEBOOK_MD,
    /** L3 知识层：十四主星四化要诀 + 分主题推理指引 */
    starEssentials: STAR_MUTAGEN_MD,
    topicGuides: topicGuidesMd(),
  };
}

/** 导出版十年规划表：仅保留确定性列（叠宫/四化/运限格局），剔除K线衍生的均值/高光/低谷 */
function exportDecadePlan(z: Zwds) {
  const a = z.astrolabe;
  if (!a) return [];
  return buildDecadePlan(a, z.decades, null).map((r) => ({
    ageRange: r.ageRange,
    gz: r.gz,
    startYear: r.startYear,
    endYear: r.endYear,
    seatName: r.seatName,
    seatBranch: r.seatBranch,
    mutagens: r.mutagens,
    patterns: r.patterns,
  }));
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

/** 二、格局与关键结构 */
function analysisPatternsMd(an: ChartAnalysis): string[] {
  const L: string[] = [];
  L.push(`## 二、格局与关键结构（程序确定性检测）`);
  L.push("");
  L.push(`> 以下按本盘星位逐一判定（含成格瑕疵与古籍出处），推理请直接引用本节结论，不要自行重推格局。`);
  L.push("");
  if (an.patterns.length) {
    L.push(`### 格局（共 ${an.patterns.length} 个）`);
    L.push("");
    an.patterns.forEach((p, i) => {
      L.push(`${i + 1}. **${p.name}**〔${p.kind}〕· ${p.where}`);
      L.push(`   - 构成：${p.basis}`);
      L.push(`   - 释义：${p.meaning}`);
      if (p.classic) L.push(`   - 古籍：${p.classic}`);
      if (p.flaw) L.push(`   - ⚠ 瑕疵：${p.flaw}`);
    });
  } else {
    L.push(`### 格局：未检出经典格局（以星情与四化论）`);
  }
  L.push("");
  L.push(`### 夹宫关系`);
  L.push("");
  if (an.jiaGong.length) {
    for (const j of an.jiaGong) {
      L.push(`- ${j.palaceName}(${j.branch}) 被**${j.kind}**〔${j.good ? "吉" : "凶"}〕——${j.detail}`);
    }
  } else {
    L.push(`- 未检出显著夹宫组合`);
  }
  L.push("");
  if (an.borrowed.length) {
    L.push(`### 空宫借星（借对宫主星论）`);
    L.push("");
    for (const b of an.borrowed) {
      L.push(`- ${b.palaceName}(${b.branch}) 无主星，借对宫【${b.oppositeName}】：${b.borrowed.join("、") || "对宫亦无主星（再借其三方论）"}`);
    }
    L.push("");
  }
  return L;
}

/** 四、三方四正快照 */
function sanfangMd(an: ChartAnalysis): string[] {
  const L: string[] = [];
  L.push(`## 四、三方四正快照（每宫会照总览）`);
  L.push("");
  L.push(`> 每宫的对宫/三合已算好并汇总会吉、会煞、生年四化会入——判断任一宫强弱直接读本表，无需再数宫位。`);
  L.push("");
  L.push(`| 宫位 | 本宫主星 | 对宫 | 三合 | 三合 | 会吉（六吉禄马） | 会煞 | 生年四化会入 |`);
  L.push(`|---|---|---|---|---|---|---|---|`);
  for (const s of an.sanfang) {
    const [self, opp, t1, t2] = s.seats;
    const cell = (x: (typeof s.seats)[number]) => `${x.palaceName}(${x.branch})：${x.majors}`;
    L.push(
      `| **${s.palaceName}(${s.branch})** | ${self.majors} | ${cell(opp)} | ${cell(t1)} | ${cell(t2)} | ${
        s.auspicious.join("、") || "无"
      } | ${s.inauspicious.join("、") || "无"} | ${s.natalMutagens.join("、") || "无"} |`
    );
  }
  L.push("");
  const borrowedNotes = an.sanfang.filter((s) => s.borrowed);
  for (const s of borrowedNotes) L.push(`> ${s.palaceName}(${s.branch})：${s.borrowed}`);
  if (borrowedNotes.length) L.push("");
  return L;
}

/** 五、飞宫四化全矩阵 */
function flyMatrixMd(an: ChartAnalysis): string[] {
  const L: string[] = [];
  const fm = an.flyMatrix;
  L.push(`## 五、飞宫四化全矩阵（十二宫互飞）`);
  L.push("");
  L.push(`> ${fm.note}`);
  L.push("");
  L.push(`| 宫（干支） | 化禄 | 化权 | 化科 | 化忌 |`);
  L.push(`|---|---|---|---|---|`);
  for (const pf of fm.palaces) {
    const cell = (k: number) => {
      const f = pf.flies[k];
      if (!f) return "-";
      if (f.isSelf) return `${f.star}→**本宫**（自化${f.mutagen}·离心）`;
      return `${f.star}→${f.toName}${f.isOpposite ? "（冲本宫方向）" : ""}`;
    };
    L.push(`| **${pf.palaceName}**（${pf.stem}${pf.branch}） | ${cell(0)} | ${cell(1)} | ${cell(2)} | ${cell(3)} |`);
  }
  L.push("");
  const outward = fm.palaces.filter((p) => p.selfOutward.length);
  const inward = fm.palaces.filter((p) => p.selfInward.length);
  if (outward.length) {
    L.push(`- **离心自化汇总**：${outward.map((p) => `${p.palaceName}(${p.selfOutward.join("、")})`).join("；")}`);
  }
  if (inward.length) {
    L.push(`- **向心自化汇总**：${inward.map((p) => `${p.palaceName}(${p.selfInward.join("、")})`).join("；")}`);
  }
  L.push("");
  const mc = an.mutagenChains;
  L.push(`### 四化传导链（两转三转）`);
  L.push("");
  L.push(`> ${mc.note}`);
  L.push("");
  L.push(`- **忌链**（十二宫为链首）：`);
  for (const c of mc.ji) L.push(`  - ${c.text}`);
  L.push(`- **禄链**（十二宫为链首）：`);
  for (const c of mc.lu) L.push(`  - ${c.text}`);
  L.push("");
  return L;
}

export function buildExportMd(z: Zwds, opts: ExportOptions = {}): string | null {
  const a = z.astrolabe;
  if (!a) return null;
  const h = z.horoscope;
  const an = z.analysis ?? analyzeChart(a);
  const L: string[] = [];

  L.push(`# 紫微斗数命盘（AI 分析用）`);
  L.push("");
  const astroTypeLabel =
    z.input.algorithm === "zhongzhou" && z.input.astroType !== "heaven"
      ? ` · 盘型：${z.input.astroType === "earth" ? "地盘（身宫起局重排）" : "人盘（福德宫起局重排）"}`
      : "";
  L.push(`> 排盘引擎：iztro · 安星流派：**${schoolLabel(z.input.algorithm)}** · 年/运限分界：${
    z.input.yearDivide === "exact" ? "立春" : "正月初一"
  }${astroTypeLabel} · 四化表：**${MUTAGEN_TABLE_LABEL[z.input.mutagenTable]}**（全表见附录B） · ${
    z.input.dayDivide === "current" ? "晚子时归当日" : "晚子时归次日"
  } · 导出时间：${new Date().toLocaleString("zh-CN")}`);
  L.push(`> 星名后括号为亮度（庙旺得利平不陷），【生年X】为生年四化；各运限四化在对应章节单列。`);
  L.push(`> ${STAR_WEIGHT_NOTE}`);
  L.push(`> 本文件不含任何量化评分数据（如人生K线），吉凶请依星耀、四化、格局本身推断。`);
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
      `| 真太阳时 | ${z.trueSolar.trueDate} ${z.trueSolar.trueTime}（出生地 ${z.trueSolar.place}，经度 ${z.trueSolar.longitude}°；钟表 ${z.trueSolar.clockDate} ${z.trueSolar.clockTime}，偏移 ${z.trueSolar.offsetMinutes.toFixed(1)} 分，其中均时差 ${z.trueSolar.eotMinutes.toFixed(1)} 分）→ 已按真太阳时排盘 |`
    );
  }
  L.push(`| 四柱干支 | ${a.chineseDate} |`);
  L.push(`| 五行局 | ${a.fiveElementsClass}（${z.decades[0]?.range[0] ?? "?"} 岁上运，虚岁） |`);
  L.push(`| 命主 / 身主 | ${a.soul} / ${a.body} |`);
  L.push(`| 命宫 / 身宫 | ${a.earthlyBranchOfSoulPalace} / ${bodyPalaceBranchOf(a.palaces, a.earthlyBranchOfBodyPalace)} |`);
  const origin = a.palaces.find((p) => p.isOriginalPalace);
  if (origin) L.push(`| 来因宫 | ${origin.name}（${origin.earthlyBranch}） |`);
  L.push(`| 生肖 / 星座 | ${a.zodiac} / ${a.sign} |`);
  if (z.input.residence)
    L.push(`| 常居住地 | ${z.input.residence}（不参与排盘，供地域/方位/迁移背景参考） |`);
  L.push("");

  /* 二、格局与关键结构 */
  L.push(...analysisPatternsMd(an));

  /* 三、十二宫详情（命宫起，逆布） */
  L.push(`## 三、十二宫详情`);
  L.push("");
  const soul = z.soulPalaceIndex >= 0 ? z.soulPalaceIndex : 0;
  for (let k = 0; k < 12; k++) {
    const p = a.palaces[fixIndex(soul - k)];
    if (!p) continue;
    const marks = [p.isBodyPalace ? "【身宫】" : "", p.isOriginalPalace ? "【来因宫】" : ""].join("");
    L.push(`### ${k + 1}. ${p.name}${marks}（${p.heavenlyStem}${p.earthlyBranch}）`);
    L.push("");
    L.push(`- 主星：${starList(p.majorStars)}`);
    if (!p.majorStars.length) {
      const opp = a.palaces[fixIndex(p.index + 6)];
      L.push(
        `- 借星：无主星，借对宫【${opp.name}】${starList(opp.majorStars)}（借星力量略减，兼看其四化）`
      );
    }
    L.push(`- 辅星：${starList(p.minorStars)}`);
    const adjMid = p.adjectiveStars.filter((s) => ADJ_MID_WEIGHT.has(s.name));
    const adjLow = p.adjectiveStars.filter((s) => !ADJ_MID_WEIGHT.has(s.name));
    L.push(`- 杂耀·中权重：${starList(adjMid)}；低权重（仅叠加参考）：${starList(adjLow)}`);
    const selfMuts = getSelfMutagens(p);
    if (selfMuts.length) {
      L.push(
        `- 自化（宫干${p.heavenlyStem}四化入本宫·离心）：${selfMuts
          .map((x) => `${x.star}化${x.mutagen}`)
          .join("、")}`
      );
    }
    L.push(`- 长生十二神：${p.changsheng12}；博士十二神：${p.boshi12}`);
    L.push(`- 岁前十二神：${p.suiqian12}；将前十二神：${p.jiangqian12}`);
    L.push(`- 大限：${p.decadal.range.join("~")} 岁（${p.decadal.heavenlyStem}${p.decadal.earthlyBranch}）；小限岁数：${p.ages.join("、")}`);
    L.push("");
  }

  /* 四、三方四正快照 + 五、飞宫四化 */
  L.push(...sanfangMd(an));
  L.push(...flyMatrixMd(an));

  /* 六、当前观测运限 */
  if (h) {
    L.push(`## 六、当前观测运限`);
    L.push("");
    L.push(
      `- 观测点：公历 ${h.solarDate}（农历 ${h.lunarDate}），虚岁 ${h.age.nominalAge}`
    );
    const dec = z.activeDecadeIdx >= 0 ? z.decades[z.activeDecadeIdx] : null;
    let seq = `- 当前序列：${
      dec ? `大限 ${dec.range[0]}~${dec.range[1]}（${dec.heavenlyStem}${dec.earthlyBranch}）` : "童限"
    } → 流年 ${z.pick.year} → 流月 ${currentMonthCell(z)?.label ?? z.pick.month}（${
      currentMonthCell(z)?.gz ?? ""
    }）`;
    if (opts.withDaily)
      seq += ` → 流日 ${z.days[z.clampedDay - 1]?.label ?? z.clampedDay}（${z.days[z.clampedDay - 1]?.gz ?? ""}）`;
    if (opts.withHourly)
      seq += ` → 流时 ${z.hours[z.pick.hour]?.label ?? ""}（${z.hours[z.pick.hour]?.gz ?? ""}）`;
    L.push(seq);
    L.push("");

    /* 运限格局提示（程序确定性扫描） */
    const hp = horoscopePatternsOf(z);
    if (hp && (hp.decadal.length || hp.yearly.length)) {
      L.push(`### 运限格局提示（以运限命宫三方扫描，直接引用勿重推）`);
      L.push("");
      const dump = (label: string, list: HoroPattern[]) => {
        if (!list.length) {
          L.push(`- ${label}：未检出显著运限格局`);
          return;
        }
        for (const p of list) {
          L.push(`- ${label}【${p.name}】〔${p.kind}〕${p.basis}——${p.meaning}`);
        }
      };
      dump(
        `大限（${dec ? `${dec.heavenlyStem}${dec.earthlyBranch} ${dec.range[0]}~${dec.range[1]}岁` : "童限"}）`,
        hp.decadal
      );
      dump(`流年（${z.pick.year} ${h.yearly.heavenlyStem}${h.yearly.earthlyBranch}）`, hp.yearly);
      L.push("");
    }

    L.push(scopeSection(a, "decadal", h.decadal, `（${dec ? `${dec.range[0]}~${dec.range[1]}岁` : "童限"}）`));
    const ageSeat = a.palaces[h.age.index];
    L.push(`### 小限（虚岁 ${h.age.nominalAge}）`);
    L.push("");
    L.push(`> ${AGE_NOTE}`);
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
    L.push(scopeSection(a, "monthly", h.monthly, `（${currentMonthCell(z)?.label ?? ""}）`));
    /* 流日/流时默认不导出（择日择时勾选附加），防无关层级稀释 AI 注意力 */
    if (opts.withDaily) L.push(scopeSection(a, "daily", h.daily, `（${z.days[z.clampedDay - 1]?.label ?? ""}）`));
    if (opts.withHourly) L.push(scopeSection(a, "hourly", h.hourly, `（${z.hours[z.pick.hour]?.label ?? ""}）`));
  }

  /* 七、十年规划表（十二大限总览） */
  const plan = exportDecadePlan(z);
  if (plan.length) {
    L.push(`## 七、十年规划表（十二大限总览）`);
    L.push("");
    L.push(`> 一限一行：叠宫=该十年主题；运限格局为该限三方扫描（程序确定性检测，直接引用）。`);
    L.push("");
    L.push(`| 大限(虚岁) | 干支 | 公历 | 命宫叠 | 四化(禄/权/科/忌) | 运限格局 |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const r of plan) {
      L.push(
        `| ${r.ageRange} | ${r.gz} | ${r.startYear}~${r.endYear} | ${r.seatName}（${r.seatBranch}） | ${r.mutagens.join(" / ")} | ${
          r.patterns.length ? r.patterns.map((p) => `${p.name}〔${p.kind}〕`).join("、") : "—"
        } |`
      );
    }
    L.push("");
  }

  /* 八、当年十二流月总览 */
  const my = getMonthlyOfYear(z);
  if (my.length) {
    L.push(`## 八、${z.pick.year} 年十二流月总览`);
    L.push("");
    L.push(`| 流月 | 干支 | 流月命宫落宫 | 四化（禄/权/科/忌） | 格局提示 |`);
    L.push(`|---|---|---|---|---|`);
    for (const m of my) {
      const idx = m.index as number;
      const seat = a.palaces[idx];
      const pats = (m.patterns as string[]) ?? [];
      L.push(
        `| ${m.label} | ${m.ganZhi} | ${seat?.name}（${seat?.earthlyBranch}） | ${(m.mutagen as string[]).join(" / ")} | ${pats.join("、") || "—"} |`
      );
    }
    L.push("");
  }

  L.push(`## 九、AI 推理指引`);
  L.push("");
  L.push(`将本文件整体提供给 AI 并附上您的问题。建议同时粘贴以下指令（可直接复制）：`);
  L.push("");
  L.push(`> 请以严谨的紫微斗数分析师身份，严格依据本文件数据推理：`);
  L.push(
    `> 1. 先复述盘面骨架——命宫主星与亮度、第二节已检出的格局、生年四化落宫——确认无误后再展开分析；`
  );
  L.push(
    `> 2. 三方四正、格局、飞宫四化、夹宫、借星均已在第二/四/五节确定性算好，请直接引用，不要自行重算宫位关系；若需推衍文中未列的关系，按宫位环形计算（对宫=隔六位，三合=前后各隔四位）；`
  );
  L.push(`> 3. 推理次序：本命（性格/禀赋/格局）→ 大限定十年基调 → 流年四化引动断当年吉凶 → 流月定应期；`);
  L.push(
    `> 4. 每个论断须注明依据（引用具体宫位/星耀/四化/格局），并区分「结构必然 / 大概率 / 倾向参考」三档确定度；`
  );
  L.push(`> 5. 推理框架遵循附录A《规则速查》；星情与四化事象反应遵循附录C；按提问主题取用附录D对应小节的宫位组合与检查清单；流派口径以本文件 meta 与附录B为准，不得改星、改宫、改四化。`);
  L.push(
    `> 6. 如需切换为**飞宫四化视角**（以四化流向为主轴论盘），直接引用第五节全矩阵与传导链：忌链看压力/亏欠流向，禄链看资源/情义流向，配合离心/向心自化论收放——仍以本文件已算好的矩阵为准，勿自行重飞。`
  );
  if (z.input.residence) {
    L.push(
      `> 7. 命主常居住地为「${z.input.residence}」（不参与排盘），涉及迁移宫、方位喜忌、异地发展等议题时结合参考。`
    );
  }
  L.push("");
  L.push(`常见问题示例（附建议取用素材）：`);
  L.push("");
  L.push(`- 我的性格优劣势与适合的行业方向？——命宫/官禄/福德三方四正快照 + 第二节格局`);
  L.push(`- 某年运势如何，宜进取还是防守？——该年流年四化与运限格局（第六/八节）+ 流年命宫三方会照`);
  L.push(`- 感情婚姻的走势与要点？——夫妻宫三方四正快照 + 夫妻宫飞宫四化 + 大限夫妻宫叠宫`);
  L.push(`- 近十年何时适合创业/置业/转型？——十二大限总览（第七节）+ 各限四化与运限格局 + 官禄/田宅宫引动`);
  L.push("");

  /* 附录A：推理规则速查（L1 知识层） */
  L.push(RULEBOOK_MD);

  /* 附录B：本盘实际生效的十干四化表 */
  L.push(`## 附录B：本盘所用十干四化表（${MUTAGEN_TABLE_LABEL[z.input.mutagenTable]}）`);
  L.push("");
  L.push(`| 天干 | 化禄 | 化权 | 化科 | 化忌 |`);
  L.push(`|---|---|---|---|---|`);
  for (const s of STEMS) {
    const t = util.getMutagensByHeavenlyStem(s as never) as string[];
    L.push(`| ${s} | ${t[0]} | ${t[1]} | ${t[2]} | ${t[3]} |`);
  }
  L.push("");
  L.push(`> 本文件所有生年四化、运限四化、飞宫四化、自化均依上表推算，AI 分析时请以此表为准。`);
  L.push("");

  /* 附录C：十四主星四化要诀 + 附录D：分主题推理指引（L3 知识层） */
  L.push(STAR_MUTAGEN_MD);
  L.push(topicGuidesMd());

  return L.join("\n");
}

/* ─────────────── 下载 ─────────────── */

export function download(filename: string, content: string, mime: string) {
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

/** 日期补零便于文件名排序：2000-8-16 → 2000-08-16 */
function padSolarDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : s;
}

/**
 * 导出文件名：`紫微斗数_姓名_YYYY-MM-DD_HH-mm`（参照 react-8char 带出生时刻，
 * 便于区分同日不同时辰的盘）。时刻取**实际排盘所用**时刻——真太阳时校正后的
 * 时刻优先；未启用真太阳时（无精确时刻）则用时辰名（如 `寅时`），不编造分钟数。
 * 勾选附加流日/流时时追加观测点（`_流日2026-06-29_流时午时`）：同一张盘的
 * 多份导出（择日/择时各一份）不致重名互相覆盖，也能一眼看出择的是哪天哪时。
 */
export function baseFilename(z: Zwds, opts: ExportOptions = {}): string {
  const name = (z.input.name || "无名").replace(/[\\/:*?"<>|\s]/g, "");
  const a = z.astrolabe;
  const date = padSolarDate(a?.solarDate ?? "");
  const clock = z.trueSolar?.trueTime;
  const time = clock ? clock.replace(":", "-") : ((a?.time as string) ?? "");
  let s = `紫微斗数_${name}_${date}${time ? `_${time}` : ""}`;
  if (opts.withDaily) s += `_流日${padSolarDate(z.targetSolar ?? "")}`;
  if (opts.withHourly) s += `_流时${z.hours?.[z.pick.hour]?.label ?? ""}`;
  return s;
}

/** TOON 场景下的推理指引（字段路径版，替代 MD 的章节号引用） */
const TOON_GUIDE = `# 紫微斗数命盘（AI 分析用 · TOON 数据 + 知识附录）

> 本文件依次为：①推理指引 ②TOON 结构化命盘数据 ③附录A规则速查 / 附录C星情要诀 / 附录D主题指引。
> TOON 为面向 LLM 的紧凑编码：\`键[N]{字段}:\` 表头后逐行为对应值，缩进表层级。

请以严谨的紫微斗数分析师身份，严格依据数据推理：
1. 先复述盘面骨架（basic 基本信息 + analysis.patterns 已检出格局 + 生年四化落宫），确认无误再分析；
2. 三方四正、格局、飞宫四化、夹宫、借星均已确定性算好——直接引用 analysis.sanfang / analysis.patterns / analysis.flyMatrix / analysis.jiaGong / analysis.borrowed 与 horoscope.horoscopePatterns（运限格局），不要自行重算宫位关系；若需推衍未列关系，按 palaces[].index 环形计算（0=寅，对宫=+6，三合=±4）；
3. 推理次序：本命（性格/禀赋/格局）→ 大限（horoscope.decadal 与 decadePlan 十年规划表）→ 流年（horoscope.yearly + horoscope.horoscopePatterns.yearly 运限格局）→ 流月（horoscope.monthlyOfCurrentYear 逐月四化与格局，定应期）；
4. 每个论断注明依据（引用具体字段），区分「结构必然 / 大概率 / 倾向参考」三档确定度；
5. 口径以 meta 为准（meta.mutagenTableDetail 为实际生效四化全表），推理框架遵循下方附录A，星情与四化事象遵循附录C，按提问主题取用附录D对应小节；
6. 星耀权重按 meta.starWeightNote 与 palaces[].adjectiveStars[].weight 取舍——低权重杂耀仅叠加参考，勿独立断大事；小限（horoscope.age 与 palaces[].ages）为辅助年系统，勿与流年混同（口径见 horoscope.age.note）；
7. 如需切换为飞宫四化视角（以四化流向为主轴论盘），直接引用 analysis.flyMatrix 与 analysis.mutagenChains——忌链看压力/亏欠流向，禄链看资源/情义流向，勿自行重飞。`;

/** 由现成 TOON 文本组装 AI 载荷（底部导出面板已持有 TOON 时复用，避免重复构建） */
export function assembleAiPayload(toon: string): string {
  return [
    TOON_GUIDE,
    "```toon",
    toon,
    "```",
    RULEBOOK_MD,
    STAR_MUTAGEN_MD,
    topicGuidesMd(),
  ].join("\n\n");
}

/**
 * 「复制给 AI」的完整载荷：TOON 数据 + 推理指引 + 知识附录（A规则/C星情/D主题）。
 * 比 MD 全文省 token，又不丢失知识层。
 */
export function buildExportAiText(z: Zwds, opts: ExportOptions = {}): string | null {
  const toon = buildExportToon(z, opts);
  if (!toon) return null;
  return assembleAiPayload(toon);
}

/**
 * TOON 导出（Token-Oriented Object Notation，https://github.com/toon-format/toon）：
 * 与 JSON 同一数据、面向 LLM 的紧凑表格化编码（均匀数组转表头+行）。
 * 长篇知识附录（规则速查/星情要诀/主题指引）为 Markdown 文本，剥离并注明见 MD 导出。
 */
export function buildExportToon(z: Zwds, opts: ExportOptions = {}): string | null {
  const data = buildExportData(z, opts);
  if (!data) return null;
  const { rulebook, starEssentials, topicGuides, ...rest } = data;
  void rulebook;
  void starEssentials;
  void topicGuides;
  const meta = {
    ...rest.meta,
    format: "TOON v2（表格化数组：字段头+逐行值）",
    note: `${rest.meta.note} 知识附录（推理规则速查/星情要诀/主题指引）未随 TOON 携带，见 Markdown 导出附录A/C/D。`,
  };
  return toonEncode({ ...rest, meta });
}

