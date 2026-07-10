import { useMemo, useState } from "react";
import { astro } from "iztro";
import type { GenderName } from "iztro/lib/i18n";
import { effectiveBirth, type Zwds } from "../core/useZwds";
import { LUNAR_DAYS, LUNAR_MONTHS, MUTAGEN_TABLES, TIME_OPTIONS } from "../core/utils";
import { daysInLunarMonth, leapMonthOf } from "../core/lunar";
import { buildSynastry, buildSynastryMd } from "../core/synastry";
import { listArchive } from "../core/archive";

/** 乙方出生信息（甲方=当前主盘；流派/四化表/子时界沿用主盘设置保证口径一致） */
type BInput = {
  name: string;
  gender: "男" | "女";
  calendar: "solar" | "lunar";
  date: string;
  timeIndex: number;
  isLeapMonth: boolean;
};

const B_KEY = "zwds-synastry-v1";

const DEFAULT_B: BInput = {
  name: "",
  gender: "女",
  calendar: "solar",
  date: "2000-01-01",
  timeIndex: 6,
  isLeapMonth: false,
};

function loadB(): BInput {
  try {
    const s = localStorage.getItem(B_KEY);
    if (s) return { ...DEFAULT_B, ...(JSON.parse(s) as Partial<BInput>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_B;
}

const DIM_META = [
  { key: "love" as const, label: "姻缘·婚恋", hint: "结婚/恋爱相性" },
  { key: "career" as const, label: "事业·合伙", hint: "共事协作/合伙经营（正财）" },
  { key: "wealth" as const, label: "金钱·财路", hint: "合伙搞钱/财缘（含偏财）" },
];

export function SynastryPanel({ z }: { z: Zwds }) {
  const [draft, setDraft] = useState<BInput>(loadB);
  const [applied, setApplied] = useState<BInput | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof BInput>(k: K, v: BInput[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /** 从多盘档案取乙方：真太阳时档案折算为校正后的公历日期+时辰，保证口径一致 */
  const archive = listArchive();
  const pickFromArchive = (name: string) => {
    const entry = archive.find((e) => e.name === name);
    if (!entry) return;
    const eff = effectiveBirth(entry.input);
    let date = eff.dateStr;
    if (eff.calendar === "solar") {
      const [y, m, d] = eff.dateStr.split(/[-/.]/).map(Number);
      if (y && m && d) date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    setDraft({
      name: entry.name,
      gender: entry.input.gender,
      calendar: eff.calendar,
      date,
      timeIndex: eff.timeIndex,
      isLeapMonth: eff.calendar === "lunar" ? entry.input.isLeapMonth : false,
    });
  };

  /* 农历三下拉 */
  const ymd = useMemo(() => {
    const [y, m, d] = draft.date.split(/[-/.]/).map(Number);
    return { y: y || 2000, m: m || 1, d: d || 1 };
  }, [draft.date]);
  const leapM = useMemo(
    () => (draft.calendar === "lunar" ? leapMonthOf(ymd.y) : 0),
    [draft.calendar, ymd.y]
  );
  const maxDay = useMemo(
    () =>
      draft.calendar === "lunar"
        ? daysInLunarMonth(ymd.y, ymd.m, draft.isLeapMonth && leapM === ymd.m)
        : 31,
    [draft.calendar, ymd, draft.isLeapMonth, leapM]
  );
  const setLunar = (y: number, m: number, d: number, leap: boolean) => {
    const validLeap = leap && leapMonthOf(y) === m;
    const dd = Math.min(d, daysInLunarMonth(y, m, validLeap));
    setDraft((dr) => ({ ...dr, date: `${y}-${m}-${dd}`, isLeapMonth: validLeap }));
  };

  /* 乙方排盘（沿用主盘流派口径） */
  const bChart = useMemo(() => {
    if (!applied) return null;
    try {
      return astro.withOptions({
        type: applied.calendar,
        dateStr: applied.date,
        timeIndex: applied.timeIndex,
        gender: applied.gender as unknown as GenderName,
        isLeapMonth: applied.isLeapMonth,
        fixLeap: true,
        language: "zh-CN",
        astroType: "heaven",
        config: {
          algorithm: z.input.algorithm,
          yearDivide: z.input.yearDivide,
          horoscopeDivide: z.input.yearDivide,
          dayDivide: z.input.dayDivide,
          mutagens: MUTAGEN_TABLES[z.input.mutagenTable] as never,
        },
      });
    } catch (e) {
      console.error("[zwds] 合盘乙方排盘失败", e);
      return null;
    }
  }, [applied, z.input.algorithm, z.input.yearDivide, z.input.dayDivide, z.input.mutagenTable]);

  const result = useMemo(() => {
    if (!z.astrolabe || !bChart || !applied) return null;
    return buildSynastry(z.astrolabe, bChart, z.input.name || "甲方", applied.name || "乙方");
  }, [z.astrolabe, z.input.name, bChart, applied]);

  const go = () => {
    setApplied(draft);
    try {
      localStorage.setItem(B_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  };

  const copyReport = async () => {
    if (!result) return;
    const md = buildSynastryMd(result);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用（权限/非安全上下文）时退回下载
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `合盘_${result.a.name}x${result.b.name}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    }
  };

  return (
    <section className="syn" id="synastry">
      <div className="syn-head">
        <span className="syn-title">合盘 · 双人相性</span>
        <span className="syn-sub">
          甲方＝当前命盘（{z.input.name || "无名"}）· 乙方在下方输入 · 同性/异性通用 · 流派口径沿用主盘
        </span>
      </div>

      <div className="syn-form">
        {archive.length > 0 && (
          <label className="fld" title="从多盘档案取乙方（真太阳时档案自动折算为校正后的公历+时辰）">
            <span>从档案选</span>
            <select value="" onChange={(e) => e.target.value && pickFromArchive(e.target.value)}>
              <option value="">选择…（{archive.length}）</option>
              {archive.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="fld">
          <span>乙方姓名</span>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="乙方"
            maxLength={12}
          />
        </label>

        <div className="seg" role="group" aria-label="乙方性别">
          {(["男", "女"] as const).map((g) => (
            <button key={g} type="button" className={draft.gender === g ? "on" : ""} onClick={() => set("gender", g)}>
              {g}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="乙方历法">
          {(["solar", "lunar"] as const).map((cal) => (
            <button
              key={cal}
              type="button"
              className={draft.calendar === cal ? "on" : ""}
              onClick={() =>
                setDraft((d) => {
                  if (d.calendar === cal) return d;
                  const [y, m, dd] = d.date.split(/[-/.]/).map(Number);
                  if (!y || !m || !dd) return { ...d, calendar: cal };
                  const pad = (n: number) => String(n).padStart(2, "0");
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
            <span>生日</span>
            <input
              type="date"
              min="1900-02-01"
              max="2100-12-31"
              value={draft.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </label>
        ) : (
          <>
            <label className="fld">
              <span>年</span>
              <select value={ymd.y} onChange={(e) => setLunar(Number(e.target.value), ymd.m, ymd.d, draft.isLeapMonth)}>
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
                value={`${ymd.m}${draft.isLeapMonth && leapM === ymd.m ? "L" : ""}`}
                onChange={(e) => {
                  const v = e.target.value;
                  const leap = v.endsWith("L");
                  setLunar(ymd.y, Number(leap ? v.slice(0, -1) : v), ymd.d, leap);
                }}
              >
                {LUNAR_MONTHS.flatMap((label, i) => {
                  const m = i + 1;
                  const opts = [
                    <option key={m} value={m}>
                      {label}
                    </option>,
                  ];
                  if (leapM === m)
                    opts.push(
                      <option key={`${m}L`} value={`${m}L`}>
                        闰{label}
                      </option>
                    );
                  return opts;
                })}
              </select>
            </label>
            <label className="fld">
              <span>日</span>
              <select value={Math.min(ymd.d, maxDay)} onChange={(e) => setLunar(ymd.y, ymd.m, Number(e.target.value), draft.isLeapMonth)}>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
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
          <select value={draft.timeIndex} onChange={(e) => set("timeIndex", Number(e.target.value))}>
            {TIME_OPTIONS.map((t) => (
              <option key={t.index} value={t.index}>
                {t.label} {t.range}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn-go syn-go" onClick={go}>
          合 盘
        </button>
      </div>

      {applied && !result && <div className="err-box">乙方排盘失败：请检查出生日期与时辰。</div>}

      {result && (
        <div className="syn-result">
          <div className="syn-persons">
            {[result.a, result.b].map((p, i) => (
              <div className="syn-person" key={i}>
                <b>{p.name}</b>
                <span>
                  {p.gender} · {p.yearGz}年 · 命宫{p.soulBranch} · {p.soulMajors} · {p.fiveElements}
                </span>
              </div>
            ))}
          </div>

          <div className="syn-rels">
            {result.relations.map((rel, i) => (
              <p key={i}>· {rel}</p>
            ))}
          </div>

          <div className="syn-cards">
            {DIM_META.map((d) => {
              const v = result.scores[d.key];
              const cls = v >= 75 ? "great" : v >= 60 ? "good" : v >= 45 ? "mid" : "hard";
              return (
                <div className={`syn-card syn-${cls}`} key={d.key} title={d.hint}>
                  <div className="syn-card-label">{d.label}</div>
                  <div className="syn-card-score">{v}</div>
                  <div className="syn-bar">
                    <i style={{ width: `${v}%` }} />
                  </div>
                  <div className="syn-card-tier">
                    {v >= 75 ? "上佳" : v >= 60 ? "良好" : v >= 45 ? "平平" : "多磨"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="syn-summary">
            {result.summary.map((s, i) => (
              <p key={i}>◆ {s}</p>
            ))}
          </div>

          <details className="syn-detail">
            <summary>互动明细（{result.factors.length} 项，标注方向与三维增减）</summary>
            <ul>
              {result.factors.map((f, i) => {
                const d = f.delta
                  .map((x, k) => (x ? `${["姻缘", "事业", "金钱"][k]}${x > 0 ? "+" : ""}${x}` : ""))
                  .filter(Boolean)
                  .join("，");
                return (
                  <li key={i}>
                    <i className={`syn-dir syn-dir-${f.dir === "互" ? "mutual" : f.dir === "A→B" ? "ab" : "ba"}`}>
                      {f.dir}
                    </i>
                    {f.text}
                    <em>（{d || "±0"}）</em>
                  </li>
                );
              })}
            </ul>
          </details>

          <div className="syn-foot">
            <button type="button" onClick={copyReport} title="复制合盘报告（Markdown），可直接粘贴给 AI 深入解读">
              {copied ? "已复制 ✓" : "复制合盘报告"}
            </button>
            <span className="syn-note">{result.note}</span>
          </div>
        </div>
      )}
    </section>
  );
}
