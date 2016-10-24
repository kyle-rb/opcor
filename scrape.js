// this is necessary to be able to call node functions from here
var electron = require('electron');
var beginUpdateInMain = electron.remote.require('./main').beginUpdateInMain;

// global variables - hold variables that need to be remembered between functions
var pageHistory = [];
var bookmarks; // this will get loaded in from a json file

// global constants - denote start and end points of various parts of the page structure
const searchResultsStart = "aaa_page"; // start of the search results section
const searchResultsEnd = "footer-box"; // end of the search results section
const movieTitleStart = 'title="'; // start of each movie title
const movieTitleEnd = '"'; // (double quote) end of each movie title
const episodeListStart = "</table>"; // start of the list of episodes section
const episodeListEnd = "</center>"; // end of the list of episodes section
const seasonStart = "<h"; // start of each season section of the list
const seasonEnd = episodeListStart; // ("</ta") end of each season section of the list
const episodeTitleStart = "> - "; // start of each episode title
const episodeTitleEnd = "<"; // end of each episode title
const iframeStart = "<iframe"; // iframe tag
const iframeEnd = "</iframe>"; // iframe end tag
const urlStart = "http:"; // start of the iframe's source
const put9UrlStart = "http://putlocker9.com/watch"; // to filter out other links
const urlEnd = movieTitleEnd; // (double quote) end of the iframe's source
const vodSectionStart = ";Vodlocker.com"; // vodlocker label
const vodSectionEnd = "target="; // stop after href
const vodLinkStart = "?version="; // start of href link
const vodLinkEnd = movieTitleEnd; // (double quote) end of link
const theVideosFileListStart = "[{file:"; // start of the list of mp4 streams on thevideos.tv embeds
const theVideosFileListEnd = "],"; // end of the list of mp4 streams on thevideos.tv embeds
const theVideosResLabelStart = 'l:"'; // start of each quality label on thevideos.tv embeds
const theVideosResLabelEnd = movieTitleEnd; // (double quote) end of each quality label on thevideos.tv embeds
const vodFileStart = 'file: "'; // start of the file on vodlocker.com embeds
const vodFileEnd = movieTitleEnd; // (double quote) end of the file on vodlocker.com embeds

function executeSearchFromBox() {
    var queryString = document.getElementById("query-input").value;
    searchMedia(queryString);
}

