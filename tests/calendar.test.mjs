// 农历↔公历核心回归测试 — 基准：iztro 示例盘农历日期交叉验证 + lunar.js 官方行为
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js'));

import { lunarToSolar, solarToLunar, lunarDaysOf, lunarMonthsOf, hourToShiChen, solarDaysOf, lunarDayName } from '../site/js/core/calendar.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('农历→公历（与 iztro 示例盘 lunarDate 交叉验证：二〇〇〇年七月十七 = 2000-08-16）', () => {
  assert.deepEqual(lunarToSolar(2000, 7, 17), { year: 2000, month: 8, day: 16 });
});

test('农历→公历：闰月（2020 闰四月廿九 = 2020-06-20）', () => {
  assert.deepEqual(lunarToSolar(2020, -4, 29), { year: 2020, month: 6, day: 20 });
});

test('农历→公历：非法日期应抛错而非静默进位（2000 年七月只有 29 天）', () => {
  assert.throws(() => lunarToSolar(2000, 7, 30));
});

test('公历→农历（2000-08-16 → 二〇〇〇年七月十七）', () => {
  const l = solarToLunar(2000, 8, 16);
  assert.deepEqual({ year: l.year, month: l.month, day: l.day }, { year: 2000, month: 7, day: 17 });
  assert.equal(l.leap, false);
  assert.equal(l.text, '2000年七月十七');
});

test('公历→农历：跨农历年（2000-01-01 = 一九九九年冬月廿五）', () => {
  const l = solarToLunar(2000, 1, 1);
  assert.deepEqual({ year: l.year, month: l.month, day: l.day }, { year: 1999, month: 11, day: 25 });
  assert.equal(l.text, '1999年冬月廿五');
});

test('农历月天数与闰月列表', () => {
  assert.equal(lunarDaysOf(2000, 7), 29);
  assert.equal(lunarDaysOf(2020, 4), 30);
  assert.equal(lunarDaysOf(2020, -4), 29); // 闰四月
  const months2020 = lunarMonthsOf(2020).map((m) => m.value);
  assert.ok(months2020.includes(-4), '2020 年应含闰四月');
  assert.ok(!lunarMonthsOf(2026).some((m) => m.value < 0), '2026 年无闰月');
  // 每个月的 days 与选项上限一致
  for (const m of lunarMonthsOf(2020)) assert.ok(m.days >= 29 && m.days <= 30);
});

test('时辰映射边界', () => {
  assert.equal(hourToShiChen(0), '早子');
  assert.equal(hourToShiChen(23), '晚子');
  assert.equal(hourToShiChen(1), '丑');
  assert.equal(hourToShiChen(13), '未');
  assert.equal(hourToShiChen(22), '亥');
});

test('公历月天数与农历日名称', () => {
  assert.equal(solarDaysOf(2000, 2), 29); // 闰年
  assert.equal(solarDaysOf(2001, 2), 28);
  assert.equal(solarDaysOf(2000, 1), 31);
  assert.equal(lunarDayName(1), '初一');
  assert.equal(lunarDayName(25), '廿五');
  assert.equal(lunarDayName(30), '三十');
});
