import { BRANCHES, SCOPES, SCOPE_META, isYangStem } from "../core/utils";
import type { Zwds } from "../core/useZwds";

const PILLAR_LABELS = ["年", "月", "日", "时"];

/** 中宫：命盘信息 + 观测点 + 本限年月日时切换 */
export function CenterPanel({ z }: { z: Zwds }) {
  const a = z.astrolabe;
  if (!a) return <div className="center" style={{ gridArea: "c" }} />;

  const h = z.horoscope;
  const pillars = a.chineseDate.split(" ");
  const yearStem = pillars[0]?.charAt(0) ?? "";
  const zao = a.gender === "女" ? "坤造" : "乾造";
  const yinyang = `${isYangStem(yearStem) ? "阳" : "阴"}${a.gender}`;
  const qiyun = z.decades[0]?.range[0];
  const allOff = SCOPES.every((s) => !z.visible[s]);
  const origin = a.palaces.find((p) => p.isOriginalPalace);
  const ts = z.trueSolar;

  return (
    <div className="center" style={{ gridArea: "c" }}>
      <div className="center-head">
        <h2>紫微斗数</h2>
        <span className="center-sub">ZI WEI · 玄机盘</span>
      </div>

      <div className="center-info">
        <div className="ci">
          <b>命造</b>
          <span>
            {z.input.name || "无名"} · {zao} {yinyang}
          </span>
        </div>
        <div className="ci">
          <b>五行局</b>
          <span>
            {a.fiveElementsClass}
            {qiyun ? ` · ${qiyun}岁上运` : ""}
          </span>
        </div>
        <div className="ci">
          <b>阳历</b>
          <span>{a.solarDate}</span>
        </div>
        <div className="ci">
          <b>农历</b>
          <span>{a.lunarDate}</span>
        </div>
        <div className="ci">
          <b>时辰</b>
          <span>
            {a.time}（{a.timeRange}）
          </span>
        </div>
        <div className="ci">
          <b>生肖·星座</b>
          <span>
            {a.zodiac} · {a.sign}
          </span>
        </div>
        {ts && (
          <div className="ci ci-wide">
            <b>真太阳时</b>
            <span title={`出生地 ${ts.place} · 经度 ${ts.longitude}° · 均时差 ${ts.eotMinutes.toFixed(1)} 分`}>
              {ts.place} · {ts.trueDate} {ts.trueTime}（钟表 {ts.clockTime}，
              {ts.offsetMinutes >= 0 ? "+" : ""}
              {ts.offsetMinutes.toFixed(1)}分）
            </span>
          </div>
        )}
        <div className="ci">
          <b>命主·身主</b>
          <span>
            {a.soul} · {a.body}
          </span>
        </div>
        <div className="ci">
          <b>命宫·身宫</b>
          <span>
            {a.earthlyBranchOfSoulPalace} · {a.earthlyBranchOfBodyPalace}
          </span>
        </div>
        {origin && (
          <div className="ci">
            <b>来因宫</b>
            <span>
              {origin.name}（{origin.earthlyBranch}）
            </span>
          </div>
        )}
      </div>

      <div className="pillars">
        {pillars.map((p, i) => (
          <div className="pillar" key={i}>
            <i>{PILLAR_LABELS[i]}</i>
            <b>{p.charAt(0)}</b>
            <b>{p.charAt(1)}</b>
          </div>
        ))}
      </div>

      {h && (
        <div className="target-line">
          <span className="tl-tag">观测</span>
          公历 {h.solarDate} · 农历 {h.lunarDate} · {BRANCHES[z.pick.hour]}时 · 虚岁
          {h.age.nominalAge}
        </div>
      )}

      <div className="depth-row">
        <button className={`db db-natal ${allOff ? "on" : ""}`} onClick={z.actions.showNatal} title="只看本命盘">
          本
        </button>
        {SCOPES.map((s) => (
          <button
            key={s}
            className={`db db-${s} ${z.visible[s] ? "on" : ""}`}
            onClick={() => z.actions.toggleScope(s)}
            title={SCOPE_META[s].rowLabel}
          >
            {SCOPE_META[s].label}
          </button>
        ))}
        <button className="db db-today" onClick={z.actions.resetToday} title="回到今天">
          今
        </button>
      </div>
    </div>
  );
}
