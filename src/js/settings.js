import {saveConfig, TIMEZONE_OPTIONS} from './config.js';
import {listInstalledApps} from './apps.js';
import {loadAppCatalog, resolvePinnedApp} from './app-catalog.js';
import {KNOWN_BUILTIN_APPS, getBuiltinAppIcon, getBuiltinAppTitle, BUILTIN_ICON_CHOICES} from './app-icons.js';
import {loadBuiltinManifest, normalizeBackgroundConfig, parseUrlList} from './backgrounds.js';
import {loadBuiltinMusicManifest, normalizeMusicConfig} from './builtin-music.js';
import {applyActiveProfile, PROFILE_OPTIONS} from './profiles.js';
import {fetchInputDevices} from './inputs.js';
import {findLoungeRoots, joinPath} from './usb.js';
import {APP_VERSION} from './version.js';

const DEFAULT_INPUTS = ['HDMI_1', 'HDMI_2', 'HDMI_3', 'TV'];
const KEYBOARD_SCROLL_RESERVE = 420;

function attachInputScrollHelpers(scrollContainer) {
  if (!scrollContainer) return;

  scrollContainer.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(function (input) {
    input.addEventListener('focus', function () {
      window.setTimeout(function () {
        const containerRect = scrollContainer.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const visibleBottom = containerRect.bottom - KEYBOARD_SCROLL_RESERVE;

        if (inputRect.bottom > visibleBottom) {
          scrollContainer.scrollTop += inputRect.bottom - visibleBottom + 32;
        } else if (inputRect.top < containerRect.top + 16) {
          scrollContainer.scrollTop -= containerRect.top + 16 - inputRect.top;
        }
      }, 320);
    });
  });
}

function createOptionStepper(className, focusIndex, optionList, currentValue, onChange) {
  const el = document.createElement('div');
  el.className = 'option-stepper focusable' + (className ? ' ' + className : '');
  el.dataset.focusIndex = String(focusIndex);
  el.tabIndex = 0;

  const prev = document.createElement('span');
  prev.className = 'stepper-arrow';
  prev.textContent = '\u2039';

  const labelEl = document.createElement('span');
  labelEl.className = 'stepper-label';

  const next = document.createElement('span');
  next.className = 'stepper-arrow';
  next.textContent = '\u203A';

  el.appendChild(prev);
  el.appendChild(labelEl);
  el.appendChild(next);

  let options = optionList.slice();
  let index = 0;

  function indexOfValue(value) {
    for (let i = 0; i < options.length; i += 1) {
      if (options[i].value === value) return i;
    }
    return -1;
  }

  function render() {
    const opt = options[index] || {value: '', label: ''};
    labelEl.textContent = opt.label;
    el.value = opt.value;
    el.dataset.value = opt.value;
    prev.classList.toggle('is-disabled', index <= 0);
    next.classList.toggle('is-disabled', index >= options.length - 1);
  }

  el.__step = function (dir) {
    if (!options.length) return;
    let n = index + dir;
    if (n < 0) n = 0;
    if (n > options.length - 1) n = options.length - 1;
    if (n !== index) {
      index = n;
      render();
      if (onChange) onChange(el.value);
    }
  };

  el.setOptions = function (newOptions, newValue) {
    options = (newOptions || []).slice();
    const found = indexOfValue(newValue);
    index = found >= 0 ? found : 0;
    render();
  };

  el.setValue = function (value) {
    const found = indexOfValue(value);
    if (found >= 0 && found !== index) {
      index = found;
      render();
    }
  };

  prev.addEventListener('click', function (event) {
    event.stopPropagation();
    el.__step(-1);
  });

  next.addEventListener('click', function (event) {
    event.stopPropagation();
    el.__step(1);
  });

  el.addEventListener('click', function (event) {
    if (event.target === prev || event.target === next) return;
    el.__step(1);
  });

  const start = indexOfValue(currentValue);
  index = start >= 0 ? start : 0;
  render();
  return el;
}

