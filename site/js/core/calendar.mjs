// calendar.mjs — 公历↔农历转换与时辰标注（纯函数，无 DOM / 无网络）
// 依赖：vendor/lunar.js 暴露的 globalThis.{Lunar, Solar, LunarYear}
// 农历月份约定：1..12 为正常月，闰月为负数（如 -4 = 闰四月），与 lunar.js 一致

const LUNAR_MONTH_NAMES = { 1: '正月', 2: '二月', 3: '三月', 4: '四月', 5: '五月', 6: '六月', 7: '七月', 8: '八月', 9: '九月', 10: '十月', 11: '冬月', 12: '腊月' };
const LUNAR_DAY_NAMES = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const SHICHEN_BY_HOUR = ['早子', '丑', '丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午', '午', '未', '未', '申', '申', '酉', '酉', '戌', '戌', '亥', '亥', '晚子'];

function requireLunar() {
  const { Lunar, Solar, LunarYear } = globalThis;
  if (!Lunar || !Solar || !LunarYear) throw new Error('vendor lunar.js not loaded');
  return { Lunar, Solar, LunarYear };
}

/** 小时 → 时辰名（0 早子 / 1-2 丑 / … / 23 晚子） */
export function hourToShiChen(hour) {
  return SHICHEN_BY_HOUR[((hour % 24) + 24) % 24];
}

/** 农历年 {y} 的月份列表 [{value(1..12或负闰月), label, days}] */
export function lunarMonthsOf(y) {
  const { LunarYear } = requireLunar();
  const leap = LunarYear.fromYear(y).getLeapMonth();
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const days = lunarDaysOf(y, m);
    months.push({ value: m, label: LUNAR_MONTH_NAMES[m], days });
    if (leap === m) months.push({ value: -m, label: `闰${LUNAR_MONTH_NAMES[m]}`, days: lunarDaysOf(y, -m) });
  }
  return months;
}

/** 农历年 {y} 月 {m}（闰月为负）的天数 */
export function lunarDaysOf(y, m) {
  const { LunarYear } = requireLunar();
  const hit = LunarYear.fromYear(y).getMonths().find((x) => x.getMonth() === m && x.getYear() === y);
  if (!hit) throw new Error(`农历 ${y} 年月 ${m} 不存在`);
  return hit.getDayCount();
}

/** 农历日期 → 公历 {year, month, day}；非法日期抛错（不静默进位） */
export function lunarToSolar(y, m, d) {
  const { Lunar } = requireLunar();
  const s = Lunar.fromYmd(y, m, d).getSolar();
  return { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
}

/** 公历日期 → 农历 {year, month, day, leap, text} */
export function solarToLunar(y, m, d) {
  const { Solar } = requireLunar();
  const l = Solar.fromYmd(y, m, d).getLunar();
  const month = l.getMonth(); // 闰月为负
  return {
    year: l.getYear(),
    month,
    day: l.getDay(),
    leap: month < 0,
    text: `${l.getYear()}年${month < 0 ? '闰' : ''}${LUNAR_MONTH_NAMES[Math.abs(month)]}${LUNAR_DAY_NAMES[l.getDay() - 1]}`,
  };
}

/** 公历年 {y} 月 {m} 的天数 */
export function solarDaysOf(y, m) {
  return new Date(y, m, 0).getDate();
}

/** 农历日名称（初一…三十） */
export function lunarDayName(d) {
  return LUNAR_DAY_NAMES[d - 1] || String(d);
}
