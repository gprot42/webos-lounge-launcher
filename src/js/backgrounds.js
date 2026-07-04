import {discoverBackgroundImages, fetchJson, joinPath} from './usb.js';

const BUILTIN_MANIFEST = 'assets/backgrounds/manifest.json';
const BUILTIN_BASE = 'assets/backgrounds/';

let builtinCache = null;

export function normalizeBackgroundConfig(bg) {
  const out = Object.assign({}, bg || {});

  if (!out.source) {
    if (!out.mode || out.mode === 'preset') {
      out.source = 'preset';
      out.mode = 'static';
    } else {
      out.source = 'usb';
    }
  }

  if (!out.mode) out.mode = 'static';
  if (!out.builtin) out.builtin = 'mountain-sunset';
  if (!out.url) out.url = '';
  if (!Array.isArray(out.urls)) out.urls = [];

  return out;
}

export async function loadBuiltinManifest() {
  if (builtinCache) return builtinCache;

  try {
    const manifest = await fetchJson(BUILTIN_MANIFEST);
    builtinCache = (manifest && manifest.backgrounds) || [];
  } catch (err) {
    builtinCache = [];
  }

  return builtinCache;
}

export function getBuiltinImageUrl(id, manifest) {
  const list = manifest || builtinCache || [];
  const entry = list.find(function (item) {
    return item.id === id;
  });

  if (!entry) return '';
  return joinPath(BUILTIN_BASE, entry.file);
}

export function parseUrlList(text) {
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line && /^https?:\/\//i.test(line);
    });
}

export function isImageUrl(url) {
  return /^https?:\/\//i.test(url);
}

export async function resolveBackgroundImages(config, usbPath) {
  const bg = normalizeBackgroundConfig(config.background);
  const images = [];

  if (bg.source === 'preset' || bg.source === 'animated-gradient') {
    return images;
  }

  if (bg.source === 'builtin') {
    const manifest = await loadBuiltinManifest();

    if (bg.mode === 'slideshow') {
      manifest.forEach(function (entry) {
        images.push(joinPath(BUILTIN_BASE, entry.file));
      });
    } else {
      const url = getBuiltinImageUrl(bg.builtin, manifest);
      if (url) images.push(url);
    }

    return images;
  }

  if (bg.source === 'url') {
    if (bg.mode === 'slideshow' && bg.urls.length) {
      return bg.urls.filter(isImageUrl);
    }

    if (bg.url && isImageUrl(bg.url)) {
      images.push(bg.url);
    }

    return images;
  }

  if (bg.source === 'usb') {
    if (bg.file) {
      const fileUrl = bg.file.indexOf('/') === 0 ? bg.file : joinPath(bg.path || usbPath || '', bg.file);
      images.push(fileUrl);
      return images;
    }

    const folder = bg.path || usbPath || '';
    if (folder) {
      return discoverBackgroundImages(folder);
    }
  }

  return images;
}