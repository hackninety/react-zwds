/**
 * 人生K线（紫微斗数·分域版）：为十二宫各生成一条 0-100 评分 K 线。
 *
 * 方法论（三合派口径,确定性推演,与 iztro 安星/四化同源）：
 *   「一宫看三方四正」——每个宫（域）独立评分,只看该宫的本宫 + 对宫 + 三合两宫,
 *   不与其余宫混算,以保留各域差异（事业差而感情好等）。因命-财帛-官禄本为一
 *   三合三角,这三条线会同步;夫妻/疾厄/福德等落他三角,则与综合分化。
 *
 *   固定基调 baseline(宫) = 三方四正星情（本宫×1.0 对宫×0.6 三合×0.4）
 *                          + 生年四化落三方四正（禄+3 权+2 科+2 忌-4,同权重）
 *                          + 身宫所在 +2
 *                          + 离心自化泄气（忌-2 禄-1 权/科-0.5）
 *   逐年 = 50 + baseline
 *          + 大限四化落三方四正（禄+6 权+4 科+3 忌-6,按位权）
 *          + 流年四化落三方四正（禄+8 权+5 科+4 忌-8,按位权）
 *          ※ 忌按专用落位权重：入本宫×1.0 / 落对宫=冲本宫×0.9（冲比坐烈）/ 三合×0.4
 *          ※ 大限忌+流年忌同引本域 → 双忌叠加,追加 35% 非线性加重
 *          + 流年支冲本宫 -4 / 六合本宫 +2
 *          + 流曜：流禄 +2w / 流羊·流陀 -2w / 流马 +1.5w（随年干支起,按位权 w）
 *          ※ 流马会禄（流禄/本命禄存/生年禄星同宫）→ 禄马交驰 +3
 *          ※ 流年化禄落生年忌宫 → 禄忌交缠·变动年 +2/-2（动能↑）
 *          + 小限入本宫 +1 / 小限冲本宫 -1（男顺女逆,生年支三合起宫）
 *          + 命宫域岁限并临 -2
 *   收敛 [8,92]；K 线 open=上年 close,high/low 由进/出两股动能撑开。
 */
import { util } from "iztro";
import { getHoroscopeStar } from "iztro/lib/star/horoscopeStar";
import type { Astrolabe, DecadeInfo } from "./useZwds";
import { BRANCHES, LUNAR_MONTHS, MUTAGEN_CHARS, fixIndex, monthGanZhi, yearGanZhi } from "./utils";
import { leapMonthOf } from "./lunar";

const CHONG: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};
const LIU_HE: Record<string, string> = {
  子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯",
  辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午",
};

const BRIGHT_SCORE: Record<string, number> = { 庙: 3, 旺: 2, 得: 1, 利: 1, 平: 0, 不: -1, 陷: -2 };
const GOOD_STARS: Record<string, number> = {
  左辅: 1.5, 右弼: 1.5, 天魁: 1.5, 天钺: 1.5, 文昌: 1, 文曲: 1, 禄存: 2, 天马: 1,
};
const BAD_STARS: Record<string, number> = {
  擎羊: -2, 陀罗: -2, 火星: -2, 铃星: -2, 地空: -2.5, 地劫: -2.5,
};
const MUT_YEARLY = [8, 5, 4, -8];
const MUT_DECADAL = [6, 4, 3, -6];
const MUT_NATAL_BASE = [3, 2, 2, -4];
const MUT_MONTHLY = [5, 3, 2, -5];
/** 忌的落位权重：忌坐对宫=冲本宫，冲比坐烈（0.9），高于常规对宫权 0.6 */
const JI_WEIGHTS: [number, number, number] = [1.0, 0.9, 0.4]; // [本宫, 对宫(冲), 三合]
/** 双忌（大限忌+流年忌同引本域）叠加加重系数 */
const DOUBLE_JI_FACTOR = 0.35;

/**
 * 流曜/月曜权重（iztro getHoroscopeStar 同源公式起盘，随干支）：正=进，负=出。
 * 流鸾流喜在夫妻/子女域加倍（婚恋应期标记）。
 */
