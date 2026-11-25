const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setupApp", {
	loadSettings: () => ipcRenderer.invoke("settings:load"),
	saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
	checkAccount: (input) => ipcRenderer.invoke("setup:account", input),
	tidMessage: (input) => ipcRenderer.invoke("setup:tid-message", input),
	check: (input) => ipcRenderer.invoke("setup:check", input),
	checkPerson: (input) => ipcRenderer.invoke("setup:person", input),
	readSubscription: (input) => ipcRenderer.invoke("setup:subscription", input),
	enableSubscription: (input) => ipcRenderer.invoke("setup:enable", input),
	checkSignIn: (input) => ipcRenderer.invoke("setup:signin", input)
});
