/**
 * 合盘（双人相性）：以传统斗数互参法确定性评分三个维度——
 *   姻缘（婚恋）/ 事业合伙（正财协作）/ 金钱财路（合伙搞钱·偏财）。
 *
 * 方法（性别无关，同性/异性通用）：
 *   1. 年支关系：六合/三合/对冲/相刑/相害/自刑/同支（两人生年太岁相性）
 *   2. 命宫支关系：同上表，权重 0.8（宫位气场相性）
 *   3. 五行局生克：相生（注明谁生谁）/ 相克 / 同局
 *   4. 太岁入卦（双向）：对方生年支落我命盘何宫——落夫妻=正缘位、落兄弟=合伙位、
 *      落财帛=财缘位……（张盛舒太岁入卦法）
 *   5. 生年四化互飞（双向）：对方年干四化打入我盘——禄=带缘带财、权=推动主导、
 *      科=贵人和缓、忌=纠缠亏欠（忌入亦主缘深，明细注明）
 *   6. 红鸾/天喜对照（双向）：我盘红鸾（天喜）所坐宫支恰为对方年支=典型婚恋缘
 *
 * 三维得分 = 50 + Σ各因子按宫位亲和度分配，收敛 [5,95]。确定性推演，仅供参考。
 */
import { util } from "iztro";
import type { Astrolabe } from "./useZwds";
import { MUTAGEN_CHARS, branchRelation, yearGanZhi } from "./utils";
import { lunarToSolarStr } from "./lunar";
import { detectHoroscopePatterns, type HoroPattern } from "./analysis";
import type { LifeKlineData } from "./lifeKline";

export type SynDimScores = { love: number; career: number; wealth: number };

export type SynFactor = {
  /** 方向：A→B（A 给 B 的作用）/ B→A / 互（对称关系） */
  dir: "A→B" | "B→A" | "互";
  text: string;
  /** [姻缘, 事业, 金钱] 增减 */
  delta: [number, number, number];
};

export type SynPerson = {
  name: string;
  gender: string;
  yearGz: string;
  soulBranch: string;
  soulMajors: string;
  fiveElements: string;
};

export type SynastryResult = {
  a: SynPerson;
  b: SynPerson;
  /** 概览行：年支/命支/五行局关系 */
  relations: string[];
  scores: SynDimScores;
  factors: SynFactor[];
  summary: string[];
  note: string;
};

/** 宫位对三维（姻缘/事业/金钱）的亲和度：四化入宫、太岁入宫按此分配 */
const PALACE_DIM: Record<string, [number, number, number]> = {
  命宫: [5, 5, 5],
  夫妻: [9, 1, 2],
  福德: [6, 2, 2],
  子女: [5, 1, 2],
  疾厄: [4, 1, 1],
  官禄: [1, 8, 3],
  事业: [1, 8, 3],
  兄弟: [1, 6, 4],
  交友: [1, 5, 2],
  仆役: [1, 5, 2],
  迁移: [1, 4, 3],
  财帛: [1, 3, 9],
  田宅: [2, 2, 7],
  父母: [1, 2, 1],
};

/** 宫位一句话角色（太岁入卦口径） */
const PALACE_ROLE: Record<string, string> = {
  命宫: "命宫之人，气场深度介入你的人生",
  夫妻: "正缘位——婚恋相性的头号信号",
  福德: "福德之人，精神契合、共享福泽",
  子女: "子女位，亲密缘/共同产出之缘",
  疾厄: "疾厄位，贴身之缘、朝夕相处",
  官禄: "事业位——共事协作的头号信号",
  兄弟: "兄弟位——传统合伙宫，合股经营之缘",
  交友: "交友位，人脉盟友之缘",
  仆役: "交友位，人脉盟友之缘",
  迁移: "迁移位，外缘/异地之缘",
  财帛: "财帛位——财缘的头号信号",
  田宅: "田宅位，置业安家/共守家业之缘",
  父母: "父母位，长辈师长/文书之缘",
};

/** 四化系数：禄=带缘带财 / 权=推动主导 / 科=贵人和缓 / 忌=纠缠亏欠（负） */
const MUT_MULT = [1.0, 0.6, 0.5, -1.1];

