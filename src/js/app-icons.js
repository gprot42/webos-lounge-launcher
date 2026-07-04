const BUILTIN_APP_ICONS = {
  'com.palm.app.settings': 'assets/app-icons/tv-settings.png',
  'com.webos.app.settings': 'assets/app-icons/tv-settings.png',
  'org.webosbrew.hbchannel': 'assets/app-icons/homebrew.png',
  'com.apple.appletv': 'assets/app-icons/apple-tv.png',
  'netflix': 'assets/app-icons/netflix.png',
  'com.netflix.ninja': 'assets/app-icons/netflix.png',
  'amazon.html': 'assets/app-icons/prime-video.png',
  'amazon': 'assets/app-icons/prime-video.png',
  'youtube.leanback.v4': 'assets/app-icons/youtube.png',
  'com.google.android.youtube.tv': 'assets/app-icons/youtube.png',
  'com.webos.app.lgchannels': 'assets/app-icons/lg-channels.png',
  'com.webos.app.livetv': 'assets/app-icons/lg-channels.png',
  'bbc.iplayer.lge': 'assets/app-icons/bbc-iplayer.png',
  'bbc.iplayer': 'assets/app-icons/bbc-iplayer.png',
  'tv.wuaki': 'assets/app-icons/rakuten.png',
  'com.webos.app.browser': 'assets/app-icons/browser.png',
  'com.webos.app.mediadiscovery': 'assets/app-icons/media-player.png'
};

const BUILTIN_APP_TITLES = {
  'com.palm.app.settings': 'TV Settings',
  'com.webos.app.settings': 'TV Settings',
  'org.webosbrew.hbchannel': 'Homebrew',
  'com.apple.appletv': 'Apple TV',
  'netflix': 'Netflix',
  'com.netflix.ninja': 'Netflix',
  'amazon.html': 'Prime Video',
  'amazon': 'Prime Video',
  'youtube.leanback.v4': 'YouTube',
  'com.google.android.youtube.tv': 'YouTube',
  'com.webos.app.lgchannels': 'LG Channels',
  'com.webos.app.livetv': 'LG Channels',
  'bbc.iplayer.lge': 'BBC iPlayer',
  'bbc.iplayer': 'BBC iPlayer',
  'tv.wuaki': 'Rakuten TV',
  'com.webos.app.browser': 'Web Browser',
  'com.webos.app.mediadiscovery': 'Media Player'
};

/** Same app, different IDs across webOS 6 vs current TVs. */
export const APP_ID_ALIASES = {
  'com.palm.app.settings': ['com.webos.app.settings'],
  'com.webos.app.settings': ['com.palm.app.settings'],
  'youtube.leanback.v4': ['com.google.android.youtube.tv'],
  'netflix': ['com.netflix.ninja'],
  'amazon.html': ['amazon'],
  'com.webos.app.lgchannels': ['com.webos.app.livetv'],
  'bbc.iplayer.lge': ['bbc.iplayer'],
  'bbc.iplayer': ['bbc.iplayer.lge']
};

export function getAppIdCandidates(id) {
  const seen = {};
  const out = [];

  function add(candidate) {
    if (!candidate || seen[candidate]) return;
    seen[candidate] = true;
    out.push(candidate);
  }

  add(id);
  (APP_ID_ALIASES[id] || []).forEach(add);
  return out;
}

export function getBuiltinAppIcon(id) {
  const candidates = getAppIdCandidates(id);
  for (let i = 0; i < candidates.length; i += 1) {
    if (BUILTIN_APP_ICONS[candidates[i]]) return BUILTIN_APP_ICONS[candidates[i]];
  }
  return '';
}

export function getBuiltinAppTitle(id) {
  const candidates = getAppIdCandidates(id);
  for (let i = 0; i < candidates.length; i += 1) {
    if (BUILTIN_APP_TITLES[candidates[i]]) return BUILTIN_APP_TITLES[candidates[i]];
  }
  return '';
}