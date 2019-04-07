// this is necessary to be able to call pseudo-backend node functions from here
let electron = require("electron");
let electronMain = electron.remote.require("./main");
let beginUpdateInMain = electronMain.beginUpdateInMain;
let keyPressed = electronMain.keyPressed;
document.addEventListener("keydown", function(event) {
    keyPressed(event.key, event.ctrlKey, event.metaKey, event.shiftKey);
});
let writeFileFromFrontend = electronMain.writeFileFromFrontend;
let requestFileWithReferer = electronMain.requestFileWithReferer;

// variables pertaining to the hash calculation, set in checkForUpdate
let hashInputString, hashIndexMultiplier, hashIndexAdditive, hashOperation;

// variable with fmovies current origin, set in checkForUpdate
let baseDomain;



function checkForUpdate() { // download the version file to see if there is an update available
  let currentVersionFile, newestVersionFile;
  try {
    currentVersionFile = JSON.parse(loadLocalFile('./version.json'));
  }
  catch (e) {
    currentVersionFile = { version: '0.0.0' }
  }

  fetch('http://palossand.com/opcor/version.json').then((res) => res.json()).then((jsonData) => {
    newestVersionFile = jsonData;
    let updateNecessary = false;
    let currentVersion = currentVersionFile.version.split('.');
    let newestVersion = newestVersionFile.version.split('.');
    let updateMessage = "";
    for (let i = 0; i < currentVersion.length; i++) {
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
      showAlert(updateMessage, 20); // show for 20 seconds
    }

    baseDomain = newestVersionFile.baseDomain;
    if (!baseDomain) baseDomain = currentVersionFile.baseDomain;
    if (!baseDomain) baseDomain = 'https://www6.fmovies.to'; // go to default

    hashInputString = newestVersionFile.hashInputString
                   || currentVersionFile.hashInputString
                   || ''; // gets hashed along with URL params

    hashIndexMultiplier = Number(newestVersionFile.hashIndexMuliplier)
                       || Number(currentVersionFile.hashIndexMultiplier)
                       || 1; // in case of no char in one string, multiply index by this

    hashIndexAdditive = Number(newestVersionFile.hashIndexAdditive)
                     || Number(currentVersionFile.hashIndexAdditive)
                     || 0; // then, add this to the scaled index and use instead of char code

    let options = [newestVersionFile.hashOperation, currentVersionFile.hashOperation, '+'];
    hashOperation = options.reduce(function(result, val) {
      if (result) return result; // if already decoded a valid value, return and move on
      switch (val) {
        case '+':
          return function(base, augment) { return base + augment; };
        case '-': // I doubt this would be used
          return function(base, augment) { return base - augment; };
        case '*':
          return function(base, augment) { return base * augment; };
        case '/': // I really doubt this would be used
          return function(base, augment) { return base / augment; };
        default:
          return null; // if the value was none of these, then return null
        }
    }, null);
    
    // site maintainer these values/calculations for the '_' URL param

    // to figure out the new value, break on XHR for /ajax/episode/info
    // and then jQuery has a "Ul" function or something before ajax
    // or search for "Object[" in all.js, since the hashing function needs to do
    //   Object.prototype.hasOwnProperty.call() when generating the hash
  });
}
function performUpdate() { // initiates a new update (in the backend code)
  console.log('update started');
  beginUpdateInMain();
}
function updateFinished() { // notifies the user that the update has finished
  console.log('update completed');
  showAlert('update complete! please restart Opcor now', 20); // show for 20 seconds
}



// the fetch API doesn't like file:// urls
// it might complain about this being render-blocking, but whatever
function loadLocalFile(path) {
  let xmlHttp = new XMLHttpRequest();
  xmlHttp.open("GET", path, false); // false for synchronous request
  xmlHttp.send(null);
  return xmlHttp.responseText;
}



function fetchWithReferer(url, referer) {
  return new Promise((resolve, reject) => {
    let container = document.getElementById('iframe-box');
    let iframe = document.createElement('iframe');
    iframe.setAttribute('src', referer);
    iframe.addEventListener('load', () => {
      let script = iframe.contentDocument.createElement('script');
      script.innerHTML = `fetch('${url}', { headers: { 'x-requested-with': 'XMLHttpRequest' } }).then(window.callback);`;
      iframe.contentWindow.callback = (response) => {
        resolve(response);
        //container.removeChild(iframe);
        // we can't do this here for some reason, it breaks the whole page
        // so I'm just clearing this box every time a transition goes through, in controller.js
      };
      iframe.contentDocument.body.appendChild(script);
    });
    container.appendChild(iframe);
  });
}



function copyText(stringToCopy) { // copies text to a user's clipboard and pops up a notification
  let selectBox = document.getElementById('select-box');
  selectBox.innerHTML = stringToCopy;
  selectText('select-box');
  document.execCommand('copy', false, null); // copies whatever text is selected
  selectBox.innerHTML = '';

  showAlert('link copied to clipboard', 1.5);
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
