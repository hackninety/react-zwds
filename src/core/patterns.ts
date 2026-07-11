/**
 * 格局检测层：本命格局（~45 个经典格局，含成格瑕疵与古籍出处）
 * 与运限格局扫描（大限/流年层八类）。
 *
 * 由 analysis.ts 拆出；盘面索引原语见 chartIndex.ts。
 * 各检测函数接受可选共享索引（整盘建一次向下传），默认自建。
 */
import { util } from "iztro";
import { getHoroscopeStar } from "iztro/lib/star/horoscopeStar";
import type { Astrolabe } from "./useZwds";
import { BRANCH_LIUHE, fixIndex } from "./utils";
import {
  SHA_STARS,
  buildChartIndex,
  sanfangIdx,
  starNamesAt,
  type ChartIndex,
} from "./chartIndex";

/* ─────────────── 五、格局检测 ─────────────── */

export type Pattern = {
  name: string;
  kind: "吉" | "凶" | "注意";
  where: string;
  basis: string;
  meaning: string;
  classic?: string;
  flaw?: string;
};

export function detectPatterns(a: Astrolabe, ix: ChartIndex = buildChartIndex(a)): Pattern[] {
  const S = ix.soulIdx;
  if (S < 0) return [];
  const out: Pattern[] = [];

  const soul = a.palaces[S];
  const soulBranch = soul.earthlyBranch as string;
  const soulMajors = new Set(soul.majorStars.map((s) => s.name as string));
  const soulAll = new Set(starNamesAt(a, S));
  const sfIdx = sanfangIdx(S);
  const sfStars = new Set<string>(sfIdx.flatMap((q) => starNamesAt(a, q)));
  const prevSet = new Set(starNamesAt(a, S - 1));
  const nextSet = new Set(starNamesAt(a, S + 1));

  const pName = (i: number) => {
    const p = a.palaces[fixIndex(i)];
    return `${p.name}(${p.earthlyBranch})`;
  };
  const at = (star: string) => {
    const i = ix.pos.get(star);
    return i == null ? "?" : pName(i);
  };
  const soulWhere = `命宫(${soulBranch})`;
  const brightOf = (star: string) => ix.bright.get(star) ?? "";
  const jiStar = ix.natal[3];
  const luStar = ix.natal[0];

  /** 命三方四正的煞忌瑕疵（吉格通用破格检查） */
  const soulFlaw = (): string | undefined => {
    const bad: string[] = [];
    sfIdx.forEach((q, k) => {
      const tag = k === 0 ? "本宫" : k === 1 ? "对宫" : "三合";
      for (const n of starNamesAt(a, q)) {
        if (SHA_STARS.includes(n)) bad.push(`${n}(${tag})`);
        else if (n === jiStar) bad.push(`${n}化忌(${tag})`);
      }
    });
    return bad.length ? `命宫三方四正见 ${bad.join("、")}，成格带瑕，力量打折` : undefined;
  };

  const add = (p: Pattern) => out.push(p);
  const addSoulGood = (p: Omit<Pattern, "kind" | "where" | "flaw">) =>
    add({ ...p, kind: "吉", where: soulWhere, flaw: soulFlaw() });

  /* —— 命宫主星结构 —— */
  if (soulMajors.has("紫微") && soulMajors.has("天府")) {
    addSoulGood({
      name: "紫府同宫",
      basis: `紫微、天府同守命宫（${soulBranch}）`,
      meaning: "帝座与财库同宫，气象宏大，终身衣禄丰足",
      classic: "「紫府同宫，终身福厚」——《紫微斗数全书·骨髓赋》",
    });
  } else if (sfStars.has("紫微") && sfStars.has("天府")) {
    addSoulGood({
      name: "紫府朝垣",
      basis: `紫微在${at("紫微")}、天府在${at("天府")}，会照命宫三方四正`,
      meaning: "紫府来朝，一生多贵人提携、根基厚",
    });
  }

  if (!soulMajors.has("天府") && !soulMajors.has("天相") && sfStars.has("天府") && sfStars.has("天相")) {
    addSoulGood({
      name: "府相朝垣",
      basis: `天府在${at("天府")}、天相在${at("天相")}，朝拱命宫`,
      meaning: "库星印星拱命，稳中求进，宜从政从商任要职",
      classic: "「天府天相乃为衣禄之神，为仕为官定主亨通之兆」——《紫微斗数全书·太微赋》",
    });
  }

  if (soulMajors.has("紫微") && sfStars.has("左辅") && sfStars.has("右弼")) {
    addSoulGood({
      name: "君臣庆会",
      basis: `紫微守命，左辅（${at("左辅")}）右弼（${at("右弼")}）会照`,
      meaning: "帝星得辅弼，统御力强，可担大任",
      classic: "「君臣庆会，材擅经邦」——《紫微斗数全书·骨髓赋》",
    });
  }

  if (["天机", "太阴", "天同", "天梁"].every((s) => sfStars.has(s))) {
    addSoulGood({
      name: "机月同梁",
      basis: "天机、太阴、天同、天梁齐会命宫三方四正",
      meaning: "思虑周密、宜幕僚/文职/公门/专业技术，稳定中成就",
      classic: "「机月同梁作吏人」——《紫微斗数全书·骨髓赋》",
    });
  }

  const sblStar = ["七杀", "破军", "贪狼"].find((s) => soulMajors.has(s));
  if (sblStar) {
    add({
      name: "杀破狼",
      kind: "注意",
      where: soulWhere,
      basis: `命坐${sblStar}，三方必会${["七杀", "破军", "贪狼"].filter((s) => s !== sblStar).join("、")}`,
      meaning: "人生主变动开创、大起大落，宜武职/创业/技术攻坚，忌守成",
    });
  }

  if (soul.majorStars.length === 0) {
    const opp = a.palaces[fixIndex(S + 6)];
    add({
      name: "命无正曜",
      kind: "注意",
      where: soulWhere,
      basis: `命宫无主星，借对宫【${opp.name}】${opp.majorStars.map((s) => s.name).join("、") || "（对宫亦空）"}论`,
      meaning: "个性随环境塑造、可塑性强，吉凶随借星与会照而定",
    });
  }

  /* —— 特定星+宫位 —— */
  const soulSeat = (star: string, branches: string[], p: Omit<Pattern, "kind" | "where" | "flaw">) => {
    if (soulMajors.has(star) && branches.includes(soulBranch)) addSoulGood(p);
  };

  if (["卯", "酉"].includes(soulBranch) && soulMajors.has("紫微") && soulMajors.has("贪狼")) {
    add({
      name: "极居卯酉",
      kind: "注意",
      where: soulWhere,
      basis: `紫微、贪狼同守命于${soulBranch}`,
      meaning: "帝星遇桃花于四败之地，多哲学/宗教/艺术缘分；逢空劫尤主方外之志",
      classic: "「极居卯酉遇劫空，十人之命九为僧」——《紫微斗数全书·骨髓赋》",
    });
  }
  if (["卯", "酉"].includes(soulBranch) && soulMajors.has("巨门") && soulMajors.has("天机")) {
    addSoulGood({
      name: "巨机同临",
      basis: `巨门、天机同守命于${soulBranch}`,
      meaning: "口才机变出众，卯宫为佳（巨机居卯格），利言语/企划/传播",
    });
  }
  if (["寅", "申"].includes(soulBranch) && soulMajors.has("巨门") && soulMajors.has("太阳")) {
    addSoulGood({
      name: "巨日同宫",
      basis: `巨门、太阳同守命于${soulBranch}（寅优于申）`,
      meaning: "光明磊落、以口才扬名，利外交/法律/教育",
      classic: "「巨日同宫，官封三代」——《紫微斗数全书·骨髓赋》",
    });
  }
  if (soulMajors.has("太阳") && soulMajors.has("太阴")) {
    addSoulGood({
      name: "日月同宫",
      basis: `太阳、太阴同守命（${soulBranch}）`,
      meaning: "阴阳并处，性格双面而才艺多端，丑未宫成局",
    });
  }
  if (["辰", "戌"].includes(soulBranch) && soulMajors.has("天机") && soulMajors.has("天梁")) {
    addSoulGood({
      name: "善荫朝纲",
      basis: `天机、天梁同守命于${soulBranch}`,
      meaning: "机梁善谈兵，善筹划、宜军师/参谋/顾问之职",
    });
  }
  if (["丑", "未"].includes(soulBranch) && soulMajors.has("武曲") && soulMajors.has("贪狼")) {
    addSoulGood({
      name: "武贪同行",
      basis: `武曲、贪狼同守命于${soulBranch}`,
      meaning: "财星遇欲望之星，先贫后富、三十后发",
      classic: "「先贫后富，武贪同身命之宫」——《紫微斗数全书·骨髓赋》",
    });
  }
  soulSeat("巨门", ["子", "午"], {
    name: "石中隐玉",
    basis: `巨门独守命于${soulBranch}`,
    meaning: "才华内蕴、大器晚成，愈磨愈亮",
    classic: "「巨门子午科权禄，石中隐玉福兴隆」——《紫微斗数全书》诗诀",
  });
  soulSeat("七杀", ["寅", "申", "子", "午"], {
    name: ["寅", "申"].includes(soulBranch) ? "七杀朝斗" : "七杀仰斗",
    basis: `七杀入庙守命于${soulBranch}`,
    meaning: "将星得地，魄力过人，宜军警/外科/开创性事业",
    classic: "「七杀朝斗，爵禄荣昌」——《紫微斗数全书》",
  });
  soulSeat("破军", ["子", "午"], {
    name: "英星入庙",
    basis: `破军入庙守命于${soulBranch}`,
    meaning: "破军子午为英星，敢破敢立，横发之局",
  });
  soulSeat("武曲", ["辰", "戌", "丑", "未"], {
    name: "将星得地",
    basis: `武曲入庙守命于${soulBranch}`,
    meaning: "财星入库地，刚毅果决，宜财经/实业",
  });
  soulSeat("太阳", ["午"], {
    name: "日丽中天",
    basis: "太阳守命于午（日之极旺）",
    meaning: "光芒极盛，声名远播，宜公众事业；亦防过亢",
  });
  soulSeat("太阳", ["卯"], {
    name: "日照雷门",
    basis: "太阳守命于卯（旭日东升）",
    meaning: "朝气蓬勃，早年即得发展",
    classic: "「日照雷门，富贵荣华」——《紫微斗数全书》",
  });
  soulSeat("太阴", ["亥"], {
    name: "月朗天门",
    basis: "太阴守命于亥（月之旺地）",
    meaning: "清贵之格，文名利禄兼得",
    classic: "「月朗天门，进爵封侯」——《紫微斗数全书》诗诀",
  });
  if (soulBranch === "子" && soulMajors.has("天同") && soulMajors.has("太阴")) {
    addSoulGood({
      name: "水澄桂萼",
      basis: "天同、太阴同守命于子（水乡月明）",
      meaning: "清雅之贵，宜清要之职、学术文教",
    });
  }

  // 明珠出海：未宫空命，日卯月亥来会
  if (
    soulBranch === "未" &&
    soul.majorStars.length === 0 &&
    ix.pos.get("太阳") != null &&
    ix.pos.get("太阴") != null &&
    a.palaces[ix.pos.get("太阳")!].earthlyBranch === "卯" &&
    a.palaces[ix.pos.get("太阴")!].earthlyBranch === "亥"
  ) {
    addSoulGood({
      name: "明珠出海",
      basis: "未宫安命无正曜，太阳在卯、太阴在亥拱照",
      meaning: "日月并明来朝，早岁扬名、贵显之格",
    });
  }

  // 日月并明 / 反背 / 夹命
  const sunB = brightOf("太阳");
  const moonB = brightOf("太阴");
  if (sfStars.has("太阳") && sfStars.has("太阴") && ["庙", "旺"].includes(sunB) && ["庙", "旺"].includes(moonB)) {
    addSoulGood({
      name: "日月并明",
      basis: `太阳(${sunB})在${at("太阳")}、太阴(${moonB})在${at("太阴")}，俱旺会照命宫`,
      meaning: "日月皆明，光被四表，主贵显",
      classic: "「日月并明，佐九重于尧殿」——《紫微斗数全书·骨髓赋》",
    });
  }
  if (sunB === "陷" && moonB === "陷") {
    add({
      name: "日月反背",
      kind: "注意",
      where: `太阳${at("太阳")}、太阴${at("太阴")}`,
      basis: "太阳、太阴俱落陷（以全盘论）",
      meaning: "日月失辉，早年辛劳、离乡背井反可成；忌自怨自艾",
    });
  }
  if ((prevSet.has("太阳") && nextSet.has("太阴")) || (prevSet.has("太阴") && nextSet.has("太阳"))) {
    addSoulGood({
      name: "日月夹命",
      basis: "太阳、太阴分居命宫两邻相夹",
      meaning: "日月辅照，非贵即富",
      classic: "「日月夹命、夹财，不权则富」——《紫微斗数全书·骨髓赋》",
    });
  }

  /* —— 吉助会照 —— */
  if (ix.natal[0] && ix.natal[1] && ix.natal[2]) {
    const hit = [0, 1, 2].every((k) => sfStars.has(ix.natal[k]));
    if (hit) {
      addSoulGood({
        name: "三奇加会",
        basis: `生年化禄(${ix.natal[0]})、化权(${ix.natal[1]})、化科(${ix.natal[2]})俱会命宫三方四正`,
        meaning: "禄权科三奇拱命，才干、机遇、名望齐备，大格",
        classic: "「科权禄拱，名誉昭彰」——《紫微斗数全书·骨髓赋》",
      });
    }
  }
  if (sfStars.has("禄存") && luStar && sfStars.has(luStar)) {
    addSoulGood({
      name: "双禄朝垣",
      basis: `禄存(${at("禄存")})与生年化禄星${luStar}(${at(luStar)})同会命宫三方`,
      meaning: "双禄交会，一生财源不断",
    });
  }
  // 禄马交驰：天马与禄存/化禄同宫（最标准），或同会命三方
  const horsePos = ix.pos.get("天马");
  if (horsePos != null) {
    const horseMates = starNamesAt(a, horsePos);
    const luHere = horseMates.includes("禄存") || (luStar ? horseMates.includes(luStar) : false);
    if (luHere) {
      add({
        name: "禄马交驰",
        kind: "吉",
        where: pName(horsePos),
        basis: `天马与${horseMates.includes("禄存") ? "禄存" : `化禄星${luStar}`}同宫于${pName(horsePos)}`,
        meaning: "禄随马动，越动越发，利远方求财/外地发展",
        flaw: sfIdx.includes(horsePos) ? soulFlaw() : undefined,
      });
    } else if (sfStars.has("天马") && (sfStars.has("禄存") || (luStar && sfStars.has(luStar)))) {
      addSoulGood({
        name: "禄马交驰（会照）",
        basis: "天马与禄存/化禄分处命宫三方四正交会",
        meaning: "动中得财，宜奔波经营、异地开拓",
      });
    }
  }
  if (["太阳", "天梁", "文昌"].every((s) => sfStars.has(s)) && (sfStars.has("禄存") || (luStar && sfStars.has(luStar)))) {
    addSoulGood({
      name: "阳梁昌禄",
      basis: `太阳(${at("太阳")})、天梁(${at("天梁")})、文昌(${at("文昌")})与禄会于命宫三方`,
      meaning: "考试功名第一格，利学业、科举、体制内晋升",
      classic: "「阳梁昌禄，胪传第一名」——《紫微斗数全书·骨髓赋》",
    });
  }
  const oppSet = new Set(starNamesAt(a, S + 6));
  if (
    (soulAll.has("天魁") && oppSet.has("天钺")) ||
    (soulAll.has("天钺") && oppSet.has("天魁"))
  ) {
    addSoulGood({
      name: "坐贵向贵",
      basis: "天魁、天钺一坐命宫一居对宫相向",
      meaning: "贵人前后相扶，逢凶有解、机会常至",
      classic: "「魁钺命身多折桂」——《紫微斗数全书》",
    });
  }
  if (prevSet.has("天魁") && nextSet.has("天钺") || prevSet.has("天钺") && nextSet.has("天魁")) {
    addSoulGood({
      name: "魁钺夹命",
      basis: "天魁、天钺夹命宫",
      meaning: "贵人相夹，暗中多助力",
    });
  }
  if ((prevSet.has("文昌") && nextSet.has("文曲")) || (prevSet.has("文曲") && nextSet.has("文昌"))) {
    addSoulGood({
      name: "昌曲夹命",
      basis: "文昌、文曲夹命宫",
      meaning: "文星相夹，聪慧儒雅、利文途",
    });
  }
  if ((prevSet.has("左辅") && nextSet.has("右弼")) || (prevSet.has("右弼") && nextSet.has("左辅"))) {
    addSoulGood({
      name: "左右夹命",
      basis: "左辅、右弼夹命宫",
      meaning: "辅弼相夹，根基稳固、得力于团队",
    });
  }
  if (soulAll.has("左辅") && soulAll.has("右弼")) {
    addSoulGood({
      name: "左右同宫",
      basis: "左辅、右弼同守命宫",
      meaning: "众望所归，一呼百应",
      classic: "「左右同宫，披罗衣紫」——《紫微斗数全书·骨髓赋》",
    });
  }
  if (soulAll.has("文昌") && soulAll.has("文曲")) {
    addSoulGood({
      name: "文桂文华",
      basis: "文昌、文曲同守命宫",
      meaning: "昌曲同宫，才学出众、气质文雅",
    });
  }

  /* —— 凶/注意类 —— */
  const luCunPos = ix.pos.get("禄存");
  if (luCunPos != null && jiStar && starNamesAt(a, luCunPos).includes(jiStar)) {
    add({
      name: "羊陀夹忌",
      kind: "凶",
      where: pName(luCunPos),
      basis: `生年化忌星${jiStar}与禄存同宫（禄存必被擎羊、陀罗相夹）`,
      meaning: "忌星受夹无路可出，该宫事项多阻滞破败，为斗数著名败局",
      classic: "「羊陀夹忌为败局」——《紫微斗数全书·骨髓赋》",
    });
  }
  if ((prevSet.has("火星") && nextSet.has("铃星")) || (prevSet.has("铃星") && nextSet.has("火星"))) {
    add({
      name: "火铃夹命",
      kind: "凶",
      where: soulWhere,
      basis: "火星、铃星夹命宫",
      meaning: "两煞相迫，性急多波折；命宫有贪狼反主奋发",
      classic: "「火铃夹命为败局」——《紫微斗数全书·骨髓赋》",
    });
  }
  if ((prevSet.has("地空") && nextSet.has("地劫")) || (prevSet.has("地劫") && nextSet.has("地空"))) {
    add({
      name: "空劫夹命",
      kind: "凶",
      where: soulWhere,
      basis: "地空、地劫夹命宫",
      meaning: "财福两空之夹，宜技术/哲思立身，忌投机",
    });
  }
  if (soulAll.has("地空") || soulAll.has("地劫")) {
    const both = soulAll.has("地空") && soulAll.has("地劫");
    add({
      name: "命里逢空",
      kind: "注意",
      where: soulWhere,
      basis: `${["地空", "地劫"].filter((s) => soulAll.has(s)).join("、")}坐命${both ? "（空劫同坐，力重）" : ""}`,
      meaning: "精神性强、不重物欲，宜创意/玄学/技术，理财宜保守",
    });
  }
  // 火贪/铃贪（全盘检索，注明是否关联命三方）
  const tanPos = ix.pos.get("贪狼");
  if (tanPos != null) {
    const mates = starNamesAt(a, tanPos);
    for (const fire of ["火星", "铃星"]) {
      if (mates.includes(fire)) {
        add({
          name: fire === "火星" ? "火贪格" : "铃贪格",
          kind: "吉",
          where: pName(tanPos),
          basis: `贪狼与${fire}同宫于${pName(tanPos)}${sfIdx.includes(tanPos) ? "（在命宫三方四正内）" : ""}`,
          meaning: "横发之格，突发财名；防暴起暴落，得而善守为要",
          classic: "「贪狼火星居庙旺，名镇诸邦」——《紫微斗数全书》诗诀",
        });
      }
    }
    if (["亥", "子"].includes(a.palaces[tanPos].earthlyBranch as string) && tanPos === S) {
      add({
        name: "泛水桃花",
        kind: "注意",
        where: soulWhere,
        basis: `贪狼坐命于${soulBranch}（水乡）`,
        meaning: "魅力强、人缘广，感情丰富须自律",
        classic: "「贪居亥子，名为泛水桃花」——《紫微斗数全书》",
      });
    }
    if (tanPos === S && soulAll.has("陀罗")) {
      add({
        name: "风流彩杖",
        kind: "注意",
        where: soulWhere,
        basis: "贪狼与陀罗同守命宫",
        meaning: "因情多纠缠、因欲生波折，感情事须节制",
      });
    }
  }
  // 刑忌夹印 / 财荫夹印（对每个天相宫检查）
  const xiangPos = ix.pos.get("天相");
  if (xiangPos != null) {
    const xp = a.palaces[xiangPos];
    const n1 = new Set(starNamesAt(a, xiangPos - 1));
    const n2 = new Set(starNamesAt(a, xiangPos + 1));
    const hasXing = (s: Set<string>) => s.has("擎羊") || s.has("天刑");
    const hasJi = (s: Set<string>) => (jiStar ? s.has(jiStar) : false);
    const hasLu = (s: Set<string>) => s.has("禄存") || (luStar ? s.has(luStar) : false);
    const hasYin = (s: Set<string>) => s.has("天梁");
    if ((hasXing(n1) && hasJi(n2)) || (hasXing(n2) && hasJi(n1))) {
      add({
        name: "刑忌夹印",
        kind: "凶",
        where: `${xp.name}(${xp.earthlyBranch})`,
        basis: "天相（印星）被刑（擎羊/天刑）与化忌相夹",
        meaning: "掌印之星受制，该宫事项易受掣肘、有责无权，防文书官非",
      });
    }
    if ((hasYin(n1) && hasLu(n2)) || (hasYin(n2) && hasLu(n1))) {
      add({
        name: "财荫夹印",
        kind: "吉",
        where: `${xp.name}(${xp.earthlyBranch})`,
        basis: "天相被天梁（荫）与禄（禄存/化禄）相夹",
        meaning: "财荫护印，该宫事项得庇荫周全、稳中得利",
      });
    }
  }
  // 禄逢冲破
  const luPositions: { star: string; idx: number }[] = [];
  if (luCunPos != null) luPositions.push({ star: "禄存", idx: luCunPos });
  if (luStar && ix.pos.get(luStar) != null) luPositions.push({ star: `化禄星${luStar}`, idx: ix.pos.get(luStar)! });
  for (const lp of luPositions) {
    if (!jiStar) break;
    const sameJi = starNamesAt(a, lp.idx).includes(jiStar);
    const oppJi = starNamesAt(a, lp.idx + 6).includes(jiStar);
    const kongJie = starNamesAt(a, lp.idx).filter((n) => n === "地空" || n === "地劫");
    if (sameJi || oppJi || kongJie.length) {
      add({
        name: "禄逢冲破",
        kind: "注意",
        where: pName(lp.idx),
        basis: `${lp.star}${sameJi ? `与${jiStar}化忌同宫` : oppJi ? `被对宫${jiStar}化忌冲` : `与${kongJie.join("、")}同宫（禄遭空劫）`}`,
        meaning: "吉处藏凶，财禄得而易失，该宫得利时防反复",
        classic: "「禄逢冲破，吉处藏凶」——《紫微斗数全书·骨髓赋》",
      });
      break;
    }
  }
  // 马头带箭
  if (soulBranch === "午" && soulAll.has("擎羊")) {
    add({
      name: "马头带箭",
      kind: "注意",
      where: soulWhere,
      basis: "擎羊坐命于午宫",
      meaning: "威镇边疆之异格：得吉化则武贵横立功名，无吉则劳苦刑伤",
      classic: "「马头带剑，镇御边疆」——《紫微斗数全书·骨髓赋》",
    });
  }

  /* —— 格局库扩充 —— */

  // 明禄暗禄：命坐禄（禄存/生年禄星），命宫地支的六合宫再见另一禄
  {
    const mingLu = soulAll.has("禄存") ? "禄存" : luStar && soulAll.has(luStar) ? `化禄星${luStar}` : null;
    const anBranch = BRANCH_LIUHE[soulBranch];
    const anSeat = a.palaces.find((p) => p.earthlyBranch === anBranch);
    if (mingLu && anSeat) {
      const anStars = starNamesAt(a, anSeat.index);
      const anLu = anStars.includes("禄存")
        ? "禄存"
        : luStar && anStars.includes(luStar) && `化禄星${luStar}` !== mingLu
          ? `化禄星${luStar}`
          : null;
      if (anLu && anLu !== mingLu) {
        addSoulGood({
          name: "明禄暗禄",
          basis: `命宫坐${mingLu}（明禄），命支${soulBranch}六合之${anSeat.name}（${anBranch}）藏${anLu}（暗禄）`,
          meaning: "明暗两禄相济，明财之外另有暗财/贵人暗助",
          classic: "「明禄暗禄，锦上添花」——《紫微斗数全书·骨髓赋》",
        });
      }
    }
  }

  if (luStar && ix.natal[1] && soulAll.has(luStar) && soulAll.has(ix.natal[1])) {
    addSoulGood({
      name: "权禄巡逢",
      basis: `生年化禄星${luStar}与化权星${ix.natal[1]}同守命宫`,
      meaning: "禄权同宫坐命，财与权柄相辅，务实进取",
      classic: "「权禄重逢，财官双美」——《紫微斗数全书·骨髓赋》",
    });
  }

  if (!soulAll.has("文昌") && !soulAll.has("文曲") && sfStars.has("文昌") && sfStars.has("文曲")) {
    addSoulGood({
      name: "文星拱命",
      basis: `文昌（${at("文昌")}）、文曲（${at("文曲")}）自三方四正拱照命宫`,
      meaning: "昌曲来拱，聪慧好学、利科名文途",
    });
  }

  if (soulAll.has("擎羊") && ["辰", "戌", "丑", "未"].includes(soulBranch)) {
    addSoulGood({
      name: "擎羊入庙",
      basis: `擎羊守命于${soulBranch}（四墓之地入庙）`,
      meaning: "刑星入庙反主威权果决，宜武职/外科/竞技；仍带刑伤性，防刚极易折",
    });
  }

  if (!soulAll.has("天魁") && !soulAll.has("天钺") && sfStars.has("天魁") && sfStars.has("天钺")) {
    addSoulGood({
      name: "天乙拱命",
      basis: `天魁（${at("天魁")}）、天钺（${at("天钺")}）自三方四正拱照命宫`,
      meaning: "双贵拱命，一生逢凶有解、机遇常至",
    });
  }

  if ((prevSet.has("紫微") && nextSet.has("天府")) || (prevSet.has("天府") && nextSet.has("紫微"))) {
    addSoulGood({
      name: "紫府夹命",
      basis: "紫微、天府分居命宫两邻相夹",
      meaning: "帝库相夹，暗受提携，根基深厚",
    });
  }

  if (soulMajors.has("廉贞") && ["寅", "申"].includes(soulBranch)) {
    addSoulGood({
      name: "雄宿朝元",
      basis: `廉贞守命于${soulBranch}（庙地）`,
      meaning: "廉贞入庙为雄宿，干练有为、宜公职武职；加会吉星方成大器",
    });
  }

  if (soulMajors.has("天梁") && soulBranch === "午") {
    addSoulGood({
      name: "寿星入庙",
      basis: "天梁守命于午（庙地）",
      meaning: "荫星入庙，逢难有救、老成持重，利医药/监察/顾问",
    });
  }

  if (soulMajors.has("巨门")) {
    const shaHit = ["擎羊", "陀罗", "火星", "铃星"].filter((s) => sfStars.has(s));
    if (shaHit.length >= 2) {
      add({
        name: "巨逢四煞",
        kind: "凶",
        where: soulWhere,
        basis: `巨门守命，三方四正会${shaHit.join("、")}`,
        meaning: "暗星会众煞，口舌是非加剧、防官非刑讼，言语谨慎为上",
      });
    }
  }

  if (ix.natal[1] && ix.natal[2]) {
    const quan = ix.natal[1];
    const ke = ix.natal[2];
    if ((soulAll.has(ke) && oppSet.has(quan)) || (soulAll.has(quan) && oppSet.has(ke))) {
      addSoulGood({
        name: "科权对拱",
        basis: `生年化科星${ke}与化权星${quan}一坐命宫一居对宫相拱`,
        meaning: "名与权对拱，利考试晋升、名位相济",
        classic: "「科权对拱，跃三汲于禹门」——《紫微斗数全书·骨髓赋》",
      });
    }
  }

  return out;
}

