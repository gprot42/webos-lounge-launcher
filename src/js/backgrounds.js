import {discoverBackgroundImages, fetchJson, joinPath} from './usb.js';
import {resolveAppUrl, withAssetVersion} from './compat.js';
import {APP_VERSION} from './version.js';

const BUILTIN_MANIFEST = 'assets/backgrounds/manifest.json';
const BUILTIN_BASE = 'assets/backgrounds/';

/**
 * Hard-coded list matching assets/backgrounds/manifest.json.
 * Used when XHR/fetch of the manifest fails (common on webOS 4.x local files).
 */
const BUILTIN_BACKGROUNDS_FALLBACK = [
  {id: 'mountain-sunset', title: 'Mountain Sunset', file: 'mountain-sunset.jpg'},
  {id: 'misty-forest', title: 'Misty Forest', file: 'misty-forest.jpg'},
  {id: 'ocean-twilight', title: 'Ocean Twilight', file: 'ocean-twilight.jpg'},
  {id: 'starry-night', title: 'Starry Night', file: 'starry-night.jpg'},
  {id: 'tropical-beach', title: 'Tropical Beach', file: 'tropical-beach.jpg'},
  {id: 'alpine-lake', title: 'Alpine Lake', file: 'alpine-lake.jpg'},
  {id: 'golden-hills', title: 'Golden Hills', file: 'golden-hills.jpg'},
  {id: 'snowy-cabin', title: 'Snowy Cabin', file: 'snowy-cabin.jpg'},
  {id: 'desert-dusk', title: 'Desert Dusk', file: 'desert-dusk.jpg'},
  {id: 'lavender-field', title: 'Lavender Field', file: 'lavender-field.jpg'},
  {id: 'autumn-lake', title: 'Autumn Lake', file: 'autumn-lake.jpg'}
];

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

function normalizeManifestList(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const cleaned = list.filter(function (entry) {
    return entry && entry.id && entry.file;
  });
  return cleaned.length ? cleaned : null;
}

export async function loadBuiltinManifest() {
  if (builtinCache) return builtinCache;

  try {
    const manifestUrl = withAssetVersion(
      resolveAppUrl(BUILTIN_MANIFEST),
      APP_VERSION
    );
    const manifest = await fetchJson(manifestUrl);
    const loaded = normalizeManifestList(manifest && manifest.backgrounds);
    builtinCache = loaded || BUILTIN_BACKGROUNDS_FALLBACK.slice();
  } catch (err) {
    builtinCache = BUILTIN_BACKGROUNDS_FALLBACK.slice();
  }

  return builtinCache;
}

/**
 * URL candidates for a packaged background image (first usually wins).
 * Absolute file:// first (most reliable on webOS 4); relative as fallback.
 */
export function builtinImageUrl(file) {
  if (!file) return '';
  const rel = joinPath(BUILTIN_BASE, file);
  const absolute = resolveAppUrl(rel);
  // Prefer absolute file:// without query string (webOS 4-safe).
  if (absolute && absolute !== rel) return absolute;
  return withAssetVersion(rel, APP_VERSION);
}

/** All URL forms to try for a builtin file (absolute, relative, versioned). */
export function builtinImageCandidates(file) {
  if (!file) return [];
  const rel = joinPath(BUILTIN_BASE, file);
  const absolute = resolveAppUrl(rel);
  const out = [];
  function push(u) {
    if (u && out.indexOf(u) < 0) out.push(u);
  }
  push(absolute);
  push(rel);
  push(withAssetVersion(rel, APP_VERSION));
  return out;
}

export function getBuiltinImageUrl(id, manifest) {
  const list = manifest || builtinCache || BUILTIN_BACKGROUNDS_FALLBACK;
  const entry = list.find(function (item) {
    return item.id === id;
  }) || list[0];

  if (!entry) return '';
  return builtinImageUrl(entry.file);
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
      // One preferred URL per photo (absolute file:// when possible).
      manifest.forEach(function (entry) {
        const url = builtinImageUrl(entry.file);
        if (url) images.push(url);
      });
    } else {
      // Multiple path forms for the selected photo so the controller can try
      // absolute file://, relative, then versioned relative on webOS 4.x.
      const list = manifest || [];
      const entry = list.find(function (item) {
        return item.id === bg.builtin;
      }) || list[0];
      if (entry) {
        builtinImageCandidates(entry.file).forEach(function (url) {
          images.push(url);
        });
      }
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
