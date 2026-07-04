import { Component, ReactNode } from "react";

/** 盘面渲染兜底：单处异常不拖垮整页 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="err-box">
          盘面渲染异常：{String(this.state.error.message || this.state.error)}
          （请调整参数或刷新页面重试）
        </div>
      );
    }
    return this.props.children;
  }
}
