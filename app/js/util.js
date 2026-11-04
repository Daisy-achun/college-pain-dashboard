/** Pure helpers (no app state) */
export const CONFC = {'高':'#16a34a','中':'#d97706','低':'#dc2626'};
export const STAGE_NONE = '未标注阶段';
export const fmt = n => Number(n).toLocaleString('en-US');
export const pct = (x, d=0) => (x*100).toFixed(d) + '%';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $ = s => document.querySelector(s);
export const short = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
export function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1800); }
export function chartOf(el){ return echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer:'canvas'}); }
export const yearOf = p => { const m = /(\d{4})/.exec(p.d||''); return m ? m[1] : '未知'; };
export const md = s => { const h = marked.parse(s || ''); return h.replace(/<a href=/g, '<a target="_blank" rel="noopener" href='); };
