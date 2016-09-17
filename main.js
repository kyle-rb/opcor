const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

let mainWindow

function createWindow() {
    mainWindow = new BrowserWindow({width: 800, height: 600, icon:'opcor-icon.png'});
    mainWindow.loadURL(`file://${__dirname}/index.html`); // grave accent indicates template string
    mainWindow.on("closed", function() {
	mainWindow = null; // change this if we switch to multiple windows
    });
}

app.on("ready", createWindow); // called when Electron has finished initialization

app.on("window-all-closed", function() {
    app.quit(); // sample code doesn't close the app when the window closes on OS X; but fuck that
});

app.on("activate", function() {
    if (mainWindow === null) {
	createWindow();
    }
});
