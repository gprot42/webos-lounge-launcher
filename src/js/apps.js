import {launchApp, listApps} from './luna.js';
import {loadAppCatalog, normalizeAppRecord, resolvePinnedApp} from './app-catalog.js';
import {getAppIdCandidates, getBuiltinAppIcon} from './app-icons.js';

const APP_ID = 'org.webosbrew.lounge.launcher';

export function createAppGrid(container, getConfig, options) {
  let catalog = {};

  function makeTile(app, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-tile focusable';
    button.dataset.focusIndex = String(index);
    button.dataset.appId = app.id;
    button.setAttribute('aria-label', app.title);

    const label = document.createElement('span');
    label.className = 'app-label';
    label.textContent = app.title;

    if (app.icon) {
      const img = document.createElement('img');
      img.className = 'app-icon';
      img.src = app.icon;
      img.alt = '';
      img.addEventListener('error', function () {
        const fallbackIcon = getBuiltinAppIcon(app.id);
        if (fallbackIcon && img.src !== fallbackIcon) {
          img.src = fallbackIcon;
          return;
        }
        img.remove();
        const fallback = document.createElement('span');
        fallback.className = 'app-fallback';
        fallback.textContent = app.title.slice(0, 2).toUpperCase();
        button.insertBefore(fallback, label);
      });
      button.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'app-fallback';
      fallback.textContent = app.title.slice(0, 2).toUpperCase();
      button.appendChild(fallback);
    }

    button.appendChild(label);

    button.addEventListener('click', function () {
      openApp(app);
    });

    return button;
  }

  function makeSettingsTile(index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-tile settings-tile focusable';
    button.dataset.focusIndex = String(index);
    button.dataset.action = 'settings';
    button.setAttribute('aria-label', 'Settings');

    const icon = document.createElement('span');
    icon.className = 'app-fallback';
    icon.textContent = '⚙';
    button.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'app-label';
    label.textContent = 'Settings';
    button.appendChild(label);

    button.addEventListener('click', function () {
      if (options.onOpenSettings) options.onOpenSettings();
    });

    return button;
  }

  async function openApp(app) {
    if (options.onBeforeLaunch) options.onBeforeLaunch();

    const ids = [];
    if (app && app.launchId) ids.push(app.launchId);
    getAppIdCandidates((app && app.id) || '').forEach(function (candidate) {
      if (candidate && ids.indexOf(candidate) < 0) ids.push(candidate);
    });

    for (let i = 0; i < ids.length; i += 1) {
      try {
        await launchApp(ids[i]);
        return;
      } catch (err) {
        // Try the next candidate id (e.g. amazon.html -> amazon).
      }
    }

    const label = app && app.title ? app.title : (app && app.id) || 'app';
    if (options.onToast) options.onToast('Could not launch ' + label);
  }

  async function refresh() {
    container.innerHTML = '';
    const config = getConfig();
    const pinned = (config.launcher && config.launcher.pinnedApps) || [];
    const scaleBySize = {small: 0.78, medium: 1, large: 1.28};
    const iconSize = (config.launcher && config.launcher.iconSize) || 'medium';
    container.style.setProperty('--tile-scale', String(scaleBySize[iconSize] || 1));
    const tiles = [];

    catalog = await loadAppCatalog();

    for (let i = 0; i < pinned.length; i += 1) {
      const info = await resolvePinnedApp(pinned[i], catalog);
      tiles.push(makeTile(info, i));
    }

    tiles.push(makeSettingsTile(pinned.length));

    for (const tile of tiles) {
      container.appendChild(tile);
    }
  }

  return {
    refresh: refresh,
    isLoungeApp: function (id) {
      return id === APP_ID;
    }
  };
}

export async function listInstalledApps() {
  try {
    const res = await listApps();
    return (res.apps || [])
      .filter(function (app) {
        const record = (app && app.appInfo) || app || {};
        return record.visible !== false;
      })
      .map(function (app) {
        return normalizeAppRecord(app, app && app.id);
      });
  } catch (err) {
    return [];
  }
}