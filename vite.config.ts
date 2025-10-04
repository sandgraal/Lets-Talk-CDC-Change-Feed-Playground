import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "assets/generated",
    emptyOutDir: true,
    lib: {
      entry: "sim/bundle.ts",
      name: "LetsTalkCdcSimulator",
      formats: ["es"],
      fileName: () => "sim-bundle.js",
    },
    rollupOptions: {
      external: [],
    },
  },
});
