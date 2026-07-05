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
import {isTerminalAppId, getAppIdCandidates} from './app-icons.js';

const APP_ID = 'org.webosbrew.lounge.launcher';

let baseConfig = loadConfig();
let visible = true;
let foregroundTimer = null;
let lastForegroundAppId = APP_ID;
let returningToLounge = false;
let launchPending = false;
let wentHiddenSinceLaunch = false;
let launchAt = 0;

const elements = {
  backgroundLayer: document.getElementById('background-layer'),
  scrim: document.getElementById('scrim'),
  clock: document.getElementById('clock'),
  clockDate: document.getElementById('clock-date'),
  appSettingsBtn: document.getElementById('app-settings-btn'),
  inputRow: document.getElementById('input-row'),
  launcher: document.querySelector('.launcher'),
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
  onOpen: function () {
    music.fadeInAndResume();
  },
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
    launchPending = true;
    wentHiddenSinceLaunch = false;
    launchAt = Date.now();
    const config = getConfig();
    if (config.music && config.music.pauseOnLaunch) {
      music.fadeOutAndPause();
    }
  },
  onOpenSettings: function () {
    settings.show();
  },
  onOpenTvSettings: function () {
    openTvSettings();
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

async function openTvSettings() {
  const config = getConfig();
  if (config.music && config.music.pauseOnLaunch) {
    music.fadeOutAndPause();
  }
  const ids = getAppIdCandidates('com.webos.app.settings');
  for (let i = 0; i < ids.length; i += 1) {
    try {
      await launchApp(ids[i]);
      return;
    } catch (err) {
      // Try the next candidate id.
    }
  }
  showToast('Could not open TV Settings');
}

if (elements.appSettingsBtn) {
  elements.appSettingsBtn.addEventListener('click', function () {
    settings.show();
  });
}

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

function formatClockDate(date, timezone) {
  const options = {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  };
  if (timezone) {
    options.timeZone = timezone;
  }
  try {
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  } catch (err) {
    // Invalid timezone — fall back to local date.
    delete options.timeZone;
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }
}

function updateClock() {
  const config = getConfig();
  const launcher = config.launcher || {};
  const now = new Date();

  if (launcher.showClock) {
    elements.clock.textContent = formatClockTime(now, launcher.timezone || '');
  } else {
    elements.clock.textContent = '';
  }

  if (elements.clockDate) {
    if (launcher.showDate) {
      elements.clockDate.textContent = formatClockDate(now, launcher.timezone || '');
    } else {
      elements.clockDate.textContent = '';
    }
  }
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

// Icon row layout: 'scroll' keeps a single horizontal row capped to N icons
// (the rest reachable by scrolling left/right), 'wrap' lets icons stack onto
// multiple rows. Scroll is the default.
function applyIconLayout() {
  const grid = elements.appGrid;
  const launcher = elements.launcher;
  if (!grid || !launcher) return;
  const config = getConfig();
  const layout = (config.launcher && config.launcher.iconLayout) || 'scroll';
  launcher.classList.toggle('layout-scroll', layout === 'scroll');
  launcher.classList.toggle('layout-wrap', layout !== 'scroll');
  if (layout === 'scroll') {
    const scaleBySize = {small: 0.78, medium: 1, large: 1.28};
    const iconSize = (config.launcher && config.launcher.iconSize) || 'medium';
    const scale = scaleBySize[iconSize] || 1;
    let perRow = parseInt(config.launcher && config.launcher.iconsPerRow, 10) || 7;
    perRow = Math.min(Math.max(perRow, 3), 12);
    const tileFootprint = (152 * scale) + 28; // tile width + 14px*2 margins
    grid.style.maxWidth = Math.round(perRow * tileFootprint) + 'px';
  } else {
    grid.style.maxWidth = '';
  }
}

function applyIconAlign() {
  if (!elements.launcher) return;
  const config = getConfig();
  const align = (config.launcher && config.launcher.iconAlign) || 'center';
  elements.launcher.classList.remove('icons-left', 'icons-center', 'icons-right');
  const cls = align === 'left' ? 'icons-left' : align === 'right' ? 'icons-right' : 'icons-center';
  elements.launcher.classList.add(cls);
}

// When a user on a weaker TV enables Performance mode, the glassmorphic blur and
// animated background are disabled for smoother rendering, while the layout stays
// intact (see the `.perf-mode` rules in styles/main.css).
function applyPerfMode() {
  const config = getConfig();
  const on = !!(config.launcher && config.launcher.perfMode);
  document.body.classList.toggle('perf-mode', on);
}

async function refreshAll() {
  updateClock();
  applyIconAlign();
  applyPerfMode();
  music.applyConfig();
  await background.refresh();
  await inputs.refresh();
  await apps.refresh();
  applyIconLayout();
  await music.loadTracks();
  focus.refresh();
}

// Reclaim system keyboard/pointer focus and re-select an item. After returning
// from another app the webview can come back without an active focus target,
// which makes the whole UI feel frozen (remote/pointer do nothing).
function reclaimInput() {
  try { window.focus(); } catch (err) { /* ignore */ }
  try { document.body && document.body.focus && document.body.focus(); } catch (err) { /* ignore */ }
  focus.refresh();
}

function handleResume() {
  visible = true;
  const config = getConfig();
  if (config.music && config.music.resumeOnReturn) {
    music.fadeInAndResume();
  }
  refreshAll().then(reclaimInput, function (err) {
    // Never leave the launcher unselectable after returning from another app.
    console.error(err);
    reclaimInput();
  });
}

function handleVisibilityChange() {
  if (document.hidden) {
    visible = false;
    // Our surface was backgrounded, so any app we launched took the foreground
    // normally. This disarms the ghost-focus recovery for that launch.
    wentHiddenSinceLaunch = true;
    return;
  }
  handleResume();
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

      // Ghost-focus recovery.
      //
      // Symptom (confirmed on-device): the user launches an app from the dock
      // (e.g. a "viewer"/media app) which grabs REMOTE INPUT but never takes the
      // graphics foreground -- so our launcher stays fully visible on top yet
      // receives zero key events and feels frozen.
      //
      // We detect this precisely:
      //   - launchPending          : the user launched something from our dock
      //   - !wentHiddenSinceLaunch : our surface was never backgrounded, i.e.
      //                              we are still the top surface on screen
      //   - appId && appId !== us  : yet the system foreground app is not us
      //
      // This excludes apps opened normally (they fire visibilitychange->hidden,
      // setting wentHiddenSinceLaunch) and benign failed launches (nothing
      // actually launched, so the foreground app stays us). In those cases we
      // must NOT relaunch, or we'd yank the user out of their app.
      if (launchPending && !wentHiddenSinceLaunch && visible &&
          appId && appId !== APP_ID && !returningToLounge &&
          (Date.now() - launchAt) > 2500) {
        launchPending = false;
        returningToLounge = true;
        try {
          await launchApp(APP_ID);
        } catch (err) {
          // Best-effort reclaim.
        } finally {
          returningToLounge = false;
        }
        lastForegroundAppId = APP_ID;
        return;
      }

      // Stop watching a launch once it clearly resolved one way or another.
      if (launchPending && (wentHiddenSinceLaunch || (Date.now() - launchAt) > 15000)) {
        launchPending = false;
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
  // webOS fires `webOSRelaunch` on the document when the user returns to an
  // already-running app (e.g. after another app closes or fails to launch).
  // Treat it as a resume so a suspended launcher wakes up and regains input.
  document.addEventListener('webOSRelaunch', handleResume);
  window.addEventListener('focus', reclaimInput);
  window.addEventListener('pagehide', handlePowerOff);
  startForegroundWatcher();
}

init().catch(function (err) {
  showToast('Startup error — check USB paths');
  console.error(err);
});