// this is necessary to be able to call node functions from here
let electron = require("electron");
let electronMain = electron.remote.require("./main");
let beginUpdateInMain = electronMain.beginUpdateInMain;
let keyPressed = electronMain.keyPressed;
document.addEventListener("keydown", function(event) {
    keyPressed(event.key, event.ctrlKey, event.metaKey, event.shiftKey);
});
let writeFileFromFrontend = electronMain.writeFileFromFrontend;
let requestFileWithReferer = electronMain.requestFileWithReferer;

// global constants - denote start and end points of various parts of the page structure
const STATES = Object.freeze({ SEARCH: 0, EPISODES: 1, STREAMS: 2 }); // states for pageHistory

const resultUrlStart = 'poster" href="';
const resultUrlEnd = '"';
const resultTitleStart = 'alt="'; // might need to alter because newlines
const resultTitleEnd = ' | ';
const tvShowIndicator = 'name">TV-Series';
const episodeSectionStart = 'fa-server'; // sections separating different hosts
const episodeSectionEnd = '</div> </div>';
const episodeIdStart = 'data-id="';
const episodeIdEnd = '"';
const episodeTitleStart = '">'; // will result in 3 extra strings at the start of the list
const episodeTitleEnd = '<';
const hostNameStart = 'fa-server"></i> ';
const hostNameEnd = ' <';
const olHexStart = '<span style="" id="';
const olHexEnd = '</';
const olScriptStart = 'var _0x9495='; // could change if they redo the obfuscation
const olScriptEnd = '}});';

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

let hashInputString; // this is the value of a string that should be retrieved from version.json
let _x, _y; // these catch the values for the script that gets 'eval'ed; they have to be up here
let openloadHexString = "", openloadStreamUrl = ""; // input and output for Openload
var z = 'hexid'; // fake id for Openload
function jQuery(input) { // this fakes jQuery for Openload to work
    if (input === document) {
        return { "ready": function(callback) { callback(); } };
    }
    else if (input === "#streamurl" || input === "#streamuri" || input === "#streamurj") {
        return { "text": function(val) { openloadStreamUrl = val; } };
    }
    else if (input === '#hexid') {
        return { "text": function() { return openloadHexString; } };
    }
    else {
        console.log("unexpected query selector in fake jQuery: " + input);
        return { "text": function(val) { openloadStreamUrl = val; } }; // pretend it's #streamurl
    }
}
var $ = jQuery;


// functions to retrieve and display data
function executeSearchFromBox() { // gets search string from input box
    console.log("executeSearchFromBox called");

    var queryString = document.getElementById("query-input").value;
    pageHistory.searchString = queryString;

    let encodedQueryString = queryString.trim().toLowerCase();
    encodedQueryString = encodedQueryString.replace(/[^A-Za-z0-9\s]/g,""); // remove special chars
    encodedQueryString = encodedQueryString.replace(/\s+/g, "+"); // replace spaces with pluses
    let queryUrl = "https://fmovies.to/search?keyword=" + encodedQueryString;

    getPage(queryUrl, retrieveSearchResults);
}

