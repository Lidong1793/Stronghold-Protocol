// public/js/render/app/pixi.js — load PIXI and pixi-spine once (one module-level promise).

import { installPixiNoEval } from './pixiNoEval.js';
import { assetFetch, isImportedAssetUrl, loadAssetImage } from '../../importedAssets.js';

const VENDOR = { pixi: '/vendor/pixi.min.js', spine: '/vendor/pixi-spine.js' };

let pixiPromise = null;
let installedAdapter = null;

function installImportedAssetAdapter(PIXI) {
  if (!PIXI?.settings?.ADAPTER || installedAdapter === PIXI) return;
  PIXI.settings.ADAPTER.fetch = assetFetch;
  // Pixi's worker bitmap loader fetches by itself, outside ADAPTER.fetch.
  PIXI.Assets?.setPreferences?.({ preferWorkers: false, preferCreateImageBitmap: true });
  if (typeof createImageBitmap !== 'function' && PIXI.extensions?.add && PIXI.ExtensionType?.LoadParser) {
    PIXI.extensions.add({
      name: 'importedAssetTextures',
      extension: { type: PIXI.ExtensionType.LoadParser, priority: 101 },
      test: (url) => isImportedAssetUrl(url) && /\.(?:png|jpe?g|webp)$/i.test(new URL(url, location.href).pathname),
      async load(url, asset) {
        const img = await loadAssetImage(url);
        if (!img) throw new Error(`image failed: ${url}`);
        const base = new PIXI.BaseTexture(img, { ...asset?.data, resolution: asset?.data?.resolution ?? PIXI.utils.getResolutionOfUrl(url) });
        base.resource.src = url;
        return new PIXI.Texture(base);
      },
      unload: (texture) => texture.destroy(true),
    });
  }
  installedAdapter = PIXI;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Make sure PIXI and PIXI.spine exist (classic scripts; loaded once). */
export function ensurePixi() {
  if (globalThis.PIXI && globalThis.PIXI.spine) {
    installPixiNoEval(globalThis.PIXI);
    installImportedAssetAdapter(globalThis.PIXI);
    return Promise.resolve(globalThis.PIXI);
  }
  if (!pixiPromise) {
    pixiPromise = (async () => {
      if (!globalThis.PIXI) await loadScript(VENDOR.pixi);
      installPixiNoEval(globalThis.PIXI);
      if (!globalThis.PIXI?.spine) await loadScript(VENDOR.spine);
      if (!globalThis.PIXI || !globalThis.PIXI.spine) throw new Error('PIXI / pixi-spine unavailable');
      installImportedAssetAdapter(globalThis.PIXI);
      return globalThis.PIXI;
    })();
    pixiPromise.catch(() => { pixiPromise = null; });
  }
  return pixiPromise;
}
