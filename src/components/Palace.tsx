import { SCOPES, abbrPalace, fixIndex } from "../core/utils";
import type { PalaceData, Zwds } from "../core/useZwds";
import { StarCell } from "./StarCell";

/** 单个宫位卡片 */
export function PalaceCard({
  palace,
  z,
  focus,
  onFocus,
}: {
  palace: PalaceData;
  z: Zwds;
  focus: number;
  onFocus: (i: number) => void;
}) {
  const { horoscope, visible } = z;
  const i = palace.index;

  /* 运限宫名徽章：大官 / 年子 / 小田 / 月父 / 日疾 / 时兄 */
  const chips: { key: string; cls: string; text: string }[] = [];
  if (horoscope) {
    if (visible.decadal)
      chips.push({ key: "d", cls: "decadal", text: "大" + abbrPalace(horoscope.decadal.palaceNames[i]) });
    if (visible.yearly) {
      chips.push({ key: "y", cls: "yearly", text: "年" + abbrPalace(horoscope.yearly.palaceNames[i]) });
      if (horoscope.age.palaceNames?.length)
        chips.push({ key: "a", cls: "age", text: "小" + abbrPalace(horoscope.age.palaceNames[i]) });
    }
    if (visible.monthly)
      chips.push({ key: "m", cls: "monthly", text: "月" + abbrPalace(horoscope.monthly.palaceNames[i]) });
    if (visible.daily)
      chips.push({ key: "dd", cls: "daily", text: "日" + abbrPalace(horoscope.daily.palaceNames[i]) });
    if (visible.hourly)
      chips.push({ key: "h", cls: "hourly", text: "时" + abbrPalace(horoscope.hourly.palaceNames[i]) });
  }

  /* 流耀（运昌运曲、流魁流钺…） */
  const horoStarRows = SCOPES.filter(
    (s) => visible[s] && horoscope?.[s]?.stars?.[i]?.length
  ).map((s) => ({ scope: s, stars: horoscope![s].stars![i] }));

  /* 岁前/将前十二神：看流年时切换为流年位 */
  const sui =
    visible.yearly && horoscope ? horoscope.yearly.yearlyDecStar.suiqian12[i] : palace.suiqian12;
  const jiang =
    visible.yearly && horoscope ? horoscope.yearly.yearlyDecStar.jiangqian12[i] : palace.jiangqian12;

  const isFocus = focus === i;
  const isOpp = focus >= 0 && i === fixIndex(focus + 6);
  const isTrine = focus >= 0 && (i === fixIndex(focus + 4) || i === fixIndex(focus - 4));

  const cls = [
    "palace",
    isFocus ? "is-focus" : "",
    isOpp ? "is-opp" : "",
    isTrine ? "is-trine" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={{ gridArea: `g${i}` }} onClick={() => onFocus(isFocus ? -1 : i)}>
      <div className="p-stars">
        <div className="p-major">
          {palace.majorStars.map((s) => (
            <StarCell key={s.name} star={s} horoscope={horoscope} visible={visible} />
          ))}
          {palace.minorStars.map((s) => (
            <StarCell key={s.name} star={s} horoscope={horoscope} visible={visible} />
          ))}
        </div>
        {palace.adjectiveStars.length > 0 && (
          <div className="p-adj">
            {palace.adjectiveStars.map((s) => (
              <span key={s.name}>{s.name}</span>
            ))}
          </div>
        )}
        {horoStarRows.map((r) => (
          <div key={r.scope} className={`p-horostars hs-${r.scope}`}>
            {r.stars.map((s) => (
              <span key={s.name}>{s.name}</span>
            ))}
          </div>
        ))}
      </div>

      <div className="p-spacer" />

      {chips.length > 0 && (
        <div className="p-chips">
          {chips.map((c) => (
            <i key={c.key} className={`chip chip-${c.cls}`}>
              {c.text}
            </i>
          ))}
        </div>
      )}

      <div className="p-foot">
        <div className="p-f-l">
          <span>{palace.changsheng12}</span>
          <span>{palace.boshi12}</span>
        </div>
        <div className="p-f-m">
          <div className="p-name">
            {palace.name}
            {palace.isBodyPalace && <em className="p-body">身</em>}
          </div>
          <div className="p-range" title={`小限：${palace.ages.slice(0, 8).join(" ")}`}>
            {palace.decadal.range.join("-")}
          </div>
        </div>
        <div className="p-f-r">
          <div className="p-f12">
            <span>{sui}</span>
            <span>{jiang}</span>
          </div>
          <div className="p-gz">
            {palace.heavenlyStem}
            {palace.earthlyBranch}
          </div>
        </div>
      </div>
    </div>
  );
}
