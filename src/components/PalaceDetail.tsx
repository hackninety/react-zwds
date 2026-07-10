import { useEffect } from "react";
import type { Zwds } from "../core/useZwds";

/** 宫位详情弹层：三方四正快照 + 飞宫四化/自化 + 相关格局 + 夹宫 + 借星 */
export function PalaceDetail({
  z,
  index,
  onClose,
}: {
  z: Zwds;
  index: number;
  onClose: () => void;
}) {
  const a = z.astrolabe;
  const an = z.analysis;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!a || !an) return null;
  const palace = a.palaces[index];
  if (!palace) return null;

  const snap = an.sanfang.find((s) => s.palaceIndex === index);
  const fly = an.flyMatrix.palaces.find((p) => p.palaceIndex === index);
  const jia = an.jiaGong.filter((j) => j.palaceIndex === index);
  const patterns = an.patterns.filter((p) => p.where.startsWith(`${palace.name}(`));

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <b>
            {palace.name}
            <i className="pd-gz">
              {palace.heavenlyStem}
              {palace.earthlyBranch}
            </i>
            {palace.isBodyPalace && <em className="p-body">身宫</em>}
            {palace.isOriginalPalace && <em className="p-origin">来因</em>}
          </b>
          <button className="pd-close" onClick={onClose} title="关闭（Esc）">
            ✕
          </button>
        </div>

        {snap && (
          <section>
            <h4>三方四正</h4>
            <ul className="pd-seats">
              {snap.seats.map((s, k) => (
                <li key={k}>
                  <i className={`pd-role pd-role-${k === 0 ? "self" : k === 1 ? "opp" : "trine"}`}>
                    {s.role}
                  </i>
                  <b>
                    {s.palaceName}（{s.branch}）
                  </b>
                  <span>{s.majors}</span>
                </li>
              ))}
            </ul>
            {snap.borrowed && <p className="pd-borrow">{snap.borrowed}</p>}
            <div className="pd-tags">
              <p>
                <i className="pd-k pd-k-good">会吉</i>
                {snap.auspicious.join("、") || "无"}
              </p>
              <p>
                <i className="pd-k pd-k-bad">会煞</i>
                {snap.inauspicious.join("、") || "无"}
              </p>
              <p>
                <i className="pd-k pd-k-mut">四化会入</i>
                {snap.natalMutagens.join("、") || "无"}
              </p>
            </div>
          </section>
        )}

        {fly && (
          <section>
            <h4>宫干四化（{fly.stem}干飞出）</h4>
            <ul className="pd-flies">
              {fly.flies.map((f) => (
                <li key={f.mutagen}>
                  <i className="pd-mut" data-m={f.mutagen}>
                    {f.mutagen}
                  </i>
                  <span>
                    {f.star} → {f.isSelf ? "本宫（自化·离心）" : f.toName}
                    {f.isOpposite ? "（冲本宫方向）" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {fly.selfInward.length > 0 && (
              <p className="pd-inward">向心自化：{fly.selfInward.join("、")}</p>
            )}
          </section>
        )}

        {patterns.length > 0 && (
          <section>
            <h4>相关格局</h4>
            {patterns.map((p, k) => (
              <div className="pd-pattern" key={k}>
                <b>
                  {p.name}
                  <i className={`pd-kind pd-kind-${p.kind}`}>{p.kind}</i>
                </b>
                <p>{p.basis}</p>
                <p className="pd-meaning">{p.meaning}</p>
                {p.classic && <p className="pd-classic">{p.classic}</p>}
                {p.flaw && <p className="pd-flaw">⚠ {p.flaw}</p>}
              </div>
            ))}
          </section>
        )}

        {jia.length > 0 && (
          <section>
            <h4>夹宫</h4>
            {jia.map((j, k) => (
              <p key={k} className="pd-jia">
                <i className={`pd-kind pd-kind-${j.good ? "吉" : "凶"}`}>{j.kind}</i>
                {j.detail}
              </p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
