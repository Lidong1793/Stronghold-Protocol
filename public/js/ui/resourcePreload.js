import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from './components.js';
import { GAME_FILES } from './gameComponents.js';
import { DATA_FILES } from '../data.js';
import { createResourcePreloader } from '../resourcePreload.js';
import { t } from '../../../shared/i18n.js';
import { APP_VERSION } from '../../../shared/constants.js';

const preloader = createResourcePreloader({ version: APP_VERSION, dataFiles: GAME_FILES.map((name) => DATA_FILES[name] || `${name}.json`) });

/** Title-only control; leaving the title aborts network work but retains confirmed downloads for this page. */
export function ResourcePreload() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(preloader.getState);
  const toggle = useRef(null);
  const close = () => { setOpen(false); toggle.current?.querySelector('.resource-preload__toggle')?.focus(); };
  useEffect(() => {
    setState(preloader.getState());
    const off = preloader.subscribe(setState);
    preloader.restore();
    return () => { off(); preloader.pause(); };
  }, []);
  const busy = ['running', 'preparing', 'pausing', 'checking'].includes(state.status);
  const complete = ['saved', 'done'].includes(state.status);
  const percent = state.total ? Math.floor(state.completed / state.total * 100) : 0;
  const statusText = state.status === 'checking' ? t('正在检查资源版本')
    : state.status === 'saved' ? t('已预载（上次完成记录）')
      : state.status === 'outdated' ? t('资源已更新，请重新预载')
        : state.status === 'preparing' ? t('正在读取资源清单')
    : state.status === 'pausing' ? t('正在暂停预载')
      : state.status === 'running' ? t('正在预载资源')
      : state.status === 'paused' ? t('预载已暂停')
        : state.status === 'done' ? t('资源预载完成')
          : state.status === 'error' ? (state.error === 'manifest' ? t('资源清单读取失败，请重试')
            : state.error === 'unavailable' ? t('服务器资源不可用，请联系服主') : t('部分资源加载失败，可重试'))
            : t('提前加载模型、贴图、音频与特效，减少首次游戏等待。');
  return html`<div class="resource-preload" ref=${toggle} onKeyDown=${(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
    ${open ? html`<section id="resource-preload-panel" class="resource-preload__panel" aria-labelledby="resource-preload-title">
      <header class="resource-preload__head">
        <div><${MicroLabel} tone="mint">RESOURCE PRELOAD<//><h2 id="resource-preload-title">${t('资源预载')}</h2></div>
        <${Button} variant="ghost" size="sm" square=${true} icon="close" aria-label=${t('收起资源预载')}
          onClick=${close} />
      </header>
      <p class=${`resource-preload__status${state.status === 'error' ? ' is-error' : ''}`} role="status">${statusText}</p>
      ${state.total ? html`<div class="resource-preload__counts"><span>${t('已完成 {done} / {total}', { done: state.completed, total: state.total })}</span><b class="num">${percent}%</b></div>
        <progress max=${state.total} value=${state.completed} aria-label=${t('资源预载进度')}></progress>
        <div class="resource-preload__counts"><span>${t('已处理 {size} MiB', { size: (state.bytes / 1048576).toFixed(1) })}</span>
          ${state.failed ? html`<span>${t('{n} 项失败', { n: state.failed })}</span>` : null}</div>` : null}
      <p class="resource-preload__hint">${t('首次完整预载约需 700 MB，建议使用 Wi-Fi。已有缓存会自动复用；缓存被清理或回收后需重新预载。')}</p>
      ${complete && !state.persistenceFailed ? html`<p class="resource-preload__hint">${t('完成记录已保存；若缓存被清理，可检查并补齐。')}</p>` : null}
      ${state.persistenceFailed ? html`<p class="resource-preload__status is-error">${t('浏览器无法保存预载记录，关闭页面后需重新检查。')}</p>` : null}
      <p class="resource-preload__hint">${t('进入大厅时自动暂停，可稍后回首页继续。')}</p>
      ${busy ? html`<${Button} block=${true} size="sm" disabled=${state.status === 'pausing'} onClick=${() => preloader.pause()}>${t('暂停预载')}<//>`
        : html`<${Button} block=${true} size="sm" variant="primary" onClick=${() => preloader.start()}>
          ${complete ? t('检查并补齐') : state.status === 'outdated' ? t('重新预载') : state.status === 'paused' ? t('继续预载') : state.status === 'error' ? t('重试预载') : t('开始预载')}<//>`}
    </section>` : null}
    <${Button} variant="ghost" size="sm" class="resource-preload__toggle" aria-expanded=${open} aria-controls="resource-preload-panel"
      onClick=${() => setOpen(!open)}>
      <${Icon} name=${complete ? 'check' : 'refresh'} />${complete ? t('资源已预载') : t('资源预载')}
      ${state.total && state.status !== 'idle' ? html`<span class="num">${percent}%</span>` : null}
    <//>
  </div>`;
}
