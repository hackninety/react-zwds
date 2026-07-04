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

/** 阳干判断（甲丙戊庚壬） */
export function isYangStem(stem: string): boolean {
  const i = STEMS.indexOf(stem as (typeof STEMS)[number]);
  return i >= 0 && i % 2 === 0;
}
