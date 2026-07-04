import {fetchJson, joinPath} from './usb.js';

const BUILTIN_MANIFEST = 'assets/music/manifest.json';
const BUILTIN_BASE = 'assets/music/';

let manifestCache = null;

export function normalizeMusicConfig(music) {
  const out = Object.assign({}, music || {});

  if (!out.source) {
    out.source = out.path ? 'usb' : 'builtin';
  }
  if (!out.builtin) {
    out.builtin = 'midnight-lounge';
  }

  return out;
}

export async function loadBuiltinMusicManifest() {
  if (manifestCache) return manifestCache;

  try {
    const manifest = await fetchJson(BUILTIN_MANIFEST);
    manifestCache = (manifest && manifest.tracks) || [];
  } catch (err) {
    manifestCache = [];
  }

  return manifestCache;
}

export function getBuiltinTrackUrl(id, manifest) {
  const list = manifest || manifestCache || [];
  const entry = list.find(function (item) {
    return item.id === id;
  });

  if (!entry) return '';
  return joinPath(BUILTIN_BASE, entry.file);
}

export async function resolveBuiltinTrack(id) {
  const manifest = await loadBuiltinMusicManifest();
  const entry = manifest.find(function (item) {
    return item.id === id;
  }) || manifest[0];

  if (!entry) return null;

  return {
    url: joinPath(BUILTIN_BASE, entry.file),
    title: entry.title || entry.id,
    artist: entry.artist || '',
    description: entry.description || ''
  };
}