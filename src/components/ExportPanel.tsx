import { useDeferredValue, useMemo, useState } from "react";
import type { Zwds } from "../core/useZwds";
import {
  assembleAiPayload,
  baseFilename,
  buildExportMd,
  buildExportToon,
  download,
} from "../core/exportData";

/** 预估文件大小（UTF-8 字节数，与下载落盘一致） */
function formatSize(text: string): string {
  const kb = new TextEncoder().encode(text).length / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`;
}

const PREVIEW_CHARS = 2000;

type Tab = "ai" | "toon" | "md";

const TAB_META: Record<Tab, { label: string; hint: string }> = {
  ai: { label: "AI 载荷", hint: "TOON 数据 + 推理指引 + 知识附录，复制后直接粘贴给 AI" },
  toon: { label: "TOON", hint: "面向 LLM 的紧凑表格化编码，token 大幅缩减" },
  md: { label: "MD", hint: "完整命盘+运限报告（Markdown），结构最全" },
};

/** 底部导出面板：复制给 AI / 导出 TOON / 导出 MD，附预览与文件大小（参考 react-8char） */
export function ExportPanel({ z }: { z: Zwds }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("ai");

  // 拨盘点击属高频交互，导出重建（数十次 horoscope 调用）走延迟值，不阻塞盘面刷新
  const { astrolabe, horoscope, input, pick } = z;
  const snap = useMemo(
    () => ({ astrolabe, horoscope, input, pick }),
    [astrolabe, horoscope, input, pick]
  );
  const dSnap = useDeferredValue(snap);

  const toon = useMemo(() => buildExportToon(z), [dSnap]); // eslint-disable-line react-hooks/exhaustive-deps
  const md = useMemo(() => buildExportMd(z), [dSnap]); // eslint-disable-line react-hooks/exhaustive-deps
  const ai = useMemo(() => (toon ? assembleAiPayload(toon) : null), [toon]);

  if (!astrolabe || !toon || !md || !ai) return null;

  const texts: Record<Tab, string> = { ai, toon, md };
  const cur = texts[tab];

  /** 复制 AI 载荷；剪贴板不可用时退回下载 TOON */
  const copyAi = async () => {
    try {
      await navigator.clipboard.writeText(ai);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      download(`${baseFilename(z)}.toon`, toon, "text/plain;charset=utf-8");
    }
  };

  return (
    <section className="export" id="ai-export">
      <div className="pat-head">
        <span className="pat-title">AI 導出</span>
        <span className="pat-sub">
          复制或下载命盘数据喂给 AI · 均不含人生K线量化数据（防 AI 把自定分值当命理定论，产生误报）
        </span>
      </div>

      <div className="export-actions">
        <button
          type="button"
          className="export-primary"
          onClick={copyAi}
          title="复制 AI 分析载荷（TOON 紧凑数据 + 推理指引 + 规则/星情/主题知识附录）到剪贴板，直接粘贴给 AI"
        >
          {copied ? "已复制 ✓" : "复制给 AI"}
          <i className="export-size">{formatSize(ai)}</i>
        </button>
        <button
          type="button"
          onClick={() => download(`${baseFilename(z)}.toon`, toon, "text/plain;charset=utf-8")}
          title="导出 TOON 格式（面向 LLM 的紧凑表格化编码，token 大幅缩减），适合直接喂给 AI"
        >
          导出 TOON
          <i className="export-size">{formatSize(toon)}</i>
        </button>
        <button
          type="button"
          onClick={() => download(`${baseFilename(z)}.md`, md, "text/markdown;charset=utf-8")}
          title="导出完整命盘+运限报告（Markdown），可上传给 AI 分析"
        >
          导出 MD
          <i className="export-size">{formatSize(md)}</i>
        </button>
      </div>

      <div className="export-pv-head">
        <span className="export-pv-label">预览</span>
        <div className="export-tabs">
          {(Object.keys(TAB_META) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "on" : ""}
              onClick={() => setTab(t)}
              title={TAB_META[t].hint}
            >
              {TAB_META[t].label}
            </button>
          ))}
        </div>
        <span className="export-pv-meta">
          {formatSize(cur)} · {cur.length.toLocaleString("zh-CN")} 字符
        </span>
      </div>
      <pre className="export-preview">
        {cur.slice(0, PREVIEW_CHARS)}
        {cur.length > PREVIEW_CHARS ? `\n……（预览前 ${PREVIEW_CHARS} 字，完整内容以复制/下载为准）` : ""}
      </pre>
    </section>
  );
}
