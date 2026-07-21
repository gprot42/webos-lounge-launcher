/* Polyfills for older webOS TVs (3.x–5.x) and safe fallbacks on webOS 6–10+. */

if (!Array.prototype.find) {
  Array.prototype.find = function (predicate) {
    if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
    const list = Object(this);
    const len = list.length >>> 0;
    for (let i = 0; i < len; i += 1) {
      const value = list[i];
      if (predicate.call(arguments[1], value, i, list)) return value;
    }
    return undefined;
  };
}

if (!Array.from) {
  Array.from = function (arrayLike) {
    return Array.prototype.slice.call(arrayLike);
  };
}

if (typeof Object.assign !== 'function') {
  Object.assign = function (target) {
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    const out = Object(target);
    for (let i = 1; i < arguments.length; i += 1) {
      const source = arguments[i];
      if (source == null) continue;
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          out[key] = source[key];
        }
      }
    }
    return out;
  };
}

if (!String.prototype.endsWith) {
  String.prototype.endsWith = function (search, length) {
    const str = String(this);
    const len = length === undefined ? str.length : length >> 0;
    const start = Math.max(0, Math.min(len, str.length));
    const searchStr = String(search);
    if (start + searchStr.length > str.length) return false;
    return str.slice(start - searchStr.length, start) === searchStr;
  };
}

if (!String.prototype.includes) {
  String.prototype.includes = function (search, start) {
    return String(this).indexOf(search, start || 0) !== -1;
  };
}

if (!String.prototype.padStart) {
  String.prototype.padStart = function (targetLength, padString) {
    const str = String(this);
    const len = targetLength >> 0;
    const fill = String(padString !== undefined ? padString : ' ');
    if (str.length >= len) return str;
    let pad = '';
    while (pad.length < len - str.length) pad += fill;
    return pad.slice(0, len - str.length) + str;
  };
}

/**
 * Resolve a path relative to the packaged app root (index.html directory).
 * Older webOS WAM often breaks relative CSS/XHR URLs; absolute file:// URLs
 * are more reliable for built-in assets.
 */
export function resolveAppUrl(relPath) {
  if (!relPath) return '';
  const path = String(relPath);
  if (/^(https?:|data:|blob:|file:)/i.test(path)) return path;

  // Absolute filesystem path (USB / app dir without scheme).
  if (path.charAt(0) === '/') {
    return 'file://' + path;
  }

  try {
    if (typeof location !== 'undefined' && location.href) {
      const href = String(location.href).split('#')[0].split('?')[0];
      const base = href.replace(/[^/]*$/, '');
      const cleaned = path.replace(/^\.\//, '');
      return base + cleaned;
    }
  } catch (err) {
    // Fall through.
  }

  return path;
}

/**
 * Cache-bust packaged asset URLs so WAM does not keep a failed empty response
 * after an update. Skips http(s)/data/blob and file:// (query strings on
 * file:// break image decode on some webOS 4 WebKits).
 */
export function withAssetVersion(url, version) {
  if (!url || !version) return url;
  if (/^(https?:|data:|blob:|file:)/i.test(url)) return url;
  const sep = url.indexOf('?') >= 0 ? '&' : '?';
  return url + sep + 'v=' + encodeURIComponent(String(version));
}

export function compatFetch(url, options) {
  if (typeof fetch === 'function') {
    return fetch(url, options).then(function (res) {
      // Some older Chromium builds report status 0 for successful local reads.
      if (res && res.ok) return res;
      if (res && res.status === 0) {
        return res.text().then(function (body) {
          return {
            ok: !!(body && body.length),
            status: 0,
            text: function () {
              return Promise.resolve(body || '');
            }
          };
        });
      }
      return res;
    });
  }

  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    const method = (options && options.method) || 'GET';

    xhr.open(method, url, true);

    xhr.onload = function () {
      const body = xhr.responseText || '';
      // Local file:// / packaged app XHR often returns status 0 on success
      // (classic webOS 4.x / older WebKit behaviour). Treat non-empty body as OK.
      const ok =
        (xhr.status >= 200 && xhr.status < 300) ||
        (xhr.status === 0 && body.length > 0);
      resolve({
        ok: ok,
        status: xhr.status,
        text: function () {
          return Promise.resolve(body);
        }
      });
    };

    xhr.onerror = function () {
      reject(new Error('Network error'));
    };

    xhr.send((options && options.body) || null);
  });
}