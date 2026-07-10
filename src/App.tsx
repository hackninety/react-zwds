import { useState } from "react";
import { useZwds, BirthInput } from "./core/useZwds";
import { InputPanel } from "./components/InputPanel";
import { Chart } from "./components/Chart";
import { HoroscopeBar } from "./components/HoroscopeBar";
import { LifeKline } from "./components/LifeKline";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { buildExportMd, downloadJson, downloadMd, downloadToon } from "./core/exportData";

const STORAGE_KEY = "zwds-input-v2";

// 清理旧版拨盘/K线持久化：现仅存起盘参数，拨盘信息不再持久化
try {
  localStorage.removeItem("zwds-nav-v1");
  localStorage.removeItem("zwds-kline-domain");
} catch {
  /* ignore */
}

const DEFAULT_INPUT: BirthInput = {
  name: "演示",
  gender: "男",
  calendar: "solar",
  date: "2000-08-16",
  timeIndex: 2,
  isLeapMonth: false,
  exactTime: "",
  useTrueSolar: false,
  placeMode: "china",
  province: "北京",
  city: "北京",
  district: "市区",
  timezone: "",
  algorithm: "default",
  yearDivide: "normal",
  mutagenTable: "default",
  dayDivide: "forward",
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
  // 每次起盘自增，用于强制盘面回到默认命宫位置（即使命宫索引与上一盘相同）
  const [genId, setGenId] = useState(0);
  const [copied, setCopied] = useState(false);
  const z = useZwds(input);

  // 开发调试句柄：控制台可直接取盘验证导出（生产构建不注入）
  if (import.meta.env.DEV) {
    (window as unknown as { __zwds: typeof z }).__zwds = z;
  }

  /** 复制 MD 全文到剪贴板（直接粘贴给 AI）；剪贴板不可用时退回下载 */
  const copyMd = async () => {
    const md = buildExportMd(z);
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      downloadMd(z);
    }
  };

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
            onClick={copyMd}
            title="复制完整命盘报告（含格局/飞宫/三方四正快照与推理指引）到剪贴板，直接粘贴给 AI"
          >
            {copied ? "已复制 ✓" : "复制给 AI"}
          </button>
          <button
            type="button"
            disabled={!z.astrolabe}
            onClick={() => downloadToon(z)}
            title="导出 TOON 格式（面向 LLM 的紧凑表格化编码，与 JSON 同数据、token 大幅缩减），适合直接喂给 AI"
          >
            导出 TOON
          </button>
          <button
            type="button"
            disabled={!z.astrolabe}
            onClick={() => downloadJson(z)}
            title="导出完整命盘+运限数据（JSON），供程序处理或 AI 分析"
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
          <Chart z={z} genId={genId} />
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
