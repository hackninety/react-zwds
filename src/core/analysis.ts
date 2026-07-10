/**
 * 结构分析层：把斗数推理中「机械且 AI 最易出错」的中间步骤确定性算好，
 * 供导出直接引用 —— 三方四正快照、飞宫四化全矩阵（含离心/向心自化）、
 * 夹宫关系、空宫借星；格局检测在 patterns.ts（此处聚合再导出）。
 *
 * 全部只读本命盘（Astrolabe），不依赖运限状态；四化表跟随 iztro 全局配置。
 * 各函数接受可选共享索引（analyzeChart 整盘建一次向下传），默认自建。
 */
import { util } from "iztro";
import type { Astrolabe } from "./useZwds";
import { MUTAGEN_CHARS, fixIndex } from "./utils";
import {
  AUSPICIOUS_MINORS,
  SEAT_ROLES,
  SHA_STARS,
  buildChartIndex,
  sanfangIdx,
  starNamesAt,
  starTxt,
  type ChartIndex,
} from "./chartIndex";
import { detectHoroscopePatterns, detectPatterns, type Pattern } from "./patterns";

/* 对外保持单一门面：格局与索引原语经此再导出 */
export * from "./patterns";
export * from "./chartIndex";

/* ─────────────── 一、空宫借星 ─────────────── */

export type BorrowedInfo = {
  palaceIndex: number;
  palaceName: string;
  branch: string;
  /** 借对宫主星（带亮度） */
  borrowed: string[];
  oppositeName: string;
};

export function getBorrowedStars(a: Astrolabe, ix: ChartIndex = buildChartIndex(a)): BorrowedInfo[] {
  const out: BorrowedInfo[] = [];
  for (const p of a.palaces) {
    if (p.majorStars.length) continue;
    const opp = a.palaces[fixIndex(p.index + 6)];
    out.push({
      palaceIndex: p.index,
      palaceName: p.name,
      branch: p.earthlyBranch as string,
      borrowed: opp.majorStars.map((s) => starTxt(ix, s.name as string)),
      oppositeName: opp.name,
    });
  }
  return out;
}

/* ─────────────── 二、三方四正快照 ─────────────── */

export type SanfangSeat = {
  role: (typeof SEAT_ROLES)[number];
  palaceName: string;
  branch: string;
  majors: string;
};

export type SanfangSnapshot = {
  palaceIndex: number;
  palaceName: string;
  branch: string;
  seats: SanfangSeat[];
  /** 会照六吉+禄马（带落点） */
  auspicious: string[];
  /** 会照六煞（带落点） */
  inauspicious: string[];
  /** 生年四化会入（带落点） */
  natalMutagens: string[];
  shaCount: number;
  borrowed: string | null;
};

export function getSanfangSnapshots(a: Astrolabe, ix: ChartIndex = buildChartIndex(a)): SanfangSnapshot[] {
  return a.palaces.map((p) => {
    const idxs = sanfangIdx(p.index);
    const seats: SanfangSeat[] = idxs.map((q, k) => {
      const t = a.palaces[q];
      return {
        role: SEAT_ROLES[k],
        palaceName: t.name,
        branch: t.earthlyBranch as string,
        majors: t.majorStars.map((s) => starTxt(ix, s.name as string)).join("、") || "无主星",
      };
    });
    const locTag = (q: number, k: number) =>
      k === 0 ? "本宫" : k === 1 ? `对宫·${a.palaces[q].name}` : `三合·${a.palaces[q].name}`;
    const auspicious: string[] = [];
    const inauspicious: string[] = [];
    const natalMutagens: string[] = [];
    let shaCount = 0;
    idxs.forEach((q, k) => {
      const names = starNamesAt(a, q);
      for (const n of names) {
        if (AUSPICIOUS_MINORS.includes(n)) auspicious.push(`${n}(${locTag(q, k)})`);
        if (SHA_STARS.includes(n)) {
          inauspicious.push(`${n}(${locTag(q, k)})`);
          shaCount++;
        }
        const mk = ix.natal.indexOf(n);
        if (mk >= 0) natalMutagens.push(`${n}化${MUTAGEN_CHARS[mk]}(${locTag(q, k)})`);
      }
    });
    const opp = a.palaces[fixIndex(p.index + 6)];
    const borrowed =
      p.majorStars.length === 0
        ? `本宫无主星，借对宫【${opp.name}】${
            opp.majorStars.map((s) => starTxt(ix, s.name as string)).join("、") || "（对宫亦无主星）"
          }`
        : null;
    return {
      palaceIndex: p.index,
      palaceName: p.name,
      branch: p.earthlyBranch as string,
      seats,
      auspicious,
      inauspicious,
      natalMutagens,
      shaCount,
      borrowed,
    };
  });
}

