/** 干支 / 宫名 / 运限通用工具 */

export const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export const LUNAR_MONTHS = [
  "正月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "冬月", "腊月",
] as const;

export const LUNAR_DAYS = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
] as const;

/** 时辰选项（对应 iztro timeIndex 0~12） */
export const TIME_OPTIONS = [
  { index: 0, label: "早子时", range: "00:00~01:00" },
  { index: 1, label: "丑时", range: "01:00~03:00" },
  { index: 2, label: "寅时", range: "03:00~05:00" },
  { index: 3, label: "卯时", range: "05:00~07:00" },
  { index: 4, label: "辰时", range: "07:00~09:00" },
  { index: 5, label: "巳时", range: "09:00~11:00" },
  { index: 6, label: "午时", range: "11:00~13:00" },
  { index: 7, label: "未时", range: "13:00~15:00" },
  { index: 8, label: "申时", range: "15:00~17:00" },
  { index: 9, label: "酉时", range: "17:00~19:00" },
  { index: 10, label: "戌时", range: "19:00~21:00" },
  { index: 11, label: "亥时", range: "21:00~23:00" },
  { index: 12, label: "晚子时", range: "23:00~00:00" },
] as const;

export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const fixIndex = (n: number) => mod(n, 12);

/** 农历年干支（以农历年为单位，1984 甲子） */
export function yearGanZhi(lunarYear: number): string {
  return STEMS[mod(lunarYear - 4, 10)] + BRANCHES[mod(lunarYear - 4, 12)];
}

export function yearStemIndex(lunarYear: number): number {
  return mod(lunarYear - 4, 10);
}

/** 五虎遁：由年干起正月天干；农历 m 月（1~12，正月建寅）干支 */
export function monthGanZhi(lunarYear: number, month: number): string {
  const ys = yearStemIndex(lunarYear);
  const start = [2, 4, 6, 8, 0][ys % 5]; // 甲己丙作首 乙庚戊为头 丙辛庚上起 丁壬壬位流 戊癸甲好求
  const stem = STEMS[mod(start + month - 1, 10)];
  const branch = BRANCHES[mod(month + 1, 12)]; // 正月=寅
  return stem + branch;
}

/** 五鼠遁：由日干起子时天干；hourIdx 0~11（子~亥） */
export function hourGanZhi(dayStem: string, hourIdx: number): string {
  const ds = STEMS.indexOf(dayStem as (typeof STEMS)[number]);
  if (ds < 0) return BRANCHES[mod(hourIdx, 12)] ?? "";
  const start = [0, 2, 4, 6, 8][ds % 5]; // 甲己还加甲 乙庚丙作初 丙辛从戊起 丁壬庚子居 戊癸何方发壬子是真途
  return STEMS[mod(start + hourIdx, 10)] + BRANCHES[mod(hourIdx, 12)];
}

/** 宫名缩写：命宫→命、官禄→官…… */
const PALACE_ABBR: Record<string, string> = {
  命宫: "命", 兄弟: "兄", 夫妻: "夫", 子女: "子", 财帛: "财", 疾厄: "疾",
  迁移: "迁", 仆役: "友", 交友: "友", 官禄: "官", 事业: "官", 田宅: "田",
  福德: "福", 父母: "父",
};
export function abbrPalace(name: string | undefined): string {
  if (!name) return "";
  return PALACE_ABBR[name] ?? name.charAt(0);
}

/** 运限层级 */
export type Scope = "decadal" | "yearly" | "monthly" | "daily" | "hourly";
export const SCOPES: Scope[] = ["decadal", "yearly", "monthly", "daily", "hourly"];

export const SCOPE_META: Record<Scope, { label: string; prefix: string; rowLabel: string }> = {
  decadal: { label: "限", prefix: "大", rowLabel: "大限" },
  yearly: { label: "年", prefix: "年", rowLabel: "流年" },
  monthly: { label: "月", prefix: "月", rowLabel: "流月" },
  daily: { label: "日", prefix: "日", rowLabel: "流日" },
  hourly: { label: "时", prefix: "时", rowLabel: "流时" },
};

export const MUTAGEN_CHARS = ["禄", "权", "科", "忌"] as const;

/**
 * 各流派的岁首（年分界）默认值：
 * - 通行版/南派三合（《全书》体系）：全盘以农历为本，年以正月初一为界（iztro 默认同此）
 * - 中州派（王亭之）：主张以立春为岁首
 * 用户仍可在「年界」中手动覆盖。
 */
export const SCHOOL_YEAR_DIVIDE = {
  default: "normal",
  zhongzhou: "exact",
} as const satisfies Record<string, "normal" | "exact">;

