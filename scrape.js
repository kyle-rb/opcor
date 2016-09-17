// global variables - hold variables that need to be remembered between functions
var pageHistory = [];

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
    var queryUrl = encodeURI(queryString.trim().replace(/\s+/g, ' ').toLowerCase());
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
    allUrls.forEach(function(url, index){ if (index % 2 == 0) { pageUrls.push(url) } });
    var allTitles = getSubstrings(resultsSection, movieTitleStart, movieTitleEnd, resultCount * 2);
    var pageTitles = [];
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
    document.getElementById("results").innerHTML = resultList;
    pageHistory = [];
    pageHistory.push(queryString);
}

function listEpisodes(pageUrl, mediaTitle) {
    embedVideo(""); // hide the video container
    document.getElementById("back-button").style.visibility = "visible"; // show back button
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
                + ((j/10)-0.3) + 's;" onclick="getMp4StreamLinks(\'' + episodeUrls[j] + '\',\''
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
    console.log(mediaTitle);
    console.log(unescape(mediaTitle));
    for (var i = 0; i < urlCount; i++) {
        linkList += `<div class="result-box" style="cursor:default;animation-delay:${((i/10)-0.3)}s;">${qualityLabels[i]}: <button class="embed" onclick="embedVideo('${streamUrls[i]}');" title="embed this video in the page"></button><a href="${streamUrls[i]}" target="_blank"><button class="window" title="pop-out this video into a new window"></button></a><a href="${streamUrls[i]}" download><button class="download" title="download this video"></button></a><button class="copy" onclick="copyUrl('${streamUrls[i]}');" title="copy a link to this video to your clipboard"></button></div>`;
    }
    pageHistory.push("");
    document.getElementById("results").innerHTML = linkList;
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

function copyUrl(videoUrl) {
    var selectBox = document.getElementById("select-box");
    selectBox.innerHTML = videoUrl;
    selectText("select-box");
    //document.designMode = "on"; // thought this had to be on to enable execCommand; MDN lied
    document.execCommand("copy", false, null); // copies whatever text is selected
    selectBox.innerHTML = "";
    
    slideInPopup("link copied to clipboard");
}

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
    }
}

function checkForUpdate() {
    
}

// Helper functions
function getPage(url) { // gets a string of the html of the page at the url passed in
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", url, false); // false for synchronous request
    xmlHttp.send(null);
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

function slideInPopup(popupMessage) { // slides in an overlay window from the top of the screen
    popupBox = document.getElementById("popup");
    popupBox.innerHTML = popupMessage;
    popupBox.style.animationPlayState = "running";
    // can't run an animation more than once; have to have it repeat and pause/play it every time
    popupBox.addEventListener("animationiteration",
                              function(){ this.style.animationPlayState = "paused"; });
}



// TODO:
// DONE episode list html/css
// DONE modify search html/css
// DONE change heading to say opcor
// DONE add movie title to qualities display
// DONE add episode title to qualities display
// DONE add enter to search
// DONE add back button/previous results feauture
//
// NEW LAYOUT FOR RESULTS PAGE
// DONE show video name on the top of the results thing
//     DONE movie-name or tv-show-name: episode-name (season number as well?)
// DONE 4 buttons for each quality option
//     DONE embed video (<video> tag) https://design.google.com/icons/#ic_picture_in_picture_alt
//     DONE open new window (<a target="_blank">) https://design.google.com/icons/#ic_open_in_new
//     DONE download video (<a download>) https://design.google.com/icons/#ic_file_download
//     DONE copy link (more complicated) https://design.google.com/icons/#ic_content_copy
//     DONE to do all this, maybe use javascript format strings
// N/A  see if I need to change the package.json file to allow mutiple windows
// DONE hide the video tag when we do another search or go back to epoisodes/search results
// DONE escape quotes and stuff from episode titles

// DONE (mostly) due to flaws in the logic of search, it only gets the first 5 results
// DONE also, if it doesn't find anything, it ends up returning the most popular shows
// DONE it wasn't getting all the urls
// logo

// LATER: (maybe next release)
//     add search history/shows i watch (maybe next version)
//     add support for multi-page results
