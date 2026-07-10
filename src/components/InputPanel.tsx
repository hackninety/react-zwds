import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  LUNAR_DAYS,
  LUNAR_MONTHS,
  SCHOOL_MUTAGEN_TABLE,
  SCHOOL_YEAR_DIVIDE,
  TIME_OPTIONS,
  applyTrueSolar,
} from "../core/utils";
import { daysInLunarMonth, leapMonthOf, lunarStrToSolarStr } from "../core/lunar";
import {
  ALL_PROVINCE_NAMES,
  getCityNamesOfProvince,
  getDistrictNamesOfCity,
} from "../core/cities";
import {
  browserTimezone,
  formatOffset,
  listTimezones,
  resolveBirthPlace,
  zoneOffsetMinutes,
} from "../core/place";
import type { BirthInput } from "../core/useZwds";

/** 出生信息输入条：历法/日期/时辰/真太阳时（时刻+省市区）/流派 */
export function InputPanel({
  value,
  onApply,
}: {
  value: BirthInput;
  onApply: (v: BirthInput) => void;
}) {
  const [draft, setDraft] = useState<BirthInput>(value);

  useEffect(() => setDraft(value), [value]);

  const set = <K extends keyof BirthInput>(k: K, v: BirthInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  /** 切流派：年界与四化表自动跟随该派默认（可再手动覆盖），盘型回天盘 */
  const setAlgorithm = (alg: BirthInput["algorithm"]) =>
    setDraft((d) => ({
      ...d,
      algorithm: alg,
      yearDivide: SCHOOL_YEAR_DIVIDE[alg],
      mutagenTable: SCHOOL_MUTAGEN_TABLE[alg],
      astroType: alg === "zhongzhou" ? d.astroType : "heaven",
    }));

  /* ── 农历年/月/日 三级下拉（含闰月位） ── */
  const lunarYMD = useMemo(() => {
    const [y, m, d] = draft.date.split(/[-/.]/).map(Number);
    return { y: y || 2000, m: m || 1, d: d || 1 };
  }, [draft.date]);
  const lunarLeapMonth = useMemo(
    () => (draft.calendar === "lunar" ? leapMonthOf(lunarYMD.y) : 0),
    [draft.calendar, lunarYMD.y]
  );
  const lunarMaxDay = useMemo(
    () =>
      draft.calendar === "lunar"
        ? daysInLunarMonth(lunarYMD.y, lunarYMD.m, draft.isLeapMonth && lunarLeapMonth === lunarYMD.m)
        : 30,
    [draft.calendar, lunarYMD, draft.isLeapMonth, lunarLeapMonth]
  );

  const setLunar = (y: number, m: number, d: number, leap: boolean) => {
    const validLeap = leap && leapMonthOf(y) === m;
    const maxD = daysInLunarMonth(y, m, validLeap);
    setDraft((dr) => ({
      ...dr,
      date: `${y}-${m}-${Math.min(d, maxD)}`,
      isLeapMonth: validLeap,
    }));
  };

  /** 勾选真太阳时：展开时刻+地区，未填时刻则默认 12:00 */
  const toggleTrueSolar = (on: boolean) =>
    setDraft((d) => ({
      ...d,
      useTrueSolar: on,
      exactTime: on && !d.exactTime ? "12:00" : d.exactTime,
    }));

  /** 省 → 市 → 区 三级联动（复刻 react-iztro） */
  const setProvince = (p: string) =>
    setDraft((d) => {
      const cities = getCityNamesOfProvince(p);
      const city = cities[0] ?? "";
      const districts = getDistrictNamesOfCity(p, city);
      return { ...d, province: p, city, district: districts[0] ?? "" };
    });

  const setCity = (c: string) =>
    setDraft((d) => {
      const districts = getDistrictNamesOfCity(d.province, c);
      return { ...d, city: c, district: districts[0] ?? "" };
    });

  const cityNames = useMemo(() => getCityNamesOfProvince(draft.province), [draft.province]);
  const districtNames = useMemo(
    () => getDistrictNamesOfCity(draft.province, draft.city),
    [draft.province, draft.city]
  );
  /** 全球 IANA 时区列表（海外出生用） */
  const timezones = useMemo(listTimezones, []);

  /** 出生公历日期（农历输入先转公历，与实际排盘一致） */
  const solarStr = useMemo(
    () =>
      draft.calendar === "lunar" ? lunarStrToSolarStr(draft.date, draft.isLeapMonth) : draft.date,
    [draft.calendar, draft.date, draft.isLeapMonth]
  );

  /** 出生地解析：经度 + 钟表基准偏移（海外含出生当日夏令时） */
  const resolvedPlace = useMemo(() => {
    if (!draft.useTrueSolar || !solarStr) return null;
    return resolveBirthPlace(draft, solarStr, draft.exactTime || "12:00");
  }, [draft, solarStr]);

  /**
   * 中国大陆夏令时提示（1986~1991 每年 4 月中~9 月中，钟表拨快 1 小时）：
   * 用 tzdb 实测 Asia/Shanghai 在出生时刻的偏移，命中 UTC+9 即提示。
   * 出生证/记忆多为当时钟面时间，不回拨会错一个时辰。
   */
  const dstWarn = useMemo(() => {
    if (draft.placeMode === "overseas" && draft.useTrueSolar) return null; // 海外模式选 Asia/Shanghai 已自动处理
    if (!solarStr) return null;
    const [y, m, d] = solarStr.split(/[-/.]/).map(Number);
    if (!y || y < 1986 || y > 1991) return null;
    const [hh, mi] = (draft.useTrueSolar && draft.exactTime ? draft.exactTime : "12:00")
      .split(":")
      .map(Number);
    return zoneOffsetMinutes("Asia/Shanghai", y, m || 1, d || 1, hh || 12, mi || 0) === 540
      ? `${y} 年该时段中国大陆实行夏令时（钟表拨快 1 小时）`
      : null;
  }, [draft.placeMode, draft.useTrueSolar, draft.exactTime, solarStr]);

  /** 真太阳时下预览推定的时辰 */
  const derivedIdx = useMemo(() => {
    if (!draft.useTrueSolar || !draft.exactTime || !solarStr || !resolvedPlace) return null;
    return (
      applyTrueSolar(
        solarStr,
        draft.exactTime,
        resolvedPlace.longitude,
        resolvedPlace.clockOffsetMinutes
      )?.timeIndex ?? null
    );
  }, [draft.useTrueSolar, draft.exactTime, solarStr, resolvedPlace]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };

  return (
    <form className="input-panel" onSubmit={submit}>
      <label className="fld">
        <span>姓名</span>
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="无名"
          maxLength={12}
        />
      </label>

      <label className="fld">
        <span>常居地</span>
        <input
          className="residence"
          value={draft.residence}
          onChange={(e) => set("residence", e.target.value)}
          placeholder="可选，如 广东深圳"
          maxLength={24}
          title="常居住地（可选）：不参与排盘，随 AI 导出提供地域背景，增强分析"
        />
      </label>

      <div className="seg" role="group" aria-label="性别">
        {(["男", "女"] as const).map((g) => (
          <button
            type="button"
            key={g}
            className={draft.gender === g ? "on" : ""}
            onClick={() => set("gender", g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="历法">
        {(["solar", "lunar"] as const).map((cal) => (
          <button
            type="button"
            key={cal}
            className={draft.calendar === cal ? "on" : ""}
            onClick={() =>
              setDraft((d) => {
                if (d.calendar === cal) return d;
                const [y, m, dd] = d.date.split(/[-/.]/).map(Number);
                if (!y || !m || !dd) return { ...d, calendar: cal };
                const pad = (n: number) => String(n).padStart(2, "0");
                // 阳历 date input 需补零；农历需钳位到当月实际天数
                const date =
                  cal === "solar"
                    ? `${y}-${pad(m)}-${pad(Math.min(dd, 31))}`
                    : `${y}-${m}-${Math.min(dd, daysInLunarMonth(y, m, false))}`;
                return { ...d, calendar: cal, date, isLeapMonth: false };
              })
            }
          >
            {cal === "solar" ? "阳历" : "农历"}
          </button>
        ))}
      </div>

      {draft.calendar === "solar" ? (
        <label className="fld">
          <span>阳历生日</span>
          <input
            type="date"
            required
            min="1900-02-01"
            max="2100-12-31"
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
      ) : (
        <>
          <label className="fld">
            <span>农历年</span>
            <select
              value={lunarYMD.y}
              onChange={(e) => setLunar(Number(e.target.value), lunarYMD.m, lunarYMD.d, draft.isLeapMonth)}
            >
              {Array.from({ length: 201 }, (_, i) => 1900 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>月</span>
            <select
              value={`${lunarYMD.m}${draft.isLeapMonth && lunarLeapMonth === lunarYMD.m ? "L" : ""}`}
              onChange={(e) => {
                const v = e.target.value;
                const leap = v.endsWith("L");
                setLunar(lunarYMD.y, Number(leap ? v.slice(0, -1) : v), lunarYMD.d, leap);
              }}
            >
              {LUNAR_MONTHS.flatMap((label, i) => {
                const m = i + 1;
                const opts = [
                  <option key={m} value={m}>
                    {label}
                  </option>,
                ];
                if (lunarLeapMonth === m) {
                  opts.push(
                    <option key={`${m}L`} value={`${m}L`}>
                      闰{label}
                    </option>
                  );
                }
                return opts;
              })}
            </select>
          </label>
          <label className="fld">
            <span>日</span>
            <select
              value={Math.min(lunarYMD.d, lunarMaxDay)}
              onChange={(e) => setLunar(lunarYMD.y, lunarYMD.m, Number(e.target.value), draft.isLeapMonth)}
            >
              {Array.from({ length: lunarMaxDay }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {LUNAR_DAYS[d - 1]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="fld">
        <span>时辰</span>
        <select
          value={derivedIdx ?? draft.timeIndex}
          disabled={derivedIdx != null}
          title={derivedIdx != null ? "已由真太阳时校正自动推定" : undefined}
          onChange={(e) => set("timeIndex", Number(e.target.value))}
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label} {t.range}
            </option>
          ))}
        </select>
      </label>

      <label className="fld">
        <span>流派</span>
        <select
          value={draft.algorithm}
          onChange={(e) => setAlgorithm(e.target.value as BirthInput["algorithm"])}
          title="安星流派（iztro 仅此两派，默认通行版即南派三合体系）；切换时年界自动套用该派岁首"
        >
          <option value="default">通行版（南派）</option>
          <option value="zhongzhou">中州派</option>
        </select>
      </label>

      <label className="fld">
        <span>年界</span>
        <select
          value={draft.yearDivide}
          onChange={(e) => set("yearDivide", e.target.value as BirthInput["yearDivide"])}
          title="年与运限的分界点。派内默认：南派=正月初一，中州派=立春；可手动覆盖"
        >
          <option value="normal">
            正月初一{draft.algorithm === "default" ? "（南派默认）" : ""}
          </option>
          <option value="exact">
            立春{draft.algorithm === "zhongzhou" ? "（中州默认）" : ""}
          </option>
        </select>
      </label>

      <label className="fld">
        <span>四化表</span>
        <select
          value={draft.mutagenTable}
          onChange={(e) => set("mutagenTable", e.target.value as BirthInput["mutagenTable"])}
          title="十干四化表。派内默认：通行版随《全书》体系（庚阳武阴同·壬梁紫左武），中州派据王亭之主张庚壬两干天府化科；可手动覆盖，全表随导出注明"
        >
          <option value="default">
            通行四化{draft.algorithm === "default" ? "（南派默认）" : ""}
          </option>
          <option value="zhongzhou">
            中州四化·天府化科{draft.algorithm === "zhongzhou" ? "（中州默认）" : ""}
          </option>
        </select>
      </label>

      <label className="fld">
        <span>子时界</span>
        <select
          value={draft.dayDivide}
          onChange={(e) => set("dayDivide", e.target.value as BirthInput["dayDivide"])}
          title="晚子时（23:00~00:00）出生按当日还是次日安星。通行默认归次日"
        >
          <option value="forward">晚子归次日（默认）</option>
          <option value="current">晚子归当日</option>
        </select>
      </label>

      {draft.algorithm === "zhongzhou" && (
        <label className="fld">
          <span>盘型</span>
          <select
            value={draft.astroType}
            onChange={(e) => set("astroType", e.target.value as BirthInput["astroType"])}
            title="中州派特有：天盘=本命盘；地盘=以身宫干支起五行局重排；人盘=以福德宫干支起五行局重排"
          >
            <option value="heaven">天盘</option>
            <option value="earth">地盘</option>
            <option value="human">人盘</option>
          </select>
        </label>
      )}

      <label className="ck" title="按出生地经度与均时差校正为真太阳时排盘（输入按东八区钟表时间解释）">
        <input
          type="checkbox"
          checked={draft.useTrueSolar}
          onChange={(e) => toggleTrueSolar(e.target.checked)}
        />
        真太阳时
      </label>

      <button type="submit" className="btn-go">
        起 盘
      </button>

      {dstWarn && (
        <div className="dst-hint">
          ⚠ {dstWarn}——若出生记录为当时钟表时间，请将时刻减 1 小时后输入；或勾选真太阳时并把出生地切为「海外」选
          Asia/Shanghai（按 tzdb 自动换算，无需手动回拨）。
        </div>
      )}

      {draft.useTrueSolar && (
        <div className="ts-row">
          <label className="fld">
            <span>出生时刻</span>
            <input
              type="time"
              required
              value={draft.exactTime}
              onChange={(e) => set("exactTime", e.target.value)}
            />
          </label>

          <div className="seg" role="group" aria-label="出生地">
            <button
              type="button"
              className={draft.placeMode !== "overseas" ? "on" : ""}
              onClick={() => set("placeMode", "china")}
              title="中国出生：省/市/区经度表，钟表按东八区（120°E 基准）解释"
            >
              中国
            </button>
            <button
              type="button"
              className={draft.placeMode === "overseas" ? "on" : ""}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  placeMode: "overseas",
                  timezone: d.timezone || browserTimezone(),
                }))
              }
              title="海外出生：选 IANA 时区（默认取浏览器系统时区），经度取该区主城官方坐标，钟表偏移按出生日期实算（自动含历史夏令时）"
            >
              海外
            </button>
          </div>

          {draft.placeMode === "overseas" ? (
            <label className="fld">
              <span>时区</span>
              <select
                className="tz-select"
                value={draft.timezone || browserTimezone()}
                onChange={(e) => set("timezone", e.target.value)}
                title="IANA 时区（区名即主城，如 Asia/Tokyo=东京）；默认取当前浏览器系统时区"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="fld">
                <span>省份</span>
                <select value={draft.province} onChange={(e) => setProvince(e.target.value)}>
                  {ALL_PROVINCE_NAMES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fld">
                <span>城市</span>
                <select value={draft.city} onChange={(e) => setCity(e.target.value)}>
                  {cityNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fld">
                <span>区县</span>
                <select value={draft.district} onChange={(e) => set("district", e.target.value)}>
                  {districtNames.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {resolvedPlace && (
            <span className="ts-lng">
              经度 {resolvedPlace.longitude}° ·{" "}
              {draft.placeMode === "overseas"
                ? `钟表基准 ${formatOffset(resolvedPlace.clockOffsetMinutes)}（出生日实算，含夏令时）`
                : "钟表基准东八区"}{" "}
              · 经度偏移{" "}
              {Math.round(resolvedPlace.longitude * 4 - resolvedPlace.clockOffsetMinutes)} 分（另含均时差）
            </span>
          )}
        </div>
      )}
    </form>
  );
}
