// this is necessary to be able to call node functions from here
var electron = require('electron');
var beginUpdateInMain = electron.remote.require('./main').beginUpdateInMain;
var recordKeyPress = electron.remote.require('./main').keyPressed;
document.addEventListener("keydown", function(event) { recordKeyPress(event.key) });

// global variables - hold variables that need to be remembered between functions
var pageHistory = [];
var bookmarks; // this will get loaded in from a json file

// global constants - denote start and end points of various parts of the page structure
const iframeStart = "UEdsbWNtRnRaU0J6"; // double base64 encoding of "iframe s"
const iframeEnd = "'));"; // end of the 'doit' and 'write' method calls
const urlStart = "http:"; // start of the iframe's source
const urlEnd = '"'; // (double quote) end of the iframe's source
const fileListStart = "[{file:"; // start of the list of mp4 streams
const fileListEnd = "],"; // end of the list of mp4 streams
const resLabelStart = 'l:"'; // start of each quality label
const resLabelEnd = urlEnd; // (double quote) end of each quality label
const searchResultsStart = "<tr></"; // start of the search results section
const searchResultsEnd = "</ta"; // end of the search results section
const movieTitleStart = 'title="'; // start of each movie title
const movieTitleEnd = urlEnd; // (double quote) end of each movie title
const episodeListStart = "END -->"; // start of the list of episodes section
const episodeListEnd = "Sponsored"; // end of the list of episodes section
const seasonStart = "<h"; // start of each season section of the list
const seasonEnd = searchResultsEnd; // ("</ta") end of each season section of the list
const episodeTitleStart = "; "; // start of each episode title
const episodeTitleEnd = "<"; // end of each episode title

function executeSearchFromBox() {
    var queryString = document.getElementById("query-input").value;
    searchMedia(queryString);
}