const FLOW_STAR_SCORE: Record<string, number> = {
  流禄: 2, 流马: 1.5, 流昌: 1, 流曲: 1, 流魁: 1, 流钺: 1,
  流羊: -2, 流陀: -2, 流鸾: 0.8, 流喜: 0.8,
  月禄: 1.2, 月马: 0.8, 月昌: 0.6, 月曲: 0.6, 月魁: 0.6, 月钺: 0.6,
  月羊: -1.2, 月陀: -1.2, 月鸾: 0.5, 月喜: 0.5,
};
/** 鸾喜的婚恋域（加倍生效） */
const LOVE_DOMAINS = new Set(["夫妻", "子女"]);
const LUAN_XI = new Set(["流鸾", "流喜", "月鸾", "月喜"]);

type FlowStarHit = { idx: number; name: string; v: number };
const flowCache = new Map<string, FlowStarHit[]>();

/** 某干支的流曜/月曜落宫（带基础分值），60 甲子内缓存 */
function flowStarsOf(scope: "yearly" | "monthly", stem: string, branch: string): FlowStarHit[] {
  const key = `${scope}:${stem}${branch}`;
  const c = flowCache.get(key);
  if (c) return c;
  const hits: FlowStarHit[] = [];
  try {
    const groups = getHoroscopeStar(stem as never, branch as never, scope);
    groups.forEach((g, idx) => {
      for (const s of g) {
        const name = s.name as string;
        const v = FLOW_STAR_SCORE[name];
        if (v) hits.push({ idx, name, v });
      }
    });
  } catch {
    /* 干支异常时无流曜 */
  }
  flowCache.set(key, hits);
  return hits;
}
/** 小限起宫地支（生年支三合局）：寅午戌人辰上起、申子辰人戌上起、巳酉丑人未上起、亥卯未人丑上起 */
const AGE_START_BRANCH: Record<string, string> = {
  寅: "辰", 午: "辰", 戌: "辰", 申: "戌", 子: "戌", 辰: "戌",
  巳: "未", 酉: "未", 丑: "未", 亥: "丑", 卯: "丑", 未: "丑",
};
/** 地支 → 宫位索引（palaces[0]=寅） */
const branchPalaceIdx = (branch: string) => fixIndex(BRANCHES.indexOf(branch as never) - 2);

/** 宫名 → 友好域名 + 展示优先级 */
const DOMAIN_META: Record<string, { label: string; priority: number }> = {
  命宫: { label: "综合·命宫", priority: 0 },
  官禄: { label: "事业·官禄", priority: 1 },
  事业: { label: "事业·官禄", priority: 1 },
  财帛: { label: "财帛·金钱", priority: 2 },
  夫妻: { label: "感情·夫妻", priority: 3 },
  疾厄: { label: "健康·疾厄", priority: 4 },
  福德: { label: "心境·福德", priority: 5 },
  田宅: { label: "家产·田宅", priority: 6 },
  迁移: { label: "外出·迁移", priority: 7 },
  交友: { label: "人际·交友", priority: 8 },
  仆役: { label: "人际·仆役", priority: 8 },
  兄弟: { label: "手足·兄弟", priority: 9 },
  子女: { label: "子女·子嗣", priority: 10 },
  父母: { label: "父母·长辈", priority: 11 },
};

export type KlineYear = {
  year: number;
  age: number;
  ganZhi: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 净运势（= close） */
  score: number;
  delta: number;
  /** 进：禄权科·六合（吉动能，撑起上影） */
  gain: number;
  /** 出：忌·冲·并临·自化漏（凶动能，压下下影） */
  drain: number;
  /** 净 = gain − drain（决定 close 涨跌） */
  net: number;
  /** 总动能 = gain + drain（该域该年有多“大”） */
  magnitude: number;
  /** 年度形态：顺遂 / 大进大出 / 破耗 / 平稳 / 平 */
  pattern: string;
  /** 出项性质：主动·自化漏 / 被动·忌冲 / 纠缠·忌入 …（无显著出项则空） */
  drainNature: string;
  factors: string[];
};

export type KlineDecadeAvg = { label: string; startYear: number; endYear: number; avg: number };

export type KlineDomain = {
  key: string;
  palaceName: string;
  label: string;
  palaceIndex: number;
  branch: string;
  isBody: boolean;
  baseline: number;
  /** 基调构成说明（自化泄气等结构性调整） */
  baselineNotes: string[];
  /** 三方四正构成（本·对·三合宫名） */
  compose: string;
  years: KlineYear[];
  decadeAvg: KlineDecadeAvg[];
};

export type KlineBand = { label: string; startYear: number; endYear: number };