/** 地支关系 → 三维权重（年支全权，命支×0.8） */
const REL_DELTA: Record<string, [number, number, number]> = {
  六合: [6, 5, 5],
  三合: [5, 5, 5],
  对冲: [-8, -3, -3],
  相刑: [-5, -4, -3],
  相害: [-5, -3, -3],
  自刑: [-3, -2, -2],
  同支: [2, 2, 2],
  无: [0, 0, 0],
};

const REL_NOTE: Record<string, string> = {
  六合: "暗合投缘，相处自然",
  三合: "同局相合，价值观同频",
  对冲: "节奏对撞，互补亦易碰撞",
  相刑: "相刑多磨，易生计较",
  相害: "相害暗损，防误会积怨",
  自刑: "同支自刑，易互相内耗",
  同支: "同气比肩，像照镜子",
  无: "无明显合冲，平缓之交",
};

const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

function personOf(chart: Astrolabe, name: string): SynPerson {
  const soul = chart.palaces.find((p) => p.name === "命宫");
  return {
    name,
    gender: chart.gender as string,
    yearGz: chart.chineseDate.split(" ")[0] ?? "",
    soulBranch: (soul?.earthlyBranch as string) ?? "",
    soulMajors: soul?.majorStars.map((s) => s.name as string).join("、") || "无主星（借对宫）",
    fiveElements: chart.fiveElementsClass as string,
  };
}

/** 星名 → 宫（主星+辅星） */
function starPalaceMap(chart: Astrolabe): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of chart.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) m.set(s.name as string, p.index);
  }
  return m;
}

