// birth-profile.mjs — 出生信息：一次填写，全站共用（localStorage 本地保存，不离开浏览器）
// 组件：摘要条（已保存时）+ 内联表单（公历/农历切换、全点选式年月日与时分、性别、城市）
// 存储约定：profile.year/month/day 恒为公历；农历输入即时转换保存，同时保留 calendar/lunarText/ly/lm/ld 供表单回显
import { loadData, SITE_ROOT } from './layout.mjs';
import { lunarMonthsOf, lunarDaysOf, lunarToSolar, solarToLunar, solarDaysOf, hourToShiChen, lunarDayName } from '../core/calendar.mjs';

const KEY = 'astroscry.birth.v1';
let citiesCache = null;

function keyOf(opts) {
  return opts?.storageKey || KEY; // 合盘的「对方」用独立 storageKey 隔离
}

export function loadProfile(opts) {
  try { return JSON.parse(localStorage.getItem(keyOf(opts))); } catch { return null; }
}
export function saveProfile(p, opts) {
  localStorage.setItem(keyOf(opts), JSON.stringify(p));
  window.dispatchEvent(new CustomEvent('astroscry:profile-saved')); // 首页等监听方刷新派生视图
}
export function clearProfile(opts) {
  localStorage.removeItem(keyOf(opts));
  window.dispatchEvent(new CustomEvent('astroscry:profile-cleared'));
}

const pad = (n) => String(n).padStart(2, '0');
const yearRange = () => { const a = []; for (let y = 1900; y <= 2100; y++) a.push(y); return a; };

/**
 * 挂载出生信息卡片。
 * @param {HTMLElement} container
 * @param {object} opts { onChange(profile)?: 保存后回调; defaultExpanded?: 无保存时展开表单（默认 true）}
 * @returns {{ get: () => object|null }}
 */
