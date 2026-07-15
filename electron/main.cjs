const { app, BrowserWindow } = require("electron");
const path = require("path");
const { fork } = require("child_process");

let mainWindow;
let serverProcess;

function startServer() {
  // Start the Express server as a child process
  const serverPath = path.join(__dirname, "..", "dist", "server.cjs");
  serverProcess = fork(serverPath, [], {
    silent: true,
    cwd: path.join(__dirname, "..", "dist")
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`Server error: ${data}`);
  });

  // Wait for server to be ready
  return new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 800,
    title: "Birthday Song Lookup",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL("http://localhost:3000");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
