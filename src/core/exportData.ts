/**
 * AI 导出：把整张命盘 + 当前运限序列化为 JSON / Markdown，
 * 供用户下载后上传给 AI 推理（结构参照 react-iztro 的 astrolabeToJson 并扩展）。
 */
import { util } from "iztro";
import type { Astrolabe, Horoscope, Zwds } from "./useZwds";
import { MUTAGEN_CHARS, MUTAGEN_TABLE_LABEL, SCOPE_META, STEMS, fixIndex, type Scope } from "./utils";
import { lunarToSolarStr } from "./lunar";
import { encode as toonEncode } from "@toon-format/toon";
import { analyzeChart, type ChartAnalysis } from "./analysis";
import { buildMonthlyKline } from "./lifeKline";
import { RULEBOOK_MD, STAR_MUTAGEN_MD, topicGuidesMd } from "./knowledge";

/** 本宫自化（离心）：宫干四化命中本宫主星/辅星 */
function getSelfMutagens(p: Astrolabe["palaces"][number]) {
  const table = util.getMutagensByHeavenlyStem(p.heavenlyStem) as string[];
  const own = new Set([...p.majorStars, ...p.minorStars].map((s) => s.name as string));
  return table
    .map((star, k) => ({ star, mutagen: MUTAGEN_CHARS[k] }))
    .filter((x) => own.has(x.star));
}

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

