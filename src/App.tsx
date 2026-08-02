import { useState } from "react";
import { DEFAULT_BIRTH_INPUT, useZwds, BirthInput } from "./core/useZwds";
import { InputPanel } from "./components/InputPanel";
import { Chart } from "./components/Chart";
import { HoroscopeBar } from "./components/HoroscopeBar";
import { LifeKline } from "./components/LifeKline";
import { DecadePlan } from "./components/DecadePlan";
import { PatternPanel } from "./components/PatternPanel";
import { SynastryPanel } from "./components/SynastryPanel";
import { ExportPanel } from "./components/ExportPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";

const STORAGE_KEY = "zwds-input-v2";

// 清理旧版拨盘/K线持久化：现仅存起盘参数，拨盘信息不再持久化
try {
  localStorage.removeItem("zwds-nav-v1");
  localStorage.removeItem("zwds-kline-domain");
} catch {
  /* ignore */
}

/** 演示盘：在中性默认参数上叠加示例生辰 */
const DEFAULT_INPUT: BirthInput = {
  ...DEFAULT_BIRTH_INPUT,
  name: "演示",
  date: "2000-08-16",
  timeIndex: 2,
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
  // 每次起盘自增，用于强制盘面回到默认命宫位置（即使命宫索引与上一盘相同）
  const [genId, setGenId] = useState(0);
  const [showSyn, setShowSyn] = useState(false);
  const z = useZwds(input);

  const toggleSyn = () => {
    setShowSyn((v) => {
      if (!v) setTimeout(() => document.getElementById("synastry")?.scrollIntoView({ behavior: "smooth" }), 60);
      return !v;
    });
  };

  // 开发调试句柄：控制台可直接取盘验证导出（生产构建不注入）
  if (import.meta.env.DEV) {
    (window as unknown as { __zwds: typeof z }).__zwds = z;
  }

  const apply = (v: BirthInput) => {
    setInput(v);
    setGenId((g) => g + 1);
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
            className={showSyn ? "on-syn" : ""}
            onClick={toggleSyn}
            title="合盘：与另一人（同性/异性均可）互参姻缘、事业合伙、金钱财路相性"
          >
            合盘
          </button>
          <button
            type="button"
            disabled={!z.astrolabe}
            onClick={() => document.getElementById("ai-export")?.scrollIntoView({ behavior: "smooth" })}
            title="跳到页面底部的 AI 导出面板：复制给 AI / 导出 TOON / 导出 MD（含预览与文件大小）"
          >
            AI 导出 ↓
          </button>
        </div>
      </header>

      <InputPanel value={input} onApply={apply} />

      {z.astrolabe ? (
        <ErrorBoundary>
          <Chart z={z} genId={genId} />
          <HoroscopeBar z={z} />
          <PatternPanel z={z} />
          <LifeKline z={z} />
          <DecadePlan z={z} />
          {showSyn && <SynastryPanel z={z} />}
          <ExportPanel z={z} />
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
