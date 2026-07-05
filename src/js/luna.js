function hasWebOS() {
  return typeof window !== 'undefined' && window.webOS && window.webOS.service;
}

export function lunaRequest(uri, options) {
  const method = options.method;
  const parameters = options.parameters || {};

  return new Promise(function (resolve, reject) {
    if (!hasWebOS()) {
      reject(new Error('webOS Luna bus unavailable'));
      return;
    }

    window.webOS.service.request(uri, {
      method: method,
      parameters: parameters,
      onSuccess: function (res) {
        if (res && res.returnValue === false) {
          reject(new Error(res.errorText || 'Luna call failed'));
          return;
        }
        resolve(res || {});
      },
      onFailure: function (err) {
        reject(err || new Error('Luna call failed'));
      }
    });
  });
}

function tryLunaRequest(uri, options) {
  return lunaRequest(uri, options).catch(function () {
    return null;
  });
}

/**
 * Some applicationManager list methods only return data through a subscription
 * on retail webOS. Open a subscribe request, resolve on the first payload, then
 * cancel so we behave like a one-shot call.
 */
function lunaSubscribeOnce(uri, options) {
  const method = options.method;
  const parameters = Object.assign({subscribe: true}, options.parameters || {});

  return new Promise(function (resolve, reject) {
    if (!hasWebOS()) {
      reject(new Error('webOS Luna bus unavailable'));
      return;
    }

    let settled = false;
    let handle = null;

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      if (handle && typeof handle.cancel === 'function') {
        try { handle.cancel(); } catch (err) { /* ignore */ }
      }
      fn(value);
    }

    handle = window.webOS.service.request(uri, {
      method: method,
      parameters: parameters,
      onSuccess: function (res) {
        if (res && res.returnValue === false) {
          finish(reject, new Error(res.errorText || 'Luna call failed'));
          return;
        }
        finish(resolve, res || {});
      },
      onFailure: function (err) {
        finish(reject, err || new Error('Luna call failed'));
      }
    });
  });
}

export function launchApp(id) {
  return lunaRequest('luna://com.webos.applicationManager', {
    method: 'launch',
    parameters: {id: id, params: {}}
  });
}

export function getAppInfo(id) {
  return lunaRequest('luna://com.webos.applicationManager', {
    method: 'getAppInfo',
    parameters: {id: id}
  });
}

function normalizeListedApps(res) {
  if (!res) return {apps: []};

  if (Array.isArray(res.apps) && res.apps.length) {
    return {apps: res.apps};
  }

  if (Array.isArray(res.launchPoints)) {
    return {
      apps: res.launchPoints.map(function (point) {
        return {
          id: point.id,
          appInfo: point
        };
      })
    };
  }

  return {apps: []};
}

export function listApps() {
  return lunaSubscribeOnce('luna://com.webos.applicationManager', {
    method: 'listLaunchPoints',
    parameters: {}
  }).then(normalizeListedApps).then(function (result) {
    if (result.apps && result.apps.length) return result;
    return lunaRequest('luna://com.webos.applicationManager', {
      method: 'listApps',
      parameters: {}
    }).then(normalizeListedApps);
  }).catch(function () {
    return lunaRequest('luna://com.webos.applicationManager', {
      method: 'listApps',
      parameters: {}
    }).then(normalizeListedApps).catch(function () {
      return {apps: []};
    });
  });
}

export function getForegroundApp() {
  return lunaRequest('luna://com.webos.applicationManager', {
    method: 'getForegroundApp',
    parameters: {}
  }).catch(function () {
    return lunaRequest('luna://com.webos.applicationManager', {
      method: 'getForegroundAppInfo',
      parameters: {}
    });
  });
}

export function getAllInputStatus() {
  return lunaRequest('luna://com.webos.service.eim', {
    method: 'getAllInputStatus',
    parameters: {subscribe: false}
  });
}

export function getInputStatus(inputId) {
  return lunaRequest('luna://com.webos.service.eim', {
    method: 'getInputStatus',
    parameters: {id: inputId}
  });
}

function switchInputViaApiAdapter(inputId) {
  return lunaRequest('luna://com.webos.service.apiadapter/tv', {
    method: 'switchInput',
    parameters: {inputId: inputId}
  });
}

function switchInputViaEim(inputId) {
  return getInputStatus(inputId).then(function (status) {
    if (status && status.appId) {
      return launchApp(status.appId);
    }
    throw new Error('Input has no launchable app');
  });
}

function switchInputViaExtinputs(inputId) {
  const hdmiMatch = inputId.match(/^HDMI_(\d+)$/i);
  if (!hdmiMatch) {
    return Promise.reject(new Error('extinputs only supports HDMI inputs'));
  }

  const mediaId = hdmiMatch[1];

  return lunaRequest('luna://com.webos.service.utp.extinputs', {
    method: 'open',
    parameters: {
      inputSourceType: 'HDMI',
      options: {mediaId: mediaId}
    }
  }).catch(function () {
    return lunaRequest('luna://com.webos.service.utp.extinputs', {
      method: 'open',
      parameters: {
        inputSourceType: 'HDMI',
        inputSource: 'HDMI_' + mediaId
      }
    });
  });
}

export function switchInput(inputId, device) {
  if (device && device.appId) {
    return launchApp(device.appId).catch(function () {
      return switchInputViaApiAdapter(inputId)
        .catch(function () { return switchInputViaEim(inputId); })
        .catch(function () { return switchInputViaExtinputs(inputId); });
    });
  }

  return switchInputViaApiAdapter(inputId)
    .catch(function () { return switchInputViaEim(inputId); })
    .catch(function () { return switchInputViaExtinputs(inputId); });
}

export function getStorageDevices() {
  return lunaRequest('luna://com.webos.service.pdm', {
    method: 'getAttachedStorageDeviceList',
    parameters: {subscribe: false}
  }).catch(function () {
    return tryLunaRequest('luna://com.webos.service.pdm', {
      method: 'getDeviceList',
      parameters: {subscribe: false}
    });
  });
}

/**
 * Subscribe to TV system volume changes. On webOS the physical remote volume
 * keys are handled by the platform, so we listen for volume updates and mirror
 * them on the on-screen bar. Returns an unsubscribe function.
 */
export function subscribeVolume(onChange) {
  if (!hasWebOS() || typeof onChange !== 'function') {
    return function () {};
  }

  function extractVolume(res) {
    if (!res) return null;
    if (res.volume && typeof res.volume.volume === 'number') return res.volume.volume;
    if (res.volumeStatus && typeof res.volumeStatus.volume === 'number') return res.volumeStatus.volume;
    if (typeof res.volume === 'number') return res.volume;
    return null;
  }

  function extractMuted(res) {
    if (!res) return false;
    if (res.volume && typeof res.volume.muted === 'boolean') return res.volume.muted;
    if (res.volumeStatus && typeof res.volumeStatus.muteStatus === 'boolean') return res.volumeStatus.muteStatus;
    if (typeof res.muted === 'boolean') return res.muted;
    return false;
  }

  function requestOn(uri) {
    try {
      return window.webOS.service.request(uri, {
        method: 'getVolume',
        parameters: {subscribe: true},
        onSuccess: function (res) {
          const volume = extractVolume(res);
          if (volume !== null) onChange(volume, extractMuted(res));
        },
        onFailure: function () {}
      });
    } catch (err) {
      return null;
    }
  }

  const handle = requestOn('luna://com.webos.audio') || requestOn('luna://com.webos.service.audio');

  return function () {
    if (handle && typeof handle.cancel === 'function') {
      handle.cancel();
    }
  };
}