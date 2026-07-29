# CLAUDE.md

Claude Code 在本仓库工作时的约定。

## 协作约定

- **始终用中文与我对话**；代码注释、文档同样用中文。
- **Git 提交信息用中文**，沿用现有风格：`类别：概述——细节`（类别如 修 / 功能 / 文档 / 重构 等，见 `git log`）。
- **每完成一项处理即自动 commit + push**（类似存档），不必等待确认。
- 本账号（hackninety）下部分项目引用同账号的 `*-ts-lib` 库仓库；如改动涉及这些库，**可同步修改对应 `*-ts-lib` 仓库并推送**。

## 项目速览

紫微斗数排盘 Web 应用：iztro 算法引擎 + 自研盘面 UI。React 18 + Vite + TypeScript，无 UI 框架，样式集中在 `src/index.css`。

- `npm run dev` 开发（端口 5199）；`npm run build` 构建（tsc + vite）；`npm test` 测试（vitest）。
- `src/core/` 纯逻辑：排盘 `useZwds`、结构分析 `analysis`、AI 导出 `exportData`、知识库 `knowledge`、人生K线 `lifeKline`、十年规划 `decadePlan`、合盘 `synastry`、生时校正 `rectify`。
- `src/components/` 盘面组件；`docs/kb/` 古籍赋文库（公版）。

## 重要口径

- **AI 导出（复制给AI / TOON / MD）不携带人生K线量化数据**（含月K线、十年规划表的均值/高光/低谷列）——自定分值易被 AI 当作命理定论引用造成误报；K线仅盘面展示。改导出时勿把这些字段加回去。
- MD 章节号被推理指引硬编码引用，增删章节须同步 `exportData.test.ts` 的章节顺序断言。
