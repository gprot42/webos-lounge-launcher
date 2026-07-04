import './compat.js';
import {loadConfig, saveConfig, applyUsbConfig} from './config.js';
import {applyActiveProfile} from './profiles.js';
import {resolveLoungePaths} from './usb.js';
import {createBackgroundController} from './background.js';
import {createMusicPlayer} from './music.js';
import {createAppGrid} from './apps.js';
import {createInputRow} from './inputs.js';
import {createFocusManager} from './focus.js';
import {createSettingsPanel} from './settings.js';
import {getForegroundApp, launchApp, listApps} from './luna.js';
import {isHomeApp} from './remote.js';
import {isTerminalAppId} from './app-icons.js';

const APP_ID = 'org.webosbrew.lounge.launcher';

let baseConfig = loadConfig();
let visible = true;
let foregroundTimer = null;
let lastForegroundAppId = APP_ID;
let returningToLounge = false;

const elements = {
  backgroundLayer: document.getElementById('background-layer'),
  scrim: document.getElementById('scrim'),
  clock: document.getElementById('clock'),
  inputRow: document.getElementById('input-row'),
  appGrid: document.getElementById('app-grid'),
  musicBar: document.getElementById('music-bar'),
  trackTitle: document.getElementById('track-title'),
  muteBtn: document.getElementById('mute-btn'),
  volumeSlider: document.getElementById('volume-slider'),
  audio: document.getElementById('ambient-audio'),
  settingsPanel: document.getElementById('settings-panel'),
  toast: document.getElementById('toast')
};

function getBaseConfig() {
  return baseConfig;
}

function getConfig() {
  return applyActiveProfile(baseConfig);
}

function setConfig(nextConfig) {
  baseConfig = nextConfig;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(function () {
    elements.toast.classList.remove('visible');
  }, 2800);
}

elements.onToast = showToast;

const background = createBackgroundController(elements, getConfig);
const music = createMusicPlayer(getConfig, Object.assign({}, elements, {onToast: showToast}));
const inputs = createInputRow(elements.inputRow, getConfig, {onToast: showToast});
const settings = createSettingsPanel(elements.settingsPanel, getBaseConfig, {
  onSave: function (savedConfig) {
    setConfig(savedConfig);
    refreshAll();
  },
  onClose: function () {
    focus.refresh();
  },
  onToast: showToast
});
const apps = createAppGrid(elements.appGrid, getConfig, {
  onBeforeLaunch: function () {
    const config = getConfig();
    if (config.music && config.music.pauseOnLaunch) {
      music.fadeOutAndPause();
    }
  },
  onOpenSettings: function () {
    settings.show();
  },
  onToast: showToast
});
const focus = createFocusManager(document.getElementById('app'), {
  onBack: function () {
    if (settings.isVisible()) {
      settings.hide();
      return;
    }
  },
  onRed: function () {
    if (settings.isVisible()) return;
    music.togglePause();
  },
  onGreen: function () {
    if (settings.isVisible()) return;
    music.nextTrack();
  },
  onVolumeUp: function () {
    if (settings.isVisible()) return;
    music.nudgeVolume(5);
  },
  onVolumeDown: function () {
    if (settings.isVisible()) return;
    music.nudgeVolume(-5);
  },
  onVolumeMute: function () {
    if (settings.isVisible()) return;
    elements.muteBtn.click();
  }
});

function formatClockTime(date, timezone) {
  if (timezone && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      }).formatToParts(date);
      let hour = '';
      let minute = '';
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].type === 'hour') hour = parts[i].value;
        if (parts[i].type === 'minute') minute = parts[i].value;
      }
      if (hour && minute) return hour + ':' + minute;
    } catch (err) {
      // Invalid timezone — fall back to local time.
    }
  }

  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return hours + ':' + minutes;
}

function updateClock() {
  const config = getConfig();
  if (!config.launcher || !config.launcher.showClock) {
    elements.clock.textContent = '';
    return;
  }

  elements.clock.textContent = formatClockTime(new Date(), config.launcher.timezone || '');
}

async function applyUsbOverrides() {
  const config = getBaseConfig();
  const paths = await resolveLoungePaths(config);

  if (paths.usbConfig) {
    setConfig(applyUsbConfig(config, paths.usbConfig));
    saveConfig(baseConfig);
  }

  if (!baseConfig.music.path && paths.musicPath) {
    baseConfig.music.path = paths.musicPath;
  }

  if (!baseConfig.background.path && paths.backgroundPath) {
    baseConfig.background.path = paths.backgroundPath;
  }
}

async function refreshAll() {
  updateClock();
  music.applyConfig();
  await background.refresh();
  await inputs.refresh();
  await apps.refresh();
  await music.loadTracks();
  focus.refresh();
}

function handleVisibilityChange() {
  const isVisible = !document.hidden;
  visible = isVisible;

  if (isVisible) {
    const config = getConfig();
    if (config.music && config.music.resumeOnReturn) {
      music.fadeInAndResume();
    }
    refreshAll();
  }
}

async function maybeReturnToLounge(appId) {
  const config = getConfig();
  if (!config.launcher || !config.launcher.returnOnAppExit) return;
  if (returningToLounge) return;
  if (appId === APP_ID) return;

  const wasOtherApp = lastForegroundAppId && lastForegroundAppId !== APP_ID;
  if (!wasOtherApp) return;
  if (!isHomeApp(appId)) return;

  returningToLounge = true;
  try {
    await launchApp(APP_ID);
  } catch (err) {
    // Best-effort relaunch.
  } finally {
    returningToLounge = false;
  }
}

function startForegroundWatcher() {
  if (!window.webOS || !window.webOS.service) return;

  foregroundTimer = setInterval(async function () {
    if (!visible && !getBaseConfig().launcher.returnOnAppExit) return;

    try {
      const res = await getForegroundApp();
      const appId = res.appId || res.id || '';
      const config = getConfig();

      if (appId && appId !== APP_ID && config.music && config.music.pauseOnLaunch) {
        music.fadeOutAndPause();
      }

      await maybeReturnToLounge(appId);
      lastForegroundAppId = appId || lastForegroundAppId;
    } catch (err) {
      // Foreground polling is best-effort.
    }
  }, 2000);
}

function handlePowerOff() {
  music.stop();
}

async function autoEnableTerminal() {
  if (baseConfig.launcher && baseConfig.launcher.terminalChecked) return;

  let installed = [];
  try {
    const res = await listApps();
    installed = (res && res.apps) || [];
  } catch (err) {
    return; // Could not list apps; try again on the next launch.
  }

  const terminal = installed.find(function (app) {
    return app && isTerminalAppId(app.id);
  });

  const pinned = (baseConfig.launcher.pinnedApps || []);
  if (terminal && pinned.indexOf(terminal.id) < 0) {
    pinned.push(terminal.id);
    baseConfig.launcher.pinnedApps = pinned;
  }

  baseConfig.launcher.terminalChecked = true;
  saveConfig(baseConfig);
}

async function init() {
  await applyUsbOverrides();
  await autoEnableTerminal();
  updateClock();
  setInterval(updateClock, 30000);

  await refreshAll();

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePowerOff);
  startForegroundWatcher();
}

init().catch(function (err) {
  showToast('Startup error — check USB paths');
  console.error(err);
});