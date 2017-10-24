const electron = require("electron");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const fs = require("fs");
const request = require("request");

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({width: 800, height: 600, icon:"img/opcor-icon.png"});
    mainWindow.loadURL("file://" + __dirname + "/index.html", {
        extraHeaders: "Referer: https://fmovies.to", // spoof http header
        httpReferrer: "test http referrer string"
    }); // "httpReferrer" option wasn't working
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

function keyPressed(key, ctrlKey, metaKey, shiftKey) { // doesn't like when I pass the whole object
    if ((ctrlKey || metaKey) && !shiftKey) { // control or command/windows but not shift
        if (key == "m" || key == "M") { // m or M (due to capslock)
            BrowserWindow.getFocusedWindow().minimize(); // minimize current window
        }
        else if (key == "w" || key == "W") { // w or W (due to capslock)
            BrowserWindow.getFocusedWindow().close(); // close current window
        }
    }
    else {
        // no-op; normal button press
    }
}

function writeFileFromFrontend(fileName, fileContents) {
    var fileEncoding;
    if (fileName.includes("png") || fileName.includes("jpg") || fileName.includes("icns") || fileName.includes("ttf")) {
        fileEncoding = "binary";
    }
    else {
        fileEncoding = "utf8";
    }
    fs.writeFileSync(__dirname + "/" + fileName, fileContents, fileEncoding);
}

function requestFileWithReferer(filePath, referer, callbackName) {
    var result = "";
    var req = request({url: filePath,
                       encoding: "utf8",
                       headers: {"Referer": referer}},
                       function(error, response, body) {
        if (!error && response.statusCode == 200) {
            mainWindow.webContents.executeJavaScript(callbackName + "(" + body + ");");
        }
        else {
            console.log("file request failed");
        }
    });
}

// UPDATE FUNCTIONS
/*
    On update:
    1. Download new "filelist.json" from the internet and parse it. If this fails, end process and say update failed.
    2. Go through file list and rename all files to filename + "~OLD". Don't edit directory names.
    3. For each file, listed in the new filelist, download and save it with its name + "~NEW"
    4. When we've downloaded and saved all files, iterate though the renamed old ones and delete them.
    5. Rename all the new ones to their actualy filename.
    6. Display a message to the user that the update is complete, and to restart the app for the changes to take effect.
*/
const fileLocation = "http://palossand.com/opcor/";
const newFileSuffix = "~NEW";
const oldFileSuffix = "~OLD";

var updateStatus = {
    oldFileList: {}, newFileList: {}, // object with list of files named 'files'
    filesQueued: 0, allFilesQueued: false, // all files queued to be loaded/renamed/saved/deleted?
    nextAction: function() {},
    actionStarted: function(isLastFile) {
        ++updateStatus.filesQueued; updateStatus.allFilesQueued = isLastFile;
    },
    actionCompleted: function() {
        if ((--updateStatus.filesQueued === 0) && updateStatus.allFilesQueued) {
            updateStatus.nextAction();
        }
    }
}

function beginUpdateInMain() {
    console.log("ready to update");
    mainWindow.webContents.executeJavaScript("slideInPopup('update started', 2000)");
    updateStatus.oldFileList = JSON.parse(fs.readFileSync(__dirname + "/filelist.json", "utf8"));

    getFile("filelist.json", loadNewFiles);
}
function getFile(filePath, callback) { // gets a string of the data at the specified url passed in
    var fileEncoding;
    if (filePath.includes("png") || filePath.includes("jpg") || filePath.includes("icns") || filePath.includes("ttf")) {
        fileEncoding = null;
    }
    else {
        fileEncoding = "utf8";
    }
    var result = "";
    var req = request({url: fileLocation + filePath, encoding: fileEncoding}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            callback(filePath, body);
        }
        else {
            console.log(fileLocation + filePath);
            console.log("FAILED WITH STATUS: " + response.statusCode);
            mainWindow.webContents.executeJavaScript("slideInPopup('file request failed', 2000)");
        }
    });
}
function loadNewFiles(fileListPath, newFileListString) {
    mainWindow.webContents.executeJavaScript("slideInPopup('downloaded new file list', 2000)");

    updateStatus.newFileList = JSON.parse(newFileListString);
    var fileCount = updateStatus.newFileList.files.length;
    updateStatus.nextAction = renameOldFiles;
    updateStatus.filesQueued = 0;
    updateStatus.allFilesQueued = false;
    updateStatus.newFileList.files.forEach(function(fileName, index) {
        updateStatus.actionStarted(index == fileCount-1);
        getFile(fileName, saveFile);
    });
}
function saveFile(fileName, fileContents) {
    var fileEncoding;
    if (fileName.includes("png") || fileName.includes("jpg") || fileName.includes("icns") || fileName.includes("ttf")) {
        fileEncoding = "binary";
    }
    else {
        fileEncoding = "utf8";
    }
    fs.writeFile(__dirname + "/" + fileName + newFileSuffix, fileContents, fileEncoding, updateStatus.actionCompleted);
}
function renameOldFiles() {
    mainWindow.webContents.executeJavaScript("slideInPopup('downloaded new files', 2000)");

    var fileCount = updateStatus.oldFileList.files.length;
    updateStatus.nextAction = renameNewFiles;
    updateStatus.filesQueued = 0;
    updateStatus.allFilesQueued = false;
    updateStatus.oldFileList.files.forEach(function(fileName, index) {
        updateStatus.actionStarted(index == fileCount-1);
        fs.rename(__dirname + "/" + fileName, __dirname + "/" + fileName + oldFileSuffix, updateStatus.actionCompleted);
    });
}
function renameNewFiles() {
    mainWindow.webContents.executeJavaScript("slideInPopup('renamed old files', 2000)");

    var fileCount = updateStatus.newFileList.files.length;
    updateStatus.nextAction = deleteOldFiles;
    updateStatus.filesQueued = 0;
    updateStatus.allFilesQueued = false;
    updateStatus.newFileList.files.forEach(function(fileName, index) {
        updateStatus.actionStarted(index == fileCount-1);
        fs.rename(__dirname + "/" + fileName + newFileSuffix, __dirname + "/" + fileName, updateStatus.actionCompleted);
    });
}
function deleteOldFiles() {
    mainWindow.webContents.executeJavaScript("slideInPopup('renamed new files', 2000)");

    var fileCount = updateStatus.oldFileList.files.length;
    updateStatus.nextAction = completeUpdate;
    updateStatus.filesQueued = 0;
    updateStatus.allFilesQueued = false;
    updateStatus.oldFileList.files.forEach(function(fileName, index) {
        updateStatus.actionStarted(fileName, index == fileCount-1);
        fs.unlink(__dirname + "/" + fileName + oldFileSuffix, updateStatus.actionCompleted);
    });
}
function completeUpdate() { // alert user to restart app
    console.log("done updating");
    mainWindow.webContents.executeJavaScript("updateFinished()");
}

// can be called from renderer javascript
exports.beginUpdateInMain = beginUpdateInMain;
exports.keyPressed = keyPressed;
exports.writeFileFromFrontend = writeFileFromFrontend;
exports.requestFileWithReferer = requestFileWithReferer;
