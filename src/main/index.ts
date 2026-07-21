import { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { resolveStoreDir } from "./lib/storeDir.js";
import { createSupervisor } from "./sidecar/supervisor.js";
import { registerHandlers } from "./ipc/registerHandlers.js";
import type { Supervisor } from "./sidecar/supervisor.js";

const dirName = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: Supervisor | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(dirName, "../preload/index.mjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(dirName, "../renderer/index.html"));
  }
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Intisy Dashboard");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Quit", click: () => app.quit() }]));
}

function applyContentSecurityPolicy(): void {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const scriptSrc = isDev ? "'self' 'unsafe-eval' 'unsafe-inline'" : "'self'";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [`default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline';`],
      },
    });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    applyContentSecurityPolicy();

    const storeDir = resolveStoreDir(process.env, process.platform, homedir());
    supervisor = createSupervisor({ sidecarPath: join(dirName, "sidecar.js"), storeDir });
    registerHandlers(supervisor);

    createWindow();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    supervisor?.dispose();
  });
}
