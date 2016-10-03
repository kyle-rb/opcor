const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const fs = require("fs");

let mainWindow

function createWindow() {
    mainWindow = new BrowserWindow({width: 800, height: 600, icon:"img/opcor-icon.png"});
    mainWindow.loadURL("file://" + __dirname + "/index.html");
    mainWindow.on("closed", function() {
	mainWindow = null; // change this if we switch to multiple windows
    });
}

function writeBookmarks(bookmarksObject) { // should really implement error handling at some point
    fs.write("bookmarks.json", JSON.stringify(bookmarksObject), function() {});
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

app.on("keydown", function(key) {
    if (key.ctrlKey && key.keyCode == 77) {
        mainWindow.getFocusedWindow.minimize();
    }
    else if (key.ctrlKey && key.keyCode == 87) {
        mainWindow.getFocusedWindow.close();
    }
});
