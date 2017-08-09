// this is necessary to be able to call node functions from here
let electron = require("electron");
let beginUpdateInMain = electron.remote.require("./main").beginUpdateInMain;
let keyPressed = electron.remote.require("./main").keyPressed;
document.addEventListener("keydown", function(event) {
    keyPressed(event.key, event.ctrlKey, event.metaKey, event.shiftKey);
});
let writeFileFromFrontend = electron.remote.require("./main").writeFileFromFrontend;

// global constants - denote start and end points of various parts of the page structure
const STATES = Object.freeze({ SEARCH: 0, EPISODES: 1, STREAMS: 2 }); // states for pageHistory

const resultUrlStart = "ml-item";
const resultUrlEnd = '" class';
const resultTitleStart = 'ml-mask" title="'; // might need to alter because newlines
const resultTitleEnd = '"';
const tvShowIndicator = "<strong>Episode:</strong>";
const episodeSectionStart = "<ul id="; // sections separating different hosts
const episodeSectionEnd = "<\\/ul>"
const episodeIdStart = 'id=\\"ep-';
const episodeIdEnd = '\\"';
const episodeTitleStart = "><\\/i>";
const episodeTitleEnd = "     "; // five spaces should be enough
const hostNameStart = '<a title=\\"';
const hostNameEnd = '\\"';
const olHexStart = '<span id="';
const olHexEnd = "</";
const olScriptStart = "var _0x9495="; // could change if they redo the obfuscation
const olScriptEnd = "}});";

// global variables - hold variables that need to be remembered between functions
let pageHistory = { state: STATES.SEARCH,
                    searchString: "",
                    resultIndex: -1,
                    episodeIndex: -1,
                    scrollPos: 0
                  }; // stores information about the current location/state
let settings = {}; // stores settings
let resultList = []; // list of pairs containing show/movie names and urls
let episodeList = []; // list of pairs containing episode names and ids
let streamList = []; // list of pairs containing string quality identifiers and urls
let frameDocument; // iframe container for video embed

let _x, _y; // these catch the values for the script that gets 'eval'ed; they have to be up here
let openloadHexString = "", openloadStreamUrl = ""; // input and output for Openload
var z = 'hexid'; // fake id for Openload
function jQuery(input) { // this fakes jQuery for Openload to work
    if (input === document) {
        return { "ready": function(callback) { callback(); } };
    }
    else if (input === "#streamurl") {
        return { "text": function(val) { openloadStreamUrl = val; } };
    }
    else if (input === '#hexid') {
        return { "text": function() { return openloadHexString; } };
    }
}
var $ = jQuery;


// functions to retrieve and display data
function executeSearchFromBox() { // gets search string from input box
    var queryString = document.getElementById("query-input").value;
    retrieveSearchResults(queryString);
}

function retrieveSearchResults(searchString) { // searches for string and saves to resultList
    pageHistory.searchString = searchString;
    let encodedSearchString = searchString.trim().toLowerCase();
    encodedSearchString = encodedSearchString.replace(/[^A-Za-z0-9\s]/g,""); // remove special chars
    encodedSearchString = encodedSearchString.replace(/\s+/g, "+"); // replace spaces with pluses
    let searchUrl = "https://solarmoviez.to/search/" + encodedSearchString + ".html";
    let resultsPage = getPage(searchUrl); // html of search results page
    if (resultsPage.includes("No result found.") || resultsPage.includes("Error 404")) {
        resultList = [];
    }
    else {
        let resultCount = (resultsPage.match(/ml-item/g)||[]).length;
        let urlList = getSubstrings(resultsPage, resultUrlStart, resultUrlEnd, resultCount);
        let titleList = getSubstrings(resultsPage, resultTitleStart, resultTitleEnd, resultCount);
        resultList = [];
        for (let i = 0; i < resultCount; i++) {
            resultList[i] = [titleList[i].slice(16), urlList[i].slice(31)];
        }
    }

    displaySearchResults();
}

function displaySearchResults() { // displays the contents of resultsList
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "hidden"; // hide back button
    document.getElementById("settings-button").style.visibility = "visible"; // show settings button
    let displayText;
    if (resultList.length === 0) {
        displayText = "couldn't find shit";
    }
    else {
        displayText = "are any of these the thing you wanted to watch?<br/><br/>";
        for (var i = 0; i < resultList.length; i++) {
            displayText += `<div class="result-box" style="animation-delay:${((i%7/10)-0.3)}s;" 
            onclick="retrieveEpisodeList(${i});">${resultList[i][0]}</div>`;
        }
        displayText += "<br/>if it's not one of those, then either it's not on there, or you"
            + " fucked up the search terms";
    }
    document.getElementById("results").innerHTML = displayText;
    document.body.scrollTop = 0;
    
    pageHistory.state = STATES.SEARCH;
    pageHistory.resultIndex = -1;
    pageHistory.episodeIndex = -1;
    pageHistory.scrollPos = 0;
    episodeList = [];
    streamList = [];
}