function searchMedia(queryString) {
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "hidden"; // hide back button
    //document.getElementById("bookmark-list-button").style.visibility = "visible"; // show bookmark button
    var queryUrl = encodeURI(queryString.trim().replace(/\s+/g, ' ').toLowerCase());
    // may need to replace single quotes individually, we'll see if it works without
    var searchUrl = "http://putlocker.is/search/search.php?q=" + queryUrl;
    var searchPage = getPage(searchUrl);
    if (searchPage.includes("Top Movies")) { // case where no results are returned
        document.getElementById("results").innerHTML = "couldn't find shit";
        return;
    }
    var resultsSection = getSubstrings(searchPage, searchResultsStart, searchResultsEnd)[0];
    var resultCount = (resultsSection.match(/%"/g)||[]).length; // there are more urls than results
    var allUrls = getSubstrings(resultsSection, urlStart, urlEnd, resultCount * 3);
    var pageUrls = [];
    allUrls.forEach(function(url, index){ if (index % 3 == 0) { pageUrls.push(url) } });
    var allTitles = getSubstrings(resultsSection, movieTitleStart, movieTitleEnd, resultCount * 2);
    var pageTitles = [];
    console.log("all urls: ", allUrls);
    console.log("actual urls: ", pageUrls);
    allTitles.forEach(function(str,i){if(i%2 == 0){pageTitles.push(str.substring(7,str.length))}});
    // have to filter out other urls/titles and get rid of the 'title="' on each title
    
    var resultList = "are any of these the thing you wanted to watch?<br/><br/>";
    for (var i = 0; i < resultCount; i++) {
        resultList += '<div class="result-box" style="animation-delay:' + ((i/10)-0.3)
            + 's;" onclick="listEpisodes(\'' + pageUrls[i] + '\',\'' + escape(pageTitles[i])
            + '\');">' + pageTitles[i] + '</div>';
    }
    resultList += "<br/>if it's not one of those, then either it's not on there, or you fucked up"
        + " the search terms";
    if (resultCount == 0) {
        document.getElementById("results").innerHTML = "couldn't find shit";
    }
    document.getElementById("results").innerHTML = resultList;
    pageHistory = [];
    pageHistory.push(queryString);
}

function listEpisodes(pageUrl, mediaTitle) {
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show back button
    //document.getElementById("bookmark-list-button").style.visibility = "hidden"; // hide bookmark button
    if (!pageUrl.includes("tvshow")) {
        getMp4StreamLinks(pageUrl, mediaTitle); // not a tv show; we don't need to list episodes
        return;
    }
    var episodeListSection = getSubstrings(getPage(pageUrl), episodeListStart, episodeListEnd)[0];
    var seasonCount = (episodeListSection.match(/!i/g)||[]).length - 1; // number of seasons
    var seasons = getSubstrings(episodeListSection, seasonStart, seasonEnd, seasonCount);
    var fullEpisodeListString = unescape(mediaTitle) + ":<br/>";
    var episodeCount = 0;
    var episodeTitle = "";
    var episodeUrl = "";
    var episodeCount;
    for (var i = 0; i < seasonCount; i++) {
        episodeCount = (seasons[i].match(/&n/g)||[]).length / 4;
        episodeTitles = getSubstrings(seasons[i],episodeTitleStart,episodeTitleEnd,episodeCount);
        episodeTitles.forEach(function(str, i, arr) { arr[i] = str.substring(2, str.length) });
        allUrls = getSubstrings(seasons[i], urlStart, urlEnd, episodeCount * 2 + 1);
        var episodeUrls = [];
        allUrls.forEach(function(url, i) { if (i != 0 && i%2 == 0) { episodeUrls.push(url) } });
        
         fullEpisodeListString += '<br/>Season ' + (i + 1);
        episodeCount = episodeTitles.length
        for (j = 0; j < episodeCount; j++) {
            fullEpisodeListString += '<div class="result-box" style="animation-delay:'
                + ((j%7/10)-0.3) + 's;" onclick="getMp4StreamLinks(\'' + episodeUrls[j] + '\',\''
                + mediaTitle + ': Season ' + (i+1) + ' Episode ' + (j+1) + ': '
                + escape(episodeTitles[j]) + '\');"> Episode ' + (j+1) + ': ' + episodeTitles[j]
                + '</div>';
        }
    }
    pageHistory.push({ url: pageUrl, title: mediaTitle });
    document.getElementById("results").innerHTML = fullEpisodeListString;
}

function getMp4StreamLinks(pageUrl, mediaTitle) { // takes a search string; returns stream links
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show the back button
    //document.getElementById("bookmark-list-button").style.visibility = "hidden"; // hide bookmark button
    var codedIframe = getSubstrings(getPage(pageUrl), iframeStart, iframeEnd)[0];
    var decodedIframe = doit(codedIframe);
    var embeddedUrl = getSubstrings(decodedIframe, urlStart, urlEnd)[0];
    var mp4ListString = getSubstrings(getPage(embeddedUrl), fileListStart, fileListEnd)[0];
    // this string is actually JSON, so I should probably just modify it to make it parsable
    var urlCount = (mp4ListString.match(/}/g)||[]).length;
    var streamUrls = getSubstrings(mp4ListString, urlStart, urlEnd, urlCount);
    var qualityLabels = getSubstrings(mp4ListString, resLabelStart, resLabelEnd, urlCount);
    qualityLabels.forEach(function(str, index, arr){ arr[index] = str.substring(3, str.length) });

    var linkList = unescape(mediaTitle);
    for (var i = 0; i < urlCount; i++) {
        linkList += `<div class="result-box" style="cursor:default;animation-delay:${((i/10)-0.3)}s;">${qualityLabels[i]}: <button class="embed" onclick="embedVideo('${streamUrls[i]}');" title="embed this video in the page"></button><a href="window.html#${streamUrls[i]}" target="_blank"><button class="window" title="pop-out this video into a new window"></button></a><button class="copy" onclick="copyText('${streamUrls[i]}');" title="copy a link to this video to your clipboard"></button></div>`;
    }
    if (pageHistory.length == 2) { // we're going from episode list to stream links
        pageHistory[1].scrollPos = document.body.scrollTop; // save the scroll position
    }
    pageHistory.push("");
    document.getElementById("results").innerHTML = linkList;
    document.body.scrollTop = 0;
}

function embedVideo(videoUrl) {
    document.getElementById("video-source").src = videoUrl;
    document.getElementById("video-embed").load();
    if (videoUrl == "") {
        document.getElementById("video-container").style.visibility = "hidden";
    }
    else {
        document.getElementById("video-container").style.visibility = "visible";
    }
}

function copyText(copyText) {
    var selectBox = document.getElementById("select-box");
    selectBox.innerHTML = copyText;
    selectText("select-box");
    //document.designMode = "on"; // thought this had to be on to enable execCommand; MDN lied
    document.execCommand("copy", false, null); // copies whatever text is selected
    selectBox.innerHTML = "";
    
    slideInPopup("link copied to clipboard", 2000); // show for 2 seconds
}

function copyUrl(url) {
    // no-op, so no errors are thrown (hopefully)
}

function showBookmarks() {
    bookmarkBox = document.getElementById("bookmark-popup");
    bookmarkBox.innerHTML = "test text";
    bookmarkBox.style.top = "20px";
    setTimeout(function(){ bookmarkBox.style.top = "-640px" }, 4000);
}

// function hideBookmarks() {}

function goBack() {
    if (pageHistory.length === 1) {
        // do nothing; length 1 means results page - should not have executed
    }
    else if (pageHistory.length === 2) {
        var lastPage = pageHistory.pop()
        if (lastPage === "") { // we're on the stream links page
            searchMedia(pageHistory.pop());
        }
        else { // we're on the episode list page
            searchMedia(pageHistory.pop());
        }
    }
    else if (pageHistory.length === 3) {
        pageHistory.pop(); // get rid of empty string from stream links page
        var showInfo = pageHistory.pop();
        listEpisodes(showInfo.url, showInfo.title);
        document.body.scrollTop = showInfo.scrollPos; // sets the scroll position to where it was
    }
}

function retrieveBookmarks(bookmarkObject) {
    bookmarks = bookmarkObject;
}

function bookmarkShow() {
    // get the show title and url from the history page
    // add these to the json file
}

function checkForUpdate() {
    var currentVersionFile = JSON.parse(getPage("./version.json"));
    var newestVersionFile = JSON.parse(getPage("https://raw.githubusercontent.com/kyle-rb/opcor/master/version.json"));

    var updateNecessary = false;
    var currentVersion = currentVersionFile.version.split('.');
    var newestVersion = newestVersionFile.version.split('.');
    var updateMessage = "";
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
        slideInPopup(popupText, 8000); // show for 8 seconds
    }
}

