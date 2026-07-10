/** 出生地解析测试：IANA 时区偏移（含历史夏令时）、主城经度、真太阳时联动 */
import { describe, expect, it } from "vitest";
import { formatOffset, listTimezones, resolveBirthPlace, zoneLongitude, zoneOffsetMinutes } from "./place";
import { TZ_LONGITUDE } from "./tzdata";
import { applyTrueSolar } from "./utils";

describe("时区偏移（按出生墙钟时刻实算）", () => {
  it("固定偏移时区", () => {
    expect(zoneOffsetMinutes("Asia/Tokyo", 2000, 6, 15, 12, 0)).toBe(540);
    expect(zoneOffsetMinutes("Asia/Tokyo", 1985, 1, 1, 0, 30)).toBe(540);
    expect(zoneOffsetMinutes("Asia/Shanghai", 2000, 6, 15, 12, 0)).toBe(480);
    expect(zoneOffsetMinutes("Asia/Kathmandu", 2000, 6, 15, 12, 0)).toBe(345); // +5:45
    expect(zoneOffsetMinutes("Asia/Kolkata", 2000, 6, 15, 12, 0)).toBe(330); // +5:30
  });

  it("夏令时历史正确（tzdb）", () => {
    expect(zoneOffsetMinutes("America/New_York", 2000, 7, 1, 12, 0)).toBe(-240); // EDT
    expect(zoneOffsetMinutes("America/New_York", 2000, 1, 15, 12, 0)).toBe(-300); // EST
    expect(zoneOffsetMinutes("Europe/London", 1990, 7, 1, 12, 0)).toBe(60); // BST
    expect(zoneOffsetMinutes("Europe/London", 1990, 1, 15, 12, 0)).toBe(0);
    // 中国大陆 1986~1991 夏令时（+9），海外模式选 Asia/Shanghai 会被 tzdb 自动处理
    expect(zoneOffsetMinutes("Asia/Shanghai", 1988, 7, 1, 12, 0)).toBe(540);
    expect(zoneOffsetMinutes("Asia/Shanghai", 1988, 1, 15, 12, 0)).toBe(480);
  });

  it("非法时区兜底东八", () => {
    expect(zoneOffsetMinutes("Not/AZone", 2000, 6, 15)).toBe(480);
  });
});

describe("主城经度与列表", () => {
  it("tzdb 官方坐标（东京 139.74 ≈ 相对 JST 135°E 约 +19 分）", () => {
    expect(TZ_LONGITUDE["Asia/Tokyo"]).toBeCloseTo(139.74, 1);
    expect(TZ_LONGITUDE["Asia/Shanghai"]).toBeCloseTo(121.47, 1);
    expect(Math.round(TZ_LONGITUDE["Asia/Tokyo"] * 4 - 540)).toBe(19);
  });

  it("坐标表外的时区按偏移折算", () => {
    expect(zoneLongitude("Etc/NotExist", 540)).toBe(135);
    expect(zoneLongitude("Asia/Tokyo", 540)).toBeCloseTo(139.74, 1);
  });

  it("全球时区列表可用且含主要区", () => {
    const list = listTimezones();
    expect(list.length).toBeGreaterThan(200);
    expect(list).toContain("Asia/Tokyo");
    expect(list).toContain("America/New_York");
  });

  it("偏移格式化", () => {
    expect(formatOffset(540)).toBe("UTC+09:00");
    expect(formatOffset(-300)).toBe("UTC-05:00");
    expect(formatOffset(345)).toBe("UTC+05:45");
    expect(formatOffset(0)).toBe("UTC+00:00");
  });
});

describe("resolveBirthPlace 与真太阳时联动", () => {
  it("海外·东京：经度偏移约 +19 分（另含均时差）", () => {
    const r = resolveBirthPlace(
      { placeMode: "overseas", timezone: "Asia/Tokyo", province: "", city: "", district: "" },
      "2000-6-15",
      "12:00"
    );
    expect(r.clockOffsetMinutes).toBe(540);
    expect(r.place).toBe("Asia/Tokyo（UTC+09:00）");
    const adj = applyTrueSolar("2000-6-15", "12:00", r.longitude, r.clockOffsetMinutes)!;
    expect(adj.offsetMinutes - adj.eotMinutes).toBeCloseTo(r.longitude * 4 - 540, 6);
    expect(Math.round(adj.offsetMinutes - adj.eotMinutes)).toBe(19);
  });

  it("海外·纽约夏令时出生：基准 -240 而非 -300", () => {
    const r = resolveBirthPlace(
      { placeMode: "overseas", timezone: "America/New_York", province: "", city: "", district: "" },
      "1995-8-1",
      "10:00"
    );
    expect(r.clockOffsetMinutes).toBe(-240);
    // 纽约经度 -74.02°：-74.02×4-(-240) ≈ -56 分
    expect(Math.round(r.longitude * 4 - r.clockOffsetMinutes)).toBe(-56);
  });

  it("中国模式与旧口径完全一致（120°E 基准）", () => {
    const r = resolveBirthPlace(
      { placeMode: "china", timezone: "", province: "北京", city: "北京", district: "市区" },
      "2000-6-15",
      "12:00"
    );
    expect(r.clockOffsetMinutes).toBe(480);
    const adj = applyTrueSolar("2000-6-15", "12:00", r.longitude, r.clockOffsetMinutes)!;
    const legacy = applyTrueSolar("2000-6-15", "12:00", r.longitude)!;
    expect(adj.offsetMinutes).toBe(legacy.offsetMinutes);
    expect(adj.dateStr).toBe(legacy.dateStr);
  });
});
