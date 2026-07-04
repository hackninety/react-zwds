import { MUTAGEN_CHARS, SCOPES, Scope } from "../core/utils";
import type { Horoscope } from "../core/useZwds";

type StarLike = {
  name: string;
  type?: string;
  brightness?: string;
  mutagen?: string;
};

/** 单颗星：竖排星名 + 亮度 + 生年四化（实心）/ 运限四化（描边按限色） */
export function StarCell({
  star,
  horoscope,
  visible,
}: {
  star: StarLike;
  horoscope?: Horoscope | null;
  visible?: Record<Scope, boolean>;
}) {
  const scopeMuts: { scope: Scope; char: string }[] = [];
  if (horoscope && visible) {
    for (const s of SCOPES) {
      if (!visible[s]) continue;
      const k = (horoscope[s].mutagen as string[]).indexOf(star.name);
      if (k >= 0) scopeMuts.push({ scope: s, char: MUTAGEN_CHARS[k] });
    }
  }

  return (
    <div className={`star star-${star.type ?? "adjective"}`}>
      <span className="star-name">{star.name}</span>
      <span className="star-bright">{star.brightness || "　"}</span>
      {(star.mutagen || scopeMuts.length > 0) && (
        <span className="star-muts">
          {star.mutagen && (
            <b className="mut mut-natal" data-m={star.mutagen}>
              {star.mutagen}
            </b>
          )}
          {scopeMuts.map((m) => (
            <b key={m.scope} className={`mut mut-scope mut-${m.scope}`} data-m={m.char}>
              {m.char}
            </b>
          ))}
        </span>
      )}
    </div>
  );
}
