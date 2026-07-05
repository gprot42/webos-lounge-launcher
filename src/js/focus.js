import {REMOTE_KEY} from './remote.js';

const ROW_TOLERANCE = 72;
const COL_TOLERANCE = 88;
const MIN_PRIMARY_DELTA = 18;
const POINTER_AXIS_THRESHOLD = 28;
const POINTER_AXIS_RATIO = 1.6;

function focusRow(el) {
  if (!el) return '';
  if (el.closest('#input-row')) return 'inputs';
  if (el.closest('#app-grid')) return 'apps';
  if (el.closest('#music-bar')) return 'music';
  if (el.closest('#settings-panel')) return 'settings';
  return 'other';
}

export function createFocusManager(root, handlers) {
  let items = [];
  let pointerAxis = null;
  let pointerAccumDx = 0;
  let pointerAccumDy = 0;
  let lastPointerX = null;
  let lastPointerY = null;

  function collect() {
    items = Array.from(root.querySelectorAll('.focusable:not([disabled])'));
    items.sort(function (a, b) {
      return Number(a.dataset.focusIndex || 0) - Number(b.dataset.focusIndex || 0);
    });
  }

  function scrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth + 1) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // Older webOS Chromium builds ignore scrollIntoView({inline}), so the app
  // row never scrolls horizontally. Manually keep the focused tile inside the
  // scroll container's viewport by adjusting scrollLeft.
  function ensureHorizontallyVisible(el) {
    const container = scrollableAncestor(el);
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const margin = 24;
    if (eRect.left < cRect.left + margin) {
      container.scrollLeft -= (cRect.left + margin) - eRect.left;
    } else if (eRect.right > cRect.right - margin) {
      container.scrollLeft += eRect.right - (cRect.right - margin);
    }
  }

  function focusItem(el) {
    if (!el) return;
    el.focus();
    ensureHorizontallyVisible(el);
    if (el.scrollIntoView) {
      try {
        el.scrollIntoView({block: 'nearest', inline: 'nearest'});
      } catch (err) {
        el.scrollIntoView(false);
      }
    }
    el.classList.add('focused');
    items.forEach(function (item) {
      if (item !== el) item.classList.remove('focused');
    });
  }

  function resetPointerAxis() {
    pointerAxis = null;
    pointerAccumDx = 0;
    pointerAccumDy = 0;
    lastPointerX = null;
    lastPointerY = null;
  }

  function updatePointerAxis(dx, dy) {
    pointerAccumDx += dx;
    pointerAccumDy += dy;

    const total = Math.abs(pointerAccumDx) + Math.abs(pointerAccumDy);
    if (total < POINTER_AXIS_THRESHOLD) return;

    if (Math.abs(pointerAccumDx) > Math.abs(pointerAccumDy) * POINTER_AXIS_RATIO) {
      pointerAxis = 'horizontal';
    } else if (Math.abs(pointerAccumDy) > Math.abs(pointerAccumDx) * POINTER_AXIS_RATIO) {
      pointerAxis = 'vertical';
    } else {
      pointerAxis = null;
    }

    pointerAccumDx = 0;
    pointerAccumDy = 0;
  }

  function shouldIgnorePointerTarget(target) {
    const active = document.activeElement;
    if (!active || !target || active === target) return false;
    if (!active.classList.contains('focusable')) return false;
    if (pointerAxis !== 'horizontal') return false;
    return focusRow(active) !== focusRow(target);
  }

  function onPointerMove(event) {
    if (event.clientX == null || event.clientY == null) return;

    if (lastPointerX != null) {
      updatePointerAxis(event.clientX - lastPointerX, event.clientY - lastPointerY);
    }
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    const target = event.target && event.target.closest
      ? event.target.closest('.focusable:not([disabled])')
      : null;
    if (!target) return;
    if (target.dataset && target.dataset.pointerFocus === 'off') return;
    if (shouldIgnorePointerTarget(target)) return;
    focusItem(target);
  }

  function moveSequential(active, delta) {
    const scoped = items.filter(function (item) {
      return focusRow(item) === 'settings';
    });
    const idx = scoped.indexOf(active);
    if (idx < 0) return false;
    const next = scoped[idx + delta];
    if (!next) return true;
    focusItem(next);
    return true;
  }

  function adjustValueControl(el, dir) {
    if (!el) return false;
    const tag = el.tagName;

    if (el.classList && el.classList.contains('option-stepper') && typeof el.__step === 'function') {
      el.__step(dir);
      return true;
    }

    if (tag === 'SELECT') {
      const count = el.options.length;
      if (!count) return false;
      let next = el.selectedIndex + dir;
      if (next < 0) next = 0;
      if (next > count - 1) next = count - 1;
      if (next !== el.selectedIndex) {
        el.selectedIndex = next;
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      return true;
    }

    if (tag === 'INPUT' && el.type === 'range') {
      const step = Number(el.step) || 1;
      const min = el.min !== '' ? Number(el.min) : 0;
      const max = el.max !== '' ? Number(el.max) : 100;
      let next = Number(el.value) + dir * step;
      if (next < min) next = min;
      if (next > max) next = max;
      if (next !== Number(el.value)) {
        el.value = String(next);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      return true;
    }

    return false;
  }

  // Move to the previous/next focusable in the same row by index order.
  // Spatial navigation fails when tiles overlap or share an x-position (e.g. a
  // wrapped/stacked dock), so horizontal dock movement falls back to this.
  // Returns false when there is no same-row neighbour (row edge) so the caller
  // can continue across rows via moveByGlobalIndex.
  function moveByIndexInRow(active, delta) {
    const row = focusRow(active);
    const scoped = items.filter(function (item) {
      return focusRow(item) === row;
    });
    const idx = scoped.indexOf(active);
    if (idx < 0) return false;
    const next = scoped[idx + delta];
    if (!next) return false; // at the row edge; let the caller cross rows
    focusItem(next);
    return true;
  }

  // Final horizontal fallback: walk every focusable (except the settings
  // overlay) in focus-index order. This guarantees left/right always advances
  // through the launcher -- app grid, inputs, top-bar and music controls -- so
  // focus can never dead-end at a row boundary (the "can't scroll after
  // launching an app" freeze).
  function moveByGlobalIndex(active, delta) {
    const scoped = items.filter(function (item) {
      return focusRow(item) !== 'settings';
    });
    const idx = scoped.indexOf(active);
    if (idx < 0) return false;
    const next = scoped[idx + delta];
    if (!next) return false; // true first/last item
    focusItem(next);
    return true;
  }

  function moveDirection(keyCode) {
    collect();
    const nav = (typeof window !== 'undefined') ? (window.__NAV = window.__NAV || {}) : {};
    const dirName = keyCode === REMOTE_KEY.LEFT ? 'L'
      : keyCode === REMOTE_KEY.RIGHT ? 'R'
      : keyCode === REMOTE_KEY.UP ? 'U'
      : keyCode === REMOTE_KEY.DOWN ? 'D' : '?';
    if (!items.length) { nav.last = dirName + ' noItems'; return; }

    resetPointerAxis();

    const active = document.activeElement;
    const fromIdx = items.indexOf(active);
    if (!active || fromIdx < 0) {
      nav.last = dirName + ' reset from=' + fromIdx + ' n=' + items.length;
      focusItem(items[0]);
      return;
    }
    nav.last = dirName + ' from=' + fromIdx + '/' + items.length + ' row=' + focusRow(active);

    const isHorizontal = keyCode === REMOTE_KEY.LEFT || keyCode === REMOTE_KEY.RIGHT;
    const isVertical = keyCode === REMOTE_KEY.UP || keyCode === REMOTE_KEY.DOWN;

    if (isHorizontal && focusRow(active) === 'settings' && adjustValueControl(active, keyCode === REMOTE_KEY.RIGHT ? 1 : -1)) {
      return;
    }

    if (isVertical && focusRow(active) === 'settings') {
      if (moveSequential(active, keyCode === REMOTE_KEY.DOWN ? 1 : -1)) return;
    }

    const rect = active.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let best = null;
    let bestScore = Infinity;

    items.forEach(function (item) {
      if (item === active) return;
      const r = item.getBoundingClientRect();
      const ix = r.left + r.width / 2;
      const iy = r.top + r.height / 2;
      const dx = ix - cx;
      const dy = iy - cy;

      if (keyCode === REMOTE_KEY.LEFT && dx >= -10) return;
      if (keyCode === REMOTE_KEY.RIGHT && dx <= 10) return;
      if (keyCode === REMOTE_KEY.UP && dy >= -10) return;
      if (keyCode === REMOTE_KEY.DOWN && dy <= 10) return;

      if (isHorizontal) {
        if (Math.abs(dy) > ROW_TOLERANCE) return;
        if (Math.abs(dx) < MIN_PRIMARY_DELTA) return;
      }

      if (isVertical) {
        if (Math.abs(dx) > COL_TOLERANCE) return;
        if (Math.abs(dy) < MIN_PRIMARY_DELTA) return;
      }

      const primary = isHorizontal ? Math.abs(dx) : Math.abs(dy);
      const secondary = isHorizontal ? Math.abs(dy) : Math.abs(dx);
      const score = primary * 100 + secondary;

      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (best) {
      nav.last += ' spatial->' + items.indexOf(best);
      focusItem(best);
      return;
    }

    // Spatial search found nothing (overlapping/stacked tiles, or an edge of a
    // row). Fall back to index-order movement: same row first, then across all
    // rows, so left/right always advances through the launcher instead of
    // dead-ending at a row boundary.
    if (isHorizontal) {
      const row = focusRow(active);
      if (row !== 'settings') {
        const delta = keyCode === REMOTE_KEY.RIGHT ? 1 : -1;
        if (moveByIndexInRow(active, delta)) {
          nav.last += ' rowIdx->' + items.indexOf(document.activeElement);
        } else if (moveByGlobalIndex(active, delta)) {
          nav.last += ' global->' + items.indexOf(document.activeElement);
        } else {
          nav.last += ' edge(noMove)';
        }
      } else {
        nav.last += ' settingsRow(noMove)';
      }
    } else {
      nav.last += ' vertNoBest';
    }
  }

  function onKeyDown(event) {
    let code = event.keyCode;
    resetPointerAxis();

    if (typeof window !== 'undefined') {
      window.__NAV = window.__NAV || {};
      window.__NAV.kd = (window.__NAV.kd || 0) + 1;
      window.__NAV.rawCode = event.keyCode + '/' + (event.key || '-');
    }

    // Physical USB/Bluetooth keyboards can report different keyCodes than the
    // TV remote; normalize via event.key so keyboard navigation works too.
    if (event.key) {
      const active = document.activeElement;
      const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
      const keyMap = {
        ArrowLeft: REMOTE_KEY.LEFT,
        ArrowUp: REMOTE_KEY.UP,
        ArrowRight: REMOTE_KEY.RIGHT,
        ArrowDown: REMOTE_KEY.DOWN,
        Enter: REMOTE_KEY.ENTER,
        Escape: REMOTE_KEY.BACK,
        GoBack: REMOTE_KEY.BACK
      };
      if (!typing) {
        keyMap.Backspace = REMOTE_KEY.BACK;
      }
      if (keyMap[event.key] !== undefined) {
        code = keyMap[event.key];
      }
    }

    if (code === REMOTE_KEY.BACK) {
      if (handlers && handlers.onBack) {
        event.preventDefault();
        handlers.onBack();
      }
      return;
    }

    if (code === REMOTE_KEY.RED) {
      if (handlers && handlers.onRed) {
        event.preventDefault();
        handlers.onRed();
      }
      return;
    }

    if (code === REMOTE_KEY.GREEN) {
      if (handlers && handlers.onGreen) {
        event.preventDefault();
        handlers.onGreen();
      }
      return;
    }

    if (code === REMOTE_KEY.VOLUME_UP) {
      if (handlers && handlers.onVolumeUp) {
        event.preventDefault();
        handlers.onVolumeUp();
      }
      return;
    }

    if (code === REMOTE_KEY.VOLUME_DOWN) {
      if (handlers && handlers.onVolumeDown) {
        event.preventDefault();
        handlers.onVolumeDown();
      }
      return;
    }

    if (code === REMOTE_KEY.VOLUME_MUTE) {
      if (handlers && handlers.onVolumeMute) {
        event.preventDefault();
        handlers.onVolumeMute();
      }
      return;
    }

    if (code === REMOTE_KEY.LEFT || code === REMOTE_KEY.RIGHT
      || code === REMOTE_KEY.UP || code === REMOTE_KEY.DOWN) {
      event.preventDefault();
      try {
        moveDirection(code);
      } catch (err) {
        if (typeof window !== 'undefined') {
          window.__NAV = window.__NAV || {};
          window.__NAV.last = 'ERR ' + (err && err.message ? err.message : err);
        }
      }
      return;
    }
    if (code === REMOTE_KEY.ENTER) {
      const active = document.activeElement;
      if (active && active.classList.contains('focusable')) {
        event.preventDefault();
        active.click();
      }
    }
  }

  document.addEventListener('keydown', onKeyDown);
  root.addEventListener('mousemove', onPointerMove);

  return {
    refresh: function () {
      collect();
      if (items.length) focusItem(items[0]);
    },
    destroy: function () {
      document.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('mousemove', onPointerMove);
    }
  };
}