export function mountBirthCard(container, opts = {}) {
  let profile = loadProfile(opts);
  let expanded = opts.defaultExpanded !== false && !profile;

  const state = {
    calendar: profile?.calendar === 'lunar' ? 'lunar' : 'solar',
    // 公历坐标（表单内随选择联动；农历模式下也同步换算，便于切换不丢日期）
    y: profile?.year ?? 2000, m: profile?.month ?? 1, d: profile?.day ?? 1,
    // 农历坐标（calendar==='lunar' 时使用）
    ly: profile?.ly ?? profile?.year ?? 2000, lm: profile?.lm ?? 1, ld: profile?.ld ?? 1,
    hour: profile?.hour ?? 12, minute: profile?.minute ?? 0,
    gender: profile?.gender ?? 'male',
    city: profile?.cityName ?? '北京',
  };

  async function render() {
    if (!citiesCache) citiesCache = (await loadData(SITE_ROOT + 'data/cities.json')).cities;

    if (profile && !expanded) {
      const p = profile;
      const when = p.calendar === 'lunar' && p.lunarText
        ? `${p.lunarText}（公历 ${p.year}-${pad(p.month)}-${pad(p.day)}）`
        : `${p.year}-${pad(p.month)}-${pad(p.day)}`;
      container.innerHTML = `
        <div class="birth-summary">
          <div><span class="src-tag">出生信息</span><b>${when} ${pad(p.hour)}:${pad(p.minute)}</b>
            <span class="pill">${p.gender === 'male' ? '男' : '女'}</span>
            ${p.cityName ? `<span class="pill">${p.cityName}</span>` : ''}
            <span class="hint">已本地保存，全站通用</span></div>
          <button class="btn ghost" id="bp-edit" type="button">修改</button>
        </div>`;
      container.querySelector('#bp-edit').addEventListener('click', () => { expanded = true; render(); });
      return;
    }

    container.innerHTML = `
      <form id="bp-form" class="panel" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">
        <div style="grid-column:1/-1;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
          <div class="seg-group" id="bp-cal">
            <button type="button" data-v="solar" class="${state.calendar === 'solar' ? 'active' : ''}">公历</button>
            <button type="button" data-v="lunar" class="${state.calendar === 'lunar' ? 'active' : ''}">农历</button>
          </div>
          <div class="seg-group" id="bp-gender">
            <button type="button" data-v="male" class="${state.gender === 'male' ? 'active' : ''}">男</button>
            <button type="button" data-v="female" class="${state.gender === 'female' ? 'active' : ''}">女</button>
          </div>
          <span class="hint" id="bp-hint">${state.calendar === 'lunar' ? '只记得农历生日？选农历输入即可' : ''}</span>
        </div>
        <div><label>年份</label><select id="bp-y"></select></div>
        <div><label>月份</label><select id="bp-m"></select></div>
        <div><label>日期</label><select id="bp-d"></select></div>
        <div><label>小时（含时辰）</label><select id="bp-h"></select></div>
        <div><label>分钟</label><select id="bp-min"></select></div>
        <div><label>出生城市（星盘与真太阳时需要）</label><select id="bp-city">
          ${citiesCache.map((c) => `<option value="${c.name}" ${c.name === state.city ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select></div>
        <div style="align-self:end;"><button class="btn" type="button" id="bp-save">保存出生信息</button></div>
      </form>`;

    const $ = (id) => container.querySelector(id);

    function rebuildDateSelects() {
      const selY = $('#bp-y'), selM = $('#bp-m'), selD = $('#bp-d');
      if (state.calendar === 'lunar') {
        selY.innerHTML = yearRange().map((y) => `<option value="${y}" ${y === state.ly ? 'selected' : ''}>${y}（农历）</option>`).join('');
        const months = lunarMonthsOf(state.ly);
        selM.innerHTML = months.map((m) => `<option value="${m.value}" ${m.value === state.lm ? 'selected' : ''}>${m.label}</option>`).join('');
        if (!months.some((m) => m.value === state.lm)) { state.lm = months[0].value; selM.value = String(state.lm); }
        const days = lunarDaysOf(state.ly, state.lm);
        if (state.ld > days) state.ld = days;
        selD.innerHTML = Array.from({ length: days }, (_, i) => `<option value="${i + 1}" ${i + 1 === state.ld ? 'selected' : ''}>${lunarDayName(i + 1)}</option>`).join('');
      } else {
        selY.innerHTML = yearRange().map((y) => `<option value="${y}" ${y === state.y ? 'selected' : ''}>${y}（公历）</option>`).join('');
        selM.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === state.m ? 'selected' : ''}>${i + 1} 月</option>`).join('');
        const days = solarDaysOf(state.y, state.m);
        if (state.d > days) state.d = days;
        selD.innerHTML = Array.from({ length: days }, (_, i) => `<option value="${i + 1}" ${i + 1 === state.d ? 'selected' : ''}>${i + 1} 日</option>`).join('');
      }
    }
    function rebuildTimeSelects() {
      $('#bp-h').innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === state.hour ? 'selected' : ''}>${pad(h)} 时（${hourToShiChen(h)}时）</option>`).join('');
      $('#bp-min').innerHTML = Array.from({ length: 12 }, (_, i) => i * 5).map((v) => `<option value="${v}" ${v === state.minute ? 'selected' : ''}>${pad(v)} 分</option>`).join('');
    }
    rebuildDateSelects();
    rebuildTimeSelects();

    $('#bp-cal').addEventListener('click', (e) => {
      const v = e.target?.dataset?.v;
      if (!v || v === state.calendar) return;
      // 切换日历时把当前日期换算过去，避免丢日期
      if (v === 'lunar') {
        const l = solarToLunar(state.y, state.m, state.d);
        state.ly = l.year; state.lm = l.month; state.ld = l.day;
      } else {
        const s = lunarToSolar(state.ly, state.lm, state.ld);
        state.y = s.year; state.m = s.month; state.d = s.day;
      }
      state.calendar = v;
      render();
    });
    $('#bp-gender').addEventListener('click', (e) => {
      const v = e.target?.dataset?.v;
      if (!v) return;
      state.gender = v;
      $('#bp-gender').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    });
    $('#bp-y').addEventListener('change', (e) => { state.calendar === 'lunar' ? state.ly = +e.target.value : state.y = +e.target.value; rebuildDateSelects(); });
    $('#bp-m').addEventListener('change', (e) => { state.calendar === 'lunar' ? state.lm = +e.target.value : state.m = +e.target.value; rebuildDateSelects(); });
    $('#bp-d').addEventListener('change', (e) => { state.calendar === 'lunar' ? state.ld = +e.target.value : state.d = +e.target.value; });
    $('#bp-h').addEventListener('change', (e) => { state.hour = +e.target.value; });
    $('#bp-min').addEventListener('change', (e) => { state.minute = +e.target.value; });
    $('#bp-city').addEventListener('change', (e) => { state.city = e.target.value; });

    $('#bp-save').addEventListener('click', () => {
      try {
        const city = citiesCache.find((c) => c.name === state.city) || citiesCache[0];
        let p;
        if (state.calendar === 'lunar') {
          const s = lunarToSolar(state.ly, state.lm, state.ld); // 非法农历日期会抛错
          const l = solarToLunar(s.year, s.month, s.day);
          p = { calendar: 'lunar', year: s.year, month: s.month, day: s.day, lunarText: l.text, ly: state.ly, lm: state.lm, ld: state.ld };
        } else {
          const l = solarToLunar(state.y, state.m, state.d);
          p = { calendar: 'solar', year: state.y, month: state.m, day: state.d, lunarText: l.text };
        }
        p.hour = state.hour; p.minute = state.minute; p.gender = state.gender;
        p.cityName = city.name; p.lat = city.lat; p.lon = city.lon; p.tz = city.tz;
        saveProfile(p, opts);
        profile = p; expanded = false;
        render();
        opts.onChange?.(profile);
      } catch (err) {
        $('#bp-hint').textContent = `保存失败：${err.message}`;
      }
    });
  }

  render();
  return {
    get: () => loadProfile(opts),
  };
}

/** 摘要文案（页面标题处展示用） */
export function profileSummary(p) {
  if (!p) return '';
  const when = p.calendar === 'lunar' && p.lunarText ? `${p.lunarText}` : `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return `${when} ${pad(p.hour)}:${pad(p.minute)} · ${p.gender === 'male' ? '男' : '女'} · ${p.cityName}`;
}