/**
 * 十干四化表预设（顺序：禄/权/科/忌）。
 * - 通行：《紫微斗数全书》体系，与 iztro 内置默认一致（戊贪阴右机·庚阳武阴同·壬梁紫左武）
 * - 中州：王亭之主张，庚/壬两干以天府化科（庚阳武府同·壬梁紫府武），其余同通行
 * 始终整表注入 iztro（config.mutagens 为全局粘性配置，整表覆盖以避免切换残留）。
 */
export const MUTAGEN_TABLES: Record<"default" | "zhongzhou", Record<string, string[]>> = {
  default: {
    甲: ["廉贞", "破军", "武曲", "太阳"],
    乙: ["天机", "天梁", "紫微", "太阴"],
    丙: ["天同", "天机", "文昌", "廉贞"],
    丁: ["太阴", "天同", "天机", "巨门"],
    戊: ["贪狼", "太阴", "右弼", "天机"],
    己: ["武曲", "贪狼", "天梁", "文曲"],
    庚: ["太阳", "武曲", "太阴", "天同"],
    辛: ["巨门", "太阳", "文曲", "文昌"],
    壬: ["天梁", "紫微", "左辅", "武曲"],
    癸: ["破军", "巨门", "太阴", "贪狼"],
  },
  zhongzhou: {
    甲: ["廉贞", "破军", "武曲", "太阳"],
    乙: ["天机", "天梁", "紫微", "太阴"],
    丙: ["天同", "天机", "文昌", "廉贞"],
    丁: ["太阴", "天同", "天机", "巨门"],
    戊: ["贪狼", "太阴", "右弼", "天机"],
    己: ["武曲", "贪狼", "天梁", "文曲"],
    庚: ["太阳", "武曲", "天府", "天同"],
    辛: ["巨门", "太阳", "文曲", "文昌"],
    壬: ["天梁", "紫微", "天府", "武曲"],
    癸: ["破军", "巨门", "太阴", "贪狼"],
  },
};

export type MutagenTableKey = keyof typeof MUTAGEN_TABLES;

export const MUTAGEN_TABLE_LABEL: Record<MutagenTableKey, string> = {
  default: "通行四化（庚阳武阴同·壬梁紫左武）",
  zhongzhou: "中州派四化（庚阳武府同·壬梁紫府武，天府化科）",
};

/** 各流派默认四化表（切流派时自动配对，可手动覆盖） */
export const SCHOOL_MUTAGEN_TABLE = {
  default: "default",
  zhongzhou: "zhongzhou",
} as const satisfies Record<string, MutagenTableKey>;

/** 阳干判断（甲丙戊庚壬） */
export function isYangStem(stem: string): boolean {
  const i = STEMS.indexOf(stem as (typeof STEMS)[number]);
  return i >= 0 && i % 2 === 0;
}

/** 钟表小时 → iztro timeIndex（23 点为晚子时 12） */
export function timeIndexFromClock(hour: number): number {
  if (hour >= 23) return 12;
  return Math.floor((hour + 1) / 2);
}

/** 均时差（分钟），N 为年内第几日 */
export function equationOfTime(dayOfYear: number): number {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export type TrueSolarResult = {
  /** 校正后公历日期 YYYY-M-D */
  dateStr: string;
  /** 校正后时刻 HH:mm */
  timeStr: string;
  timeIndex: number;
  /** 总偏移（分钟，含经度差与均时差） */
  offsetMinutes: number;
  eotMinutes: number;
};

/**
 * 真太阳时校正：输入按东八区（120°E）钟表时间解释。
 * 真太阳时 = 钟表时间 + (经度 − 120) × 4 分钟 + 均时差
 */
export function applyTrueSolar(
  solarDateStr: string,
  timeStr: string,
  longitude: number
): TrueSolarResult | null {
  const dm = solarDateStr.split(/[-/.]/).map(Number);
  const tm = timeStr.split(":").map(Number);
  if (dm.length < 3 || tm.length < 2 || dm.some(isNaN) || tm.some(isNaN)) return null;
  const base = new Date(dm[0], dm[1] - 1, dm[2], tm[0], tm[1]);
  if (isNaN(base.getTime())) return null;

  const startOfYear = new Date(dm[0], 0, 1);
  const dayOfYear = Math.floor((base.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const eot = equationOfTime(dayOfYear);
  const offset = (longitude - 120) * 4 + eot;
  const adj = new Date(base.getTime() + offset * 60000);

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStr: `${adj.getFullYear()}-${adj.getMonth() + 1}-${adj.getDate()}`,
    timeStr: `${pad(adj.getHours())}:${pad(adj.getMinutes())}`,
    timeIndex: timeIndexFromClock(adj.getHours()),
    offsetMinutes: offset,
    eotMinutes: eot,
  };
}