/* ─────────────── 运限格局扫描（大限/流年/流月层） ─────────────── */

export type HoroPattern = {
  scope: "decadal" | "yearly" | "monthly";
  name: string;
  kind: "吉" | "凶" | "注意";
  basis: string;
  meaning: string;
};

/**
 * 以运限命宫为中心扫描运限层格局：本命星曜三方会照 + 该运限四化引动 + 该运限流曜。
 * 用于回答「这个大限/这一年/这个月是不是考运期/财运期/动荡期」。
 *
 * @param soulIdxOfScope 运限命宫所在的本命宫位索引（h.decadal.index / h.yearly.index / h.monthly.index）
 * @param stem/branch    运限干支（四化与流曜由此起）
 */
export function detectHoroscopePatterns(
  a: Astrolabe,
  scope: "decadal" | "yearly" | "monthly",
  soulIdxOfScope: number,
  stem: string,
  branch: string,
  ix: ChartIndex = buildChartIndex(a)
): HoroPattern[] {
  const S = fixIndex(soulIdxOfScope);
  const sf = sanfangIdx(S);
  const sfSet = new Set(sf);
  const sfStars = new Set<string>(sf.flatMap((q) => starNamesAt(a, q)));
  const tag = scope === "decadal" ? "大限" : scope === "yearly" ? "流年" : "流月";
  /* 流曜名前缀随层级（iztro 实名：运昌/流昌/月昌） */
  const fp = scope === "decadal" ? "运" : scope === "yearly" ? "流" : "月";
  const out: HoroPattern[] = [];
  const add = (name: string, kind: HoroPattern["kind"], basis: string, meaning: string) =>
    out.push({ scope, name, kind, basis, meaning });

  const mutStars = stem ? (util.getMutagensByHeavenlyStem(stem as never) as string[]) : [];
  const posOf = (star: string) => ix.pos.get(star) ?? -1;
  const inSf = (star: string) => sfSet.has(posOf(star));
  const mutInSf = (k: number) => !!mutStars[k] && inSf(mutStars[k]);
  const seatName = (i: number) => a.palaces[fixIndex(i)]?.name ?? "?";

  /* 运限流曜（大限=运X / 流年=流X），键统一去前缀 */
  const flowPos = new Map<string, number>();
  try {
    getHoroscopeStar(stem as never, branch as never, scope).forEach((g, idx) => {
      for (const s of g) flowPos.set((s.name as string).slice(1), idx);
    });
  } catch {
    /* 干支异常时无流曜 */
  }
  const flowIn = (short: string) => sfSet.has(flowPos.get(short) ?? -1);

  // 三奇加会（运限）
  if (mutInSf(0) && mutInSf(1) && mutInSf(2)) {
    add(
      "三奇加会（运限）",
      "吉",
      `${tag}化禄${mutStars[0]}、化权${mutStars[1]}、化科${mutStars[2]}俱会${tag}命宫三方四正`,
      "运限三奇拱照，此运才干机遇名望齐至，宜大胆进取"
    );
  }

  // 双禄交会：运限化禄会照 + 本命禄存/生年禄星亦在三方（非同星）
  if (mutInSf(0)) {
    const natalLuHere = sfStars.has("禄存") || (ix.natal[0] !== mutStars[0] && ix.natal[0] && sfStars.has(ix.natal[0]));
    if (natalLuHere) {
      add(
        "双禄交会（运限）",
        "吉",
        `${tag}化禄（${mutStars[0]}）与本命禄（${sfStars.has("禄存") ? "禄存" : `生年禄星${ix.natal[0]}`}）同会${tag}命宫三方`,
        "运限禄叠本命禄，财源双至，进财应期"
      );
    }
  }

  // 阳梁昌禄（运限）：太阳天梁+（本命文昌或流昌）+（运限禄或本命禄）
  if (
    sfStars.has("太阳") &&
    sfStars.has("天梁") &&
    (sfStars.has("文昌") || flowIn("昌")) &&
    (mutInSf(0) || sfStars.has("禄存") || (ix.natal[0] && sfStars.has(ix.natal[0])))
  ) {
    add(
      "阳梁昌禄（运限）",
      "吉",
      `太阳、天梁会${tag}命宫三方，文昌${sfStars.has("文昌") ? "" : `（${fp}昌）`}与禄俱到`,
      "考试功名应期：升学、考证、竞聘、体制晋升的窗口期"
    );
  }

  // 禄马交驰（运限）：流禄/运限化禄 与 流马/本命天马 同会三方
  {
    const luIn = flowIn("禄") || mutInSf(0) || sfStars.has("禄存");
    const maIn = flowIn("马") || sfStars.has("天马");
    if (luIn && maIn && (flowIn("禄") || flowIn("马") || mutInSf(0))) {
      add(
        "禄马交驰（运限）",
        "吉",
        `禄（${flowIn("禄") ? `${fp}禄` : mutInSf(0) ? `化禄${mutStars[0]}` : "禄存"}）与马（${flowIn("马") ? `${fp}马` : "天马"}）同会${tag}命宫三方`,
        "动中得财之运，宜外出经营、差旅开拓、异地机会"
      );
    }
  }

  // 羊陀夹忌（运限）：运限忌星恰落本命禄存之宫（必被羊陀所夹）
  {
    const jiStar = mutStars[3];
    const luCunPos = ix.pos.get("禄存");
    if (jiStar && luCunPos != null && posOf(jiStar) === luCunPos) {
      add(
        "羊陀夹忌（运限）",
        "凶",
        `${tag}化忌（${jiStar}）落入本命禄存之宫【${seatName(luCunPos)}】，受擎羊陀罗相夹`,
        "此运忌星受夹无处可泄，该宫事项动辄得咎，宜守不宜攻"
      );
    }
  }

  // 忌入/忌冲运限命宫
  {
    const jiStar = mutStars[3];
    const jiPos = jiStar ? posOf(jiStar) : -1;
    if (jiPos === S) {
      add(
        "忌入运限命宫",
        "注意",
        `${tag}化忌（${jiStar}）坐${tag}命宫【${seatName(S)}】`,
        "忌坐运限命，此运多自我纠结、执念沉淀，宜收敛整固"
      );
    } else if (jiPos === fixIndex(S + 6)) {
      add(
        "忌冲运限命宫",
        "注意",
        `${tag}化忌（${jiStar}）自对宫【${seatName(jiPos)}】冲${tag}命宫`,
        "忌冲运限命，冲力最烈，主变动离散——换环境/换轨道的敏感期"
      );
    }
  }

  // 杀破狼运：运限命宫坐杀破狼
  {
    const sbl = a.palaces[S].majorStars.find((s) => ["七杀", "破军", "贪狼"].includes(s.name as string));
    if (sbl) {
      add(
        "杀破狼运",
        "注意",
        `${tag}命宫坐${sbl.name}（三方必会齐杀破狼）`,
        "变动开创之运：转型、跳槽、创业多发于此，宜主动求变忌被动硬守"
      );
    }
  }

  // 火贪/铃贪引动：贪狼在三方与火/铃同宫，且被本运四化引动（禄权忌任一）
  {
    const tanPos = ix.pos.get("贪狼");
    if (tanPos != null && sfSet.has(tanPos)) {
      const mates = starNamesAt(a, tanPos);
      const fire = ["火星", "铃星"].find((f) => mates.includes(f));
      const trigged = mutStars[0] === "贪狼" || mutStars[1] === "贪狼" || mutStars[3] === "贪狼";
      if (fire && trigged) {
        add(
          "火贪引动（运限）",
          "注意",
          `贪狼与${fire}同宫于${seatName(tanPos)}（在${tag}命宫三方），且本${tag.charAt(1)}贪狼被四化引动`,
          "横发格被引动：暴利与暴损同门，见好就收、落袋为安"
        );
      }
    }
  }

  return out;
}