function retrieveEpisodeList(resultIndex) { // gets episodes of a tv show and saves to episodeList
    pageHistory.resultIndex = resultIndex;
    
    let urlList = resultList[resultIndex][1].split("-"); // tokenize by dashes
    let movieId = urlList[urlList.length - 1].slice(0, -5); // last section, with ".html" removed

    episodeListUrl = "https://solarmoviez.to/ajax/v4_movie_episodes/" + movieId;
    episodesPage = getPage(episodeListUrl);
    let hostCount = (episodesPage.match(/server-item/g)||[]).length; // number of different hosts
    let sections = getSubstrings(episodesPage, episodeSectionStart, episodeSectionEnd, hostCount);
    let idLists = [];
    let titleLists = [];
    let episodeCount = 0;
    for (let i = 0; i < sections.length; i++) {
        episodeCount = (sections[i].match(/data-index/g)||[]).length; // episodes from this host
        idLists[i] = getSubstrings(sections[i], episodeIdStart, episodeIdEnd, episodeCount);
        titleLists[i]= getSubstrings(sections[i], episodeTitleStart, episodeTitleEnd, episodeCount);
        for (let j = 0; j < episodeCount; j++) {
            titleLists[i][j] = titleLists[i][j].slice(6);
            idLists[i][j] = idLists[i][j].slice(8);
        }
        titleLists[i].reverse(); // list of episodes is backwards
        idLists[i].reverse();
    }
    let hostMatchFunctionObj = {
        "main-vip": hostName => hostName === "VIP 1",
        "alt-vip": hostName => hostName === "VIP 6",
        "openload": hostName => hostName === "OPENLOAD",
        "backup": hostName => hostName === "BACKUP"
    }
    let hostMatchFunction = hostMatchFunctionObj[settings.host] || hostMatchFunctionObj["openload"];
    let hostList = getSubstrings(episodesPage, hostNameStart, hostNameEnd, hostCount);
    hostList.reverse();
    let hostIndex = -1;

    console.log("host count: " + hostCount);
    console.log("episode count: " + episodeCount);

    for (let i = 0; i < hostList.length; i++) {
        hostList[i] = hostList[i].slice(hostNameStart.length);

        console.log(hostList[i]);

        if (hostMatchFunction(hostList[i])) {
            console.log("chose: " + hostList[i]);
            hostIndex = i;
            break;
        }
    }
    episodeList = [];
    if (hostIndex !== -1) {
        for (let i = 0; i < titleLists[hostIndex].length; i++) {
            episodeList[i] = [titleLists[hostIndex][i], idLists[hostIndex][i]];
        }
    }

    let landingPage = getPage(resultList[resultIndex][1]);
    if (landingPage.indexOf(tvShowIndicator) !== -1) { // if it's a tv show
        displayEpisodeList();
    }
    else { // if it's a movie
        retrieveVideoStreams(-1);
    }
}

function displayEpisodeList() { // displays the contents of episodeList
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show back button
    document.getElementById("settings-button").style.visibility = "hidden"; // hide settings button
    let displayText = resultList[pageHistory.resultIndex][0]; // show/movie name

    for (let i = 0; i < episodeList.length; i++) {
        displayText += `<div class="result-box" style="animation-delay:${((i%7/10)-0.3)}s;" 
        onclick="retrieveVideoStreams(${i});">${episodeList[i][0]}</div>`;
    }

    document.getElementById("results").innerHTML = displayText || "something went wrong";
    
    if (pageHistory.state = STATES.STREAMS) {
        document.body.scrollTop = pageHistory.scrollPos;
    }
    else {
        document.body.scrollTop = 0;
    }
    pageHistory.state = STATES.EPISODES;
    pageHistory.episodeIndex = -1;
    streamList = [];
}

