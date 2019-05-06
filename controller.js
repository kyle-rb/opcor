const STATES = { SEARCH: 0, EPISODES: 1, STREAMS: 2 }; // states for pageHistory

let app;
document.addEventListener('DOMContentLoaded', init);

function init() {
  app = new Vue({
    el: '#opcor-app',
    data: {
      STATES: STATES,
      state: STATES.SEARCH, // decide which section to show
      justLaunched: true, // decide whether to show search bar explanation text
      episodeIndex: -1,
      resultIndex: -1,
      scrollPos: 0,

      resultList: [],
      episodeList: [],
      streamList: [],

      alertText: '', // in popup notification
      menuVisible: false,

      queryInput: '', // from search bar
      embedSrc: '', // determines visibility of query source
    },
    methods: {
      performSearch: function() {
        model.getSearchResults(this.queryInput).then((results) => {
          this.resultList = results;
          this.state = this.STATES.SEARCH;
          this.justLaunched = false;
        }).catch((error) => {
          window.open(baseDomain);
          // on request fail
          // pop open google recaptcha in window
          // modify that window to hijack submit button
          // attempt POST to /waf-verify with data g-recaptcha-response: 03AOLTBLSegiLae88sqy...
          // check response for set-cookie header, save value for future requests
          // if correct, let user know to retry that request?
          // clear the verify box of iframes when transition occurs?

          this.resultList = [];
          this.state = this.STATES.SEARCH;
          this.justLaunched = false;
        });
      },
      getEpisodesOrMovie: function(index) { // either display episodes or movie stream
        this.resultIndex = index;
        model.getEpisodeList(this.resultList[index].url).then((episodeList) => {
          this.episodeList = episodeList;
          if (this.isMovie) { // if movie, go directly to streams
            this.getStreams(0);
          }
          else { // otherwise, for tv show
            this.episodeList = episodeList;
            this.state = this.STATES.EPISODES;
          }
        }).catch((error) => {
          this.episodeList = [];
          this.state = this.STATES.EPISODES;
        });
      },
      getStreams: function(index) {
        this.embedSrc = ''; // in case of next/prev episode navigation
        document.getElementById('iframe-box').innerHTML = ''; // kill iframes
        model.getStreamList(this.episodeList[index].streams).then((streamList) => {
          this.episodeIndex = index;
          this.streamList = streamList;
          this.state = this.STATES.STREAMS;
        }).catch((error) => {
          this.episodeIndex = index;
          this.streamList = [];
          this.state = this.STATES.STREAMS;
        });
      },
      
      goBack: function() { // simply change the state variable, the watcher handles the rest
        if (this.state === this.STATES.EPISODES) {
          this.state = this.STATES.SEARCH;
        }
        else if (this.state === this.STATES.STREAMS) {
          if (!this.isMovie) { // if show, go back to episodes
            this.state = this.STATES.EPISODES;
          }
          else { // otherwise this is a movie; go to search
            this.state = this.STATES.SEARCH;
          }
        }
      },
      embedVideo: function(stream) {
        if (stream.type === 'mp4') {
          this.embedSrc = stream.src;
        }
        else {
          resolveMyCloud(stream.src, stream.referer).then((hlsStream) => {
            this.embedSrc = hlsStream[0].src + '#' + stream.src;
          });
        }
      },
      openVideoInNew: function(stream) {
        if (stream.type === 'mp4') {
          window.open('window.html#' + stream.src);
        }
        else {
          resolveMyCloud(stream.src, stream.referer).then((hlsStream) => {
            window.open('window.html#' + hlsStream[0].src + '#' + stream.src);
          });
        }
      },
      copyText: function(text) {
        copyText(text);
      },

      toggleMenu: function() {
        this.menuVisible = !this.menuVisible;
      },
      slideOutMenu: function() { // add functionality to save settings
        this.menuVisible = false;
      },

      openRecaptcha: function() {
        window.open(baseDomain + '/ajax/episode/info');
      },

      showAlert: function(message, duration) { // duration in seconds
        this.alertText = message;
        setTimeout(() => this.dismissAlert(), duration * 1000);
      },
      dismissAlert: function() {
        this.alertText = '';
      },
    },
    computed: {
      isMovie: function() { // false if result state, or if tv show in episodes/streams state
        return (this.resultIndex >= 0) && (this.resultList[this.resultIndex].episodeCount === 0);
      },
      fullTitle: function() { // either movie name or show/episode names
        if (!this.isMovie && this.episodeList[this.episodeIndex]) { // if not movie, and ep selected
          return `${this.resultList[this.resultIndex].title}: ${this.episodeList[this.episodeIndex].title}`;
        }
        else { // otherwise just use the show/movie's title
          return this.resultList[this.resultIndex].title;
        }
      },
      wikiLink: function() {
        let titleList = this.resultList[this.resultIndex].title.split(" ");
        let seasonNum = 1; // no season number should mean season 1
        if (titleList[titleList.length-1] < 99) {
          seasonNum = titleList.pop(); // if last char is season number
        }
        return `https://en.wikipedia.org/wiki/Special:Search?search=list+of+${titleList.join('+')}+episodes`;
      },
    },
    watch: {
      state: function(newState, oldState) {
        if (oldState === this.STATES.STREAMS) {
          this.embedSrc = '';
          this.episodeIndex = -1;
        }

        switch (newState) {
          case this.STATES.STREAMS:
            if (oldState === this.STATES.EPISODES) this.scrollPos = document.body.scrollTop; // save
            break;
          case this.STATES.EPISODES:
            window.setTimeout(() => { // set 0 second timeout to wait for render to happen
              document.body.scrollTop = this.scrollPos; // restore
            }, 0);
            break;
          case this.STATES.SEARCH:
            this.episodeList = [];
            this.resultIndex = -1;
            this.scrollPos = 0;
            break;
        }
      },
    },
    filters: {
      animationDelay: function(delay) {
        return 'animation-delay:' + delay + 's;';
      },
      windowUrl: function(plainUrl) {
        return 'window.html#' + plainUrl;
      },
    },
  });

  checkForUpdate();
}

function showAlert(message, duration) { // for visibility outside of app
  app.showAlert(message, duration);
}
