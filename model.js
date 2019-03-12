// variables for setting inputs and outputs for 'eval'ing the OpenLoad script
let openloadHexString, openloadStreamUrl;
let cc_cc_cc = 'hexid'; // must be defined for script, but just a sigil value detected by fakeQuery
let _x, _y;
let z = 'hexid';
let ffff = 'hexid';

// this fakes just enough jQuery for OpenLoad to work
function fakeQuery(input) {
  if (input === document) {
    console.log('asking for onload callback');
    return { 'ready': function(callback) { callback(); } }; // document.ready callback
  }
  else if (input === '#hexid') {
    console.log('asking for #hexid');
    return { 'text': function() { return openloadHexString; } }; // retrieving a value
  }
  else if (input === '#streamurl' || input === '#streamuri' || input === '#streamurj') {
    console.log('asking for #streamurl or similar');
    return { 'text': function(val) { openloadStreamUrl = val; } }; // setting a value
  }
  else {
    console.log('asking for other value:', input);
    // I think they swapped out #streamurl for something else, so this is the lazy workaround
    return { "text": function(val) { openloadStreamUrl = val; } }; // default to setting a value
  }
}
var $ = fakeQuery, jQuery = fakeQuery; // this needs to be var and not let because OpenLoad expects 
                                       //  window.jQuery, which var does but let doesn't




let model = {
  // returns resultList: [ { title: "Title", url: "https://url.ex/ample", episodeCount: 10 } ]
  getSearchResults: function(queryInput) {
    let encodedQueryString = queryInput.trim().toLowerCase();
    encodedQueryString = encodedQueryString.replace(/[^A-Za-z0-9\s]/g,""); // remove special chars
    encodedQueryString = encodedQueryString.replace(/\s+/g, "+"); // replace spaces with pluses
    let queryUrl = baseDomain + "/search?keyword=" + encodedQueryString;

    return fetch(queryUrl).then((res) => res.text()).then((resultsPage) => {
      if (!resultsPage || resultsPage.includes("No result found.")
                       || resultsPage.includes("Error 404")) {
        resultList = [];
      }
      else {
        const sectionStart = 'data-tip=',      sectionEnd = '</a> </div>';
        const urlStart = '"/film/',            urlEnd = '"';
        const titleStart = 'alt="',            titleEnd = ' | ';
        const episodeCountStart = 'Eps<span>', episodeCountEnd = '</span>'
        let resultCount = (resultsPage.match(/\s\|\s/g)||[]).length;

        let sections = getSubstrings(resultsPage, sectionStart, sectionEnd, resultCount);

        resultList = sections.map((section) => ({
          url: baseDomain + '/' + getSubstrings(section,urlStart,urlEnd)[0].slice(urlStart.length),
          title: getSubstrings(section, titleStart, titleEnd)[0].slice(titleStart.length),
          episodeCount: +getSubstrings(section, episodeCountStart, episodeCountEnd)[0].slice(episodeCountStart.length),
        }));
      }
      return resultList;
    });
  },

  // returns episodeList: [ { title: "Episode 1", streams: [ { host: 'openload', id: '12xyz' } ] } ]
  getEpisodeList: function(mediaUrl) {
    let mediaId = mediaUrl.split('.').pop(); // show/movie's id follows the last '.' in url
    let dataUrl = `${baseDomain}/ajax/film/servers/${mediaId}`;
    return fetch(dataUrl).then((res) => res.text()).then((episodesPage) => {
      const sectionStart = 'fa-server',               sectionEnd = '<\\/div>\\n';
      const idStart = 'data-id=\\"',                  idEnd = '\\"';
      const titleStart = '\\">',/* 3 extra matches */ titleEnd = '<';
      const hostNameStart = 'fa-server\\"><\\/i>\\n', hostNameEnd = '\\n';
      let hostCount = (episodesPage.match(/fa-server/g)||[]).length;

      let sections = getSubstrings(episodesPage, sectionStart, sectionEnd, hostCount);
      return sections.map((section) => { // for each host section
        let episodeCount = (section.match(/href/g)||[]).length; // episodes from this host

        return {
          hostName: getSubstrings(section, hostNameStart, hostNameEnd)[0]
                    .slice(hostNameStart.length).trim(),
          ids: getSubstrings(section, idStart, idEnd, episodeCount)
               .map((id) => id.slice(idStart.length)),
          titles: getSubstrings(section, titleStart, titleEnd, episodeCount+3).slice(3)
                  .map((title) => title.slice(titleStart.length)),
        };
      })
      .filter((hostData) => hostData.hostName === 'OpenLoad' || hostData.hostName === 'MyCloud')
      .sort((hostA, hostB) => hostB.ids.length - hostA.ids.length) // host with most titles is first
      .reduce((episodes, hostData) => {
        hostData.titles.forEach((title, i) => {
          // insert current episode data into a matching episode name or insert new episode
          // this algorithms ensures:
          //  - primary ordering determined by the host with the most episodes
          //  - if differently hosted episodes' titles match, the episode's streams are grouped
          //  - insertion location of episodes not on the first host is determined by lexical order
          let insertBefore = 0;
          episodes.forEach((episode, j) => {
            if (title === episode.title) { // if match found, modify current episode
              episode.streams.push({ host: hostData.hostName, id: hostData.ids[i] });
              insertBefore = null;
              return;
            }
            if (title > episode.title) {
              insertBefore = j + 1;
            }
          });
          if (insertBefore !== null) { // if we haven't added data to an episode, insert new episode
            episodes.splice(insertBefore, 0, {
              title: title,
              streams: [{ host: hostData.hostName, id: hostData.ids[i] }],
            });
          }
        });
        return episodes;
      }, [])
      .map((episode) => ({ title: 'Episode ' + episode.title, streams: episode.streams }));
    });
  },

  // returns streamList: [ { name: 'openload', url: 'https://url.ex/ample' type: 'mp4' } ]
  // (openload streams are of type mp4 and mycloud streams are hls)
  getStreamList: function(streams) {
    const fmoviesReferer = 'http://ffmovies.ru/~';//'https://www6.fmovies.to/~'; // both result in 403
    const myCloudReferer = 'https://mcloud.to/~'; // possibly change them in the future?
    const hosts = {
      'OpenLoad':   { id: '24', resolve: resolveOpenLoad },
      'MyCloud':    { id: '28', resolve: resolveMyCloud },
      'Other':      { id: '30', resolve: () => [] }, // default to nothing
      'Streamango': { id: '34', resolve: () => [] },
    }
    return Promise.all(streams.map((stream) => {
      let serverId = hosts[stream.host].id;
      let hourTimestamp = getAlteredTimestamp();
      let properties = ["id",      "server", "ts"];
      let values =     [stream.id, serverId, hourTimestamp];
      let hashParam = getHashParam(properties, values);

      let requestUrl = `${baseDomain}/ajax/episode/info?ts=${hourTimestamp}&_=${hashParam}&id=${stream.id}&server=${serverId}`;

      return fetchWithReferer(requestUrl, requestUrl).then((res) => res.json()).then((data) => {
        if (data.error || !data.target) return [];

        let rotateAmount = ('h'.charCodeAt(0) - data.target.charCodeAt(0)) % 26; // assume "https"
        if (rotateAmount < 0) rotateAmount += 26;
        let embedPageUrl = rotate(data.target, rotateAmount); // just in case this is reactivated

        return hosts[stream.host].resolve(embedPageUrl, requestUrl); // resolve based on host
      });
    })).then((streamLists) => streamLists.reduce((fullList, subList) => fullList.concat(subList)));
  },
};