export function buildSynastry(
  aChart: Astrolabe,
  bChart: Astrolabe,
  aNameRaw: string,
  bNameRaw: string
): SynastryResult {
  const a = personOf(aChart, aNameRaw || "甲方");
  const b = personOf(bChart, bNameRaw || "乙方");
  const factors: SynFactor[] = [];
  const relations: string[] = [];
  const acc: [number, number, number] = [0, 0, 0];

  const add = (dir: SynFactor["dir"], text: string, delta: [number, number, number]) => {
    factors.push({ dir, text, delta: [r1(delta[0]), r1(delta[1]), r1(delta[2])] });
    acc[0] += delta[0];
    acc[1] += delta[1];
    acc[2] += delta[2];
  };

  /* 1. 年支关系 */
  const aYb = a.yearGz.charAt(1);
  const bYb = b.yearGz.charAt(1);
  const yRel = branchRelation(aYb, bYb);
  relations.push(`年支：${a.yearGz}（${a.name}） × ${b.yearGz}（${b.name}）＝ ${yRel}（${REL_NOTE[yRel]}）`);
  if (yRel !== "无") add("互", `生年太岁${yRel}：${REL_NOTE[yRel]}`, REL_DELTA[yRel]);

  /* 2. 命宫支关系（×0.8） */
  const sRel = branchRelation(a.soulBranch, b.soulBranch);
  relations.push(`命宫：${a.soulBranch}（${a.name}） × ${b.soulBranch}（${b.name}）＝ ${sRel}（${REL_NOTE[sRel]}）`);
  if (sRel !== "无") {
    const d = REL_DELTA[sRel];
    add("互", `命宫地支${sRel}：${REL_NOTE[sRel]}`, [d[0] * 0.8, d[1] * 0.8, d[2] * 0.8]);
  }

  /* 3. 五行局生克 */
  const aWx = a.fiveElements.charAt(0);
  const bWx = b.fiveElements.charAt(0);
  if (aWx && bWx) {
    if (aWx === bWx) {
      relations.push(`五行局：同为${aWx}局，同质同频`);
      add("互", `五行局相同（${a.fiveElements}），步调一致`, [2, 2, 2]);
    } else if (SHENG[aWx] === bWx) {
      relations.push(`五行局：${a.name}${aWx}局 生 ${b.name}${bWx}局`);
      add("A→B", `${a.name}的${aWx}局生${b.name}的${bWx}局：${a.name}天然滋养扶持对方`, [3, 4, 4]);
    } else if (SHENG[bWx] === aWx) {
      relations.push(`五行局：${b.name}${bWx}局 生 ${a.name}${aWx}局`);
      add("B→A", `${b.name}的${bWx}局生${a.name}的${aWx}局：${b.name}天然滋养扶持对方`, [3, 4, 4]);
    } else if (KE[aWx] === bWx) {
      relations.push(`五行局：${a.name}${aWx}局 克 ${b.name}${bWx}局`);
      add("A→B", `${a.name}的${aWx}局克${b.name}的${bWx}局：相处需让利让权`, [-3, -3, -3]);
    } else if (KE[bWx] === aWx) {
      relations.push(`五行局：${b.name}${bWx}局 克 ${a.name}${aWx}局`);
      add("B→A", `${b.name}的${bWx}局克${a.name}的${aWx}局：相处需让利让权`, [-3, -3, -3]);
    }
  }

  /* 4. 太岁入卦（双向）：对方年支落我盘何宫 */
  const taisui = (
    hostChart: Astrolabe,
    host: SynPerson,
    guest: SynPerson,
    guestBranch: string,
    dir: SynFactor["dir"]
  ) => {
    const seat = hostChart.palaces.find((p) => p.earthlyBranch === guestBranch);
    if (!seat) return;
    const dim = PALACE_DIM[seat.name] ?? [1, 1, 1];
    const role = PALACE_ROLE[seat.name] ?? `${seat.name}之缘`;
    add(dir, `${guest.name}的太岁（${guestBranch}）坐${host.name}的【${seat.name}】：${role}`, [
      dim[0] * 0.8,
      dim[1] * 0.8,
      dim[2] * 0.8,
    ]);
  };
  taisui(aChart, a, b, bYb, "B→A");
  taisui(bChart, b, a, aYb, "A→B");

  /* 5. 生年四化互飞（双向）：对方年干四化打入我盘 */
  const flyIn = (
    hostChart: Astrolabe,
    host: SynPerson,
    guest: SynPerson,
    guestStem: string,
    dir: SynFactor["dir"]
  ) => {
    if (!guestStem) return;
    const map = starPalaceMap(hostChart);
    const stars = util.getMutagensByHeavenlyStem(guestStem as never) as string[];
    stars.forEach((star, k) => {
      const idx = map.get(star);
      if (idx == null) return;
      const seat = hostChart.palaces[idx];
      const dim = PALACE_DIM[seat.name] ?? [1, 1, 1];
      const m = MUT_MULT[k];
      const delta: [number, number, number] = [dim[0] * m, dim[1] * m, dim[2] * m];
      const flavor =
        k === 0
          ? "带缘带财，予以滋养"
          : k === 1
            ? "推动主导（略带强势）"
            : k === 2
              ? "贵人和缓，添名添信"
              : "纠缠亏欠——相欠即深缘，但耗损此宫事项";
      add(
        dir,
        `${guest.name}生年化${MUTAGEN_CHARS[k]}（${star}）入${host.name}的【${seat.name}】：${flavor}`,
        delta
      );
    });
  };
  flyIn(aChart, a, b, b.yearGz.charAt(0), "B→A");
  flyIn(bChart, b, a, a.yearGz.charAt(0), "A→B");

  /* 6. 红鸾/天喜对照（双向）：我盘鸾喜宫支 = 对方年支 */
  const luanxi = (hostChart: Astrolabe, host: SynPerson, guest: SynPerson, guestBranch: string, dir: SynFactor["dir"]) => {
    for (const p of hostChart.palaces) {
      for (const s of p.adjectiveStars) {
        const n = s.name as string;
        if ((n === "红鸾" || n === "天喜") && p.earthlyBranch === guestBranch) {
          add(
            dir,
            `${host.name}的${n}正坐${guest.name}太岁位（${guestBranch}）：典型婚恋喜缘`,
            n === "红鸾" ? [8, 0, 1] : [6, 0, 1]
          );
        }
      }
    }
  };
  luanxi(aChart, a, b, bYb, "B→A");
  luanxi(bChart, b, a, aYb, "A→B");

  /* 汇总 */
  const scores: SynDimScores = {
    love: clamp(Math.round(50 + acc[0]), 5, 95),
    career: clamp(Math.round(50 + acc[1]), 5, 95),
    wealth: clamp(Math.round(50 + acc[2]), 5, 95),
  };

  const summary = buildSummary(a, b, scores, factors, yRel);

  return {
    a,
    b,
    relations,
    scores,
    factors,
    summary,
    note: "合盘为双人本命结构互参（年支/命支关系、五行局、太岁入卦、生年四化互飞、鸾喜对照）的确定性量化，性别无关、同性异性通用；分数为相对倾向非命定，重大决策请结合现实条件。",
  };
}

