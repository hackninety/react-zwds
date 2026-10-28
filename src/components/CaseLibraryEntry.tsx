import { Component, lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CaseReference } from "mingli-cases-react";

const MingliCaseLibrary = lazy(() => import("mingli-cases-react").then((module) => ({ default: module.MingliCaseLibrary })));
const loadLibrary = () => import("mingli-cases-ts-lib");

class LibraryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p role="alert">命例库加载失败，请刷新页面后重试。</p> : this.props.children;
  }
}

function LibraryContent({ onReferenceChange }: { onReferenceChange: (reference: CaseReference | null) => void }) {
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return <LibraryBoundary>
    <Suspense fallback={<p role="status">正在加载命例库…</p>}>
      <MingliCaseLibrary loadLibrary={loadLibrary} preferredChart="ziwei" title="紫微命例库"
        onReferenceChange={(reference) => { if (active.current) onReferenceChange(reference); }} />
    </Suspense>
  </LibraryBoundary>;
}

export function CaseLibraryEntry({ reference, onReferenceChange, onClear }: {
  reference: CaseReference | null;
  onReferenceChange: (reference: CaseReference | null) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <section className="case-library-entry export" id="case-library" data-testid="case-library-entry">
    <div className="pat-head">
      <span className="pat-title">命例库</span>
      <span className="pat-sub">查阅原始资料、练习论断；可选为独立 AI 参考。</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "收起命例库" : "打开命例库"}</button>
    </div>
    {reference && <div className="case-reference-note" data-testid="selected-case-reference">
      <span>已选 AI 参考：{reference.title}（非当前命主事实）</span>
      <button type="button" onClick={onClear}>清除参考</button>
    </div>}
    {open && <div className="case-library-content"><LibraryContent onReferenceChange={onReferenceChange} /></div>}
  </section>;
}
