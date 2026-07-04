import {normalizeBackgroundConfig, resolveBackgroundImages} from './backgrounds.js';
import {resolveLoungePaths} from './usb.js';

const PRESETS = {
  'warm-gradient': 'linear-gradient(135deg, #1a1028 0%, #3d1f2e 40%, #7a3b2e 100%)',
  'cool-gradient': 'linear-gradient(145deg, #0b1220 0%, #162447 50%, #1f4068 100%)',
  'midnight': 'linear-gradient(180deg, #050508 0%, #12121a 60%, #1c1c28 100%)',
  'ember': 'radial-gradient(ellipse at 30% 20%, #4a1942 0%, #1a0a14 50%, #080408 100%)'
};

export function createBackgroundController(elements, getConfig) {
  const layer = elements.backgroundLayer;
  const scrim = elements.scrim;
  let slideshowTimer = null;
  let slideshowIndex = 0;
  let slideshowImages = [];
  let usbBackgroundPath = '';

  function applyPreset(name) {
    const gradient = PRESETS[name] || PRESETS['warm-gradient'];
    layer.style.backgroundImage = gradient;
    layer.style.backgroundColor = '#0a0a0f';
    layer.classList.remove('has-image');
    layer.classList.remove('ken-burns');
  }

  function applyImage(url) {
    const config = getConfig();
    const bg = normalizeBackgroundConfig(config.background);

    layer.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
    layer.classList.add('has-image');

    if (bg.kenBurns) {
      layer.classList.add('ken-burns');
    } else {
      layer.classList.remove('ken-burns');
    }
  }

  function applyScrim() {
    const config = getConfig();
    const opacity = (config.background && config.background.overlayOpacity) || 0.45;
    scrim.style.opacity = String(opacity);
  }

  function clearSlideshow() {
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    }
  }

  function showSlideshowImage() {
    if (!slideshowImages.length) return;
    applyImage(slideshowImages[slideshowIndex % slideshowImages.length]);
    slideshowIndex += 1;
  }

  function startSlideshow(images, intervalSec) {
    slideshowImages = images;
    slideshowIndex = 0;
    showSlideshowImage();
    slideshowTimer = setInterval(showSlideshowImage, intervalSec * 1000);
  }

  async function refresh() {
    clearSlideshow();
    applyScrim();

    const config = getConfig();
    const bg = normalizeBackgroundConfig(config.background);

    if (bg.source === 'preset') {
      applyPreset(bg.preset || 'warm-gradient');
      return;
    }

    if (!usbBackgroundPath) {
      const paths = await resolveLoungePaths(config);
      usbBackgroundPath = paths.backgroundPath || '';
    }

    const images = await resolveBackgroundImages(config, usbBackgroundPath);

    if (!images.length) {
      applyPreset(bg.preset || 'warm-gradient');
      return;
    }

    if (bg.mode === 'slideshow' && images.length > 1) {
      startSlideshow(images, bg.slideshowIntervalSec || 300);
      return;
    }

    applyImage(images[0]);
  }

  return {
    refresh: refresh,
    destroy: clearSlideshow
  };
}