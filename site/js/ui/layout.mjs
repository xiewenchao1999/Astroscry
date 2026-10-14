// layout.mjs — 顶栏 + 页脚注入（每页引入一次）

// 导航链接需按当前页面位置生成前缀：根目录 index.html 上要用 pages/ 前缀，pages/ 下则不用
const atRoot = /\/index\.html$/.test(location.pathname) || location.pathname.endsWith('/');
const P = atRoot ? 'pages/' : '';     // pages 目录前缀
const R = atRoot ? '' : '../';        // 站点根前缀
export const SITE_ROOT = R;           // 共享组件（如出生信息卡）拼数据路径用，勿硬编码 ../
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NAV = [
  { href: R + 'index.html', text: '首页' },
  { href: P + 'horoscope.html', text: '每日星象' },
  { href: P + 'natal.html', text: '西方星盘' },
  { href: P + 'synastry.html', text: '合盘' },
  { href: P + 'tarot.html', text: '塔罗占卜' },
  { href: P + 'bazi.html', text: '八字排盘' },
  { href: P + 'ziwei.html', text: '紫微斗数' },
  { href: P + 'about.html', text: '关于' },
];

export function renderLayout() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <a class="brand" href="${R}index.html">星卜<small>Astroscry</small></a>
    <nav class="site-nav">${NAV.map((n) => `<a href="${n.href}" class="${page === n.href.split('/').pop() ? 'active' : ''}">${n.text}</a>`).join('')}</nav>`;
  document.body.prepend(header);

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div>星卜 Astroscry · 传统术数文化的算法呈现 · 全部计算在你的浏览器本地完成，生日数据不离开设备</div>
    <div class="note">结果仅供文化参考，不构成任何现实决策建议 · 数据来源与许可见 <a href="${P}about.html">关于页</a></div>`;
  document.body.append(footer);
}

/** 通用：加载站点 JSON 数据 */
export async function loadData(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`数据加载失败 ${path}: ${res.status}`);
  return res.json();
}

/** 通用：错误展示（消息一律转义，防注入） */
export function showError(el, msg) {
  el.innerHTML = `<div class="error-box">${esc(msg)}</div>`;
}