function retrieveSearchResults(resultsPage) { // searches for string and saves to resultList
    if (!resultsPage||resultsPage.includes("No result found.")||resultsPage.includes("Error 404")) {
        resultList = [];
    }
    else {
        let resultCount = (resultsPage.match(/\s\|\s/g)||[]).length;
        let urlList = getSubstrings(resultsPage, resultUrlStart, resultUrlEnd, resultCount);
        let titleList = getSubstrings(resultsPage, resultTitleStart, resultTitleEnd, resultCount);
        resultList = [];
        for (let i = 0; i < resultCount; i++) {
            resultList[i] = [titleList[i].slice(5), "https://fmovies.to" + urlList[i].slice(14)];
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
            onclick="getEpisodeListPage(${i});">${resultList[i][0]}</div>`;
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

function getEpisodeListPage(resultIndex) {
    pageHistory.resultIndex = resultIndex;
    let episodeListUrl = resultList[resultIndex][1];
    getPage(episodeListUrl, retrieveEpisodeList);
}

function retrieveEpisodeList(episodesPage) { // gets episodes of a tv show and saves to episodeList
    let hostCount = (episodesPage.match(/fa-server/g)||[]).length; // number of different hosts
    let sections = getSubstrings(episodesPage, episodeSectionStart, episodeSectionEnd, hostCount);
    let idLists = [];
    let titleLists = [];
    let episodeCount = 0;
    for (let i = 0; i < sections.length; i++) {
        episodeCount = (sections[i].match(/href/g)||[]).length; // episodes from this host
        idLists[i] = getSubstrings(sections[i], episodeIdStart, episodeIdEnd, episodeCount);
        titleLists[i]= getSubstrings(sections[i], episodeTitleStart,episodeTitleEnd,episodeCount+3);
        titleLists[i] = titleLists[i].slice(3); // 3 extra matches at the beginning              ^
        for (let j = 0; j < episodeCount; j++) {
            titleLists[i][j] = "Episode " + titleLists[i][j].slice(episodeTitleStart.length);
            idLists[i][j] = idLists[i][j].slice(episodeIdStart.length);
        }
    }
    let hostMatchFunctionObj = {
        "main-vip": hostName => hostName === "Server G1", // are there others on fmovies?
        "alt-vip": hostName => hostName === "Server F4",
        "openload": hostName => hostName === "OpenLoad",
        "backup": hostName => hostName === "MyCloud" // change the label, or name, or both?
    }
    let hostMatchFunction = hostMatchFunctionObj[settings.host] || hostMatchFunctionObj["openload"];
    let hostList = getSubstrings(episodesPage, hostNameStart, hostNameEnd, hostCount);
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
    if (hostIndex !== -1) { // mux lists into list of tuples
        for (let i = 0; i < titleLists[hostIndex].length; i++) {
            episodeList[i] = [titleLists[hostIndex][i], idLists[hostIndex][i]];
        }
    }
    console.log(idLists);

    if (episodesPage.indexOf(tvShowIndicator) !== -1) { // if it's a tv show
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
    let titleList = resultList[pageHistory.resultIndex][0].split(" ");
    let seasonNum = 1; // if there's no season number, it should be season 1
    if (titleList[titleList.length-1] < 99)
        seasonNum = titleList.pop(); // if last char is season number
    let wikiLink = "https://en.wikipedia.org/wiki/Special:Search?search=list+of+"
        + titleList.join('+') + "+episodes";
    let displayText = `<a href="${wikiLink}" target="blank">${resultList[pageHistory.resultIndex][0]}</a>`; // show/movie name with wikipedia link

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
    let hostServerIds = {
        "main-vip": "34", // Server G1
        "alt-vip": "30", // Server F4
        "openload": "24", // OpenLoad
        "backup": "28", // MyCloud
    }
    let serverId = hostServerIds[settings.host];
    let episodeId;
    if (episodeIndex != -1) { // if it's a tv show
        episodeId = episodeList[episodeIndex][1];
    }
    else if (episodeList.length > 0) {
        episodeId = episodeList[0][1];
    }
    else {
        displayVideoStreams(); // will display error
        return;
    }

    // the timestamp follows weird rules
    let hourTimestamp = Math.floor(Date.now() / (60 * 60 * 1000)); // hours since 1970
    let hourOfDay = hourTimestamp % 24 - 4; // hour of day on 24 hour clock in EST
    console.log("hourOfDay: " + hourOfDay);
    if (hourOfDay === 1) { // 1AM
        hourTimestamp += 12; // plus 12 hours
    }
    else if ((hourOfDay >= 14 && hourOfDay <= 23) || hourOfDay === 0) { // 2PM - 12AM
        hourTimestamp -= 12; // minus 12 hours
    }
    // otherwise normal time works
    hourTimestamp *= (60 * 60); // make it a normal unix seconds timestamp

    let hashParam = hashString(hashInputString);
    let properties = ["id",      "server", "ts"];
    let values =     [episodeId, serverId, hourTimestamp]; // removed 'update=0' from this list
    for (var i = 0; i < properties.length; i++) {
        var charCodeSum = 0;
        var propNameAndValue = hashInputString + properties[i] + values[i];
        for (var j = 0; j < propNameAndValue.length; j++) {
            charCodeSum += propNameAndValue.charCodeAt(j);
        }
        hashParam += hashString(charCodeSum.toString(16)); // hash the hex representation of the sum
    }
    let requestUrl = `https://fmovies.to/ajax/episode/info?ts=${hourTimestamp}&_=${hashParam}&id=${episodeId}&server=${serverId}`;
    console.log(requestUrl);
    requestFileWithReferer(requestUrl, requestUrl, "writeVideoStreams");

    pageHistory.episodeIndex = episodeIndex;
    pageHistory.scrollPos = document.body.scrollTop;
}

function writeVideoStreams(streamInfoQuery) {
    let streamSources = [];
    if (settings.host !== "openload") {
        console.log(streamInfoQuery);
    }
    else {
        let embedPageUrl;
        try {
            embedPageUrl = streamInfoQuery.target; // JSON gets parsed automatically I guess?
        }
        catch (e) {
            embedPageUrl = "";
            streamSources = [];
        }
        //console.log("unrotated: " + embedPageUrl);
        let rotateAmount = ("h".charCodeAt(0) - embedPageUrl.charCodeAt(0)) % 26; // for "https"
        if (rotateAmount < 0) rotateAmount += 26;
        embedPageUrl = rotate(embedPageUrl, rotateAmount); // no longer necessary, but doesn't hurt
        //console.log("fixed: " + embedPageUrl);
        if (embedPageUrl && embedPageUrl.indexOf("openload") !== -1) { // ensure openload url
            let embedPage = getPage(embedPageUrl); // fuck async lol
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

    hashInputString = newestVersionFile.hashInputString;
    if (!hashInputString) hashInputString = currentVersionFile.hashInputString;
    if (!hashInputString) hashInputString = "iQDWcsGqN"; // go to default
    // (old was "FuckYouBitch", and before that it was "ypYZrEpHb")
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
    document.getElementById("video-source").src = videoUrl;
    document.getElementById("video-embed").load();
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
function getPage(url, async=false) { // gets a string of the html of the page at the url passed in
    console.log("started loading " + url);
    let startTime = Date.now();
    let xmlHttp = new XMLHttpRequest();

    if (async) {
        xmlHttp.open("GET", url, true);
        xmlHttp.onreadystatechange = function() {
            if (xmlHttp.readyState === XMLHttpRequest.DONE) {
                console.log("resource load time: " + (Date.now() - startTime));
                async(xmlHttp.responseText);
            }
        }
        xmlHttp.send(null);
    }
    else {
        xmlHttp.open("GET", url, false); // false for synchronous request
        xmlHttp.send(null);
        console.log("resource load time: " + (Date.now() - startTime));
        return xmlHttp.responseText;
    }
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
    else { // first time top is unset, so show menu
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

function hashString(str) { // all the url params are hashed to produce another url param
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash += str.charCodeAt(i) + i;
    }
    return hash;
}

function rotate(str, amount) {
    var charCode, newStr = "";
    for (var i = 0; i < str.length; i++) {
        charCode = str.charCodeAt(i);
        if (charCode > 64 && charCode < 91) {
            charCode = (charCode - 65 + amount) % 26 + 65;
        }
        else if (charCode > 96 && charCode < 123) {
            charCode = (charCode - 97 + amount) % 26 + 97;
        }
        newStr += String.fromCharCode(charCode);
    }
    return newStr;
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
