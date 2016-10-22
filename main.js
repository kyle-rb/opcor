const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const fs = require("fs");

let mainWindow;

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

function beginUpdateInMain() {
    console.log("ready to update");
    console.log(fs.readFileSync("./filelist.json", "utf8"));

    /*
    On update:
    1. Download new "filelist.json" from the internet and parse it. If this fails, end process and say update failed.
    2. Go through file list and rename all files to filename + "_OLD". Don't edit directory names.
    3. For each file, listed in the new filelist, download and save it.
    4. When we've downloaded and saved all files, iterate though the renamed ones and delete them.
    5. Display a message to the user that the update is complete, and to restart the app for the changes to take effect.
    */
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

exports.beginUpdateInMain = beginUpdateInMain; // can be called from renderer javascript