function performUpdate() {
    console.log("update started");
    beginUpdateInMain();
}
function updateFinished() {
    console.log("update completed");
    slideInPopup("update complete! please restart Opcor now", 20000); // show for 20 seconds
}

// Helper functions
function getPage(url) { // gets a string of the html of the page at the url passed in
    var startTime = Date.now();
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", url, false); // false for synchronous request; UI is frozen anyway
    xmlHttp.send(null);
    console.log("resource load time: " + (Date.now() - startTime));
    return xmlHttp.responseText;
}

function getSubstrings(searchStr, startStr, endStr, strCount = 1) { // [startStr ***]endStr
    var searchStartIndex = 0;
    var results = [];
    var startIndex;
    var endIndex;
    for (var i = 0; i < strCount; i++) {
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

function escapeToHexEntity(preString) { // for encoding media titles (no longer used)
    var postString = "";
    var postChar;
    for (var i = 0; i < preString.length; i++) {
        postChar = escape(preString[i]);
        if (postChar === preString[i]) // just plain char
            postString += postChar;
        else // convert hex representation to html hex entity representation
            postString += '&#x' + postChar.substring(1, postChar.length) + ';';
    }    
    return postString;
}

function selectText(element) {
    var text = document.getElementById(element);
    var range, selection;
    if (document.body.createTextRange) {
        range = document.body.createTextRange();
        range.moveToElementText(text);
        range.select();
    } else if (window.getSelection) {
        selection = window.getSelection();
        range = document.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function slideInPopup(popupMessage, popupDuration) { // slides in a popup from the top of the screen
    popupBox = document.getElementById("alert-popup");
    popupBox.innerHTML = popupMessage;
    popupBox.style.top = "20px";
    setTimeout(function(){ popupBox.style.top = "-120px" }, popupDuration);
}

// LATER: (maybe next release)
//     add search history/shows i watch (maybe next version)
//     add support for multi-page results