/* ─────────────── 三、飞宫四化全矩阵 ─────────────── */

export type FlyEntry = {
  mutagen: (typeof MUTAGEN_CHARS)[number];
  star: string;
  toIndex: number;
  toName: string;
  toBranch: string;
  /** 落回本宫（离心自化） */
  isSelf: boolean;
  /** 落入对宫（即对宫的向心来源） */
  isOpposite: boolean;
};

export type PalaceFly = {
  palaceIndex: number;
  palaceName: string;
  branch: string;
  stem: string;
  flies: FlyEntry[];
  /** 离心自化：本宫干四化本宫之星 */
  selfOutward: string[];
  /** 向心自化：对宫干四化入本宫之星 */
  selfInward: string[];
};

export type FlyMatrix = {
  palaces: PalaceFly[];
  /** 语句化：每宫一句「X宫(干)：禄入A、权入B、科入C、忌入D」 */
  sentences: string[];
  note: string;
};

export function getFlyMatrix(a: Astrolabe, ix: ChartIndex = buildChartIndex(a)): FlyMatrix {
  const rawFlies = (P: number): FlyEntry[] => {
    const p = a.palaces[P];
    const stars = util.getMutagensByHeavenlyStem(p.heavenlyStem as never) as string[];
    return stars.map((star, k) => {
      const to = ix.pos.get(star) ?? -1;
      const t = to >= 0 ? a.palaces[to] : null;
      return {
        mutagen: MUTAGEN_CHARS[k],
        star,
        toIndex: to,
        toName: t?.name ?? "（星不在盘中）",
        toBranch: (t?.earthlyBranch as string) ?? "",
        isSelf: to === P,
        isOpposite: to === fixIndex(P + 6),
      };
    });
  };
  const palaces: PalaceFly[] = a.palaces.map((p) => {
    const flies = rawFlies(p.index);
    const oppFlies = rawFlies(fixIndex(p.index + 6));
    return {
      palaceIndex: p.index,
      palaceName: p.name,
      branch: p.earthlyBranch as string,
      stem: p.heavenlyStem as string,
      flies,
      selfOutward: flies.filter((f) => f.isSelf).map((f) => `${f.star}化${f.mutagen}`),
      selfInward: oppFlies
        .filter((f) => f.toIndex === p.index)
        .map((f) => `${f.star}化${f.mutagen}（来自对宫宫干）`),
    };
  });
  const sentences = palaces.map((pf) => {
    const parts = pf.flies.map((f) =>
      f.isSelf
        ? `化${f.mutagen}=${f.star}→本宫（自化${f.mutagen}·离心）`
        : `化${f.mutagen}=${f.star}→${f.toName}`
    );
    return `${pf.palaceName}(${pf.stem}${pf.branch})：${parts.join("，")}`;
  });
  return {
    palaces,
    sentences,
    note: "宫干四化=该宫对他宫的因果投射（如财帛宫化忌入夫妻=为配偶/感情付出金钱）。离心自化=本宫气外泄不聚；向心自化=对宫牵引入本宫。忌入某宫=纠缠沉淀，忌落对宫即冲本宫=变动更烈。",
  };
}