const TIER = (v: number) => (v >= 75 ? "上佳" : v >= 60 ? "良好" : v >= 45 ? "平平" : "多磨");

function buildSummary(
  a: SynPerson,
  b: SynPerson,
  s: SynDimScores,
  factors: SynFactor[],
  yRel: string
): string[] {
  const L: string[] = [];
  const dims: [string, number][] = [
    ["姻缘", s.love],
    ["事业合伙", s.career],
    ["金钱财路", s.wealth],
  ];
  const top = [...dims].sort((x, y) => y[1] - x[1])[0];
  L.push(
    `三维相性：姻缘 ${s.love}（${TIER(s.love)}）· 事业合伙 ${s.career}（${TIER(s.career)}）· 金钱财路 ${s.wealth}（${TIER(s.wealth)}）——最强项为【${top[0]}】。`
  );

  if (s.love >= 65 && Math.max(s.career, s.wealth) >= 65) {
    L.push("情财兼备：既有婚恋相性也有共事财缘，成家与共事可并行。");
  } else if (s.wealth >= 60 && s.wealth - s.love >= 10) {
    L.push("财缘明显强于情缘：更宜合伙搞钱、项目协作，感情顺其自然勿强求。");
  } else if (s.career >= 60 && s.career - s.love >= 10) {
    L.push("事业相性强于情缘：宜同事/合伙定位，分工互补比亲密关系更顺。");
  } else if (s.love >= 65) {
    L.push("情缘为先：婚恋相性突出，共事反而要注意公私分明。");
  }

  const jiAB = factors.some((f) => f.dir === "A→B" && f.text.includes("化忌"));
  const jiBA = factors.some((f) => f.dir === "B→A" && f.text.includes("化忌"));
  if (jiAB && jiBA) {
    L.push("双向化忌交缠：彼此都欠对方、缘分极深但互相消耗——无论结婚还是合伙，先小人后君子（协议先行）。");
  } else if (jiAB || jiBA) {
    const giver = jiAB ? a.name : b.name;
    const taker = jiAB ? b.name : a.name;
    L.push(`单向化忌：${giver} 对 ${taker} 付出/纠缠更多，关系易失衡，${taker} 宜主动回馈以平衡。`);
  }

  if (yRel === "对冲") {
    L.push("年支对冲：节奏与立场易对撞，保持一定空间（异地/分工两线）反而长久。");
  } else if (yRel === "六合" || yRel === "三合") {
    L.push("太岁相合：底层气场投缘，磨合成本低，是关系的天然黏合剂。");
  }
  return L;
}

/* ─────────────── 流年合参（双人当年对比） ─────────────── */

export type YearlySide = {
  name: string;
  /** 流年命宫叠本命宫 */
  seatName: string;
  seatBranch: string;
  /** 流年四化落宫：「禄=太阳→官禄」 */
  mutagenLines: string[];
  /** 命宫域 K 线该年 */
  kline: { score: number; pattern: string; net: number } | null;
  /** 与太岁关系：值/冲/刑/害/合/平 */
  taisui: string;
  patterns: HoroPattern[];
};

export type YearlySynastry = {
  year: number;
  gz: string;
  a: YearlySide;
  b: YearlySide;
  /** 流年化忌星在双方盘各落何宫 */
  jiLine: string;
  conclusions: string[];
};

