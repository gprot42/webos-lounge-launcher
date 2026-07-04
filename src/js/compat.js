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

export function compatFetch(url, options) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }

  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    const method = (options && options.method) || 'GET';

    xhr.open(method, url, true);

    xhr.onload = function () {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        text: function () {
          return Promise.resolve(xhr.responseText);
        }
      });
    };

    xhr.onerror = function () {
      reject(new Error('Network error'));
    };

    xhr.send((options && options.body) || null);
  });
}