import { useEffect, useMemo, useRef, useState } from "react";
import type { Zwds } from "../core/useZwds";
import type { LifeKlineData } from "../core/lifeKline";
import { todayLunar } from "../core/lunar";

/** 人生K线：红涨绿跌，金线=5年均线；点击年份联动流年拨盘（参照 react-8char 移植） */

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
  if (!data || data.years.length < 5) return null;
  return <KlineInner data={data} z={z} />;
}

function KlineInner({ data, z }: { data: LifeKlineData; z: Zwds }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const curYear = useMemo(() => todayLunar().year, []);

  const { years } = data;
  const currentIndex = years.findIndex((y) => y.year === curYear);
  const selectedIndex = years.findIndex((y) => y.year === z.pick.year);

  const svgW = PAD_L + PAD_R + years.length * SLOT_W;
  const svgH = PAD_T + CHART_H + PAD_B;
  const yOf = (v: number) => PAD_T + ((100 - v) / 100) * CHART_H;
  const xOf = (i: number) => PAD_L + i * SLOT_W;

  /* 大限分段 */
  const bands = useMemo(() => {
    const list: { start: number; end: number; label: string }[] = [];
    years.forEach((y, i) => {
      const last = list[list.length - 1];
      if (!last || last.label !== y.decadeLabel) list.push({ start: i, end: i, label: y.decadeLabel });
      else last.end = i;
    });
    return list;
  }, [years]);

  /* 5 年均线 */
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

  /* 初始/选中年自动滚动到可视中央 */
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const idx = selectedIndex >= 0 ? selectedIndex : currentIndex;
    if (idx < 0) return;
    el.scrollTo({ left: Math.max(0, xOf(idx) - el.clientWidth / 2), behavior: "smooth" });
  }, [selectedIndex, currentIndex]);

  const h = hover !== null ? years[hover] : null;
  const tipLeft = hover !== null ? Math.max(4, Math.min(xOf(hover!) + 14, svgW - 250)) : 0;

  return (
    <section className="kline">
      <div className="kline-head">
        <span className="kline-title">人生K线</span>
        <span className="kline-legend">
          <i style={{ color: UP }}>红涨</i>
          <i style={{ color: DOWN }}>绿跌</i>
          <i style={{ color: GOLD }}>金线=5年均线</i>
          <i style={{ color: CYAN }}>点击年份联动流年拨盘</i> · 悬停查看明细
        </span>
      </div>

      <div className="kline-scroll" ref={boxRef}>
        <div className="kline-canvas" style={{ width: svgW }}>
          <svg width={svgW} height={svgH} className="kline-svg" aria-hidden="true">
            {/* 大限分段底色与标签 */}
            {bands.map((b, bi) => (
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
                  {years[b.start].year}
                </text>
              </g>
            ))}

            {/* 网格 */}
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

            {/* K 线 */}
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

            {/* 5 年均线 */}
            <polyline points={maPoints} fill="none" stroke={GOLD} strokeWidth={1.4} strokeOpacity={0.9} />

            {/* 当前年（今） */}
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

            {/* 选中流年 */}
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

            {/* 感应区（点击联动流年） */}
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

          {/* 悬浮明细 */}
          {h && (
            <div className="kline-tip" style={{ left: tipLeft }}>
              <div className="kline-tip-head">
                <b>
                  {h.year} {h.ganZhi}
                  <em>
                    {h.age}岁 · {h.decadeLabel}
                  </em>
                </b>
                <span style={{ color: h.delta >= 0 ? UP : DOWN }}>
                  {h.score}分 {h.delta >= 0 ? "▲" : "▼"}
                  {Math.abs(h.delta)}
                </span>
              </div>
              {(h.factors.length ? h.factors.slice(0, 6) : ["平年（无显著作用关系）"]).map((f, fi) => (
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
