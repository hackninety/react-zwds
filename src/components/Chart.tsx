import { useEffect, useMemo, useState } from "react";
import { MUTAGEN_CHARS, fixIndex, type Scope } from "../core/utils";
import type { Zwds } from "../core/useZwds";
import { PalaceCard } from "./Palace";
import { CenterPanel } from "./CenterPanel";
import { PalaceDetail } from "./PalaceDetail";

/** 自动聚焦优先级：最深的已显示运限层的命宫 → 本命命宫 */
const FOCUS_ORDER: Scope[] = ["hourly", "daily", "monthly", "yearly", "decadal"];

/** 各宫位在 4×4 栅格中的 [列, 行] */
const GRID_POS: Record<number, [number, number]> = {
  3: [0, 0], 4: [1, 0], 5: [2, 0], 6: [3, 0],
  2: [0, 1], 7: [3, 1],
  1: [0, 2], 8: [3, 2],
  0: [0, 3], 11: [1, 3], 10: [2, 3], 9: [3, 3],
};

/** 宫位朝向中宫的锚点（viewBox 0~400） */
function anchor(i: number): { x: number; y: number } {
  const pos = GRID_POS[i];
  if (!pos) return { x: 200, y: 200 };
  const [c, r] = pos;
  const x = c === 0 ? 100 : c === 3 ? 300 : c * 100 + 50;
  const y = r === 0 ? 100 : r === 3 ? 300 : r * 100 + 50;
  return { x, y };
}

type FlyLine = {
  mutagen: (typeof MUTAGEN_CHARS)[number];
  star: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 标签位置（沿线偏目标端） */
  label: { x: number; y: number };
  self: boolean;
};

/** 星盘：十二宫 + 中宫 + 三方四正/飞宫四化连线 */
export function Chart({ z, genId = 0 }: { z: Zwds; genId?: number }) {
  const a = z.astrolabe;

  /* 默认自动选中命宫：流时>流日>流月>流年>大限的命宫，全关则本命命宫 */
  const autoFocus = useMemo(() => {
    if (z.horoscope) {
      for (const s of FOCUS_ORDER) {
        if (z.visible[s]) return z.horoscope[s].index;
      }
    }
    return z.soulPalaceIndex;
  }, [z.horoscope, z.visible, z.soulPalaceIndex]);

  const [userFocus, setUserFocus] = useState<number | null>(null);
  /** 飞宫模式：连线改画选中宫的宫干四化飞向 */
  const [flyMode, setFlyMode] = useState(false);
  /** 宫位详情弹层 */
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  // 运限选择变化、或每次起盘（genId 变化）后，回到默认命宫聚焦
  useEffect(() => {
    setUserFocus(null);
  }, [autoFocus, genId]);
  useEffect(() => {
    setDetailIdx(null);
  }, [genId]);

  const focus = userFocus ?? autoFocus;
  const handleFocus = (i: number) => setUserFocus(i === focus ? null : i);

  /* 三方四正连线（飞宫模式关闭时） */
  const lines = useMemo(() => {
    if (focus < 0 || flyMode) return [];
    const from = anchor(focus);
    const targets = [
      { i: fixIndex(focus + 4), opp: false },
      { i: fixIndex(focus - 4), opp: false },
      { i: fixIndex(focus + 6), opp: true },
    ];
    return targets.map((t) => ({ from, to: anchor(t.i), opp: t.opp }));
  }, [focus, flyMode]);

  /* 飞宫四化连线：同目标多化按垂直向量平行错开 */
  const flyLines = useMemo<FlyLine[]>(() => {
    if (!flyMode || focus < 0 || !z.analysis) return [];
    const pf = z.analysis.flyMatrix.palaces.find((p) => p.palaceIndex === focus);
    if (!pf) return [];
    const from = anchor(focus);
    const byTarget = new Map<number, typeof pf.flies>();
    for (const f of pf.flies) {
      if (f.toIndex < 0) continue;
      const arr = byTarget.get(f.toIndex) ?? [];
      arr.push(f);
      byTarget.set(f.toIndex, arr);
    }
    const out: FlyLine[] = [];
    for (const [toIdx, group] of byTarget) {
      const to = anchor(toIdx);
      if (toIdx === focus) {
        // 自化：不画线，标签环绕锚点
        group.forEach((f, k) => {
          out.push({
            mutagen: f.mutagen,
            star: f.star,
            from,
            to: from,
            label: { x: from.x + 14 + k * 14, y: from.y - 12 },
            self: true,
          });
        });
        continue;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      group.forEach((f, k) => {
        const off = (k - (group.length - 1) / 2) * 7;
        const sx = from.x + px * off;
        const sy = from.y + py * off;
        const ex = to.x + px * off;
        const ey = to.y + py * off;
        out.push({
          mutagen: f.mutagen,
          star: f.star,
          from: { x: sx, y: sy },
          to: { x: ex, y: ey },
          label: { x: sx + (ex - sx) * 0.78, y: sy + (ey - sy) * 0.78 },
          self: false,
        });
      });
    }
    return out;
  }, [flyMode, focus, z.analysis]);

  if (!a) return null;

  return (
    <div className="chart-outer">
      <div className="chart-wrap">
        <div className={`chart ${flyMode ? "chart-flymode" : ""}`}>
          {a.palaces.map((p) => (
            <PalaceCard
              key={p.index}
              palace={p}
              z={z}
              focus={focus}
              onFocus={handleFocus}
              onDetail={setDetailIdx}
            />
          ))}
          <CenterPanel z={z} flyMode={flyMode} onToggleFly={() => setFlyMode((v) => !v)} />
          <svg
            className="chart-lines"
            viewBox="0 0 400 400"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter id="lglow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {lines.map((l, k) => (
              <g key={k} filter="url(#lglow)">
                <line
                  className={l.opp ? "sline sline-opp" : "sline"}
                  x1={l.from.x}
                  y1={l.from.y}
                  x2={l.to.x}
                  y2={l.to.y}
                />
                <circle className={l.opp ? "sdot sdot-opp" : "sdot"} cx={l.to.x} cy={l.to.y} r="3.4" />
              </g>
            ))}
            {flyLines.map((f, k) =>
              f.self ? (
                <g key={k} filter="url(#lglow)">
                  <text className="fly-label" data-m={f.mutagen} x={f.label.x} y={f.label.y}>
                    自{f.mutagen}
                  </text>
                  <circle className="fly-selfdot" data-m={f.mutagen} cx={f.from.x} cy={f.from.y} r={5 + k * 2.5} />
                </g>
              ) : (
                <g key={k} filter="url(#lglow)">
                  <line
                    className="fly-line"
                    data-m={f.mutagen}
                    x1={f.from.x}
                    y1={f.from.y}
                    x2={f.to.x}
                    y2={f.to.y}
                  />
                  <circle className="fly-dot" data-m={f.mutagen} cx={f.to.x} cy={f.to.y} r="3.2" />
                  <text className="fly-label" data-m={f.mutagen} x={f.label.x} y={f.label.y}>
                    {f.mutagen}
                  </text>
                </g>
              )
            )}
            {focus >= 0 && (
              <circle className="sdot-src" cx={anchor(focus).x} cy={anchor(focus).y} r="4.4" />
            )}
          </svg>
        </div>
      </div>
      {detailIdx != null && <PalaceDetail z={z} index={detailIdx} onClose={() => setDetailIdx(null)} />}
    </div>
  );
}
