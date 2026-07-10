import { useEffect, useMemo, useState } from "react";
import type { BirthInput } from "../core/useZwds";
import {
  TRAITS,
  buildHourCandidates,
  matchEvents,
  scoreCandidate,
  traitHits,
  type LifeEvent,
} from "../core/rectify";

/**
 * 生时校正助手（定盘）弹层：同日十三时辰并排 + 特征勾选 + 大事年份反查评分。
 * 选定时辰后回填输入并直接起盘（自动关闭真太阳时——时辰不详即无可靠钟表时刻）。
 */
export function RectifyPanel({
  input,
  onPick,
  onClose,
}: {
  input: BirthInput;
  onPick: (timeIndex: number) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<LifeEvent[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 十三时辰候选（与日期/历法/流派设置联动） */
  const candidates = useMemo(() => buildHourCandidates(input), [input]);
  const hitsMap = useMemo(() => candidates.map((c) => traitHits(c.chart)), [candidates]);

  /** 大事年份反查（仅在填了年份时计算，13 盘 K 线较重） */
  const validEvents = events.filter((e) => e.year > 1900);
  const eventHitsMap = useMemo(
    () => (validEvents.length ? candidates.map((c) => matchEvents(c.chart, validEvents)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, JSON.stringify(validEvents)]
  );

  const scored = useMemo(() => {
    return candidates
      .map((c, i) => ({
        c,
        hits: hitsMap[i],
        eventHits: eventHitsMap?.[i] ?? [],
        score: scoreCandidate(hitsMap[i], checked, eventHitsMap?.[i] ?? []),
      }))
      .sort((a, b) => b.score - a.score || a.c.timeIndex - b.c.timeIndex);
  }, [candidates, hitsMap, eventHitsMap, checked]);

  const maxScore = scored[0]?.score ?? 0;
  const anyCriteria = checked.size > 0 || validEvents.length > 0;

  const toggleTrait = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setEvent = (i: number, patch: Partial<LifeEvent>) =>
    setEvents((list) => {
      const n = [...list];
      const base: LifeEvent = n[i] ?? { year: 0, kind: "turbulent" };
      n[i] = { ...base, ...patch };
      return n;
    });

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="rf-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <b>
            生时校正助手
            <i className="pd-gz">
              {input.calendar === "lunar" ? "农历" : "阳历"} {input.date} · {input.gender}
            </i>
          </b>
          <button type="button" className="pd-close" onClick={onClose} title="关闭（Esc）">
            ✕
          </button>
        </div>

        <p className="rf-tip">
          时辰不详时定盘：勾选下方符合命主的<b>性格特征</b>、填入<b>已发生的大事年份</b>
          ，十三个时辰按匹配度排序（按标准时辰排盘，不作真太阳时校正；流派口径沿用当前设置）。
        </p>

        <div className="rf-traits">
          {TRAITS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rf-chip ${checked.has(t.id) ? "on" : ""}`}
              onClick={() => toggleTrait(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rf-events">
          <span className="rf-events-label">大事年份（可选，最多三条）：</span>
          {[0, 1, 2].map((i) => (
            <span className="rf-event" key={i}>
              <input
                type="number"
                placeholder="公历年"
                min={1900}
                max={2100}
                value={events[i]?.year || ""}
                onChange={(e) => setEvent(i, { year: Number(e.target.value) || 0 })}
              />
              <select
                value={events[i]?.kind ?? "turbulent"}
                onChange={(e) => setEvent(i, { kind: e.target.value as LifeEvent["kind"] })}
              >
                <option value="turbulent">动荡/破耗/大变动</option>
                <option value="good">顺遂/有成</option>
              </select>
            </span>
          ))}
        </div>

        <div className="rf-table-wrap">
          <table className="rf-table">
            <thead>
              <tr>
                <th>时辰</th>
                <th>命宫</th>
                <th>命宫主星</th>
                <th>身宫</th>
                <th>五行局</th>
                <th>特征命中</th>
                {validEvents.length > 0 && <th>年份反查</th>}
                <th>匹配</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scored.map(({ c, hits, eventHits, score }) => {
                const matched = TRAITS.filter((t, i) => checked.has(t.id) && hits[i]).map(
                  (t) => t.label.split("·")[0]
                );
                const best = anyCriteria && score === maxScore && maxScore > 0;
                return (
                  <tr key={c.timeIndex} className={best ? "rf-best" : ""}>
                    <td>
                      <b>{c.label}</b>
                      <i>{c.range}</i>
                    </td>
                    <td>{c.soulBranch}</td>
                    <td className="rf-majors">{c.soulMajors}</td>
                    <td>{c.bodyBranch}</td>
                    <td>{c.fiveElements}</td>
                    <td className="rf-hits">{matched.length ? matched.join("、") : "—"}</td>
                    {validEvents.length > 0 && (
                      <td className="rf-hits">
                        {validEvents.map((e, k) => (
                          <i key={k} className={eventHits[k] ? "rf-ev-hit" : "rf-ev-miss"}>
                            {e.year}
                            {eventHits[k] ? "✓" : "✗"}
                          </i>
                        ))}
                      </td>
                    )}
                    <td>
                      <b className={best ? "rf-score-best" : "rf-score"}>{score}</b>
                    </td>
                    <td>
                      <button type="button" className="rf-use" onClick={() => onPick(c.timeIndex)}>
                        用此时辰
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="rf-note">
          校时仅供缩小范围：特征区分度有限，建议多勾几项并配合大事年份交叉验证；确定时辰后若知道大致钟表时刻，可再开启真太阳时精排。
        </p>
      </div>
    </div>
  );
}
