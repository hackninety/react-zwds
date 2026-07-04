import { FormEvent, useEffect, useState } from "react";
import { TIME_OPTIONS, timeIndexFromClock } from "../core/utils";
import type { BirthInput } from "../core/useZwds";

/** 出生信息输入条：历法/日期/时辰/精确时刻/真太阳时/流派 */
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

  /** 填写精确时刻后自动同步时辰 */
  const setExactTime = (t: string) => {
    setDraft((d) => {
      const next = { ...d, exactTime: t };
      if (t) {
        const hour = Number(t.split(":")[0]);
        if (!isNaN(hour)) next.timeIndex = timeIndexFromClock(hour);
      } else {
        next.useTrueSolar = false;
      }
      return next;
    });
  };

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
          disabled={!!draft.exactTime}
          title={draft.exactTime ? "已由精确时刻自动推定" : undefined}
          onChange={(e) => set("timeIndex", Number(e.target.value))}
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label} {t.range}
            </option>
          ))}
        </select>
      </label>

      <label className="fld">
        <span>时刻</span>
        <input
          type="time"
          value={draft.exactTime}
          onChange={(e) => setExactTime(e.target.value)}
          title="精确出生时刻（可选，填写后自动推定时辰；启用真太阳时必填）"
        />
      </label>

      <label className="ck" title="按出生地经度与均时差校正为真太阳时排盘（输入按东八区钟表时间解释）">
        <input
          type="checkbox"
          checked={draft.useTrueSolar}
          disabled={!draft.exactTime}
          onChange={(e) => set("useTrueSolar", e.target.checked)}
        />
        真太阳时
      </label>

      {draft.useTrueSolar && (
        <label className="fld">
          <span>经度</span>
          <input
            className="num"
            type="number"
            step="0.01"
            min={-180}
            max={180}
            value={draft.longitude}
            onChange={(e) => set("longitude", Number(e.target.value))}
            title="出生地经度，东经为正（如北京 116.40）"
          />
        </label>
      )}

      <label className="fld">
        <span>流派</span>
        <select
          value={draft.algorithm}
          onChange={(e) => set("algorithm", e.target.value as BirthInput["algorithm"])}
          title="安星流派（iztro 仅此两派，默认通行版即南派三合体系）"
        >
          <option value="default">通行版（南派）</option>
          <option value="zhongzhou">中州派</option>
        </select>
      </label>

      <label className="fld">
        <span>年界</span>
        <select
          value={draft.yearDivide}
          onChange={(e) => set("yearDivide", e.target.value as BirthInput["yearDivide"])}
          title="年与运限的分界点"
        >
          <option value="normal">正月初一</option>
          <option value="exact">立春</option>
        </select>
      </label>

      <button type="submit" className="btn-go">
        起 盘
      </button>
    </form>
  );
}