export type LifeKlineData = {
  note: string;
  domains: KlineDomain[];
  bands: KlineBand[];
  lastAge: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (n: number) => Math.round(n);
const fmt = (n: number) => `${n > 0 ? "+" : ""}${round(n)}`;

/** i 的三方四正及位权（本宫1.0 对宫0.6 三合0.4） */
function tsWeights(i: number): Map<number, number> {
  const m = new Map<number, number>();
  m.set(fixIndex(i), 1.0);
  m.set(fixIndex(i + 6), 0.6);
  m.set(fixIndex(i + 4), 0.4);
  m.set(fixIndex(i - 4), 0.4);
  return m;
}

function palaceStarScore(a: Astrolabe, idx: number): { s: number; badNames: string[] } {
  const p = a.palaces[idx];
  let bright = 0;
  for (const st of p.majorStars) bright += BRIGHT_SCORE[(st.brightness as string) ?? ""] ?? 0;
  bright = clamp(bright, -6, 6);
  let good = 0;
  let bad = 0;
  const badNames: string[] = [];
  for (const st of p.minorStars) {
    good += GOOD_STARS[st.name as string] ?? 0;
    const b = BAD_STARS[st.name as string];
    if (b) {
      bad += b;
      badNames.push(st.name as string);
    }
  }
  return { s: bright + clamp(good, 0, 6) + clamp(bad, -8, 0), badNames };
}

export function buildLifeKline(
  astrolabe: Astrolabe | null,
  decades: DecadeInfo[],
  birthLunarYear: number
): LifeKlineData | null {
  if (!astrolabe || !decades.length) return null;
  const a = astrolabe;

  const starPalace = new Map<string, number>();
  for (const p of a.palaces) {
    for (const st of [...p.majorStars, ...p.minorStars]) starPalace.set(st.name as string, p.index);
  }

  /** 某天干四化落宫命中：[{宫index, 四化k, 星名}] */
  const mutCache = new Map<string, { idx: number; k: number; star: string }[]>();
  const mutHits = (stem: string) => {
    if (!stem) return [];
    const c = mutCache.get(stem);
    if (c) return c;
    const stars = util.getMutagensByHeavenlyStem(stem as never) as string[];
    const hits: { idx: number; k: number; star: string }[] = [];
    stars.forEach((star, k) => {
      const idx = starPalace.get(star);
      if (idx != null) hits.push({ idx, k, star });
    });
    mutCache.set(stem, hits);
    return hits;
  };

  const natalYearStem = a.chineseDate.split(" ")[0]?.charAt(0) ?? "";
  const lastAge = Math.min(100, decades[decades.length - 1].range[1]);

  /* 小限：生年支三合定起宫（寅午戌辰起…），男顺女逆，一岁一宫 */
  const natalYearBranch = a.chineseDate.split(" ")[0]?.charAt(1) ?? "";
  const ageStartIdx = AGE_START_BRANCH[natalYearBranch]
    ? branchPalaceIdx(AGE_START_BRANCH[natalYearBranch])
    : -1;
  const ageDir = a.gender === "女" ? -1 : 1;
  const smallLimitIdx = (age: number) =>
    ageStartIdx < 0 ? -1 : fixIndex(ageStartIdx + ageDir * (age - 1));

  /* 大限段背景（含童限） */
  const bands: KlineBand[] = [];
  const firstAge = decades[0].range[0];
  if (firstAge > 1) {
    bands.push({ label: "童限", startYear: birthLunarYear, endYear: birthLunarYear + firstAge - 2 });
  }
  for (const d of decades) {
    bands.push({
      label: `${d.heavenlyStem}${d.earthlyBranch}限 ${d.range[0]}-${d.range[1]}`,
      startYear: birthLunarYear + d.range[0] - 1,
      endYear: Math.min(birthLunarYear + lastAge - 1, birthLunarYear + d.range[1] - 1),
    });
  }

  const decadeAt = (age: number) => decades.find((d) => age >= d.range[0] && age <= d.range[1]) ?? null;

  const domains: KlineDomain[] = [];

  for (const palace of a.palaces) {
    const P = palace.index;
    const meta = DOMAIN_META[palace.name] ?? { label: palace.name, priority: 99 };
    const wmap = tsWeights(P);
    const composeNames = [...wmap.keys()].map((q) => a.palaces[q].name);

    /* baseline（静态：三方四正星情 + 生年四化 + 身宫 + 离心自化泄气） */
    const baselineNotes: string[] = [];
    let baseline = 0;
    for (const [q, w] of wmap) baseline += w * palaceStarScore(a, q).s;
    for (const hit of mutHits(natalYearStem)) {
      const w = wmap.get(hit.idx);
      if (w) baseline += w * MUT_NATAL_BASE[hit.k];
    }
    if (palace.isBodyPalace) baseline += 2;
    // 离心自化（本宫宫干四化本宫之星）：气外泄。忌最重=得而复失；禄权科小幅泄
    const selfMutKinds = new Set(
      mutHits(palace.heavenlyStem)
        .filter((h) => h.idx === P)
        .map((h) => h.k)
    );
    const hasSelfJi = selfMutKinds.has(3);
    if (hasSelfJi) {
      baseline -= 2;
      baselineNotes.push("自化忌·得而复失 -2");
    }
    if (selfMutKinds.has(0)) {
      baseline -= 1;
      baselineNotes.push("自化禄·福不耐久 -1");
    }
    if (selfMutKinds.has(1)) {
      baseline -= 0.5;
      baselineNotes.push("自化权·虚张内耗 -0.5");
    }
    if (selfMutKinds.has(2)) {
      baseline -= 0.5;
      baselineNotes.push("自化科·虚名少实 -0.5");
    }
    baseline = clamp(round(baseline), -18, 18);

    const years: KlineYear[] = [];
    for (let age = 1; age <= lastAge; age++) {
      const year = birthLunarYear + age - 1;
      const gz = yearGanZhi(year);
      const yStem = gz.charAt(0);
      const yBranch = gz.charAt(1);
      const pBranch = palace.earthlyBranch as string;
      const decade = decadeAt(age);
      const factors: string[] = [];
      let gain = 0; // 进：禄权科·六合
      let drain = 0; // 出：忌·冲·并临·自化漏
      const nature: string[] = []; // 出项性质（主动/被动/纠缠）

      // 四化落三方四正：禄权科=进；忌=出，按落位区分性质与专用权重
      // （入本宫=纠缠×1.0 / 落对宫=冲本宫·被动×0.9，冲比坐烈 / 三合=拖累×0.4）
      let jiSources = 0; // 命中本域的忌来源数（大限/流年）
      let jiDrainSum = 0;
      const applyMut = (stem: string, MUT: number[], tag: string) => {
        let jiHit = false;
        for (const hit of mutHits(stem)) {
          const w = wmap.get(hit.idx);
          if (!w) continue;
          if (hit.k === 3) {
            const pos = hit.idx === P ? 0 : hit.idx === fixIndex(P + 6) ? 1 : 2;
            const v = JI_WEIGHTS[pos] * Math.abs(MUT[3]);
            drain += v;
            jiDrainSum += v;
            jiHit = true;
            if (pos === 0) nature.push(`${tag}${hit.star}忌入本宫·纠缠`);
            else if (pos === 1) nature.push(`${tag}${hit.star}忌冲本宫·被动`);
            else nature.push(`${tag}${hit.star}忌拖累三合`);
            factors.push(`${tag}${hit.star}化忌→${a.palaces[hit.idx].name}${pos === 1 ? "(冲本宫)" : ""} -${round(v)}`);
          } else {
            const v = w * MUT[hit.k];
            gain += v;
            if (Math.abs(v) >= 1)
              factors.push(`${tag}${hit.star}化${MUTAGEN_CHARS[hit.k]}→${a.palaces[hit.idx].name} ${fmt(v)}`);
          }
        }
        if (jiHit) jiSources++;
      };
      if (decade) applyMut(decade.heavenlyStem, MUT_DECADAL, "大限");
      applyMut(yStem, MUT_YEARLY, "流年");

      // 双忌叠加：大限忌+流年忌同引本域，凶性非线性放大
      if (jiSources >= 2) {
        const extra = jiDrainSum * DOUBLE_JI_FACTOR;
        drain += extra;
        nature.push("双忌叠加·加重");
        factors.push(`双忌叠加（大限忌+流年忌同引本域） -${round(extra)}`);
      }

      // 流年支与本宫：六合=进，六冲=出（被动）
      if (CHONG[yBranch] === pBranch) {
        drain += 4;
        nature.push("流年支冲本宫·被动");
        factors.push("流年支冲本宫 -4");
      } else if (LIU_HE[yBranch] === pBranch) {
        gain += 2;
        factors.push("流年支合本宫 +2");
      }

      // 流曜（魁钺昌曲禄羊陀马鸾喜十颗，iztro 同源公式；鸾喜在夫妻/子女域加倍）
      const flows = flowStarsOf("yearly", yStem, yBranch);
      const liuLuIdx = flows.find((f) => f.name === "流禄")?.idx ?? -1;
      const liuMaIdx = flows.find((f) => f.name === "流马")?.idx ?? -1;
      for (const f of flows) {
        if (f.name === "流马") continue; // 流马按禄马交驰逻辑单独处理
        const w = wmap.get(f.idx);
        if (!w) continue;
        let v = f.v * w;
        if (LUAN_XI.has(f.name) && LOVE_DOMAINS.has(palace.name)) v *= 2;
        if (v >= 0) gain += v;
        else drain += -v;
        if (Math.abs(v) >= 0.5)
          factors.push(`${f.name}入${a.palaces[f.idx].name} ${v >= 0 ? fmt(v) : `-${round(-v)}`}`);
      }
      const wMa = liuMaIdx >= 0 ? wmap.get(liuMaIdx) : undefined;
      if (wMa) {
        // 禄马交驰年：流马与流禄同宫，或流马之宫坐本命禄存/生年禄星
        const maMates = new Set(
          [...a.palaces[liuMaIdx].majorStars, ...a.palaces[liuMaIdx].minorStars].map(
            (s) => s.name as string
          )
        );
        const natalLuStar = mutHits(natalYearStem).find((h) => h.k === 0)?.star;
        const withLu =
          liuMaIdx === liuLuIdx ||
          maMates.has("禄存") ||
          (natalLuStar ? maMates.has(natalLuStar) : false);
        if (withLu) {
          gain += 3;
          factors.push(`禄马交驰（流马会禄于${a.palaces[liuMaIdx].name}） +3`);
        } else {
          gain += wMa * 1.5;
          factors.push(`流马入${a.palaces[liuMaIdx].name} ${fmt(wMa * 1.5)}`);
        }
      }

      // 流禄引动生年忌：流年化禄星落生年忌之宫（含禄忌同星），禄忌交缠=变动之年
      const yLuHit = mutHits(yStem).find((h) => h.k === 0);
      const natalJiHit = mutHits(natalYearStem).find((h) => h.k === 3);
      if (yLuHit && natalJiHit && yLuHit.idx === natalJiHit.idx && wmap.has(yLuHit.idx)) {
        gain += 2;
        drain += 2;
        nature.push("流禄引动生年忌·变动");
        factors.push("流禄引动生年忌（禄忌交缠，先得后失防反复） +2/-2");
      }

      // 小限落宫：入本宫=当年事聚此域（小幅关注），落对宫=小限冲（小幅动荡）
      const ageIdx = smallLimitIdx(age);
      if (ageIdx === P) {
        gain += 1;
        factors.push("小限入本宫 +1");
      } else if (ageIdx >= 0 && ageIdx === fixIndex(P + 6)) {
        drain += 1;
        nature.push("小限冲本宫·小动");
        factors.push("小限冲本宫 -1");
      }

      // 岁限并临（命宫域）：动荡
      if (meta.priority === 0 && decade && gz === `${decade.heavenlyStem}${decade.earthlyBranch}`) {
        drain += 2;
        nature.push("岁限并临·动荡");
        factors.push("岁限并临 -2");
      }

      // 自化忌：进得越大、主动漏得越多（得而复失）
      if (hasSelfJi && gain > 0) {
        const leak = gain * 0.4;
        drain += leak;
        nature.push("主动·自化漏（得而复失）");
        factors.push(`自化忌漏财（进越大漏越多） -${round(leak)}`);
      }

      const net = gain - drain;
      const magnitude = gain + drain;
      const close = clamp(round(50 + baseline + net), 8, 92);

      let pattern = "平稳";
      if (magnitude < 4) pattern = "平";
      else if (gain >= 5 && drain >= 5) pattern = "大进大出";
      else if (net >= 5) pattern = "顺遂";
      else if (net <= -5) pattern = "破耗";

      years.push({
        year,
        age,
        ganZhi: gz,
        open: 0,
        close,
        high: 0,
        low: 0,
        score: close,
        delta: 0,
        gain: round(gain),
        drain: round(drain),
        net: round(net),
        magnitude: round(magnitude),
        pattern,
        drainNature: drain >= 3 ? [...new Set(nature)].slice(0, 3).join("、") : "",
        factors,
      });
    }

    /* OHLC：body=净(open→close)，上影∝进(gain)，下影∝出(drain)；
       大进大出 → 小实体+长上下影（十字），顺遂 → 长阳短影，破耗 → 阴线长下影 */
    let prevClose = 50 + baseline;
    for (const y of years) {
      y.open = round(prevClose);
      y.delta = y.close - y.open;
      y.high = clamp(round(Math.max(y.open, y.close) + y.gain * 0.5), 2, 98);
      y.low = clamp(round(Math.min(y.open, y.close) - y.drain * 0.5), 2, 98);
      prevClose = y.close;
    }

    /* 大限段均分 */
    const decadeAvg: KlineDecadeAvg[] = bands.map((b) => {
      const pts = years.filter((y) => y.year >= b.startYear && y.year <= b.endYear);
      return {
        label: b.label,
        startYear: b.startYear,
        endYear: b.endYear,
        avg: pts.length ? round(pts.reduce((s, y) => s + y.score, 0) / pts.length) : 0,
      };
    });

    domains.push({
      key: `p${P}`,
      palaceName: palace.name,
      label: meta.label,
      palaceIndex: P,
      branch: palace.earthlyBranch as string,
      isBody: palace.isBodyPalace,
      baseline,
      baselineNotes,
      compose: composeNames.join("·"),
      years,
      decadeAvg,
    });
  }

  domains.sort(
    (x, y) =>
      (DOMAIN_META[x.palaceName]?.priority ?? 99) - (DOMAIN_META[y.palaceName]?.priority ?? 99)
  );

  return {
    note: "紫微分域量化：每宫独立看其三方四正 + 四化落宫。区分「进(禄权科·流曜吉·六合)」与「出(忌·冲·流羊陀·自化漏)」两股动能——净决定 K 线涨跌，进撑上影、出压下影。故「大进大出」年为小实体长上下影(十字)，非单一好坏；出项再分主动(自化漏)/被动(忌冲)/纠缠(忌入)。流曜十颗（魁钺昌曲禄羊陀马鸾喜，iztro 同源公式），鸾喜在夫妻/子女域加倍；忌落对宫按「冲本宫」加重；大限忌+流年忌同引为双忌叠加非线性放大；流禄会流马为禄马交驰；流禄落生年忌宫为禄忌交缠变动年。确定性推演,仅供参考娱乐。",
    domains,
    bands,
    lastAge,
  };
}

/* ─────────────── 月K线（某域某年逐月细化） ─────────────── */

export type KlineMonth = {
  month: number;
  leap: boolean;
  label: string;
  gz: string;
  open: number;
  close: number;
  high: number;
  low: number;
  score: number;
  delta: number;
  gain: number;
  drain: number;
  net: number;
  magnitude: number;
  pattern: string;
  factors: string[];
};

export type MonthlyKline = {
  year: number;
  ganZhi: string;
  palaceIndex: number;
  palaceName: string;
  months: KlineMonth[];
  note: string;
};

/**
 * 月K线：以该年年K的 open→close 轨迹为基准漂移，
 * 月干四化（五虎遁）引动三方四正 + 月支冲合本宫 + 月曜（月魁钺昌曲禄羊陀马鸾喜）
 * 制造波动；闰月沿用本月干支（无独立月建）。anchor 传该域该年的年K open/close。
 */
export function buildMonthlyKline(
  a: Astrolabe,
  palaceIndex: number,
  year: number,
  anchor: { open: number; close: number }
): MonthlyKline | null {
  const palace = a.palaces[palaceIndex];
  if (!palace) return null;
  const P = palaceIndex;
  const wmap = tsWeights(P);
  const pBranch = palace.earthlyBranch as string;

  const starPalace = new Map<string, number>();
  for (const p of a.palaces) {
    for (const st of [...p.majorStars, ...p.minorStars]) starPalace.set(st.name as string, p.index);
  }
  const mutHits = (stem: string) => {
    if (!stem) return [] as { idx: number; k: number; star: string }[];
    const stars = util.getMutagensByHeavenlyStem(stem as never) as string[];
    const hits: { idx: number; k: number; star: string }[] = [];
    stars.forEach((star, k) => {
      const idx = starPalace.get(star);
      if (idx != null) hits.push({ idx, k, star });
    });
    return hits;
  };

  /* 月序（含闰月位，闰月沿用本月干支） */
  const leapM = leapMonthOf(year);
  const list: { month: number; leap: boolean; label: string; gz: string }[] = [];
  for (let m = 1; m <= 12; m++) {
    list.push({ month: m, leap: false, label: LUNAR_MONTHS[m - 1], gz: monthGanZhi(year, m) });
    if (leapM === m) {
      list.push({ month: m, leap: true, label: `闰${LUNAR_MONTHS[m - 1]}`, gz: monthGanZhi(year, m) });
    }
  }

  const months: KlineMonth[] = [];
  const M = list.length;
  list.forEach((cell, i) => {
    const mStem = cell.gz.charAt(0);
    const mBranch = BRANCHES[fixIndex(cell.month + 1)]; // 正月建寅
    const factors: string[] = [];
    let gain = 0;
    let drain = 0;

    // 月干四化落三方四正（忌按落位专用权重）
    for (const hit of mutHits(mStem)) {
      const w = wmap.get(hit.idx);
      if (!w) continue;
      if (hit.k === 3) {
        const pos = hit.idx === P ? 0 : hit.idx === fixIndex(P + 6) ? 1 : 2;
        const v = JI_WEIGHTS[pos] * Math.abs(MUT_MONTHLY[3]);
        drain += v;
        factors.push(
          `月${hit.star}化忌→${a.palaces[hit.idx].name}${pos === 1 ? "(冲本宫)" : ""} -${round(v)}`
        );
      } else {
        const v = w * MUT_MONTHLY[hit.k];
        gain += v;
        if (v >= 0.8)
          factors.push(`月${hit.star}化${MUTAGEN_CHARS[hit.k]}→${a.palaces[hit.idx].name} ${fmt(v)}`);
      }
    }

    // 月支冲合本宫
    if (CHONG[mBranch] === pBranch) {
      drain += 3;
      factors.push("月支冲本宫 -3");
    } else if (LIU_HE[mBranch] === pBranch) {
      gain += 1.5;
      factors.push("月支合本宫 +1.5");
    }

    // 月曜（魁钺昌曲禄羊陀马鸾喜，鸾喜在夫妻/子女域加倍）
    for (const f of flowStarsOf("monthly", mStem, mBranch)) {
      const w = wmap.get(f.idx);
      if (!w) continue;
      let v = f.v * w;
      if (LUAN_XI.has(f.name) && LOVE_DOMAINS.has(palace.name)) v *= 2;
      if (v >= 0) gain += v;
      else drain += -v;
      if (Math.abs(v) >= 0.5)
        factors.push(`${f.name}入${a.palaces[f.idx].name} ${v >= 0 ? fmt(v) : `-${round(-v)}`}`);
    }

    if (cell.leap) factors.push("闰月沿用本月干支（无独立月建）");

    const net = gain - drain;
    const magnitude = gain + drain;
    // 沿年K开盘→收盘轨迹漂移 + 月波动
    const base = anchor.open + ((anchor.close - anchor.open) * (i + 1)) / M;
    const close = clamp(round(base + net), 5, 95);

    let pattern = "平稳";
    if (magnitude < 2.5) pattern = "平";
    else if (gain >= 3 && drain >= 3) pattern = "大进大出";
    else if (net >= 3) pattern = "顺遂";
    else if (net <= -3) pattern = "破耗";

    months.push({
      ...cell,
      open: 0,
      close,
      high: 0,
      low: 0,
      score: close,
      delta: 0,
      gain: round(gain),
      drain: round(drain),
      net: round(net),
      magnitude: round(magnitude),
      pattern,
      factors,
    });
  });

  let prev = anchor.open;
  for (const m of months) {
    m.open = round(prev);
    m.delta = m.close - m.open;
    m.high = clamp(round(Math.max(m.open, m.close) + m.gain * 0.5), 2, 98);
    m.low = clamp(round(Math.min(m.open, m.close) - m.drain * 0.5), 2, 98);
    prev = m.close;
  }

  return {
    year,
    ganZhi: yearGanZhi(year),
    palaceIndex: P,
    palaceName: palace.name,
    months,
    note: "月K线：以该年年K开盘→收盘轨迹为基准漂移，月干四化（五虎遁）+ 月支冲合 + 月曜（魁钺昌曲禄羊陀马鸾喜）制造波动；闰月沿用本月干支。用于定应期月份，颗粒度细于年线、权重低于年线。",
  };
}