/* ─────────────── 四、夹宫关系 ─────────────── */

export type JiaGong = {
  palaceIndex: number;
  palaceName: string;
  branch: string;
  kind: string;
  good: boolean;
  detail: string;
};

const JIA_PAIRS: { kind: string; s1: string; s2: string; good: boolean; note: string }[] = [
  { kind: "左右夹", s1: "左辅", s2: "右弼", good: true, note: "贵人扶持，稳固" },
  { kind: "昌曲夹", s1: "文昌", s2: "文曲", good: true, note: "文星辅佑，利科名" },
  { kind: "魁钺夹", s1: "天魁", s2: "天钺", good: true, note: "贵人夹命，机遇多" },
  { kind: "日月夹", s1: "太阳", s2: "太阴", good: true, note: "日月夹辅，不权则富" },
  { kind: "羊陀夹", s1: "擎羊", s2: "陀罗", good: false, note: "羊陀相夹（本宫必坐禄存），束缚牵制" },
  { kind: "火铃夹", s1: "火星", s2: "铃星", good: false, note: "火铃夹制，急躁受迫" },
  { kind: "空劫夹", s1: "地空", s2: "地劫", good: false, note: "空劫相夹，财福易漏" },
];

export function getJiaGong(a: Astrolabe, ix: ChartIndex = buildChartIndex(a)): JiaGong[] {
  const out: JiaGong[] = [];
  for (const p of a.palaces) {
    const prev = new Set(starNamesAt(a, p.index - 1));
    const next = new Set(starNamesAt(a, p.index + 1));
    const both = (x: string, y: string) => (prev.has(x) && next.has(y)) || (prev.has(y) && next.has(x));
    for (const pair of JIA_PAIRS) {
      if (both(pair.s1, pair.s2)) {
        out.push({
          palaceIndex: p.index,
          palaceName: p.name,
          branch: p.earthlyBranch as string,
          kind: pair.kind,
          good: pair.good,
          detail: pair.note,
        });
      }
    }
    // 禄忌夹：一邻有禄存或生年禄星，另一邻有生年忌星
    const luSet = ["禄存", ix.natal[0]].filter(Boolean) as string[];
    const jiStar = ix.natal[3];
    if (jiStar) {
      const hasLu = (s: Set<string>) => luSet.some((n) => s.has(n));
      if ((hasLu(prev) && next.has(jiStar)) || (hasLu(next) && prev.has(jiStar))) {
        out.push({
          palaceIndex: p.index,
          palaceName: p.name,
          branch: p.earthlyBranch as string,
          kind: "禄忌夹",
          good: false,
          detail: "禄忌相夹，吉中藏纠缠、进退两难",
        });
      }
    }
  }
  return out;
}

/* ─────────────── 汇总入口 ─────────────── */

export type ChartAnalysis = {
  note: string;
  patterns: Pattern[];
  sanfang: SanfangSnapshot[];
  flyMatrix: FlyMatrix;
  jiaGong: JiaGong[];
  borrowed: BorrowedInfo[];
};

export function analyzeChart(a: Astrolabe): ChartAnalysis {
  const ix = buildChartIndex(a); // 整盘建一次索引，五个分析共享
  return {
    note: "本节为确定性结构分析（与安星/四化同一口径算出）：patterns=格局检测（含成格瑕疵与古籍出处）；sanfang=每宫三方四正快照（会吉/会煞/四化会入已汇总，无需再数宫位）；flyMatrix=十二宫宫干四化飞宫全矩阵（含离心/向心自化）；jiaGong=夹宫关系；borrowed=空宫借星。分析时请直接引用本节结论。",
    patterns: detectPatterns(a, ix),
    sanfang: getSanfangSnapshots(a, ix),
    flyMatrix: getFlyMatrix(a, ix),
    jiaGong: getJiaGong(a, ix),
    borrowed: getBorrowedStars(a, ix),
  };
}
