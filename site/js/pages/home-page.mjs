// home-page.mjs — 首页：出生信息卡片（一次填写全站通用）+ 今日干支/月相摘要
import { renderLayout } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { stagger, revealCards } from '../ui/motion.mjs';

renderLayout();

mountBirthCard(document.getElementById('birth-card'));

const { Lunar, Solar } = globalThis;
const A = globalThis.Astronomy;
const now = new Date();
let ganZhi = '', lunarText = '';
try {
  const lunar = Solar.fromDate(now).getLunar();
  const ec = lunar.getEightChar();
  ganZhi = `${ec.getYear()}年 ${ec.getMonth()}月 ${ec.getDay()}日`;
  lunarText = `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
} catch { /* 首页摘要失败不阻塞 */ }

let moonText = '';
try {
  const angle = A.MoonPhase(A.MakeTime(now));
  const names = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
  moonText = `${names[Math.floor((angle + 22.5) / 45) % 8]}（月相角 ${angle.toFixed(0)}°）`;
} catch { /* 同上 */ }

document.getElementById('today').innerHTML = `
  <div class="kv" style="justify-content:space-around;text-align:center;">
    <div><span>今日干支</span><b>${ganZhi || '—'}</b></div>
    <div><span>农历</span><b>${lunarText || '—'}</b></div>
    <div><span>今日月相</span><b>${moonText || '—'}</b></div>
  </div>`;

// 内容就绪后再入场（先渲染后动画，避免动效作用在空盒子上）
document.querySelectorAll('.grid').forEach((g) => stagger(g, '.entry'));
revealCards(document.querySelector('.wrap'), '.card');
stagger(document.querySelector('.wrap'), '.entry');
