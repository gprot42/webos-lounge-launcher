import {lunaRequest} from './luna.js';

let cachedSdkVersion = null;

export function parseSdkVersion(raw) {
  if (!raw) return 0;
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 0;
}

export async function getSdkVersion() {
  if (cachedSdkVersion !== null) return cachedSdkVersion;

  if (window.webOS && typeof window.webOS.deviceInfo === 'function') {
    cachedSdkVersion = await new Promise(function (resolve) {
      window.webOS.deviceInfo(function (info) {
        resolve(parseSdkVersion(info && info.sdkVersion));
      });
    });
    return cachedSdkVersion;
  }

  try {
    const res = await lunaRequest('luna://com.webos.service.tv.systemproperty', {
      method: 'getSystemInfo',
      parameters: {keys: ['sdkVersion']}
    });
    cachedSdkVersion = parseSdkVersion(res.sdkVersion);
  } catch (err) {
    cachedSdkVersion = 0;
  }

  return cachedSdkVersion;
}

/** webOS 6.x TVs (sdk 6) and later year-branded releases (sdk 9+). */
export function isModernWebOS(sdkVersion) {
  return sdkVersion >= 6;
}