/** 当前流年的流月一览（含闰月位） */
function getMonthlyOfYear(z: Zwds) {
  const { astrolabe, pick, months } = z;
  if (!astrolabe) return [];
  const results: Record<string, unknown>[] = [];
  for (const cell of months) {
    const dateStr = lunarToSolarStr(pick.year, cell.month, 15, cell.leap);
    if (!dateStr) continue;
    try {
      const h = astrolabe.horoscope(dateStr, 0);
      results.push({
        month: cell.month,
        isLeapMonth: cell.leap,
        label: cell.label,
        ganZhi: cell.gz,
        ...serializeHoroscopeItem(h.monthly),
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

export function buildExportData(z: Zwds) {
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
    note: "所有命盘分析解读请以 meta.school 指定流派为准；brightness=星耀亮度（庙旺得利平不陷），mutagen=生年四化，selfMutagens=自化（宫干四化入本宫·离心），各运限四化见 horoscope 对应层级。analysis 字段为确定性结构分析（格局/三方四正快照/飞宫矩阵/夹宫/借星），推理时请直接引用，勿自行重算宫位关系。",
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
    selfMutagens: getSelfMutagens(p),
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

  return {
    meta,
    input,
    basic,
    palaces,
    analysis: z.analysis ?? analyzeChart(a),
    horoscope,
    lifeKline: serializeLifeKline(z),
    /** L1 知识层：推理规则速查（Markdown 文本，供 AI 直接遵循） */
    rulebook: RULEBOOK_MD,
    /** L3 知识层：十四主星四化要诀 + 分主题推理指引 */
    starEssentials: STAR_MUTAGEN_MD,
    topicGuides: topicGuidesMd(),
  };
}

/** 选中年逐月细化（12 域；factors 仅命宫域附带以控制体积） */
function serializeMonthly(z: Zwds) {
  const lk = z.lifeKline;
  const a = z.astrolabe;
  if (!lk || !a) return null;
  const rows = lk.domains
    .map((d) => {
      const y = d.years.find((x) => x.year === z.pick.year);
      if (!y) return null;
      const mk = buildMonthlyKline(a, d.palaceIndex, z.pick.year, { open: y.open, close: y.close });
      if (!mk) return null;
      return {
        domain: d.label,
        palaceName: d.palaceName,
        months: mk.months.map((m) => ({
          label: m.label,
          gz: m.gz,
          score: m.score,
          delta: m.delta,
          gain: m.gain,
          drain: m.drain,
          pattern: m.pattern,
          ...(d.palaceName === "命宫" ? { factors: m.factors } : {}),
        })),
      };
    })
    .filter(Boolean);
  return rows.length ? { year: z.pick.year, note: "月K线：月干四化+月支冲合+月曜引动，定应期月份；分值以该域该年年K轨迹为基准。", domains: rows } : null;
}

/** 人生K线导出：紧凑逐年序列 + 各域高光/低谷（带计分原因） */
function serializeLifeKline(z: Zwds) {
  const lk = z.lifeKline;
  if (!lk?.domains.length) return null;
  const domains = lk.domains.map((d) => {
    const sorted = [...d.years].sort((a, b) => b.score - a.score);
    // 动能最大（无论好坏）——用于点出「大进大出」类年份
    const turbulent = [...d.years].sort((a, b) => b.magnitude - a.magnitude);
    const pick = (y: (typeof d.years)[number]) => ({
      year: y.year,
      ganZhi: y.ganZhi,
      age: y.age,
      score: y.score,
      net: y.net,
      gain: y.gain,
      drain: y.drain,
      magnitude: y.magnitude,
      pattern: y.pattern,
      drainNature: y.drainNature || undefined,
      factors: y.factors,
    });
    const cur = d.years.find((y) => y.year === z.pick.year);
    return {
      palaceName: d.palaceName,
      label: d.label,
      earthlyBranch: d.branch,
      isBodyPalace: d.isBody,
      baseline: d.baseline,
      baselineNotes: d.baselineNotes,
      sanfangsizheng: d.compose,
      decadeAvg: d.decadeAvg,
      // 逐年：score=净运势, net=进-出, gain=进, drain=出, pattern=形态
      series: d.years.map((y) => ({
        year: y.year,
        age: y.age,
        score: y.score,
        delta: y.delta,
        gain: y.gain,
        drain: y.drain,
        pattern: y.pattern,
      })),
      highlights: sorted.slice(0, 3).map(pick),
      lowlights: sorted.slice(-3).reverse().map(pick),
      mostTurbulent: turbulent.slice(0, 3).map(pick),
      currentYear: cur ? pick(cur) : null,
    };
  });
  return {
    note: lk.note,
    monthlyOfSelectedYear: serializeMonthly(z),
    legend: "score/净=净运势(涨跌)；gain/进=禄权科·流禄·流马·六合动能；drain/出=忌·冲·流羊陀·自化漏动能；pattern=顺遂/大进大出/破耗/平稳/平；drainNature=出项性质(主动自化漏/被动忌冲/纠缠忌入/双忌叠加/禄忌交缠)。忌落对宫按冲本宫加重；大限忌+流年忌同引=双忌叠加非线性放大。判断某年好坏须同时看 净 与 进出：大进大出=净或有限但动能大、得失起伏，非单纯好或坏。",
    domains,
  };
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
  return L;
}

export function buildExportMd(z: Zwds): string | null {
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
  L.push(`| 命宫 / 身宫 | ${a.earthlyBranchOfSoulPalace} / ${a.earthlyBranchOfBodyPalace} |`);
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
    L.push(`- 杂耀：${starList(p.adjectiveStars)}`);
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
    L.push(
      `- 当前序列：${
        dec ? `大限 ${dec.range[0]}~${dec.range[1]}（${dec.heavenlyStem}${dec.earthlyBranch}）` : "童限"
      } → 流年 ${z.pick.year} → 流月 ${currentMonthCell(z)?.label ?? z.pick.month}（${
        currentMonthCell(z)?.gz ?? ""
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
    L.push(scopeSection(a, "monthly", h.monthly, `（${currentMonthCell(z)?.label ?? ""}）`));
    L.push(scopeSection(a, "daily", h.daily, `（${z.days[z.clampedDay - 1]?.label ?? ""}）`));
    L.push(scopeSection(a, "hourly", h.hourly, `（${z.hours[z.pick.hour]?.label ?? ""}）`));
  }

  /* 七、十二大限总览 */
  const all = getAllDecadals(z);
  if (all.length) {
    L.push(`## 七、十二大限总览`);
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

  /* 八、当年十二流月总览 */
  const my = getMonthlyOfYear(z);
  if (my.length) {
    L.push(`## 八、${z.pick.year} 年十二流月总览`);
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

  /* 九、人生K线（分域量化参考） */
  const lk = z.lifeKline;
  if (lk?.domains.length) {
    L.push(`## 九、人生K线（分域量化参考）`);
    L.push("");
    L.push(`> ${lk.note}`);
    L.push("");
    L.push(`### 各域概览（十二宫）`);
    L.push("");
    L.push(
      `| 域（宫·支） | 三方四正 | 基调 | 高光年(净) | 低谷年(净) | 动能最大年(形态) | 当前${z.pick.year}年 |`
    );
    L.push(`|---|---|---|---|---|---|---|`);
    for (const d of lk.domains) {
      const sorted = [...d.years].sort((a, b) => b.score - a.score);
      const turbulent = [...d.years].sort((a, b) => b.magnitude - a.magnitude);
      const top = sorted[0];
      const bot = sorted[sorted.length - 1];
      const tur = turbulent[0];
      const cur = d.years.find((y) => y.year === z.pick.year);
      const bodyMark = d.isBody ? "·身" : "";
      L.push(
        `| ${d.label}（${d.palaceName}${d.branch}${bodyMark}） | ${d.compose} | ${
          d.baseline >= 0 ? "+" : ""
        }${d.baseline} | ${top ? `${top.year}(${top.score})` : "-"} | ${
          bot ? `${bot.year}(${bot.score})` : "-"
        } | ${tur ? `${tur.year}(${tur.pattern})` : "-"} | ${
          cur ? `${cur.score}·${cur.pattern}` : "-"
        } |`
      );
    }
    L.push("");
    L.push(
      `> 读法：**净=运势涨跌，进(禄权科·流禄·流马·六合)/出(忌·冲·流羊陀·自化漏)是两股动能**。故「大进大出」年（进出都大、净有限）不是简单的好或坏——如财帛该年赚得多也花/破得多，须看出项性质：主动(自化漏，多为自己花用/投资)、被动(忌冲，多为官非·罚款·外来破财)、纠缠(忌入，是非缠身)。忌落对宫按「冲本宫」加重；大限忌+流年忌同引=**双忌叠加**非线性放大；流马会禄=**禄马交驰**动中得财；流禄落生年忌宫=**禄忌交缠**变动年。命-财帛-官禄同一三合三角会同步；夫妻/迁移/福德、兄弟/疾厄/田宅、子女/交友/父母各自成组分化。身宫所在宫基调 +2 标「身」。`
    );
    L.push("");
    const overall = lk.domains.find((d) => d.palaceName === "命宫") ?? lk.domains[0];
    const cur = overall.years.find((y) => y.year === z.pick.year);
    if (cur) {
      L.push(`### 综合（命宫）当前 ${cur.year} ${cur.ganZhi} 明细`);
      L.push("");
      L.push(
        `- ${cur.score} 分（较上年 ${cur.delta >= 0 ? "+" : ""}${cur.delta}）· 形态：**${cur.pattern}** · 进 ${cur.gain} / 出 ${cur.drain} / 净 ${cur.net >= 0 ? "+" : ""}${cur.net}${cur.drainNature ? ` · 出项：${cur.drainNature}` : ""}`
      );
      for (const f of cur.factors.length ? cur.factors : ["平年（三方四正无显著引动）"]) L.push(`  - ${f}`);
      L.push("");
    }

    /* 命宫域选中年逐月细化（月K线） */
    const curYearData = overall.years.find((y) => y.year === z.pick.year);
    if (curYearData && a) {
      const mk = buildMonthlyKline(a, overall.palaceIndex, z.pick.year, {
        open: curYearData.open,
        close: curYearData.close,
      });
      if (mk) {
        L.push(`### 命宫域 ${z.pick.year} 年逐月细化（月K线）`);
        L.push("");
        L.push(`> ${mk.note}`);
        L.push("");
        L.push(`| 月 | 干支 | 分 | 较上月 | 进 | 出 | 形态 |`);
        L.push(`|---|---|---|---|---|---|---|`);
        for (const m of mk.months) {
          L.push(
            `| ${m.label} | ${m.gz} | ${m.score} | ${m.delta >= 0 ? "+" : ""}${m.delta} | ${m.gain} | ${m.drain} | ${m.pattern} |`
          );
        }
        L.push("");
        const curM = mk.months.find((m) => m.month === z.pick.month && m.leap === z.effLeap);
        if (curM) {
          L.push(`- 当前观测月【${curM.label}（${curM.gz}）】明细：`);
          for (const f of curM.factors.length ? curM.factors : ["平月（无显著引动）"]) {
            L.push(`  - ${f}`);
          }
          L.push("");
        }
      }
    }
  }

  L.push(`## 十、AI 推理指引`);
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
  if (z.input.residence) {
    L.push(
      `> 6. 命主常居住地为「${z.input.residence}」（不参与排盘），涉及迁移宫、方位喜忌、异地发展等议题时结合参考。`
    );
  }
  L.push("");
  L.push(`常见问题示例（附建议取用素材）：`);
  L.push("");
  L.push(`- 我的性格优劣势与适合的行业方向？——命宫/官禄/福德三方四正快照 + 第二节格局`);
  L.push(`- 某年运势如何，宜进取还是防守？——该年流年四化（第六/八节）+ 人生K线该年进/出/净与形态（第九节）`);
  L.push(`- 感情婚姻的走势与要点？——夫妻宫三方四正快照 + 夫妻宫飞宫四化 + 大限夫妻宫叠宫`);
  L.push(`- 近十年何时适合创业/置业/转型？——十二大限总览（第七节）+ K线高光年 + 官禄/田宅域曲线`);
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

/**
 * TOON 导出（Token-Oriented Object Notation，https://github.com/toon-format/toon）：
 * 与 JSON 同一数据、面向 LLM 的紧凑表格化编码（均匀数组转表头+行）。
 * 长篇知识附录（规则速查/星情要诀/主题指引）为 Markdown 文本，剥离并注明见 MD 导出。
 */
export function buildExportToon(z: Zwds): string | null {
  const data = buildExportData(z);
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

export function downloadToon(z: Zwds) {
  const toon = buildExportToon(z);
  if (!toon) return;
  download(`${baseFilename(z)}.toon`, toon, "text/plain;charset=utf-8");
}

export function downloadMd(z: Zwds) {
  const md = buildExportMd(z);
  if (!md) return;
  download(`${baseFilename(z)}.md`, md, "text/markdown;charset=utf-8");
}
