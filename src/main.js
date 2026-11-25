const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const api = require("./api");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
}

function settingsPath() {
	return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
	try {
		return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
	} catch (error) {
		return {};
	}
}

function writeSettings(settings) {
	fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
	fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function createWindow() {
	const window = new BrowserWindow({
		width: 1180,
		height: 860,
		minWidth: 960,
		minHeight: 700,
		title: "Prod account setup",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	window.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});
	window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
	ipcMain.handle("settings:load", () => readSettings());
	ipcMain.handle("settings:save", (_event, settings) => {
		writeSettings(settings);
		return { ok: true };
	});
	ipcMain.handle("setup:account", (_event, input) => api.checkAccount(input));
	ipcMain.handle("setup:tid-message", (_event, input) => api.tidMessage(input));
	ipcMain.handle("setup:check", (_event, input) => api.checkSetup(input));
	ipcMain.handle("setup:person", (_event, input) => api.checkPerson(input));
	ipcMain.handle("setup:subscription", (_event, input) => api.readSubscription(input));
	ipcMain.handle("setup:enable", (_event, input) => api.enableSubscription(input));
	ipcMain.handle("setup:signin", (_event, input) => api.checkSignIn(input));
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