function yearlySide(
  chart: Astrolabe,
  name: string,
  year: number,
  gz: string,
  lk: LifeKlineData | null
): YearlySide | null {
  const dateStr = lunarToSolarStr(year, 6, 15) ?? `${year}-7-15`;
  let h: ReturnType<Astrolabe["horoscope"]>;
  try {
    h = chart.horoscope(dateStr, 0);
  } catch {
    return null;
  }
  const seat = chart.palaces[h.yearly.index];
  const map = starPalaceMap(chart);
  const stars = util.getMutagensByHeavenlyStem(gz.charAt(0) as never) as string[];
  const mutagenLines = stars.map((star, k) => {
    const idx = map.get(star);
    return `${MUTAGEN_CHARS[k]}=${star}→${idx != null ? (chart.palaces[idx].name as string) : "?"}`;
  });
  const soulDomain = lk?.domains.find((d) => d.palaceName === "命宫");
  const y = soulDomain?.years.find((x) => x.year === year);
  const personBranch = (chart.chineseDate.split(" ")[0] ?? "").charAt(1);
  const rel = branchRelation(gz.charAt(1), personBranch);
  const taisui =
    rel === "同支" || rel === "自刑"
      ? "值太岁"
      : rel === "对冲"
        ? "冲太岁"
        : rel === "相刑"
          ? "刑太岁"
          : rel === "相害"
            ? "害太岁"
            : rel === "六合" || rel === "三合"
              ? "合太岁"
              : "平";
  return {
    name,
    seatName: (seat?.name as string) ?? "?",
    seatBranch: (seat?.earthlyBranch as string) ?? "?",
    mutagenLines,
    kline: y ? { score: y.score, pattern: y.pattern, net: y.net } : null,
    taisui,
    patterns: detectHoroscopePatterns(
      chart,
      "yearly",
      h.yearly.index,
      h.yearly.heavenlyStem as string,
      h.yearly.earthlyBranch as string
    ),
  };
}

/** 流年合参：同一公历年（流年干支相同）下，双人各自的引动与强弱对比 */
export function buildYearlySynastry(
  aChart: Astrolabe,
  bChart: Astrolabe,
  aName: string,
  bName: string,
  year: number,
  aLk: LifeKlineData | null,
  bLk: LifeKlineData | null
): YearlySynastry | null {
  const gz = yearGanZhi(year);
  const a = yearlySide(aChart, aName || "甲方", year, gz, aLk);
  const b = yearlySide(bChart, bName || "乙方", year, gz, bLk);
  if (!a || !b) return null;

  // 流年忌星在双方盘的落宫
  const jiStar = (util.getMutagensByHeavenlyStem(gz.charAt(0) as never) as string[])[3] ?? "";
  const seatOf = (chart: Astrolabe) => {
    const idx = starPalaceMap(chart).get(jiStar);
    return idx != null ? (chart.palaces[idx].name as string) : "?";
  };
  const jiLine = jiStar
    ? `流年化忌（${jiStar}）落 ${a.name}【${seatOf(aChart)}】 / ${b.name}【${seatOf(bChart)}】——今年的坑各在此处`
    : "";

  const conclusions: string[] = [];
  if (a.kline && b.kline) {
    const diff = a.kline.score - b.kline.score;
    if (Math.abs(diff) >= 8) {
      const strong = diff > 0 ? a : b;
      const weak = diff > 0 ? b : a;
      conclusions.push(
        `今年 ${strong.name} 明显更旺（${strong.kline!.score} vs ${weak.kline!.score}）：共同行动宜由 ${strong.name} 多担主导，${weak.name} 宜稳守配合。`
      );
    } else if (a.kline.score >= 60 && b.kline.score >= 60) {
      conclusions.push(`双双顺遂（${a.kline.score} / ${b.kline.score}）：宜乘势共进，合作事项可提速。`);
    } else if (a.kline.score <= 45 && b.kline.score <= 45) {
      conclusions.push(`双双承压（${a.kline.score} / ${b.kline.score}）：共同事务宜守不宜攻，避免此时做重大绑定。`);
    } else {
      conclusions.push(`两人强弱相当（${a.kline.score} / ${b.kline.score}）：按分工各自推进即可。`);
    }
  }
  for (const s of [a, b]) {
    if (s.taisui === "冲太岁" || s.taisui === "刑太岁") {
      conclusions.push(`${s.name} ${s.taisui}：本年变动与是非偏多，重大共同决策宜听多方意见、放缓节奏。`);
    }
  }
  const notable = (s: YearlySide) => s.patterns.filter((p) => p.kind === "吉").map((p) => p.name);
  const an = notable(a);
  const bn = notable(b);
  if (an.length || bn.length) {
    conclusions.push(
      `运限格局：${an.length ? `${a.name} 有 ${an.join("、")}` : ""}${an.length && bn.length ? "；" : ""}${
        bn.length ? `${b.name} 有 ${bn.join("、")}` : ""
      }——吉格所在的一方是当年发力点。`
    );
  }

  return { year, gz, a, b, jiLine, conclusions };
}

