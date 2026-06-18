import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      // package.json "type":"module" makes .js preload run as ESM (no require).
      // CJS preload must use .cjs so require("electron") works in the isolated preload context.
      lib: {
        entry: resolve(__dirname, "electron/preload/index.ts"),
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
        },
        output: {
          manualChunks(id) {
            if (id.includes("ContinuityInspectorModal")) return "continuity-inspector";
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
});
