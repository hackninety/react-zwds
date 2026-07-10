import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // lunar-typescript 是双格式包（require→index.cjs / import→index.mjs）：
      // 应用的 import 与 iztro/lunar-lite 的 require 会被 rolldown 按条件各解析一份，
      // 同一份数据表被打包两次（engine +289KiB）。统一指到 ESM 单份；
      // 其 exports 映射只导出 "."，子路径被封锁，故必须用绝对路径。
      "lunar-typescript": fileURLToPath(
        new URL("./node_modules/lunar-typescript/dist/index.mjs", import.meta.url)
      ),
    },
  },
  server: { port: 5199, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // rolldown（vite 8 内核）不支持对象式 manualChunks，用 advancedChunks 等价迁移；
        // 分组按旧 manualChunks 的依赖闭包展开（engine 含 iztro 全部子依赖）
        advancedChunks: {
          groups: [
            { name: "engine", test: /node_modules[\\/](iztro|lunar-lite|lunar-typescript|dayjs|i18next)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|loose-envify)[\\/]/ },
          ],
        },
      },
    },
  },
});
