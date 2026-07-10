/**
 * 出生地解析：真太阳时校正所需的「经度 + 钟表基准偏移」。
 * - 中国城市：省/市/区经度表 + 固定东八区（UTC+8，钟表基准 120°E）
 * - 海外时区：IANA 时区（浏览器 Intl 原生），主城经度取 tzdb 官方坐标，
 *   钟表偏移按出生日期用 Intl 实算 —— 自动涵盖历史时制与夏令时
 *   （如 America/New_York 冬 -5 夏 -4；中国大陆 1986~1991 夏令时 +9 亦被正确处理）
 */
import { TZ_LONGITUDE } from "./tzdata";
import { getLongitude } from "./cities";

/** 某 IANA 时区在给定 epoch 时刻的 UTC 偏移（分钟，东正西负） */
function offsetAtEpoch(timeZone: string, epochMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(epochMs)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const wallUTC = Date.UTC(p.year, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return Math.round((wallUTC - epochMs) / 60000);
}

/**
 * 某 IANA 时区在给定「当地墙钟时刻」的 UTC 偏移（分钟）。
 * 迭代两次收敛（夏令时切换瞬间取切换后偏移）；时区无效时兜底东八 480。
 */
export function zoneOffsetMinutes(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
): number {
  try {
    const wallUTC = Date.UTC(year, month - 1, day, hour, minute);
    let off = offsetAtEpoch(timeZone, wallUTC);
    off = offsetAtEpoch(timeZone, wallUTC - off * 60000);
    return off;
  } catch {
    return 480;
  }
}

/** 时区主城经度；不在 tzdb 坐标表时按 UTC 偏移折算（offsetMinutes/4 度） */
export function zoneLongitude(timeZone: string, offsetMinutes: number): number {
  return TZ_LONGITUDE[timeZone] ?? Math.round((offsetMinutes / 4) * 100) / 100;
}

/** UTC 偏移分钟 → 「UTC+09:00」 */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 浏览器当前系统时区（不可得时按上海） */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

/** 全球 IANA 时区列表（浏览器原生；不支持时退回 tzdb 坐标表键） */
export function listTimezones(): string[] {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (sv) return sv.call(Intl, "timeZone");
  } catch {
    /* fall through */
  }
  return Object.keys(TZ_LONGITUDE);
}

export type BirthPlaceInput = {
  placeMode: "china" | "overseas";
  timezone: string;
  province: string;
  city: string;
  district: string;
};

export type ResolvedPlace = {
  longitude: number;
  /** 钟表基准偏移（分钟）：中国=480；海外=该时区在出生时刻的实际 UTC 偏移 */
  clockOffsetMinutes: number;
  /** 展示/导出用地点标签 */
  place: string;
};

/**
 * 解析出生地 → 真太阳时参数。
 * solarStr/timeStr 为出生的公历日期与钟表时刻（海外模式用于查当日时区偏移，含夏令时）。
 */
export function resolveBirthPlace(
  p: BirthPlaceInput,
  solarStr: string,
  timeStr: string
): ResolvedPlace {
  if (p.placeMode === "overseas") {
    const tz = p.timezone || browserTimezone();
    const [y, m, d] = solarStr.split(/[-/.]/).map(Number);
    const [hh, mi] = timeStr.split(":").map(Number);
    const off = zoneOffsetMinutes(tz, y || 2000, m || 1, d || 1, hh || 12, mi || 0);
    return {
      longitude: zoneLongitude(tz, off),
      clockOffsetMinutes: off,
      place: `${tz}（${formatOffset(off)}）`,
    };
  }
  return {
    longitude: getLongitude(p.province, p.city, p.district) ?? 120,
    clockOffsetMinutes: 480,
    place:
      p.province === p.city ? `${p.city}${p.district}` : `${p.province}${p.city}${p.district}`,
  };
}
