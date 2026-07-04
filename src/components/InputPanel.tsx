import { FormEvent, useEffect, useState } from "react";
import { TIME_OPTIONS } from "../core/utils";
import type { BirthInput } from "../core/useZwds";

/** 出生信息输入条 */
export function InputPanel({
  value,
  onApply,
}: {
  value: BirthInput;
  onApply: (v: BirthInput) => void;
}) {
  const [draft, setDraft] = useState<BirthInput>(value);

  useEffect(() => setDraft(value), [value]);

  const set = <K extends keyof BirthInput>(k: K, v: BirthInput[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(draft);
  };

  return (
    <form className="input-panel" onSubmit={submit}>
      <label className="fld">
        <span>姓名</span>
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="无名"
          maxLength={12}
        />
      </label>

      <div className="seg" role="group" aria-label="性别">
        {(["男", "女"] as const).map((g) => (
          <button
            type="button"
            key={g}
            className={draft.gender === g ? "on" : ""}
            onClick={() => set("gender", g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="seg" role="group" aria-label="历法">
        <button
          type="button"
          className={draft.calendar === "solar" ? "on" : ""}
          onClick={() => set("calendar", "solar")}
        >
          阳历
        </button>
        <button
          type="button"
          className={draft.calendar === "lunar" ? "on" : ""}
          onClick={() => set("calendar", "lunar")}
        >
          农历
        </button>
      </div>

      <label className="fld">
        <span>{draft.calendar === "lunar" ? "农历生日" : "阳历生日"}</span>
        <input
          type="date"
          required
          min="1900-02-01"
          max="2100-12-31"
          value={draft.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </label>

      {draft.calendar === "lunar" && (
        <label className="ck">
          <input
            type="checkbox"
            checked={draft.isLeapMonth}
            onChange={(e) => set("isLeapMonth", e.target.checked)}
          />
          闰月
        </label>
      )}

      <label className="fld">
        <span>时辰</span>
        <select
          value={draft.timeIndex}
          onChange={(e) => set("timeIndex", Number(e.target.value))}
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label} {t.range}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="btn-go">
        起 盘
      </button>
    </form>
  );
}
