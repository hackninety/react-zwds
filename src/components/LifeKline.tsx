import { useEffect, useMemo, useRef, useState } from "react";
import type { Zwds } from "../core/useZwds";
import type { KlineDomain, LifeKlineData } from "../core/lifeKline";
import { todayLunar } from "../core/lunar";

/** 人生K线（分域）：十二宫各一条流年K线,页签切换;红涨绿跌,金线5年均线,点年份联动拨盘 */

const UP = "#ff4d6d";
const DOWN = "#21d07a";
const GOLD = "#f3c96b";
const CYAN = "#55d7ff";

const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 24;
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

  /* 大限段背景（域无关,取自共享 bands） */
  const bandSlots = useMemo(() => {
    return data.bands.map((b) => {
      const start = years.findIndex((y) => y.year >= b.startYear);
      const endRaw = years.findIndex((y) => y.year > b.endYear);
      const end = (endRaw < 0 ? years.length : endRaw) - 1;
      return { start: start < 0 ? 0 : start, end, label: b.label };
    });
  }, [data.bands, years]);

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
          <i>上影=进/下影=出，长上下影=大进大出</i>
          <i style={{ color: CYAN }}>点年份联动拨盘</i>
        </span>
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
                <text x={xOf(b.start) + 2} y={PAD_T - 9} fontSize={9} fill="#8fa3cc" opacity={0.85}>
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

      <p className="kline-note">{data.note}</p>
    </section>
  );
}
