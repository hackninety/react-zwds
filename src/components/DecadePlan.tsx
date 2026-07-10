import { useMemo } from "react";
import type { Zwds } from "../core/useZwds";
import { buildDecadePlan } from "../core/decadePlan";

/** 十年规划表：一限一行的人生总览（点行联动拨盘） */
export function DecadePlan({ z }: { z: Zwds }) {
  const a = z.astrolabe;

  const rows = useMemo(
    () => (a ? buildDecadePlan(a, z.decades, z.lifeKline) : []),
    [a, z.decades, z.lifeKline]
  );

  if (!a || !rows.length) return null;

  return (
    <section className="dp">
      <div className="pat-head">
        <span className="pat-title">十年規劃表</span>
        <span className="pat-sub">
          一限一行 · 均值/高光/低谷取综合·命宫域 · 运限格局为该限扫描 · <i className="dp-link">点行联动拨盘</i>
        </span>
      </div>

      <div className="dp-wrap">
        <table className="dp-table">
          <thead>
            <tr>
              <th>大限(虚岁)</th>
              <th>干支</th>
              <th>公历</th>
              <th>命宫叠</th>
              <th>四化(禄权科忌)</th>
              <th>均值</th>
              <th>高光年</th>
              <th>低谷年</th>
              <th>运限格局</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current = z.activeDecadeIdx === r.idx;
              return (
                <tr
                  key={r.idx}
                  className={current ? "dp-current" : ""}
                  onClick={() => z.actions.pickDecade(r.idx)}
                  title={`公历 ${r.startYear}~${r.endYear} · 点击切换拨盘到此限`}
                >
                  <td>
                    <b>{r.ageRange}</b>
                  </td>
                  <td>{r.gz}</td>
                  <td className="dp-years">
                    {r.startYear}~{r.endYear}
                  </td>
                  <td>
                    本命{r.seatName}
                    <i>（{r.seatBranch}）</i>
                  </td>
                  <td className="dp-mut">{r.mutagens.join(" / ")}</td>
                  <td>
                    <b className={r.avg == null ? "" : r.avg >= 55 ? "dp-hi" : r.avg <= 45 ? "dp-lo" : ""}>
                      {r.avg ?? "—"}
                    </b>
                  </td>
                  <td className="dp-mark dp-hi">
                    {r.best ? `${r.best.year}(${r.best.score})` : "—"}
                  </td>
                  <td className="dp-mark dp-lo">
                    {r.worst ? `${r.worst.year}(${r.worst.score})` : "—"}
                  </td>
                  <td className="dp-pats">
                    {r.patterns.length
                      ? r.patterns.map((p, k) => (
                          <i key={k} className={`pd-kind pd-kind-${p.kind}`} title={`${p.basis}——${p.meaning}`}>
                            {p.name.replace("（运限）", "")}
                          </i>
                        ))
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
