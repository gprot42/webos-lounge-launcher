export const REMOTE_KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  BACK: 461,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  VOLUME_UP: 447,
  VOLUME_DOWN: 448,
  VOLUME_MUTE: 449
};

export const HOME_APP_IDS = [
  'com.webos.app.home',
  'com.webos.app.launcher',
  'com.webos.app.homeupdater',
  'com.webos.app.dashboard',
  'com.palm.app.home',
  'com.webos.app.homelauncher',
  'com.webos.app.gamehome',
  'com.webos.app.seniorhome'
];

export function isHomeApp(appId) {
  if (!appId) return false;
  return HOME_APP_IDS.indexOf(appId) >= 0;
}