import { useEffect, useMemo, useRef, useState } from "react";
import type { Zwds } from "../core/useZwds";
import { buildMonthlyKline, type KlineDomain, type LifeKlineData } from "../core/lifeKline";
import { todayLunar } from "../core/lunar";

/** 人生K线（分域）：十二宫各一条流年K线,页签切换;红涨绿跌,金线5年均线,点年份联动拨盘 */

const UP = "#ff4d6d";
const DOWN = "#21d07a";
const GOLD = "#f3c96b";
const CYAN = "#55d7ff";

const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 34; // 顶部留两行段标签（窄段错排到上行防碰撞）
const PAD_B = 26;
const SLOT_W = 8;
const BODY_W = 5;
const CHART_H = 190;

export function LifeKline({ z }: { z: Zwds }) {
  const data = z.lifeKline;
  if (!data || !data.domains.length || data.domains[0].years.length < 5) return null;
  return <KlineInner data={data} z={z} />;
}

function KlineInner({ data, z }: { data: LifeKlineData; z: Zwds }) {
  const [domainKey, setDomainKey] = useState(data.domains[0].key);
  const [hover, setHover] = useState<number | null>(null);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showRadar, setShowRadar] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const curYear = useMemo(() => todayLunar().year, []);

  const domain: KlineDomain =
    data.domains.find((d) => d.key === domainKey) ?? data.domains[0];
  const years = domain.years;

  const currentIndex = years.findIndex((y) => y.year === curYear);
  const selectedIndex = years.findIndex((y) => y.year === z.pick.year);

  const svgW = PAD_L + PAD_R + years.length * SLOT_W;
  const svgH = PAD_T + CHART_H + PAD_B;
  const yOf = (v: number) => PAD_T + ((100 - v) / 100) * CHART_H;
  const xOf = (i: number) => PAD_L + i * SLOT_W;

  /* 大限段背景（域无关,取自共享 bands）；落不进年份轴的段直接丢弃防堆叠 */
  const bandSlots = useMemo(() => {
    const slots = data.bands
      .map((b) => {
        const start = years.findIndex((y) => y.year >= b.startYear);
        const endRaw = years.findIndex((y) => y.year > b.endYear);
        const end = (endRaw < 0 ? years.length : endRaw) - 1;
        return { start, end, label: b.label, row: 0 };
      })
      .filter((b) => b.start >= 0 && b.end >= b.start);
    // 标签防碰撞：估宽后贪心分两行（窄段如童限放不下时抬到上行）
    const rowEnd = [-Infinity, -Infinity];
    for (const b of slots) {
      const x = PAD_L + b.start * SLOT_W + 2;
      const w = b.label.replace(/[^一-龥]/g, "").length * 9 +
        b.label.replace(/[一-龥]/g, "").length * 5.2 + 8;
      b.row = x >= rowEnd[0] ? 0 : 1;
      rowEnd[b.row] = x + w;
    }
    return slots;
  }, [data.bands, years]);

  /* 大限基调背景线：各段十年均分的阶梯线（衬在蜡烛后，看每个十年整体抬升/下沉） */
  const avgSegs = useMemo(
    () =>
      domain.decadeAvg
        .map((dv) => {
          const s = years.findIndex((y) => y.year >= dv.startYear);
          const eRaw = years.findIndex((y) => y.year > dv.endYear);
          const e = (eRaw < 0 ? years.length : eRaw) - 1;
          return s >= 0 && e >= s && dv.avg > 0
            ? { x1: xOf(s), x2: xOf(e) + SLOT_W, y: yOf(dv.avg) }
            : null;
        })
        .filter((v): v is NonNullable<typeof v> => v != null),
    [domain.decadeAvg, years]
  );

  const maPoints = useMemo(
    () =>
      years
        .map((_, i) => {
          const seg = years.slice(Math.max(0, i - 4), i + 1);
          const avg = seg.reduce((a, y) => a + y.close, 0) / seg.length;
          return `${xOf(i) + SLOT_W / 2},${yOf(avg).toFixed(1)}`;
        })
        .join(" "),
    [years]
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const idx = selectedIndex >= 0 ? selectedIndex : currentIndex;
    if (idx < 0) return;
    el.scrollTo({ left: Math.max(0, xOf(idx) - el.clientWidth / 2), behavior: "smooth" });
  }, [selectedIndex, currentIndex, domainKey]);

  const h = hover !== null ? years[hover] : null;
  const tipLeft = hover !== null ? Math.max(4, Math.min(xOf(hover) + 14, svgW - 250)) : 0;

  return (
    <section className="kline">
      <div className="kline-head">
        <span className="kline-title">人生K线</span>
        <span className="kline-legend">
          <i style={{ color: UP }}>红涨</i>
          <i style={{ color: DOWN }}>绿跌</i>
          <i style={{ color: GOLD }}>金线=5年均线</i>
          <i style={{ color: "#7da2ff" }}>蓝阶=大限均值</i>
          <i>上影=进/下影=出，长上下影=大进大出</i>
          <i style={{ color: CYAN }}>点年份联动拨盘</i>
        </span>
        <button
          className={`kline-mbtn ${showRadar ? "on" : ""}`}
          onClick={() => setShowRadar((v) => !v)}
          title="展开/收起选中年份的十二域雷达图（一眼比较该年各域强弱）"
        >
          雷达
        </button>
        <button
          className={`kline-mbtn kline-mbtn-tight ${showMonthly ? "on" : ""}`}
          onClick={() => setShowMonthly((v) => !v)}
          title="展开/收起选中年份的逐月细化K线（月干四化+月支冲合+月曜）"
        >
          月线
        </button>
      </div>

      {/* 域页签（十二宫） */}
      <div className="kline-tabs">
        {data.domains.map((d) => (
          <button
            key={d.key}
            className={`kline-tab ${d.key === domainKey ? "on" : ""}`}
            onClick={() => setDomainKey(d.key)}
            title={`${d.palaceName}（${d.branch}）· 三方四正：${d.compose} · 基调 ${
              d.baseline >= 0 ? "+" : ""
            }${d.baseline}`}
          >
            {d.label}
            {d.isBody && <em className="kline-tab-body">身</em>}
          </button>
        ))}
      </div>

      <div className="kline-sub">
        {domain.palaceName}（{domain.branch}）· 三方四正 {domain.compose} · 基调{" "}
        {domain.baseline >= 0 ? "+" : ""}
        {domain.baseline}
        {domain.baselineNotes.length > 0 && ` ｜ ${domain.baselineNotes.join("、")}`}
      </div>

      <div className="kline-scroll" ref={boxRef}>
        <div className="kline-canvas" style={{ width: svgW }}>
          <svg width={svgW} height={svgH} className="kline-svg" aria-hidden="true">
            {bandSlots.map((b, bi) => (
              <g key={`${b.label}-${b.start}`}>
                {bi % 2 === 1 && (
                  <rect
                    x={xOf(b.start)}
                    y={PAD_T}
                    width={(b.end - b.start + 1) * SLOT_W}
                    height={CHART_H}
                    fill="#7da2ff"
                    opacity={0.05}
                  />
                )}
                <text
                  x={xOf(b.start) + 2}
                  y={b.row === 0 ? PAD_T - 8 : PAD_T - 20}
                  fontSize={9}
                  fill="#8fa3cc"
                  opacity={b.row === 0 ? 0.85 : 0.7}
                >
                  {b.label}
                </text>
                <text x={xOf(b.start) + 2} y={svgH - 8} fontSize={8} fill="#66759b" opacity={0.9}>
                  {years[b.start]?.year}
                </text>
              </g>
            ))}

            {[20, 50, 80].map((v) => (
              <g key={v}>
                <line
                  x1={PAD_L}
                  y1={yOf(v)}
                  x2={svgW - PAD_R}
                  y2={yOf(v)}
                  stroke="#7da2ff"
                  strokeOpacity={v === 50 ? 0.22 : 0.1}
                  strokeDasharray={v === 50 ? "3 3" : "2 4"}
                />
                <text x={PAD_L - 5} y={yOf(v) + 3} fontSize={8} textAnchor="end" fill="#66759b">
                  {v}
                </text>
              </g>
            ))}

            {avgSegs.map((s, si) => (
              <line
                key={`avg-${si}`}
                x1={s.x1}
                y1={s.y}
                x2={s.x2}
                y2={s.y}
                stroke="#7da2ff"
                strokeWidth={1.6}
                strokeOpacity={0.38}
              />
            ))}

            {years.map((y, i) => {
              const up = y.close >= y.open;
              const color = up ? UP : DOWN;
              const cx = xOf(i) + SLOT_W / 2;
              const bodyTop = yOf(Math.max(y.open, y.close));
              const bodyH = Math.max(1, Math.abs(yOf(y.open) - yOf(y.close)));
              return (
                <g key={y.year} opacity={hover === null || hover === i ? 1 : 0.5}>
                  <line x1={cx} y1={yOf(y.high)} x2={cx} y2={yOf(y.low)} stroke={color} strokeWidth={1} />
                  <rect x={cx - BODY_W / 2} y={bodyTop} width={BODY_W} height={bodyH} fill={color} />
                </g>
              );
            })}

            <polyline points={maPoints} fill="none" stroke={GOLD} strokeWidth={1.4} strokeOpacity={0.9} />

            {currentIndex >= 0 && (
              <g>
                <line
                  x1={xOf(currentIndex) + SLOT_W / 2}
                  y1={PAD_T - 2}
                  x2={xOf(currentIndex) + SLOT_W / 2}
                  y2={PAD_T + CHART_H}
                  stroke={GOLD}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.9}
                />
                <text
                  x={xOf(currentIndex) + SLOT_W / 2}
                  y={PAD_T + 9}
                  fontSize={9}
                  textAnchor="middle"
                  fill={GOLD}
                  fontWeight="bold"
                >
                  今
                </text>
              </g>
            )}

            {selectedIndex >= 0 && selectedIndex !== currentIndex && (
              <line
                x1={xOf(selectedIndex) + SLOT_W / 2}
                y1={PAD_T - 2}
                x2={xOf(selectedIndex) + SLOT_W / 2}
                y2={PAD_T + CHART_H}
                stroke={CYAN}
                strokeWidth={1}
                strokeDasharray="2 3"
                strokeOpacity={0.9}
              />
            )}

            {years.map((y, i) => (
              <rect
                key={`hit-${y.year}`}
                x={xOf(i)}
                y={PAD_T}
                width={SLOT_W}
                height={CHART_H}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => z.actions.pickYear(y.year)}
              />
            ))}
          </svg>

          {h && (
            <div className="kline-tip" style={{ left: tipLeft }}>
              <div className="kline-tip-head">
                <b>
                  {h.year} {h.ganZhi}
                  <em>
                    {h.age}岁 · {domain.label}
                  </em>
                </b>
                <span style={{ color: h.delta >= 0 ? UP : DOWN }}>
                  {h.score}分 {h.delta >= 0 ? "▲" : "▼"}
                  {Math.abs(h.delta)}
                </span>
              </div>
              <div className="kline-tip-metrics">
                <span className={`kline-pat kline-pat-${h.pattern}`}>{h.pattern}</span>
                <span>
                  进<b style={{ color: UP }}>{h.gain}</b> · 出
                  <b style={{ color: DOWN }}>{h.drain}</b> · 净
                  <b style={{ color: h.net >= 0 ? UP : DOWN }}>
                    {h.net >= 0 ? "+" : ""}
                    {h.net}
                  </b>
                </span>
              </div>
              {h.drainNature && <p className="kline-tip-nature">出项：{h.drainNature}</p>}
              {(h.factors.length ? h.factors.slice(0, 6) : ["平年（三方四正无显著引动）"]).map((f, fi) => (
                <p key={fi}>· {f}</p>
              ))}
              {h.factors.length > 6 && <p className="kline-tip-more">… 共 {h.factors.length} 项</p>}
            </div>
          )}
        </div>
      </div>

      <div className="kline-panels">
        {showMonthly && <MonthKline z={z} domain={domain} />}
        {showRadar && <YearRadar z={z} data={data} />}
      </div>

      <p className="kline-note">{data.note}</p>
    </section>
  );
}

