import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Fully static, client-side-only build. No backend, no server functions.
// vite-plugin-singlefile inlines all JS/CSS into index.html so the build
// output is one portable, self-contained file (needed for artifact hosting
// and for the "nothing leaves your browser" story to be easy to verify).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
  },
});
