import { useMemo } from "react";
import type { Zwds } from "../core/useZwds";
import { detectHoroscopePatterns } from "../core/analysis";

/**
 * 格局·古籍语料面板（拨盘之下、人生K线之上）：
 * 本命格局卡片（构成/释义/古籍赋文出处/成格瑕疵）+ 当前大限/流年运限格局（随拨盘联动）。
 */
export function PatternPanel({ z }: { z: Zwds }) {
  const a = z.astrolabe;
  const an = z.analysis;
  const h = z.horoscope;

  const horoPats = useMemo(() => {
    if (!a || !h) return null;
    return {
      decadal: detectHoroscopePatterns(
        a,
        "decadal",
        h.decadal.index,
        h.decadal.heavenlyStem as string,
        h.decadal.earthlyBranch as string
      ),
      yearly: detectHoroscopePatterns(
        a,
        "yearly",
        h.yearly.index,
        h.yearly.heavenlyStem as string,
        h.yearly.earthlyBranch as string
      ),
    };
  }, [a, h]);

  if (!a || !an) return null;
  const dec = z.activeDecadeIdx >= 0 ? z.decades[z.activeDecadeIdx] : null;

  const horoRows = horoPats
    ? ([
        {
          key: "decadal",
          label: `大限 ${dec ? `${dec.heavenlyStem}${dec.earthlyBranch} ${dec.range[0]}~${dec.range[1]}岁` : "童限"}`,
          list: horoPats.decadal,
        },
        {
          key: "yearly",
          label: `流年 ${z.pick.year}${h ? ` ${h.yearly.heavenlyStem}${h.yearly.earthlyBranch}` : ""}`,
          list: horoPats.yearly,
        },
      ] as const)
    : [];

  return (
    <section className="pat">
      <div className="pat-head">
        <span className="pat-title">格局 · 古籍語料</span>
        <span className="pat-sub">
          本命格局 {an.patterns.length} 个（程序确定性检测，含成格瑕疵）· 赋文全文见仓库 docs/kb 赋文库
        </span>
      </div>

      {an.patterns.length ? (
        <div className="pat-grid">
          {an.patterns.map((p, i) => (
            <div className={`pat-card pat-card-${p.kind}`} key={i}>
              <div className="pat-name">
                <b>{p.name}</b>
                <i className={`pd-kind pd-kind-${p.kind}`}>{p.kind}</i>
                <em>{p.where}</em>
              </div>
              <p className="pat-basis">{p.basis}</p>
              <p className="pat-meaning">{p.meaning}</p>
              {p.classic && <p className="pat-classic">{p.classic}</p>}
              {p.flaw && <p className="pat-flaw">⚠ {p.flaw}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="pat-none">未检出经典本命格局（以星情与四化论）</p>
      )}

      {horoRows.length > 0 && (
        <div className="pat-horo">
          <h4>当前运限格局（随拨盘联动）</h4>
          {horoRows.map((row) => (
            <div className="pat-horo-row" key={row.key}>
              <i className={`pat-scope pat-scope-${row.key}`}>{row.label}</i>
              {row.list.length ? (
                <div className="pat-horo-items">
                  {row.list.map((p, k) => (
                    <p key={k}>
                      【{p.name}】<i className={`pd-kind pd-kind-${p.kind}`}>{p.kind}</i>{" "}
                      {p.basis}——{p.meaning}
                    </p>
                  ))}
                </div>
              ) : (
                <span className="pat-none">未检出显著运限格局</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
