// Temporary on-screen diagnostic overlay.
//
// Purpose: when the launcher appears "frozen" after returning from another app,
// this HUD tells us *which* failure mode we're in without needing SSH/logs:
//
//   - HEARTBEAT stops counting        -> the JS main thread is blocked.
//   - HEARTBEAT counts, KEY/PTR stale -> input never reaches the webview
//                                        (another app is holding input focus).
//   - KEY updates but focus unchanged -> a focus/navigation bug in the page.
//
// It listens in the capture phase so it records every event even if a later
// handler stops propagation or returns early. Remove once the freeze is fixed.

export function createDebugHud() {
  const el = document.createElement('div');
  el.id = 'debug-hud';
  el.style.cssText = [
    'position:fixed',
    'left:12px',
    'bottom:12px',
    'z-index:99999',
    'font:12px/1.4 monospace',
    'color:#0f0',
    'background:rgba(0,0,0,0.72)',
    'padding:8px 10px',
    'border:1px solid #0a0',
    'border-radius:6px',
    'white-space:pre',
    'pointer-events:none',
    'max-width:60vw'
  ].join(';');
  document.body.appendChild(el);

  const state = {
    beats: 0,
    lastKeyCode: '-',
    lastKeyAt: 0,
    lastKeyName: '-',
    lastPtrAt: 0,
    lastClickAt: 0,
    lastClickTarget: '-',
    fgApp: '-',
    fgAt: 0
  };

  function ago(ts) {
    if (!ts) return 'never';
    return Math.round((Date.now() - ts) / 100) / 10 + 's';
  }

  function describe(node) {
    if (!node || !node.tagName) return String(node);
    let out = node.tagName.toLowerCase();
    if (node.id) out += '#' + node.id;
    if (node.className && typeof node.className === 'string') {
      out += '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    return out.slice(0, 40);
  }

  document.addEventListener('keydown', function (e) {
    state.lastKeyCode = e.keyCode;
    state.lastKeyName = e.key || '-';
    state.lastKeyAt = Date.now();
  }, true);

  document.addEventListener('mousemove', function () {
    state.lastPtrAt = Date.now();
  }, true);

  document.addEventListener('click', function (e) {
    state.lastClickAt = Date.now();
    state.lastClickTarget = describe(e.target);
  }, true);

  function render() {
    state.beats += 1;
    const lines = [
      'HUD beat=' + state.beats,
      'vis=' + document.visibilityState + ' hidden=' + document.hidden,
      'active=' + describe(document.activeElement),
      'key=' + state.lastKeyCode + '/' + state.lastKeyName + ' (' + ago(state.lastKeyAt) + ' ago)',
      'ptr=' + ago(state.lastPtrAt) + ' ago',
      'click=' + state.lastClickTarget + ' (' + ago(state.lastClickAt) + ' ago)',
      'fgApp=' + state.fgApp + ' (' + ago(state.fgAt) + ' ago)'
    ];
    el.textContent = lines.join('\n');
  }

  setInterval(render, 500);
  render();

  return {
    setForeground: function (appId) {
      state.fgApp = appId || '(none)';
      state.fgAt = Date.now();
    }
  };
}