function retrieveVideoStreams(episodeIndex) { // gets streams for a video and saves to streamList
    let urlList = resultList[pageHistory.resultIndex][1].split("-"); // tokenize by dashes
    let movieId = urlList[urlList.length - 1].slice(0, -5); // last section, with ".html" removed

    let episodeId;
    if (episodeIndex != -1) { // if it's a tv show
        episodeId = episodeList[episodeIndex][1];
    }
    else {
        episodeId = episodeList[0][1];
    }

    let streamSources = [];
    if (settings.host !== "openload") {
        let tokenUrl = `https://solarmoviez.to/ajax/movie_token?eid=${episodeId}&mid=${movieId}`;
        let tokenScript = getPage(tokenUrl);
        _x = "";
        _y = "";
        eval(tokenScript); // this sets _x and _y
        let streamUrl = `https://solarmoviez.to/ajax/movie_sources/${episodeId}?x=${_x}&y=${_y}`;
        let streamPage = getPage(streamUrl);
        try {
            streamSources = JSON.parse(streamPage).playlist[0].sources.reverse();
        }
        catch (e) {
            streamSources = [];
        }
    }
    else {
        let embedPageQuery = getPage("https://solarmoviez.to/ajax/movie_embed/" + episodeId);
        let embedPageUrl;
        try {
            embedPageUrl = JSON.parse(embedPageQuery).src;
        }
        catch (e) {
            embedPageUrl = "";
            streamSources = [];
        }
        if (embedPageUrl.indexOf("openload") !== -1) { // don't continue if empty or streamango link
            let embedPage = getPage(embedPageUrl);
            openloadHexString = getSubstrings(embedPage, olHexStart, olHexEnd)[0];
            olHexId = getSubstrings(embedPage, olHexStart, ">")[0]; // get id so we can remove it
            openloadHexString = openloadHexString.slice(olHexId.length + 1); // remove id
            let openloadScript = getSubstrings(embedPage, olScriptStart, olScriptEnd)[0];
            if (openloadHexString && openloadScript) {
                eval(openloadScript + olScriptEnd); // this sets openloadStreamUrl
            }
            if (openloadStreamUrl) {
                streamSources = [{
                    "file": `https://openload.co/stream/${openloadStreamUrl}?mime=true`
                }];
            }
        }
        // else if (embedPageUrl.indexOf("streamango") !== -1) { // temporary handler for streamango
        //     streamSources = [{
        //         "file": embedPageUrl
        //     }];
        // } // just don't try and use the players; only copy links
    }
    openloadHexString = "";
    openloadStreamUrl = "";

    // for googlevideo hosting, the sources had labels like 720p, 1080p, etc.
    for (let i = 0; i < streamSources.length; i++) {
        if (streamSources[i].label === undefined) { // if no label, give the source a number
            streamSources[i].label = "Source " + (i + 1);
        }
        else if (streamSources[i].label.length === 4) { // pad labels so the buttons line up
            streamSources[i].label = "&nbsp;&nbsp;" + streamSources[i].label;
        }
        streamList[i] = [streamSources[i].label, streamSources[i].file];
    }

    pageHistory.episodeIndex = episodeIndex;
    pageHistory.scrollPos = document.body.scrollTop;

    displayVideoStreams();
}

function displayVideoStreams() { // displays the contents of streamList
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show the back button
    document.getElementById("settings-button").style.visibility = "hidden"; // hide settings button
    let displayText = resultList[pageHistory.resultIndex][0]; // movie or show name
    if (pageHistory.episodeIndex != -1) { // if it's a tv show
        displayText += ": " + episodeList[pageHistory.episodeIndex][0]; // episode name
    }
    if (streamList.length === 0) {
        displayText = "looks like this video isn't available from this host";
    }
    else {
        for (let i = 0; i < streamList.length; i++) {
            displayText += `<div class="result-box" style="cursor:default;animation-delay:
            ${((i/10)-0.3)}s;">${streamList[i][0]}:
            <button class="embed" onclick="embedVideo('${streamList[i][1]}');"></button>
            <a href="window.html#${streamList[i][1]}" target="_blank">
            <button class="window"></button></a>
            <button class="copy" onclick="copyText('${streamList[i][1]}');"></button></div>`;
        }
    }
    document.getElementById("results").innerHTML = displayText;
    document.body.scrollTop = 0;

    pageHistory.state = STATES.STREAMS;
}

// other functions that might be called
function pageLoaded() {
    checkForUpdate();
    getSettings();

    frameDocument = document.getElementById('video-embed-frame').contentWindow.document;
    frameDocument.head.innerHTML = '<style>html,body{height:100%;padding:0;border:none;margin:0;}#video-embed{position:absolute;width:100%;height:100%;}</style>';
    frameDocument.body.innerHTML = '<video id="video-embed" controls autoplay><source id="video-source" src="" type="video/mp4"></video>';
}

function checkForUpdate() { // download the version file to see if there is an update available
    let currentVersionFile = JSON.parse(getPage("./version.json"));
    let newestVersionFile = JSON.parse(getPage("http://palossand.com/opcor/version.json"));
    let updateNecessary = false;
    let currentVersion = currentVersionFile.version.split('.');
    let newestVersion = newestVersionFile.version.split('.');
    let updateMessage = "";
    for (var i = 0; i < currentVersion.length; i++) {
        if (currentVersion[i] < newestVersion[i]) {
            updateMessage = newestVersionFile.message;
            updateNecessary = true;
            break;
        }
        if (currentVersion[i] > newestVersion[i]) {
            break; // only continue loop if current version number is equal
        }
    }
    if (updateNecessary) {
        var popupText = updateMessage;
        slideInPopup(popupText, 20000); // show for 20 seconds
    }
}
function performUpdate() { // initiates a new update (in the backend code)
    console.log("update started");
    beginUpdateInMain();
}
function updateFinished() { // notifies the user that the update has finished
    console.log("update completed");
    slideInPopup("update complete! please restart Opcor now", 20000); // show for 20 seconds
}

