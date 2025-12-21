import { app, BrowserWindow } from "electron";
import path from "node:path";
import net from "node:net";
import { pathToFileURL } from "node:url";

let mainWindow = null;

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Failed to get free port")));
      }
    });
    server.on("error", (err) => {
      try {
        server.close();
      } catch {}
      reject(err);
    });
  });
}

async function startBundledServer() {
  const port = await getFreePort();
  process.env.PORT = String(port);
  process.env.LOCAL_DB_DIR = app.getPath("userData");

  const appPath = app.getAppPath();
const serverEntry = path.join(appPath, "dist", "server", "node-build.cjs");
await import(serverEntry);

  // ✅ Convert to file:// URL for ESM compatibility
  const serverURL = pathToFileURL(serverEntry).href;

  // Dynamically import the server (must be a file:// URL on Windows)
  await import(serverURL);

  return port;
}

async function createMainWindow() {
  const isDev = Boolean(process.env.ELECTRON_START_URL);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (isDev) {
    await win.loadURL(process.env.ELECTRON_START_URL);
    try {
      win.webContents.openDevTools({ mode: "detach" });
    } catch {}
  } else {
    const port = await startBundledServer();
    const url = `http://localhost:${port}`;
    await win.loadURL(url);
  }

  return win;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(async () => {
  mainWindow = await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    }
  });
});
