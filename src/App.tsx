import { useState } from "react";
import { useZwds, BirthInput } from "./core/useZwds";
import { InputPanel } from "./components/InputPanel";
import { Chart } from "./components/Chart";
import { HoroscopeBar } from "./components/HoroscopeBar";
import { LifeKline } from "./components/LifeKline";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { downloadJson, downloadMd } from "./core/exportData";

const STORAGE_KEY = "zwds-input";

const DEFAULT_INPUT: BirthInput = {
  name: "演示",
  gender: "女",
  calendar: "solar",
  date: "2000-08-16",
  timeIndex: 2,
  isLeapMonth: false,
  exactTime: "",
  useTrueSolar: false,
  province: "北京",
  city: "北京",
  district: "市区",
  algorithm: "default",
  yearDivide: "normal",
  astroType: "heaven",
  residence: "",
};

function loadInput(): BirthInput {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return { ...DEFAULT_INPUT, ...(JSON.parse(s) as Partial<BirthInput>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_INPUT;
}

export default function App() {
  const [input, setInput] = useState<BirthInput>(loadInput);
  const z = useZwds(input);

  const apply = (v: BirthInput) => {
    setInput(v);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="app">
      <div className="bg-fx" aria-hidden="true" />

      <header className="top">
        <h1>紫微斗数</h1>
        <span className="top-sub">玄机排盘 · iztro 引擎 · 自研盘面</span>
        <div className="top-actions">
          <button
            type="button"
            disabled={!z.astrolabe}
            onClick={() => downloadJson(z)}
            title="导出完整命盘+运限数据（JSON），可上传给 AI 分析"
          >
            导出 JSON
          </button>
          <button
            type="button"
            disabled={!z.astrolabe}
            onClick={() => downloadMd(z)}
            title="导出完整命盘+运限报告（Markdown），可上传给 AI 分析"
          >
            导出 MD
          </button>
        </div>
      </header>

      <InputPanel value={input} onApply={apply} />

      {z.astrolabe ? (
        <ErrorBoundary>
          <Chart z={z} />
          <HoroscopeBar z={z} />
          <LifeKline z={z} />
        </ErrorBoundary>
      ) : (
        <div className="err-box">
          排盘失败：请检查出生日期与时辰（支持 1900 ~ 2100 年，农历请勿超出当月天数）。
        </div>
      )}

      <footer className="foot">
        算法引擎{" "}
        <a href="https://github.com/SylarLong/iztro" target="_blank" rel="noreferrer">
          iztro
        </a>{" "}
        · 盘面 react-zwds · 星盘仅供学习研究
      </footer>
    </div>
  );
}
