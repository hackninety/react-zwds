import { useEffect, useMemo, useState } from "react";
import { fixIndex, type Scope } from "../core/utils";
import type { Zwds } from "../core/useZwds";
import { PalaceCard } from "./Palace";
import { CenterPanel } from "./CenterPanel";

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

/** 星盘：十二宫 + 中宫 + 三方四正发光连线 */
export function Chart({ z }: { z: Zwds }) {
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

  // 运限选择变化后，回到自动聚焦
  useEffect(() => {
    setUserFocus(null);
  }, [autoFocus]);

  const focus = userFocus ?? autoFocus;
  const handleFocus = (i: number) => setUserFocus(i === focus ? null : i);

  const lines = useMemo(() => {
    if (focus < 0) return [];
    const from = anchor(focus);
    const targets = [
      { i: fixIndex(focus + 4), opp: false },
      { i: fixIndex(focus - 4), opp: false },
      { i: fixIndex(focus + 6), opp: true },
    ];
    return targets.map((t) => ({ from, to: anchor(t.i), opp: t.opp }));
  }, [focus]);

  if (!a) return null;

  return (
    <div className="chart-outer">
      <div className="chart-wrap">
        <div className="chart">
          {a.palaces.map((p) => (
            <PalaceCard key={p.index} palace={p} z={z} focus={focus} onFocus={handleFocus} />
          ))}
          <CenterPanel z={z} />
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
            {focus >= 0 && (
              <circle className="sdot-src" cx={anchor(focus).x} cy={anchor(focus).y} r="4.4" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
