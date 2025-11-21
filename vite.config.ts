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
            "changefeed-playground": "web/changefeed-playground.tsx",
          },
          output: {
            entryFileNames: chunk => {
              if (chunk.name === "event-log-widget") return "event-log-widget.js";
              if (chunk.name === "changefeed-playground") return "changefeed-playground.js";
              return "ui-shell.js";
            },
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
