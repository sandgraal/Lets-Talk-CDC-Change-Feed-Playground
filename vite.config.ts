import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  if (mode === "web") {
    return {
      plugins: [react()],
      publicDir: false,
      build: {
        outDir: "assets/generated",
        emptyOutDir: false,
        rollupOptions: {
          input: {
            shell: "web/main.tsx",
            "event-log-widget": "web/event-log-widget.tsx",
          },
          output: {
            entryFileNames: chunk => (chunk.name === "event-log-widget" ? "event-log-widget.js" : "ui-shell.js"),
            chunkFileNames: "ui-[name].js",
            assetFileNames: "ui-[name].[ext]",
          },
        },
      },
    };
  }

  return {
    publicDir: false,
    build: {
      outDir: "assets/generated",
      emptyOutDir: false,
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
  };
});
