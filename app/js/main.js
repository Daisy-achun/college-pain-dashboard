import { initCore, initGlobal, recompute, showTab, RENDER, dirty } from './core.js';

function assetURL(rel) {
  // import.meta.url = .../js/main.js → 项目根
  return new URL(rel, new URL('../', import.meta.url));
}

async function loadData() {
  if (globalThis.__DASHBOARD__) return globalThis.__DASHBOARD__;
  const url = assetURL('data/dashboard.json');
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`无法加载 dashboard.json（${res.status}）\n${url.href}`);
  return res.json();
}

async function boot() {
  const status = document.getElementById('bootStatus');
  try {
    const data = await loadData();
    if (status) {
      status.textContent = '数据已加载，正在渲染…';
    }
    initCore(data);
    initGlobal();
    recompute();
    document.querySelectorAll('#tabs button').forEach(b => {
      b.onclick = () => showTab(b.dataset.tab);
    });
    Object.keys(RENDER).forEach(k => dirty.add(k));
    showTab('overview');
    if (status) {
      status.dataset.done = '1';
      status.remove();
    }
  } catch (err) {
    console.error(err);
    if (status) {
      status.dataset.err = '1';
      status.style.color = '#b91c1c';
      status.innerHTML = `加载失败：${err.message || err}<br><span style="color:#64748b;font-size:12px">请硬刷新；若在妙搭打开，确认资源路径含 app_id。</span>`;
    } else {
      document.body.insertAdjacentHTML('afterbegin',
        `<div style="padding:20px;color:#b91c1c;font-family:sans-serif">加载失败：${err.message}</div>`);
    }
    throw err;
  }
}

boot();