function getSettings() {
    try {
        settings = JSON.parse(getPage("./settings.json"));
    }
    catch (e) {
        settings = { host: "openload" };
    }
}

function goBack() { // go back one page (e.g. stream list to episode list)
    if (pageHistory.state === STATES.EPISODES || pageHistory.episodeIndex === -1) {
        displaySearchResults();
    }
    else if (pageHistory.state === STATES.STREAMS) {
        displayEpisodeList();
    }
    else {
        // either STATES.SEARCH or bad value; this shouldn't get hit
    }
}

function embedVideo(videoUrl) { // starts playing the video in a box under the stream list
    frameDocument.getElementById("video-source").src = videoUrl;
    frameDocument.getElementById("video-embed").load();
    if (videoUrl == "") {
        document.getElementById("video-container").style.display = "none";
    }
    else {
        document.getElementById("video-container").style.display = "block";
    }
}

function copyText(stringToCopy) { // copies text to a user's clipboard and pops up a notification
    var selectBox = document.getElementById("select-box");
    selectBox.innerHTML = stringToCopy;
    selectText("select-box");
    document.execCommand("copy", false, null); // copies whatever text is selected
    selectBox.innerHTML = "";
    
    slideInPopup("link copied to clipboard", 2000); // show for 2 seconds
}

// helper functions to simplify main functions
function getPage(url) { // gets a string of the html of the page at the url passed in
    console.log("started loading " + url);
    let startTime = Date.now();
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", url, false); // false for synchronous request; doesn't matter if UI freezes
    xmlHttp.send(null);
    console.log("resource load time: " + (Date.now() - startTime));
    return xmlHttp.responseText;
}

function getSubstrings(searchStr, startStr, endStr, strCount = 1) { // [startStr ***]endStr
    let searchStartIndex = 0;
    let results = [];
    let startIndex;
    let endIndex;
    for (let i = 0; i < strCount; i++) {
        startIndex = searchStr.indexOf(startStr, searchStartIndex);
        endIndex = searchStr.indexOf(endStr, startIndex + startStr.length);
        searchStartIndex = endIndex + endStr.length;
        if (startIndex < 0 || endIndex <= startIndex + startStr.length) {
            results[i] = "";
        }
        else {
            results[i] = searchStr.substring(startIndex, endIndex);
        }
    }
    return results;
}

function slideInPopup(popupMessage, popupDuration) { // slides in popup from the top of the screen
    let popupBox = document.getElementById("alert-popup");
    popupBox.innerHTML = popupMessage;
    popupBox.style.top = "20px";
    setTimeout(function(){ popupBox.style.top = "-120px" }, popupDuration);
}

function toggleMenu() {
    if (document.getElementById("menu-popup").style.top === "20px") {
        slideOutMenu();
    }
    else { /* first time top is unset, so show menu */
        slideInMenu();
    }
}
function slideInMenu() {
    let hostButtons = document.getElementsByName("host");
    for (let i = 0; i < hostButtons.length; i++) {
        if (hostButtons[i].value === settings.host) {
            hostButtons[i].checked = true;
            break;
        }
    }
    menuBox = document.getElementById("menu-popup");
    menuBox.style.top = "20px";
}
function slideOutMenu() {
    let hostButtons = document.getElementsByName("host");
    for (let i = 0; i < hostButtons.length; i++) {
        if (hostButtons[i].checked) {
            settings.host = hostButtons[i].value;
            break;
        }
    }
    let fileContents = JSON.stringify(settings);
    writeFileFromFrontend("settings.json", fileContents);
    menuBox = document.getElementById("menu-popup");
    menuBox.style.top = "-640px";
}
// also: style the form

function selectText(element) { // selects the text of element
    let text = document.getElementById(element);
    let range, selection;
    if (document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(text);
        range.select();
    }
    else if (window.getSelection) {
        selection = window.getSelection();
        range = document.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// this is to avoid a thing where JSFuck gets 'p' from the fourth letter in http:// or https://, but
// Electron uses file://, so 'p's are 'e's, and 'escape' and 'unescape' are 'escaee' and 'unescaee'
// I hate JavaScript so goddamn much
function escaee(str) {
    return escape(str);
}

function unescaee(str) {
    return unescape(str);
}

// * * * * * * * * * * * * * * * * * * * *
//
// TODO:
// add streamango support (or remove the embed thing as an option for real builds)
// add next and previous buttons (push navs to popped-out window?)
//
// * * * * * * * * * * * * * * * * * * * *
