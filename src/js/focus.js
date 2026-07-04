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

  function focusItem(el) {
    if (!el) return;
    el.focus();
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

  function moveDirection(keyCode) {
    collect();
    if (!items.length) return;

    resetPointerAxis();

    const active = document.activeElement;
    if (!active || items.indexOf(active) < 0) {
      focusItem(items[0]);
      return;
    }

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

    if (best) focusItem(best);
  }

  function onKeyDown(event) {
    const code = event.keyCode;
    resetPointerAxis();

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

    if (code === REMOTE_KEY.LEFT) {
      event.preventDefault();
      moveDirection(REMOTE_KEY.LEFT);
      return;
    }
    if (code === REMOTE_KEY.RIGHT) {
      event.preventDefault();
      moveDirection(REMOTE_KEY.RIGHT);
      return;
    }
    if (code === REMOTE_KEY.UP) {
      event.preventDefault();
      moveDirection(REMOTE_KEY.UP);
      return;
    }
    if (code === REMOTE_KEY.DOWN) {
      event.preventDefault();
      moveDirection(REMOTE_KEY.DOWN);
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