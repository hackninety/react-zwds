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
 *   逐年 = 50 + baseline
 *          + 大限四化落三方四正（禄+6 权+4 科+3 忌-6,按位权）
 *          + 流年四化落三方四正（禄+8 权+5 科+4 忌-8,按位权）
 *          + 流年支冲本宫 -4 / 六合本宫 +2
 *          + 命宫域岁限并临 -2
 *   收敛 [8,92]；K 线 open=上年 close,high/low 由动荡度（冲/忌/煞聚/并临）撑开。
 */
import { util } from "iztro";
import type { Astrolabe, DecadeInfo } from "./useZwds";
import { BRANCHES, MUTAGEN_CHARS, fixIndex, yearGanZhi } from "./utils";

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

    /* baseline（静态：三方四正星情 + 生年四化 + 身宫；自化忌者留不住，基调略降） */
    let baseline = 0;
    for (const [q, w] of wmap) baseline += w * palaceStarScore(a, q).s;
    for (const hit of mutHits(natalYearStem)) {
      const w = wmap.get(hit.idx);
      if (w) baseline += w * MUT_NATAL_BASE[hit.k];
    }
    if (palace.isBodyPalace) baseline += 2;
    // 自化忌（本宫宫干化忌落本宫）：主动漏、得而复失的结构性倾向
    const hasSelfJi = mutHits(palace.heavenlyStem).some((h) => h.k === 3 && h.idx === P);
    if (hasSelfJi) baseline -= 2;
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

      // 四化落三方四正：禄权科=进；忌=出，按落位区分性质（入本宫=纠缠 / 冲本宫=被动 / 三合=拖累）
      const applyMut = (stem: string, MUT: number[], tag: string) => {
        for (const hit of mutHits(stem)) {
          const w = wmap.get(hit.idx);
          if (!w) continue;
          const v = w * MUT[hit.k];
          if (hit.k === 3) {
            drain += Math.abs(v);
            if (hit.idx === P) nature.push(`${tag}${hit.star}忌入本宫·纠缠`);
            else if (hit.idx === fixIndex(P + 6)) nature.push(`${tag}${hit.star}忌冲本宫·被动`);
            else nature.push(`${tag}${hit.star}忌拖累三合`);
          } else {
            gain += v;
          }
          if (Math.abs(v) >= 1)
            factors.push(`${tag}${hit.star}化${MUTAGEN_CHARS[hit.k]}→${a.palaces[hit.idx].name} ${fmt(v)}`);
        }
      };
      if (decade) applyMut(decade.heavenlyStem, MUT_DECADAL, "大限");
      applyMut(yStem, MUT_YEARLY, "流年");

      // 流年支与本宫：六合=进，六冲=出（被动）
      if (CHONG[yBranch] === pBranch) {
        drain += 4;
        nature.push("流年支冲本宫·被动");
        factors.push("流年支冲本宫 -4");
      } else if (LIU_HE[yBranch] === pBranch) {
        gain += 2;
        factors.push("流年支合本宫 +2");
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
    note: "紫微分域量化：每宫独立看其三方四正 + 四化落宫。区分「进(禄权科)」与「出(忌·冲·自化漏)」两股动能——净决定 K 线涨跌，进撑上影、出压下影。故「大进大出」年为小实体长上下影(十字)，非单一好坏；出项再分主动(自化漏)/被动(忌冲)/纠缠(忌入)。确定性推演,仅供参考娱乐。",
    domains,
    bands,
    lastAge,
  };
}
