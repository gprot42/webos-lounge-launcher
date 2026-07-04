const BUILTIN_APP_ICONS = {
  'com.palm.app.settings': 'assets/app-icons/tv-settings.png',
  'com.webos.app.settings': 'assets/app-icons/tv-settings.png',
  'org.webosbrew.hbchannel': 'assets/app-icons/homebrew.png',
  'com.apple.appletv': 'assets/app-icons/apple-tv.png'
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
  'com.google.android.youtube.tv': 'YouTube'
};

/** Same app, different IDs across webOS 6 vs current TVs. */
export const APP_ID_ALIASES = {
  'com.palm.app.settings': ['com.webos.app.settings'],
  'com.webos.app.settings': ['com.palm.app.settings'],
  'youtube.leanback.v4': ['com.google.android.youtube.tv'],
  'netflix': ['com.netflix.ninja'],
  'amazon.html': ['amazon']
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