// takes OpenLoad embed url and returns list of one mp4 stream
function resolveOpenLoad(url, referer) {
  if (url.indexOf('openload') === -1) return [];

  return fetch(url).then((res) => res.text()).then((embedPage) => {
    const hexStart = 'style="">',       hexEnd = '</';
    const scriptStart = 'var _0x9495=', scriptEnd = '}});';

    openloadHexString = getSubstrings(embedPage, hexStart, hexEnd)[0].slice(hexStart.length);
    let openloadScript = getSubstrings(embedPage, scriptStart, scriptEnd)[0];
    if (openloadHexString && openloadScript) {
      eval(openloadScript + scriptEnd); // this sets openloadStreamUrl
    }
    else {
      console.error('OpenLoad parsing failed: hex string or script not valid');
      console.log('hex string:', openloadHexString);
    }

    if (openloadStreamUrl) {
      console.log('Successfully \'eval\'ed OpenLoad script to get url:', openloadStreamUrl);
      return [{
        name: 'OpenLoad',
        type: 'mp4',
        src: `https://openload.co/stream/${openloadStreamUrl}?mime=true`,
      }];
    }
    else {
      return [];
    }
  });
}

// takes MyCloud embed url and returns list of m3u8 files for different levels of quality
function resolveMyCloud(url, referer) {
  return fetchWithReferer(url, referer).then((res) => res.text()).then((embedPage) => {
    const listUrlStart = '"file":"', listUrlEnd = '"';
    
    let listUrl = getSubstrings(embedPage, listUrlStart, listUrlEnd)[0].slice(listUrlStart.length);

    if (listUrl) { // TODO: fetch list (with referer), parse it, and get list of all m3u8s
      console.log('Got MyCloud list url:', listUrl);
      return [{
        name: 'MyCloud',
        type: 'hls',
        src: listUrl,
      }];
    }
    else {
      return [];
    }
  });
}