export function createSettingsPanel(panel, getConfig, options) {
  let visible = false;
  let builtinManifest = [];
  let pinnedOrder = [];
  let pinnedContainer = null;
  let appsByIdMap = {};
  let customApps = [];

  function findCustomApp(id) {
    for (let i = 0; i < customApps.length; i += 1) {
      if (customApps[i].id === id) return customApps[i];
    }
    return null;
  }

  function hide() {
    visible = false;
    panel.hidden = true;
    if (options.onClose) options.onClose();
  }

  function show() {
    visible = true;
    panel.hidden = false;
    render();
    if (options.onOpen) options.onOpen();
  }

  function labeledControl(label, control) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-row';
    const span = document.createElement('span');
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(control);
    return wrap;
  }

  function labeledBlock(label, control) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-block';
    const heading = document.createElement('span');
    heading.className = 'settings-block-label';
    heading.textContent = label;
    wrap.appendChild(heading);
    wrap.appendChild(control);
    return wrap;
  }

  function syncBackgroundFields(source, refs) {
    const isImage = source !== 'preset' && source !== 'animated-gradient';
    const showBuiltin = source === 'builtin';
    const showUsb = source === 'usb';
    const showUrl = source === 'url';
    const isSlideshow = refs.displaySelect.value === 'slideshow';

    refs.displayRow.hidden = !isImage;
    refs.builtinRow.hidden = !showBuiltin;
    refs.usbHint.hidden = !showUsb;
    refs.usbFileRow.hidden = !showUsb || isSlideshow;
    refs.urlRow.hidden = !showUrl || isSlideshow;
    refs.urlsRow.hidden = !showUrl || !isSlideshow;
    refs.intervalRow.hidden = !isImage || !isSlideshow;
    refs.kenBurnsRow.hidden = !isImage;
  }

  function movePinned(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= pinnedOrder.length) return;
    const tmp = pinnedOrder[index];
    pinnedOrder[index] = pinnedOrder[next];
    pinnedOrder[next] = tmp;
    if (pinnedContainer) renderPinnedList(pinnedContainer);
  }

  function renderPinnedList(container) {
    container.innerHTML = '';

    pinnedOrder.forEach(function (appId, index) {
      const app = appsByIdMap[appId] || {id: appId, title: appId, icon: ''};
      const row = document.createElement('div');
      row.className = 'settings-pinned-row';

      if (app.icon) {
        const icon = document.createElement('img');
        icon.className = 'settings-app-icon';
        icon.src = app.icon;
        icon.alt = '';
        row.appendChild(icon);
      }

      const title = document.createElement('span');
      title.className = 'settings-pinned-title';
      title.textContent = app.title || app.id;

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'settings-mini-btn focusable';
      upBtn.dataset.focusIndex = String(960 + index * 3);
      upBtn.textContent = '↑';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', function () { movePinned(index, -1); });

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'settings-mini-btn focusable';
      downBtn.dataset.focusIndex = String(961 + index * 3);
      downBtn.textContent = '↓';
      downBtn.disabled = index === pinnedOrder.length - 1;
      downBtn.addEventListener('click', function () { movePinned(index, 1); });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'settings-mini-btn focusable';
      removeBtn.dataset.focusIndex = String(962 + index * 3);
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', function () {
        const removedId = pinnedOrder[index];
        pinnedOrder.splice(index, 1);
        for (let i = customApps.length - 1; i >= 0; i -= 1) {
          if (customApps[i].id === removedId) customApps.splice(i, 1);
        }
        renderPinnedList(container);
      });

      row.appendChild(title);
      row.appendChild(upBtn);
      row.appendChild(downBtn);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  async function render() {
    const config = getConfig();
    const effective = applyActiveProfile(config);
    const bg = normalizeBackgroundConfig(effective.background);
    builtinManifest = await loadBuiltinManifest();
    pinnedOrder = (config.launcher.pinnedApps || []).slice();
    customApps = (config.launcher.customApps || []).map(function (entry) {
      return Object.assign({}, entry);
    });
    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'settings-header';

    const headerTitleWrap = document.createElement('div');
    headerTitleWrap.className = 'settings-header-title';

    const headerTitle = document.createElement('h2');
    headerTitle.textContent = 'Settings';

    const versionLabel = document.createElement('p');
    versionLabel.className = 'settings-version';
    versionLabel.textContent = 'Version ' + APP_VERSION;

    headerTitleWrap.appendChild(headerTitle);
    headerTitleWrap.appendChild(versionLabel);

    const headerActions = document.createElement('div');
    headerActions.className = 'settings-header-actions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'settings-close focusable';
    closeBtn.dataset.focusIndex = '900';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hide);
    headerActions.appendChild(closeBtn);

    header.appendChild(headerTitleWrap);
    header.appendChild(headerActions);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'settings-body';
    panel.appendChild(body);

    const profileSection = document.createElement('section');
    profileSection.className = 'settings-section';
    profileSection.innerHTML = '<h3>Profile</h3>';

    const profileSelect = createOptionStepper('', 901,
      PROFILE_OPTIONS.map(function (entry) {
        return {value: entry.id, label: entry.label};
      }),
      config.profile || 'default');
    profileSection.appendChild(labeledControl('Active profile', profileSelect));

    const profileHint = document.createElement('p');
    profileHint.className = 'settings-hint';
    profileHint.textContent = 'Night lowers ambient volume and darkens the scrim. Cinema disables music and uses a dark gradient.';
    profileSection.appendChild(profileHint);
    body.appendChild(profileSection);

    const section = document.createElement('section');
    section.className = 'settings-section';
    section.innerHTML = '<h3>Background</h3>';

    const sourceSelect = createOptionStepper('', 902, [
      {value: 'preset', label: 'Gradient'},
      {value: 'animated-gradient', label: 'Animated Gradient'},
      {value: 'builtin', label: 'Built-in photos'},
      {value: 'usb', label: 'USB folder'},
      {value: 'url', label: 'Image URL'}
    ], bg.source, function () {
      syncFields();
    });
    section.appendChild(labeledControl('Source', sourceSelect));

    const presetSelect = createOptionStepper('', 903, [
      {value: 'warm-gradient', label: 'Warm gradient'},
      {value: 'cool-gradient', label: 'Cool gradient'},
      {value: 'midnight', label: 'Midnight'},
      {value: 'ember', label: 'Ember'}
    ], bg.preset);
    const presetRow = labeledControl('Gradient', presetSelect);
    section.appendChild(presetRow);

    const displaySelect = createOptionStepper('', 904, [
      {value: 'static', label: 'Single image'},
      {value: 'slideshow', label: 'Slideshow'}
    ], bg.mode, function () {
      syncFields();
    });
    const displayRow = labeledControl('Display', displaySelect);
    section.appendChild(displayRow);

    const builtinSelect = createOptionStepper('', 905,
      builtinManifest.map(function (entry) {
        return {value: entry.id, label: entry.title || entry.id};
      }),
      bg.builtin);
    const builtinRow = labeledControl('Photo', builtinSelect);
    section.appendChild(builtinRow);

    const usbHint = document.createElement('p');
    usbHint.className = 'settings-hint';
    usbHint.textContent = 'USB path: lounge/backgrounds/ with images.json. For a single file, enter the filename below.';
    section.appendChild(usbHint);

    const usbFileInput = document.createElement('input');
    usbFileInput.type = 'text';
    usbFileInput.className = 'settings-text focusable';
    usbFileInput.dataset.focusIndex = '906';
    usbFileInput.placeholder = 'living-room.jpg';
    usbFileInput.value = config.background.file || '';
    const usbFileRow = labeledControl('USB filename', usbFileInput);
    section.appendChild(usbFileRow);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'settings-text focusable';
    urlInput.dataset.focusIndex = '907';
    urlInput.placeholder = 'https://example.com/wallpaper.jpg';
    urlInput.value = bg.url || '';
    const urlRow = labeledControl('Image URL', urlInput);
    section.appendChild(urlRow);

    const urlsInput = document.createElement('textarea');
    urlsInput.className = 'settings-textarea focusable';
    urlsInput.dataset.focusIndex = '908';
    urlsInput.rows = 4;
    urlsInput.placeholder = 'One image URL per line';
    urlsInput.value = (bg.urls || []).join('\n');
    const urlsRow = labeledBlock('Slideshow URLs', urlsInput);
    section.appendChild(urlsRow);

    const intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.min = '30';
    intervalInput.max = '3600';
    intervalInput.step = '30';
    intervalInput.className = 'settings-text focusable';
    intervalInput.dataset.focusIndex = '909';
    intervalInput.value = String(bg.slideshowIntervalSec || 300);
    const intervalRow = labeledControl('Seconds per slide', intervalInput);
    section.appendChild(intervalRow);

    const kenBurnsToggle = document.createElement('input');
    kenBurnsToggle.type = 'checkbox';
    kenBurnsToggle.checked = !!bg.kenBurns;
    kenBurnsToggle.className = 'focusable';
    kenBurnsToggle.dataset.focusIndex = '910';
    const kenBurnsRow = labeledControl('Ken Burns motion', kenBurnsToggle);
    section.appendChild(kenBurnsRow);

    const overlayRange = document.createElement('input');
    overlayRange.type = 'range';
    overlayRange.min = '20';
    overlayRange.max = '60';
    overlayRange.value = String(Math.round((bg.overlayOpacity || 0.45) * 100));
    overlayRange.className = 'focusable';
    overlayRange.dataset.focusIndex = '911';
    section.appendChild(labeledControl('Overlay opacity', overlayRange));

    const oledNote = document.createElement('p');
    oledNote.className = 'oled-note';
    oledNote.textContent = 'On OLED TVs, prefer slideshow or gradients over a single static photo left on screen for long periods.';
    section.appendChild(oledNote);
    body.appendChild(section);

    const refs = {
      displayRow: displayRow,
      builtinRow: builtinRow,
      usbHint: usbHint,
      usbFileRow: usbFileRow,
      urlRow: urlRow,
      urlsRow: urlsRow,
      intervalRow: intervalRow,
      kenBurnsRow: kenBurnsRow,
      displaySelect: displaySelect
    };

    function syncFields() {
      presetRow.hidden = sourceSelect.value !== 'preset' && sourceSelect.value !== 'animated-gradient';
      syncBackgroundFields(sourceSelect.value, refs);
    }

    syncFields();

    const music = normalizeMusicConfig(config.music);
    const builtinTracks = await loadBuiltinMusicManifest();

    const musicSection = document.createElement('section');
    musicSection.className = 'settings-section';
    musicSection.innerHTML = '<h3>Music</h3>';

    const musicEnabled = document.createElement('input');
    musicEnabled.type = 'checkbox';
    musicEnabled.checked = !!effective.music.enabled;
    musicEnabled.className = 'focusable';
    musicEnabled.dataset.focusIndex = '912';
    musicSection.appendChild(labeledControl('Ambient music', musicEnabled));

    const musicSourceSelect = createOptionStepper('', 913, [
      {value: 'builtin', label: 'Built-in ambient'},
      {value: 'usb', label: 'USB folder'}
    ], music.source, function () {
      syncMusicFields();
    });
    const musicSourceRow = labeledControl('Source', musicSourceSelect);
    musicSection.appendChild(musicSourceRow);

    const builtinTrackSelect = createOptionStepper('', 914,
      builtinTracks.map(function (entry) {
        const detail = entry.description ? ' — ' + entry.description : '';
        return {value: entry.id, label: (entry.title || entry.id) + detail};
      }),
      music.builtin);
    const builtinTrackRow = labeledControl('Ambient track', builtinTrackSelect);
    musicSection.appendChild(builtinTrackRow);

    const musicFolderPicker = createOptionStepper('', 9145, [
      {value: '', label: 'Custom path (type below)…'}
    ], '', function (value) {
      if (value) musicPathInput.value = value;
    });
    const musicFolderRow = labeledControl('Browse folders', musicFolderPicker);
    musicSection.appendChild(musicFolderRow);

    findLoungeRoots().then(function (roots) {
      const opts = [{value: '', label: 'Custom path (type below)…'}];
      roots.forEach(function (root) {
        opts.push({value: joinPath(root, 'music'), label: joinPath(root, 'music')});
        opts.push({value: joinPath(root, 'music', 'ambient'), label: joinPath(root, 'music', 'ambient')});
        opts.push({value: joinPath(root, 'music', 'jazz'), label: joinPath(root, 'music', 'jazz')});
      });

      if (opts.length === 1) {
        opts[0].label = 'No USB drives detected — type a path below';
      }
      musicFolderPicker.setOptions(opts, config.music.path || '');
    }).catch(function () {
      musicFolderPicker.setOptions(
        [{value: '', label: 'Could not scan USB drives — type a path below'}], '');
    });

    const musicPathInput = document.createElement('input');
    musicPathInput.type = 'text';
    musicPathInput.className = 'settings-text focusable';
    musicPathInput.dataset.focusIndex = '915';
    musicPathInput.placeholder = 'e.g. /media/usb1/lounge/music or auto-detected';
    musicPathInput.value = config.music.path || '';
    const musicPathRow = labeledControl('Music folder', musicPathInput);
    musicSection.appendChild(musicPathRow);

    musicPathInput.addEventListener('input', function () {
      musicFolderPicker.setValue(musicPathInput.value);
    });

    const shuffleToggle = document.createElement('input');
    shuffleToggle.type = 'checkbox';
    shuffleToggle.checked = config.music.shuffle !== false;
    shuffleToggle.className = 'focusable';
    shuffleToggle.dataset.focusIndex = '916';
    const shuffleRow = labeledControl('Shuffle', shuffleToggle);
    musicSection.appendChild(shuffleRow);

    const repeatSelect = createOptionStepper('', 917, [
      {value: 'all', label: 'Repeat all'},
      {value: 'one', label: 'Repeat one'},
      {value: 'off', label: 'Play once'}
    ], config.music.repeat || 'one');
    const repeatRow = labeledControl('Repeat', repeatSelect);
    musicSection.appendChild(repeatRow);

    const musicVolume = document.createElement('input');
    musicVolume.type = 'range';
    musicVolume.min = '0';
    musicVolume.max = '50';
    musicVolume.value = String(Math.round((effective.music.volume || 0.15) * 100));
    musicVolume.className = 'focusable';
    musicVolume.dataset.focusIndex = '918';
    musicSection.appendChild(labeledControl('Ambient volume', musicVolume));

    const musicHint = document.createElement('p');
    musicHint.className = 'settings-hint';
    musicHint.textContent = 'Built-in tracks are copyright-free (CC0 / public domain). USB mode: pick a detected folder above or type the full path. Supports playlist.m3u or tracks.json. Red = pause, Green = skip.';
    musicSection.appendChild(musicHint);

    function syncMusicFields() {
      const isBuiltin = musicSourceSelect.value === 'builtin';
      builtinTrackRow.hidden = !isBuiltin;
      musicFolderRow.hidden = isBuiltin;
      musicPathRow.hidden = isBuiltin;
      shuffleRow.hidden = isBuiltin;
      repeatRow.hidden = isBuiltin;
    }

    syncMusicFields();
    body.appendChild(musicSection);

    const launcherSection = document.createElement('section');
    launcherSection.className = 'settings-section';
    launcherSection.innerHTML = '<h3>Launcher</h3>';

    const showClockToggle = document.createElement('input');
    showClockToggle.type = 'checkbox';
    showClockToggle.checked = config.launcher.showClock !== false;
    showClockToggle.className = 'focusable';
    showClockToggle.dataset.focusIndex = '919';
    launcherSection.appendChild(labeledControl('Show clock', showClockToggle));

    const showDateToggle = document.createElement('input');
    showDateToggle.type = 'checkbox';
    showDateToggle.checked = config.launcher.showDate !== false;
    showDateToggle.className = 'focusable';
    showDateToggle.dataset.focusIndex = '9195';
    launcherSection.appendChild(labeledControl('Show date', showDateToggle));

    const timezoneSelect = createOptionStepper('', 920,
      TIMEZONE_OPTIONS.map(function (option) {
        return {value: option.value, label: option.label};
      }),
      config.launcher.timezone || '');
    launcherSection.appendChild(labeledControl('Timezone', timezoneSelect));

    const iconSizeSelect = createOptionStepper('', 9205, [
      {value: 'small', label: 'Small'},
      {value: 'medium', label: 'Medium'},
      {value: 'large', label: 'Large'}
    ], config.launcher.iconSize || 'medium');
    launcherSection.appendChild(labeledControl('Icon size', iconSizeSelect));

    const iconAlignSelect = createOptionStepper('', 9206, [
      {value: 'left', label: 'Left'},
      {value: 'center', label: 'Centre'},
      {value: 'right', label: 'Right'}
    ], config.launcher.iconAlign || 'center');
    launcherSection.appendChild(labeledControl('Icon alignment', iconAlignSelect));

    const returnToggle = document.createElement('input');
    returnToggle.type = 'checkbox';
    returnToggle.checked = !!config.launcher.returnOnAppExit;
    returnToggle.className = 'focusable';
    returnToggle.dataset.focusIndex = '921';
    launcherSection.appendChild(labeledControl('Return when app exits', returnToggle));

    const bootToggle = document.createElement('input');
    bootToggle.type = 'checkbox';
    bootToggle.checked = !!config.launcher.bootOnStart;
    bootToggle.className = 'focusable';
    bootToggle.dataset.focusIndex = '922';
    launcherSection.appendChild(labeledControl('Boot on TV start', bootToggle));

    const bootHint = document.createElement('p');
    bootHint.className = 'settings-hint';
    bootHint.textContent = 'Boot on start requires the Homebrew Autostart app or a root init.d script. This setting records your preference.';
    launcherSection.appendChild(bootHint);
    body.appendChild(launcherSection);

    const inputsSection = document.createElement('section');
    inputsSection.className = 'settings-section';
    inputsSection.innerHTML = '<h3>Inputs</h3><p class="settings-hint">Choose which inputs appear and set custom labels.</p>';

    const inputsList = document.createElement('div');
    inputsList.className = 'settings-inputs';
    inputsSection.appendChild(inputsList);
    body.appendChild(inputsSection);

    const appsSection = document.createElement('section');
    appsSection.className = 'settings-section';
    appsSection.innerHTML = '<h3>Pinned apps</h3><p class="settings-hint">Reorder or remove apps pinned to the home row.</p>';

    const pinnedList = document.createElement('div');
    pinnedList.className = 'settings-pinned-list';
    appsSection.appendChild(pinnedList);

    const addHeading = document.createElement('h4');
    addHeading.className = 'settings-subheading';
    addHeading.textContent = 'Add an app';
    appsSection.appendChild(addHeading);

    const addHint = document.createElement('p');
    addHint.className = 'settings-hint';
    addHint.textContent = 'Tap + next to any installed app below to pin it to the home row.';
    appsSection.appendChild(addHint);

    const addAppsList = document.createElement('div');
    addAppsList.className = 'settings-apps';
    appsSection.appendChild(addAppsList);
    body.appendChild(appsSection);

    const customSection = document.createElement('section');
    customSection.className = 'settings-section';
    customSection.innerHTML = '<h3>Custom app</h3><p class="settings-hint">Pin any installed app by its App ID and choose a bundled icon. Find the App ID on your TV or in the Homebrew app list.</p>';

    const customAppIdInput = document.createElement('input');
    customAppIdInput.type = 'text';
    customAppIdInput.className = 'settings-text focusable';
    customAppIdInput.dataset.focusIndex = '1100';
    customAppIdInput.placeholder = 'e.g. com.spotify.tv';
    customSection.appendChild(labeledControl('App ID', customAppIdInput));

    const customNameInput = document.createElement('input');
    customNameInput.type = 'text';
    customNameInput.className = 'settings-text focusable';
    customNameInput.dataset.focusIndex = '1101';
    customNameInput.placeholder = 'e.g. Spotify';
    customSection.appendChild(labeledControl('Name', customNameInput));

    const iconPreview = document.createElement('img');
    iconPreview.className = 'settings-app-icon';
    iconPreview.alt = '';
    iconPreview.src = BUILTIN_ICON_CHOICES[0].value;

    const iconSelect = createOptionStepper('', 1102, BUILTIN_ICON_CHOICES, BUILTIN_ICON_CHOICES[0].value, function (value) {
      iconPreview.src = value;
    });

    const iconRow = labeledControl('Icon', iconSelect);
    iconRow.insertBefore(iconPreview, iconRow.lastChild);
    customSection.appendChild(iconRow);

    const addCustomBtn = document.createElement('button');
    addCustomBtn.type = 'button';
    addCustomBtn.className = 'settings-mini-btn settings-add-custom focusable';
    addCustomBtn.dataset.focusIndex = '1103';
    addCustomBtn.textContent = 'Add custom app';
    addCustomBtn.addEventListener('click', function () {
      const launchId = customAppIdInput.value.trim();
      if (!launchId) {
        if (options.onToast) options.onToast('Enter an App ID first');
        return;
      }

      const id = 'custom:' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const title = customNameInput.value.trim() || getBuiltinAppTitle(launchId) || launchId;

      customApps.push({id: id, launchId: launchId, title: title, icon: iconSelect.value});
      pinnedOrder.push(id);

      customAppIdInput.value = '';
      customNameInput.value = '';

      loadAppsLists(pinnedList, addAppsList, config);
    });
    customSection.appendChild(addCustomBtn);
    body.appendChild(customSection);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'settings-save focusable';
    saveBtn.dataset.focusIndex = '899';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function () {
      config.profile = profileSelect.value;
      config.background.source = sourceSelect.value;
      config.background.mode = displaySelect.value;
      config.background.preset = presetSelect.value;
      config.background.builtin = builtinSelect.value;
      config.background.file = usbFileInput.value.trim();
      config.background.url = urlInput.value.trim();
      config.background.urls = parseUrlList(urlsInput.value);
      config.background.slideshowIntervalSec = Number(intervalInput.value) || 300;
      config.background.kenBurns = kenBurnsToggle.checked;
      config.background.overlayOpacity = Number(overlayRange.value) / 100;

      config.music.enabled = musicEnabled.checked;
      config.music.source = musicSourceSelect.value;
      config.music.builtin = builtinTrackSelect.value;
      config.music.path = musicPathInput.value.trim();
      config.music.shuffle = shuffleToggle.checked;
      config.music.repeat = repeatSelect.value;
      config.music.volume = Number(musicVolume.value) / 100;

      config.launcher.showClock = showClockToggle.checked;
      config.launcher.showDate = showDateToggle.checked;
      config.launcher.timezone = timezoneSelect.value;
      config.launcher.iconSize = iconSizeSelect.value;
      config.launcher.iconAlign = iconAlignSelect.value;
      config.launcher.returnOnAppExit = returnToggle.checked;
      config.launcher.bootOnStart = bootToggle.checked;
      config.launcher.pinnedApps = pinnedOrder.slice();
      config.launcher.customApps = customApps.slice();

      saveInputSettings(inputsList, config);

      saveConfig(config);
      if (options.onSave) options.onSave(config);
      if (config.launcher.bootOnStart && options.onToast) {
        options.onToast('Boot on start saved — enable Homebrew Autostart on your TV');
      }
      hide();
    });
    headerActions.insertBefore(saveBtn, closeBtn);

    await loadInputSettings(inputsList, config);
    await loadAppsLists(pinnedList, addAppsList, config);
    attachInputScrollHelpers(body);
  }

  async function loadInputSettings(container, config) {
    const devices = await fetchInputDevices();
    const allowed = config.launcher.inputs || DEFAULT_INPUTS.slice();
    const labels = config.launcher.inputLabels || {};

    devices.forEach(function (device, index) {
      const row = document.createElement('div');
      row.className = 'settings-input-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'focusable';
      checkbox.dataset.focusIndex = String(930 + index * 2);
      checkbox.dataset.inputId = device.id;
      checkbox.checked = allowed.indexOf(device.id) >= 0;

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'settings-text focusable';
      labelInput.dataset.focusIndex = String(931 + index * 2);
      labelInput.dataset.inputId = device.id;
      labelInput.placeholder = device.label || device.id.replace(/_/g, ' ');
      labelInput.value = labels[device.id] || '';

      const name = document.createElement('span');
      name.className = 'settings-input-name';
      name.textContent = device.label || device.id;

      row.appendChild(checkbox);
      row.appendChild(name);
      row.appendChild(labelInput);
      container.appendChild(row);
    });
  }

  function saveInputSettings(container, config) {
    const allowed = [];
    const labels = {};

    container.querySelectorAll('.settings-input-row').forEach(function (row) {
      const checkbox = row.querySelector('input[type=checkbox]');
      const labelInput = row.querySelector('input[type=text]');
      const inputId = checkbox.dataset.inputId;

      if (checkbox.checked) allowed.push(inputId);
      if (labelInput.value.trim()) labels[inputId] = labelInput.value.trim();
    });

    config.launcher.inputs = allowed.length ? allowed : DEFAULT_INPUTS.slice();
    config.launcher.inputLabels = labels;
  }

  async function loadAppsLists(pinnedListEl, addContainer, config) {
    addContainer.innerHTML = '';
    const catalog = await loadAppCatalog();
    const apps = await listInstalledApps();
    appsByIdMap = Object.assign({}, catalog);
    apps.forEach(function (app) {
      appsByIdMap[app.id] = app;
    });

    customApps.forEach(function (entry) {
      if (!entry || !entry.id) return;
      appsByIdMap[entry.id] = {
        id: entry.id,
        launchId: entry.launchId,
        title: entry.title || entry.launchId || entry.id,
        icon: entry.icon || ''
      };
    });

    for (let i = 0; i < pinnedOrder.length; i += 1) {
      const appId = pinnedOrder[i];
      if (findCustomApp(appId)) continue;
      if (!appsByIdMap[appId] || !appsByIdMap[appId].title || !appsByIdMap[appId].icon) {
        appsByIdMap[appId] = await resolvePinnedApp(appId, appsByIdMap);
      }
    }

    KNOWN_BUILTIN_APPS.forEach(function (id) {
      if (appsByIdMap[id] && appsByIdMap[id].title) return;
      appsByIdMap[id] = {
        id: id,
        title: getBuiltinAppTitle(id) || id,
        icon: getBuiltinAppIcon(id) || ''
      };
    });

    pinnedContainer = pinnedListEl;
    renderPinnedList(pinnedListEl);

    const seen = {};
    const candidates = [];
    apps.forEach(function (app) {
      if (app && app.id && !seen[app.id]) {
        seen[app.id] = true;
        candidates.push(app);
      }
    });
    Object.keys(appsByIdMap).forEach(function (id) {
      const app = appsByIdMap[id];
      if (app && app.id && app.title && !seen[app.id]) {
        seen[app.id] = true;
        candidates.push(app);
      }
    });

    candidates.sort(function (a, b) {
      return (a.title || a.id).localeCompare(b.title || b.id);
    });

    const remaining = candidates.filter(function (app) {
      return pinnedOrder.indexOf(app.id) < 0;
    });

    if (!remaining.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-hint';
      empty.textContent = candidates.length
        ? 'All available apps are already pinned.'
        : 'No other apps were found on this TV.';
      addContainer.appendChild(empty);
    }

    remaining.forEach(function (app, index) {
      const row = document.createElement('div');
      row.className = 'settings-app-row';

      if (app.icon) {
        const icon = document.createElement('img');
        icon.className = 'settings-app-icon';
        icon.src = app.icon;
        icon.alt = '';
        row.appendChild(icon);
      }

      const title = document.createElement('span');
      title.textContent = app.title || app.id;

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'settings-mini-btn focusable';
      addBtn.dataset.focusIndex = String(980 + index);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', function () {
        pinnedOrder.push(app.id);
        loadAppsLists(pinnedListEl, addContainer, config);
      });

      row.appendChild(title);
      row.appendChild(addBtn);
      addContainer.appendChild(row);
    });
  }

  return {
    show: show,
    hide: hide,
    isVisible: function () { return visible; }
  };
}