/** 合盘报告 Markdown（复制给 AI 或留存；可附当前年流年合参） */
export function buildSynastryMd(r: SynastryResult, yearly?: YearlySynastry | null): string {
  const L: string[] = [];
  L.push(`# 紫微斗数合盘：${r.a.name} × ${r.b.name}`);
  L.push("");
  L.push(`> ${r.note}`);
  L.push("");
  L.push(`| 人 | 性别 | 生年 | 命宫 | 命宫主星 | 五行局 |`);
  L.push(`|---|---|---|---|---|---|`);
  for (const p of [r.a, r.b]) {
    L.push(`| ${p.name} | ${p.gender} | ${p.yearGz} | ${p.soulBranch} | ${p.soulMajors} | ${p.fiveElements} |`);
  }
  L.push("");
  L.push(`## 关系概览`);
  L.push("");
  for (const rel of r.relations) L.push(`- ${rel}`);
  L.push("");
  L.push(`## 三维评分`);
  L.push("");
  L.push(`- 姻缘（婚恋）：**${r.scores.love}**`);
  L.push(`- 事业合伙（正财协作）：**${r.scores.career}**`);
  L.push(`- 金钱财路（合伙搞钱）：**${r.scores.wealth}**`);
  L.push("");
  L.push(`## 互动明细（方向：${r.a.name}=A，${r.b.name}=B）`);
  L.push("");
  for (const f of r.factors) {
    const d = f.delta.map((x, i) => (x ? `${["姻缘", "事业", "金钱"][i]}${x > 0 ? "+" : ""}${x}` : "")).filter(Boolean);
    L.push(`- 〔${f.dir}〕${f.text}（${d.join("，") || "±0"}）`);
  }
  L.push("");
  L.push(`## 总评`);
  L.push("");
  for (const s of r.summary) L.push(`- ${s}`);
  L.push("");
  if (yearly) {
    L.push(`## 流年合参 · ${yearly.year} ${yearly.gz}`);
    L.push("");
    L.push(`| 项目 | ${yearly.a.name} | ${yearly.b.name} |`);
    L.push(`|---|---|---|`);
    L.push(`| 流年命宫叠 | 本命${yearly.a.seatName}（${yearly.a.seatBranch}） | 本命${yearly.b.seatName}（${yearly.b.seatBranch}） |`);
    L.push(`| 流年四化落宫 | ${yearly.a.mutagenLines.join("，")} | ${yearly.b.mutagenLines.join("，")} |`);
    L.push(
      `| 命宫域K线 | ${yearly.a.kline ? `${yearly.a.kline.score}·${yearly.a.kline.pattern}（净${yearly.a.kline.net >= 0 ? "+" : ""}${yearly.a.kline.net}）` : "—"} | ${
        yearly.b.kline ? `${yearly.b.kline.score}·${yearly.b.kline.pattern}（净${yearly.b.kline.net >= 0 ? "+" : ""}${yearly.b.kline.net}）` : "—"
      } |`
    );
    L.push(`| 太岁 | ${yearly.a.taisui} | ${yearly.b.taisui} |`);
    L.push(
      `| 运限格局 | ${yearly.a.patterns.map((p) => p.name).join("、") || "无"} | ${yearly.b.patterns.map((p) => p.name).join("、") || "无"} |`
    );
    L.push("");
    if (yearly.jiLine) L.push(`- ${yearly.jiLine}`);
    for (const c of yearly.conclusions) L.push(`- ${c}`);
    L.push("");
  }
  return L.join("\n");
}