function searchMedia(queryString) {
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "hidden"; // hide back button
    //document.getElementById("bookmark-list-button").style.visibility = "visible"; // show bookmark button
    var queryUrl = encodeURI(queryString.trim().replace(/\s+/g, '+').toLowerCase());
    // may need to replace single quotes individually, we'll see if it works without
    var searchUrl = "http://putlocker9.com/search/search.php?s=" + queryUrl + "&submit=Search+Now%21";
    var searchPage = getPage(searchUrl);
    var resultsSection = getSubstrings(searchPage, searchResultsStart, searchResultsEnd)[0];
    var resultCount = (resultsSection.match(/aaa_item/g)||[]).length; // there are more urls than results
    var allUrls = getSubstrings(resultsSection, put9UrlStart, urlEnd, resultCount * 2);
    var pageUrls = [];
    console.log(allUrls, allUrls.length);
    allUrls.forEach(function(url, index){ if (index % 2 == 0) { pageUrls.push(url) } }); // 2 links per item; only take 1
    var allTitles = getSubstrings(resultsSection, movieTitleStart, movieTitleEnd, resultCount * 2);
    var pageTitles = [];
    allTitles.forEach(function(str,i){if(i%2 == 0){pageTitles.push(str.substring(7,str.length))}});
    // have to filter out other urls/titles and get rid of the 'title="' on each title
    console.log(pageUrls);
    
    var resultList = "are any of these the thing you wanted to watch?<br/><br/>";
    for (var i = 0; i < resultCount; i++) {
        resultList += '<div class="result-box" style="animation-delay:' + ((i/10)-0.3)
            + 's;" onclick="movieOrShow(\'' + pageUrls[i] + '\',\'' + escape(pageTitles[i])
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

function movieOrShow(pageUrl, mediaTitle) {
    var pageSource = getPage(pageUrl);
    if ((pageSource.match(/postTabs_nav_next/g)||[]).length == 0) { // not 100% sure what this does, but let's see if it works
        listEpisodes(pageSource, pageUrl, mediaTitle);
    }
    else {
        getMp4StreamLinks(pageSource, mediaTitle); // not a tv show; we don't need to list episodes
    }
}

function listEpisodes(pageSource, pageUrl, mediaTitle) {
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show back button
    //document.getElementById("bookmark-list-button").style.visibility = "hidden"; // hide bookmark button

    var episodeListSection = getSubstrings(pageSource, episodeListStart, episodeListEnd)[0];
    var seasonCount = (episodeListSection.match(/!i/g)||[]).length - 1; // comes from !important css rule
    var seasons = getSubstrings(episodeListSection, seasonStart, seasonEnd, seasonCount);
    var fullEpisodeListString = unescape(mediaTitle) + ":<br/>";
    var episodeCount = 0;
    var episodeTitles = [];
    var episodeUrls = [];
    for (var i = 0; i < seasonCount; i++) {
        episodeCount = (seasons[i].match(/\.gif"/g)||[]).length;
        episodeTitles = getSubstrings(seasons[i], episodeTitleStart, episodeTitleEnd, episodeCount);
        episodeTitles.forEach(function(str, i, arr) { arr[i] = str.substring(4, str.length) });
        episodeUrls = getSubstrings(seasons[i], urlStart, urlEnd, episodeCount + 1);
        episodeUrls.shift(); // remove first element (season page link)
        
        fullEpisodeListString += '<br/>Season ' + (i + 1);
        episodeCount = episodeTitles.length
        for (j = 0; j < episodeCount; j++) {
            fullEpisodeListString += '<div class="result-box" style="animation-delay:'
                + ((j%7/10)-0.3) + 's;" onclick="directPageLoader(\'' + episodeUrls[j] + '\',\''
                + mediaTitle + ': Season ' + (i+1) + ' Episode ' + (j+1) + ': '
                + escape(episodeTitles[j]) + '\');"> Episode ' + (j+1) + ': ' + episodeTitles[j]
                + '</div>';
        }
    }
    pageHistory.push({ url: pageUrl, title: mediaTitle });
    document.getElementById("results").innerHTML = fullEpisodeListString;
}

function directPageLoader(pageUrl, mediaTitle) {
    getMp4StreamLinks(getPage(pageUrl), pageUrl, mediaTitle);
}

function getMp4StreamLinks(pageSource, pageUrl, mediaTitle) { // takes a search string; returns stream links
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show the back button
    //document.getElementById("bookmark-list-button").style.visibility = "hidden"; // hide bookmark button
    var iframe = getSubstrings(pageSource, iframeStart, iframeEnd)[0]; // if this doesn't exist, it just passes "" through
    var embeddedUrl = getSubstrings(iframe, urlStart, urlEnd)[0];
    var streamUrlList, labelList;
    [streamUrlList, labelList] = getLinkFromPage(embeddedUrl); // first call using embedded link

    var vodLinkCount = (pageSource.match(/;Vodlocker/g)||[]).length;
    var vodlockerSections = getSubstrings(pageSource, vodSectionStart, vodSectionEnd, vodLinkCount);
    var vodLink = "";
    var currentStream, currentLabel;
    for (var i = 0; i < vodlockerSections.length; i++) {
        vodLink = getSubstrings(vodlockerSections[i], vodLinkStart, vodLinkEnd, vodLinkCount)[0];
        iframe = getSubstrings(getPage(pageUrl + vodLink), iframeStart, iframeEnd)[0];
        embeddedUrl = getSubstrings(iframe, urlStart, urlEnd)[0];
        [currentStream, currentLabel] = getLinkFromPage(embeddedUrl);
        streamUrlList.push.apply(streamUrlList, currentStream); // basically works like in place concat
        labelList.push.apply(labelList, currentLabel);
        console.log("current links: " + currentStream + " - " + currentLabel);
        console.log("total links: " + streamUrlList + " - " + labelList);
        console.log("sections:" + vodlockerSections.length + " " + vodLinkCount);
    }

    console.log(pageUrl, vodLinkCount, streamUrlList, labelList);
    for (var i = 0; i < streamUrlList.length; i++) {
        if (!streamUrlList[i]) { // if a link is empty, remove it and its associated label
            streamUrlList.splice(i, 1);
            labelList.splice(i, 1);
        }
    }
    console.log(streamUrlList, labelList);

    var linkList = unescape(mediaTitle); // start with movie/episode title
    if (!streamUrlList[0]) { // the embed link and all vodlocker links are broken/missing
        linkList = "crap<br/>looks like the link on this page is broken"
    }
    else {
        for (var i = 0; i < streamUrlList.length; i++) {
            linkList += `<div class="result-box" style="cursor:default;animation-delay:${((i/10)-0.3)}s;">${labelList[i]}: 
            <button class="embed" onclick="embedVideo('${streamUrlList[i]}');" title="embed this video in the page"></button>
            <a href="window.html#${streamUrlList[i]}" target="_blank">
                <button class="window" title="pop-out this video into a new window">
            </button></a>
            <a href="${streamUrlList[i]}" download><button class="download" title="download this video"></button></a>
            <button class="copy" onclick="copyText('${streamUrlList[i]}');" title="copy a link to this video to your clipboard"></button>
            </div>`;
        }
    }
    if (pageHistory.length == 2) { // we're going from episode list to stream links
        pageHistory[1].scrollPos = document.body.scrollTop; // save the scroll position
    }
    pageHistory.push("");
    document.getElementById("results").innerHTML = linkList;
    document.body.scrollTop = 0;
}

function getLinkFromPage(pageUrl) { // takes a url and returns 2-item list containing a list of streams and a list of labels
    if (pageUrl.includes("thevideos")) { // this is normally used by putlocker.is, so it won't get called
        var mp4ListString = getSubstrings(getPage(pageUrl), theVideosFileListStart, theVideosFileListEnd)[0];
        var urlCount = (mp4ListString.match(/}/g)||[]).length;
        var streamUrls = getSubstrings(mp4ListString, theVideosUrlStart, theVideosUrlEnd, urlCount);
        var qualityLabels = getSubstrings(mp4ListString, theVideosResLabelStart, theVideosResLabelEnd, urlCount);
        qualityLabels.forEach(function(str, index, arr){ arr[index] = str.substring(3, str.length) });
        return [streamUrls, qualityLabels];
    }
    else if (pageUrl.includes("openload")) {
        // will probably implement, have to figure out how to build url
        // also should figure out what the file dne string is
        return [[""], [""]];
    }
    else if (pageUrl.includes("vodlocker")) {
        var embedSource = getPage(pageUrl);
        if (embedSource.includes("THIS FILE WAS DELETED")) {
            return [[""], [""]];
            console.log("broken vodlocker link: " + pageUrl);
        }
        return [[getSubstrings(embedSource, vodFileStart, vodFileEnd)[0].substring(7)], ["watch"]]; // strip out 'file "' from string
    }
    else if (pageUrl.includes("putvid")) { // I'm not going to call this method with this site unless I update
        // might not implement this for now
        return [[""], [""]];
    }
    else {
        return [[""], [""]];
    }
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
        movieOrShow(showInfo.url, showInfo.title);
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
