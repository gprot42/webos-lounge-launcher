import {normalizeBackgroundConfig} from './backgrounds.js';
import {normalizeMusicConfig} from './builtin-music.js';

const STORAGE_KEY = 'lounge.config.v1';

export const DEFAULT_CONFIG = {
  version: 12,
  profile: 'default',
  profiles: {},
  background: {
    source: 'builtin',
    mode: 'static',
    preset: 'warm-gradient',
    builtin: 'mountain-sunset',
    url: '',
    urls: [],
    path: '',
    file: '',
    slideshowIntervalSec: 300,
    overlayOpacity: 0.45,
    kenBurns: false
  },
  music: {
    enabled: true,
    source: 'builtin',
    builtin: 'midnight-lounge',
    path: '',
    shuffle: false,
    repeat: 'all',
    volume: 0.15,
    fadeSec: 2,
    pauseOnLaunch: true,
    resumeOnReturn: true
  },
  launcher: {
    pinnedApps: [
      'netflix', 'amazon.html', 'youtube.leanback.v4', 'com.apple.appletv',
      'bbc.iplayer.lge', 'com.webos.app.browser', 'com.webos.app.mediadiscovery'
    ],
    customApps: [],
    inputs: ['HDMI_1', 'HDMI_2', 'HDMI_3', 'TV'],
    inputLabels: {},
    showClock: true,
    showDate: true,
    timezone: '',
    iconSize: 'medium',
    iconAlign: 'center',
    bootOnStart: false,
    returnOnAppExit: false
  }
};

export const TIMEZONE_OPTIONS = [
  {value: '', label: 'TV local time'},
  {value: 'America/Los_Angeles', label: 'Pacific (US)'},
  {value: 'America/Denver', label: 'Mountain (US)'},
  {value: 'America/Chicago', label: 'Central (US)'},
  {value: 'America/New_York', label: 'Eastern (US)'},
  {value: 'America/Anchorage', label: 'Alaska (US)'},
  {value: 'Pacific/Honolulu', label: 'Hawaii (US)'},
  {value: 'America/Toronto', label: 'Eastern (Canada)'},
  {value: 'America/Vancouver', label: 'Pacific (Canada)'},
  {value: 'Europe/London', label: 'London'},
  {value: 'Europe/Paris', label: 'Paris'},
  {value: 'Europe/Berlin', label: 'Berlin'},
  {value: 'Europe/Helsinki', label: 'Helsinki'},
  {value: 'Asia/Tokyo', label: 'Tokyo'},
  {value: 'Asia/Seoul', label: 'Seoul'},
  {value: 'Asia/Singapore', label: 'Singapore'},
  {value: 'Australia/Sydney', label: 'Sydney'},
  {value: 'UTC', label: 'UTC'}
];

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  if (!source || typeof source !== 'object') return out;

  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] || {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function migrateConfig(config) {
  if ((config.version || 1) < 2) {
    const pinned = config.launcher.pinnedApps || [];
    if (pinned.indexOf('amazon.html') < 0) {
      const netflixIndex = pinned.indexOf('netflix');
      if (netflixIndex >= 0) {
        pinned.splice(netflixIndex + 1, 0, 'amazon.html');
      } else {
        pinned.unshift('amazon.html');
      }
      config.launcher.pinnedApps = pinned;
    }
    config.version = 2;
    saveConfig(config);
  }

  if ((config.version || 1) < 3) {
    config.music = normalizeMusicConfig(config.music);
    if (!config.music.source) {
      config.music.source = config.music.path ? 'usb' : 'builtin';
    }
    if (!config.music.builtin) {
      config.music.builtin = 'midnight-lounge';
    }
    config.version = 3;
    saveConfig(config);
  }

  if ((config.version || 1) < 4) {
    config.launcher.pinnedApps = (config.launcher.pinnedApps || []).filter(function (id) {
      return id !== 'com.breezyfin.app';
    });
    if (config.launcher.timezone === undefined) {
      config.launcher.timezone = '';
    }
    config.version = 4;
    saveConfig(config);
  }

  if ((config.version || 1) < 5) {
    if (config.music && config.music.repeat === 'one') {
      config.music.repeat = 'all';
    }
    config.version = 5;
    saveConfig(config);
  }

  if ((config.version || 1) < 6) {
    const pinned = config.launcher.pinnedApps || [];
    if (pinned.indexOf('com.apple.appletv') < 0) {
      pinned.push('com.apple.appletv');
    }
    config.launcher.pinnedApps = pinned;
    config.version = 6;
    saveConfig(config);
  }

  if ((config.version || 1) < 7) {
    const pinned = config.launcher.pinnedApps || [];
    ['bbc.iplayer.lge', 'com.webos.app.browser', 'com.webos.app.mediadiscovery'].forEach(function (id) {
      if (pinned.indexOf(id) < 0) pinned.push(id);
    });
    config.launcher.pinnedApps = pinned;
    config.version = 7;
    saveConfig(config);
  }

  if ((config.version || 1) < 8) {
    config.launcher.pinnedApps = (config.launcher.pinnedApps || []).filter(function (id) {
      return id !== 'com.webos.app.lgchannels' && id !== 'com.webos.app.livetv' && id !== 'tv.wuaki';
    });
    config.version = 8;
    saveConfig(config);
  }

  if ((config.version || 1) < 9) {
    if (!config.launcher.iconSize) {
      config.launcher.iconSize = 'medium';
    }
    config.version = 9;
    saveConfig(config);
  }

  if ((config.version || 1) < 10) {
    if (config.launcher.showDate === undefined) {
      config.launcher.showDate = true;
    }
    config.version = 10;
    saveConfig(config);
  }

  if ((config.version || 1) < 11) {
    if (!config.launcher.iconAlign) {
      config.launcher.iconAlign = 'center';
    }
    config.version = 11;
    saveConfig(config);
  }

  if ((config.version || 1) < 12) {
    if (!Array.isArray(config.launcher.customApps)) {
      config.launcher.customApps = [];
    }
    config.version = 12;
    saveConfig(config);
  }

  return config;
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const config = !raw ? deepMerge({}, DEFAULT_CONFIG) : deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
    config.background = normalizeBackgroundConfig(config.background);
    config.music = normalizeMusicConfig(config.music);
    return migrateConfig(config);
  } catch (err) {
    const config = deepMerge({}, DEFAULT_CONFIG);
    config.background = normalizeBackgroundConfig(config.background);
    config.music = normalizeMusicConfig(config.music);
    return config;
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function applyUsbConfig(config, usbConfig) {
  return deepMerge(config, usbConfig);
}