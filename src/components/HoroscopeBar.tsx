import { ReactNode, useEffect, useRef } from "react";
import type { Scope } from "../core/utils";
import type { Zwds } from "../core/useZwds";

/**
 * 底部运限拨盘（文墨天机式）：
 * 大限 → 流年 → 流月 → 流日 → 流时 五行联动，
 * 点行首标签开/关该层级在盘面上的显示。
 */

function Row({
  label,
  scope,
  on,
  onToggle,
  activeKey,
  wrap,
  children,
}: {
  label: string;
  scope: Scope;
  on: boolean;
  onToggle: () => void;
  activeKey: string | number;
  wrap?: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wrap) return;
    const el = box.current?.querySelector<HTMLElement>(".hcell.on");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeKey, wrap]);

  return (
    <div className={`hrow hrow-${scope}`}>
      <button
        className={`hlabel ${on ? "on" : ""}`}
        onClick={onToggle}
        title={on ? "点击隐藏该层级" : "点击显示该层级"}
      >
        {label}
      </button>
      <div ref={box} className={`hcells ${wrap ? "hcells-grid" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function Cell({
  main,
  sub,
  scope,
  active,
  onClick,
  title,
}: {
  main: string;
  sub?: string;
  scope: Scope;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button className={`hcell ${active ? `on on-${scope}` : ""}`} onClick={onClick} title={title}>
      <b>{main}</b>
      {sub ? <i>{sub}</i> : null}
    </button>
  );
}

export function HoroscopeBar({ z }: { z: Zwds }) {
  const { decades, childhood, activeDecadeIdx, years, months, days, hours, pick, clampedDay, visible, actions } = z;

  return (
    <section className="hbar">
      <Row
        label="大限"
        scope="decadal"
        on={visible.decadal}
        onToggle={() => actions.toggleScope("decadal")}
        activeKey={activeDecadeIdx}
      >
        {childhood && (
          <Cell
            main="童限"
            sub={childhood.label}
            scope="decadal"
            active={activeDecadeIdx === -1}
            onClick={() => actions.pickDecade(-1)}
            title={`${childhood.startYear}~${childhood.endYear}年`}
          />
        )}
        {decades.map((d, k) => (
          <Cell
            key={`${d.range[0]}-${d.earthlyBranch}`}
            main={`${d.range[0]}~${d.range[1]}`}
            sub={`${d.heavenlyStem}${d.earthlyBranch}限`}
            scope="decadal"
            active={activeDecadeIdx === k}
            onClick={() => actions.pickDecade(k)}
            title={`公历 ${d.startYear}~${d.endYear} 年`}
          />
        ))}
      </Row>

      <Row
        label="流年"
        scope="yearly"
        on={visible.yearly}
        onToggle={() => actions.toggleScope("yearly")}
        activeKey={pick.year}
      >
        {years.map((y) => (
          <Cell
            key={y.year}
            main={`${y.year}`}
            sub={`${y.gz}·${y.age}`}
            scope="yearly"
            active={pick.year === y.year}
            onClick={() => actions.pickYear(y.year)}
          />
        ))}
      </Row>

      <Row
        label="流月"
        scope="monthly"
        on={visible.monthly}
        onToggle={() => actions.toggleScope("monthly")}
        activeKey={pick.month}
      >
        {months.map((m) => (
          <Cell
            key={m.month}
            main={m.label}
            sub={m.gz}
            scope="monthly"
            active={pick.month === m.month}
            onClick={() => actions.pickMonth(m.month)}
          />
        ))}
      </Row>

      <Row
        label="流日"
        scope="daily"
        on={visible.daily}
        onToggle={() => actions.toggleScope("daily")}
        activeKey={`${pick.year}-${pick.month}-${clampedDay}`}
        wrap
      >
        {days.map((d) => (
          <Cell
            key={d.day}
            main={d.label}
            sub={d.gz}
            scope="daily"
            active={clampedDay === d.day}
            onClick={() => actions.pickDay(d.day)}
          />
        ))}
      </Row>

      <Row
        label="流时"
        scope="hourly"
        on={visible.hourly}
        onToggle={() => actions.toggleScope("hourly")}
        activeKey={pick.hour}
      >
        {hours.map((h) => (
          <Cell
            key={h.hour}
            main={h.label}
            sub={h.gz}
            scope="hourly"
            active={pick.hour === h.hour}
            onClick={() => actions.pickHour(h.hour)}
          />
        ))}
      </Row>
    </section>
  );
}