/* ─────────────── 十二域年度雷达图 ─────────────── */

const R_SIZE = 320;
const R_CX = R_SIZE / 2;
const R_CY = R_SIZE / 2 + 6;
const R_MAX = 104;

function YearRadar({ z, data }: { z: Zwds; data: LifeKlineData }) {
  const year = z.pick.year;
  const pts = useMemo(
    () =>
      data.domains.map((d) => ({
        label: d.label.split("·")[0],
        score: d.years.find((y) => y.year === year)?.score ?? null,
      })),
    [data.domains, year]
  );

  if (pts.every((p) => p.score == null)) return null;

  const angle = (i: number) => (Math.PI * 2 * i) / 12 - Math.PI / 2;
  const pos = (i: number, r: number) => ({
    x: R_CX + Math.cos(angle(i)) * r,
    y: R_CY + Math.sin(angle(i)) * r,
  });
  const rOf = (score: number) => (score / 100) * R_MAX;

  const poly = pts
    .map((p, i) => {
      const { x, y } = pos(i, rOf(p.score ?? 0));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const scores = pts.map((p) => p.score ?? 0);
  const maxIdx = scores.indexOf(Math.max(...scores));
  const minIdx = scores.indexOf(Math.min(...scores));

  return (
    <div className="kline-radar">
      <div className="kline-sub">
        {year} 年 · 十二域雷达（<i style={{ color: GOLD }}>金=最强</i>·
        <i style={{ color: "#e35bd8" }}>紫=最弱</i>）
      </div>
      <svg width={R_SIZE} height={R_SIZE} className="kline-svg" aria-hidden="true">
        {[20, 50, 80].map((v) => (
          <polygon
            key={v}
            points={pts.map((_, i) => `${pos(i, rOf(v)).x},${pos(i, rOf(v)).y}`).join(" ")}
            fill="none"
            stroke="#7da2ff"
            strokeOpacity={v === 50 ? 0.25 : 0.12}
            strokeDasharray={v === 50 ? "3 3" : "2 4"}
          />
        ))}
        {pts.map((_, i) => {
          const o = pos(i, R_MAX);
          return (
            <line
              key={i}
              x1={R_CX}
              y1={R_CY}
              x2={o.x}
              y2={o.y}
              stroke="#7da2ff"
              strokeOpacity={0.1}
            />
          );
        })}
        <polygon points={poly} fill="rgba(85,215,255,0.16)" stroke={CYAN} strokeWidth={1.5} />
        {pts.map((p, i) => {
          if (p.score == null) return null;
          const v = pos(i, rOf(p.score));
          const color = i === maxIdx ? GOLD : i === minIdx ? "#e35bd8" : CYAN;
          const lb = pos(i, R_MAX + 16);
          return (
            <g key={p.label}>
              <circle cx={v.x} cy={v.y} r={i === maxIdx || i === minIdx ? 3.6 : 2.4} fill={color} />
              <text
                x={lb.x}
                y={lb.y + 3}
                fontSize={10}
                textAnchor="middle"
                fill={i === maxIdx ? GOLD : i === minIdx ? "#e35bd8" : "#8fa3cc"}
              >
                {p.label}
                {p.score}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────── 月K线（选中年下钻） ─────────────── */

const M_PAD_L = 34;
const M_PAD_R = 10;
const M_PAD_T = 16;
const M_PAD_B = 30;
const M_SLOT = 30;
const M_BODY = 11;
const M_CHART_H = 132;

function MonthKline({ z, domain }: { z: Zwds; domain: KlineDomain }) {
  const [hoverM, setHoverM] = useState<number | null>(null);
  const year = z.pick.year;

  const monthly = useMemo(() => {
    if (!z.astrolabe) return null;
    const y = domain.years.find((x) => x.year === year);
    if (!y) return null;
    return buildMonthlyKline(z.astrolabe, domain.palaceIndex, year, { open: y.open, close: y.close });
  }, [z.astrolabe, domain, year]);

  if (!monthly) return null;
  const months = monthly.months;

  const svgW = M_PAD_L + M_PAD_R + months.length * M_SLOT;
  const svgH = M_PAD_T + M_CHART_H + M_PAD_B;
  const yOf = (v: number) => M_PAD_T + ((100 - v) / 100) * M_CHART_H;
  const xOf = (i: number) => M_PAD_L + i * M_SLOT;

  const selIdx = months.findIndex((m) => m.month === z.pick.month && m.leap === z.effLeap);
  const h = hoverM !== null ? months[hoverM] : null;
  const tipLeft = hoverM !== null ? Math.max(4, Math.min(xOf(hoverM) - 60, svgW - 250)) : 0;

  return (
    <div className="kline-month">
      <div className="kline-sub">
        {year} {monthly.ganZhi} 年 · {domain.label} · 逐月细化（月干四化+月支冲合+月曜；点月联动流月拨盘）
      </div>
      <div className="kline-month-canvas" style={{ width: svgW }}>
        <svg width={svgW} height={svgH} className="kline-svg" aria-hidden="true">
          {[20, 50, 80].map((v) => (
            <g key={v}>
              <line
                x1={M_PAD_L}
                y1={yOf(v)}
                x2={svgW - M_PAD_R}
                y2={yOf(v)}
                stroke="#7da2ff"
                strokeOpacity={v === 50 ? 0.22 : 0.1}
                strokeDasharray={v === 50 ? "3 3" : "2 4"}
              />
              <text x={M_PAD_L - 5} y={yOf(v) + 3} fontSize={8} textAnchor="end" fill="#66759b">
                {v}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const up = m.close >= m.open;
            const color = up ? UP : DOWN;
            const cx = xOf(i) + M_SLOT / 2;
            const bodyTop = yOf(Math.max(m.open, m.close));
            const bodyH = Math.max(1, Math.abs(yOf(m.open) - yOf(m.close)));
            return (
              <g key={`${m.month}${m.leap ? "L" : ""}`} opacity={hoverM === null || hoverM === i ? 1 : 0.5}>
                <line x1={cx} y1={yOf(m.high)} x2={cx} y2={yOf(m.low)} stroke={color} strokeWidth={1} />
                <rect x={cx - M_BODY / 2} y={bodyTop} width={M_BODY} height={bodyH} fill={color} />
                <text
                  x={cx}
                  y={svgH - 18}
                  fontSize={m.label.length > 2 ? 8 : 9}
                  textAnchor="middle"
                  fill={i === selIdx ? "#f3c96b" : "#8fa3cc"}
                >
                  {m.label}
                </text>
                <text x={cx} y={svgH - 7} fontSize={7.5} textAnchor="middle" fill="#66759b">
                  {m.gz}
                </text>
              </g>
            );
          })}

          {selIdx >= 0 && (
            <line
              x1={xOf(selIdx) + M_SLOT / 2}
              y1={M_PAD_T - 2}
              x2={xOf(selIdx) + M_SLOT / 2}
              y2={M_PAD_T + M_CHART_H}
              stroke={GOLD}
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.9}
            />
          )}

          {months.map((m, i) => (
            <rect
              key={`hit-${m.month}${m.leap ? "L" : ""}`}
              x={xOf(i)}
              y={M_PAD_T}
              width={M_SLOT}
              height={M_CHART_H + M_PAD_B}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverM(i)}
              onMouseLeave={() => setHoverM(null)}
              onClick={() => z.actions.pickMonth(m.month, m.leap)}
            />
          ))}
        </svg>

        {h && (
          <div className="kline-tip" style={{ left: tipLeft, top: 6 }}>
            <div className="kline-tip-head">
              <b>
                {h.label}（{h.gz}）
                <em>{domain.label}</em>
              </b>
              <span style={{ color: h.delta >= 0 ? UP : DOWN }}>
                {h.score}分 {h.delta >= 0 ? "▲" : "▼"}
                {Math.abs(h.delta)}
              </span>
            </div>
            <div className="kline-tip-metrics">
              <span className={`kline-pat kline-pat-${h.pattern}`}>{h.pattern}</span>
              <span>
                进<b style={{ color: UP }}>{h.gain}</b> · 出
                <b style={{ color: DOWN }}>{h.drain}</b> · 净
                <b style={{ color: h.net >= 0 ? UP : DOWN }}>
                  {h.net >= 0 ? "+" : ""}
                  {h.net}
                </b>
              </span>
            </div>
            {(h.factors.length ? h.factors.slice(0, 6) : ["平月（无显著引动）"]).map((f, fi) => (
              <p key={fi}>· {f}</p>
            ))}
            {h.factors.length > 6 && <p className="kline-tip-more">… 共 {h.factors.length} 项</p>}
          </div>
        )}
      </div>
    </div>
  );
}
