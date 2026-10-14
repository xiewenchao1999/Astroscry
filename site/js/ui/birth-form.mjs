// birth-form.mjs — 可复用出生信息表单（八字/紫微/星盘共用）
import { loadData } from './layout.mjs';

let citiesCache = null;

/**
 * 渲染出生信息表单。
 * @param {HTMLElement} container
 * @param {object} opts { withGender:boolean=true, cityOptional:boolean=false }
 * @returns {Promise<() => object>} getValues()：{year,month,day,hour,minute,gender,lat,lon,tz,cityName}
 */
export async function renderBirthForm(container, opts = {}) {
  if (!citiesCache) citiesCache = (await loadData('../data/cities.json')).cities;
  const { withGender = true, cityOptional = false } = opts;
  const cityOptions = citiesCache.map((c) => `<option value="${c.name}" ${c.name === '北京' ? 'selected' : ''}>${c.name}</option>`).join('');
  container.innerHTML = `
    <form class="panel" id="bf">
      <div><label>出生日期</label><input type="date" name="date" value="2000-01-01" required min="1900-01-01" max="2100-12-31"></div>
      <div><label>出生时间（24 小时制）</label><input type="time" name="time" value="12:00" required></div>
      ${withGender ? `<div><label>性别（影响大运顺逆 / 男女命）</label><select name="gender"><option value="male">男</option><option value="female">女</option></select></div>` : ''}
      ${cityOptional ? `<div><label>出生城市（用于宫位与真太阳时）</label><select name="city">${cityOptions}</select></div>` : ''}
    </form>`;
  return function getValues() {
    const f = container.querySelector('#bf');
    const [y, m, d] = f.date.value.split('-').map(Number);
    const [hh, mm] = (f.time.value || '12:00').split(':').map(Number);
    const city = f.city ? citiesCache.find((c) => c.name === f.city.value) : null;
    return {
      year: y, month: m, day: d, hour: hh, minute: mm || 0,
      gender: f.gender ? f.gender.value : 'male',
      lat: city ? city.lat : undefined,
      lon: city ? city.lon : undefined,
      tz: city ? city.tz : undefined,
      cityName: city ? city.name : '',
    };
  };
}