// extract strCount number of substrings following the pattern [startStr ***]endStr from searchStr
function getSubstrings(searchStr, startStr, endStr, strCount = 1) {
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



// the timestamp url param follows weird rules...
function getAlteredTimestamp() {
  let hourTimestamp = Math.floor(Date.now() / (60 * 60 * 1000)); // hours since 1970
  let hourOfDay = (hourTimestamp - 4) % 24; // hour of day on 24 hour clock in EST

  if (hourOfDay === 1) { // 1AM
      hourTimestamp += 12; // plus 12 hours
  }
  else if ((hourOfDay >= 14 && hourOfDay <= 23) || hourOfDay === 0) { // 2PM - 12AM
      hourTimestamp -= 12; // minus 12 hours
  }
  // otherwise normal time works
  hourTimestamp *= (60 * 60); // make it a normal unix seconds timestamp (rounded to the hour)
  return hourTimestamp;
}

// certain requests to fmovies require a '_' url param
// its value is calculated essentially based on a hash of all the other params in the request url
// the calculation has changed a few times in the past, sometimes frequently
// so my calculation is done based on a few parameters, which I set manually in version.json
function getHashParam(properties, values) {
  let hashParam = hashString(hashInputString); // hardcoded base value to start with

  for (var i = 0; i < properties.length; i++) {
      var charCodeSum = 0;
      var propertyPadded = hashInputString + properties[i];
      var valueString = values[i].toString(10);
      for (var j = 0; j < Math.max(propertyPadded.length, valueString.length); j++) {
          // there's some logic on init that determines whether to use += or *=
          // as well as what to pad the string with if there's no charCodeAt a given index
          charCodeSum = hashOperation(charCodeSum, propertyPadded.charCodeAt(j)
                                                || j * hashIndexMultiplier + hashIndexAdditive);
          charCodeSum = hashOperation(charCodeSum, valueString.charCodeAt(j)
                                                || j * hashIndexMultiplier + hashIndexAdditive);
      }
      // console.log(propertyPadded, valueString);
      // console.log("charCodeSum: " + charCodeSum + " = " + charCodeSum.toString(16));
      // console.log("hash from " + properties[i] + "=" + values[i] + ": " + hashString(charCodeSum.toString(16)));
      hashParam += hashString(charCodeSum.toString(16)); // hash the hex representation of the sum
  }
  return hashParam;
}
// this is part of the calculation of the '_' url param
function hashString(str) { 
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
      hash += str.charCodeAt(i) + i;
  }
  return hash;
}

// this solves a bit of obfuscation where in a url, each char's ascii value was rotated
// I think it's no longer active but the code calling this is agnostic to whether it is
// I basically just don't want to remove it in case something ends up breaking because of it
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

// fmovies added cloudflare ddos protection at one point, so I started to write this
// but then they removed it before I fully finished
// I'm leaving it in here in case they add it again
function solveCloudflareChallenge() {
  getPage(baseDomain + "/sw.js?12", function(challengePage) { // arbitrary file triggers challenge
      if (challengePage.slice(0, 13) === "importScripts") {
          console.log("Cloudflare challenge not necessary; done");
          return;
      }

      let challengeVC = getSubstrings(challengePage, cfVCStart, cfVCEnd)[0]
                        .slice(cfVCStart.length);
      let challengePass = getSubstrings(challengePage, cfPassStart,cfPassEnd)[0]
                          .slice(cfPassStart.length);
      let challengeScript = getSubstrings(challengePage, cfScriptStart, cfScriptEnd)[0]
                            .slice(cfScriptStart.length);
      
      let challengeBaseVariable = getSubstrings(challengeScript, "", "=")[0];
      window[challengeBaseVariable] = undefined; // make sure the internal variable is a global

      let lineCount = (challengeScript.match(/;/g)||[]).length;
      challengeScript = getSubstrings(challengeScript, "", ";", lineCount).filter(function(line) {
          let firstChar = line.trim()[0]; // filter out lines starting with a variable name
          let secondChar = line.trim()[1]; // second char must be a separator
          return !(
              (secondChar === " " || secondChar === ".") &&
              (firstChar === "t" || firstChar === "r" || firstChar === "a" || firstChar === "f")
          );
      }).join(";"); // and join the conforming lines back together

      //console.log("doing eval now");
      //console.log(challengeVC, challengePass, challengeScript);
      eval(challengeScript); // evaluate challenge script
      //console.log("challenge answer: " + window[challengeBaseVariable]);
      let answerModifier = (baseDomain.length - "https://".length); // length of domain name
      let answerKey = Object.keys(window[challengeBaseVariable])[0]; // key containing base answer
      let baseAnswer = window[challengeBaseVariable][answerKey]; // value of that key
      let challengeAnswer = +(baseAnswer.toFixed(10)) + answerModifier; // truncate base, modify

      getPage(`${baseDomain}/cdn-cgi/l/chk_jschl?jschl_vc=${challengeVC}&pass=${challengePass}&jschl_answer=${challengeAnswer}`, function(response) {
          if (response.slice(0, 13) === "importScripts") {
              console.log("Cloudflare challenge successfully solved; headers should be set");
          }
          else {
              console.log("Challenge required again");
              //solveCloudflareChallenge();
          }
      });
  });
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