/** 当前大限+流年+流月三 scope 一次扫描（共享索引）：导出与盘面格局面板共用入口 */
export function scanHoroscopePatterns(
  a: Astrolabe,
  h: {
    decadal: { index: number; heavenlyStem: unknown; earthlyBranch: unknown };
    yearly: { index: number; heavenlyStem: unknown; earthlyBranch: unknown };
    monthly?: { index: number; heavenlyStem: unknown; earthlyBranch: unknown };
  }
): { decadal: HoroPattern[]; yearly: HoroPattern[]; monthly: HoroPattern[] } {
  const ix = buildChartIndex(a);
  return {
    decadal: detectHoroscopePatterns(
      a,
      "decadal",
      h.decadal.index,
      h.decadal.heavenlyStem as string,
      h.decadal.earthlyBranch as string,
      ix
    ),
    yearly: detectHoroscopePatterns(
      a,
      "yearly",
      h.yearly.index,
      h.yearly.heavenlyStem as string,
      h.yearly.earthlyBranch as string,
      ix
    ),
    monthly: h.monthly
      ? detectHoroscopePatterns(
          a,
          "monthly",
          h.monthly.index,
          h.monthly.heavenlyStem as string,
          h.monthly.earthlyBranch as string,
          ix
        )
      : [],
  };
}
