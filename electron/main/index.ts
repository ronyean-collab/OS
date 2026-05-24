import { app, BrowserWindow, shell } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc/handlers";
import { closeDatabase, openDatabase } from "./database/connection";
import { logCrash, markSessionCleanExit } from "./services/crash-logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** With "type":"module", CJS preload must be .cjs; ESM builds use .mjs. */
function resolvePreloadPath(): string {
  const dir = path.join(__dirname, "../preload");
  const candidates = ["index.cjs", "index.mjs", "index.js"];
  for (const name of candidates) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(dir, "index.cjs");
}

function registerProcessCrashHandlers(): void {
  process.on("uncaughtException", (error) => {
    logCrash({ process: "main", error, context: { phase: "uncaughtException" } });
  });

  process.on("unhandledRejection", (reason) => {
    logCrash({
      process: "main",
      error: reason instanceof Error ? reason : new Error(String(reason)),
      context: { phase: "unhandledRejection" },
    });
  });
}

function attachRendererCrashHandlers(win: BrowserWindow): void {
  win.webContents.on("render-process-gone", (_event, details) => {
    logCrash({
      process: "renderer",
      error: new Error(`Renderer exited: ${details.reason}`),
      context: { exitCode: details.exitCode, reason: details.reason },
    });
  });

  win.webContents.on("unresponsive", () => {
    logCrash({
      process: "renderer",
      error: new Error("Renderer became unresponsive"),
      context: { phase: "unresponsive" },
    });
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: "ContinuityOS",
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  attachRendererCrashHandlers(win);

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  registerProcessCrashHandlers();
  openDatabase();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  markSessionCleanExit();
  closeDatabase();
});
