import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Multi-file static build (V3): hashed, cacheable assets under dist/assets/,
// one lazy chunk per tool. No backend. See docs/v3/ARCHITECTURE.md §6.
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Editors are shared by several lazily loaded tools. Grouping them keeps
        // the duplicate out of every tool chunk and gives them a stable, cacheable
        // name that scripts/check-budgets.mjs recognises as a shared chunk.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](@codemirror|@lezer|@uiw)[\\/]/.test(id)) return "codemirror";
          // Without an explicit home, Rollup can place React in whichever chunk
          // first used it — which was the editor chunk. The entry then imported
          // React *from* the editor chunk and preloaded ~173 kB gzip of
          // CodeMirror on the home page, where no editor exists.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor";
          return undefined;
        },
      },
    },
  },
});
