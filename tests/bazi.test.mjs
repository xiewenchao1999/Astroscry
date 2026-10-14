// 八字核心回归测试 — 基准向量来源：lunar-javascript __tests__/EightChar.test.js（MIT）+ 本站冒烟验证
// 运行：node --test tests/
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js'));

import { castBazi, solarTimeCorrection } from '../site/js/core/bazi.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('八字四柱（lunar 官方向量 2005-12-23 08:37）', () => {
  const b = castBazi({ year: 2005, month: 12, day: 23, hour: 8, minute: 37, gender: 'male' });
  assert.equal(b.pillars.year.ganZhi, '乙酉');
  assert.equal(b.pillars.month.ganZhi, '戊子');
  assert.equal(b.pillars.day.ganZhi, '辛巳');
  assert.equal(b.pillars.time.ganZhi, '壬辰');
});

test('十神（对日主辛金）', () => {
  const b = castBazi({ year: 2005, month: 12, day: 23, hour: 8, minute: 37, gender: 'male' });
  assert.equal(b.pillars.year.ganShiShen, '偏财');   // 乙 vs 辛
  assert.equal(b.pillars.month.ganShiShen, '正印');  // 戊 vs 辛
  assert.equal(b.pillars.day.ganShiShen, '日主');
  assert.equal(b.pillars.time.ganShiShen, '伤官');   // 壬 vs 辛
  assert.equal(b.pillars.day.hideGans.map((h) => h.gan).join(','), '丙,庚,戊');
});

test('纳音', () => {
  const b = castBazi({ year: 2005, month: 12, day: 23, hour: 8, minute: 37, gender: 'male' });
  assert.equal(b.pillars.year.naYin, '泉中水');
  assert.equal(b.pillars.month.naYin, '霹雳火');
  assert.equal(b.pillars.day.naYin, '白蜡金');
  assert.equal(b.pillars.time.naYin, '长流水');
});

test('晚子时默认归本日（1988-02-15 23:30 → 庚子日）', () => {
  const b = castBazi({ year: 1988, month: 2, day: 15, hour: 23, minute: 30, gender: 'male' });
  assert.equal(b.pillars.day.ganZhi, '庚子');
  assert.equal(b.pillars.time.ganZhi, '戊子');
  assert.equal(b.pillars.year.ganZhi, '戊辰');
});

test('完整结构：2000-01-01 12:00 男', () => {
  const b = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' });
  assert.equal(b.pillars.year.ganZhi, '己卯');
  assert.equal(b.pillars.month.ganZhi, '丙子');
  assert.equal(b.pillars.day.ganZhi, '戊午');
  assert.equal(b.pillars.time.ganZhi, '戊午');
  assert.equal(b.lunar.text, '一九九九年冬月廿五');
  assert.equal(b.animal, '兔');
  assert.equal(b.dayGan, '戊');
  assert.equal(b.taiYuan, '丁卯');
  assert.equal(b.mingGong, '乙亥');
  assert.equal(b.shenGong, '辛未');
  assert.equal(b.xunKong, '子丑');
  // 五行统计（含藏干）：金0 木2 水2 火5 土5
  assert.deepEqual(b.fiveElements, { 金: 0, 木: 2, 水: 2, 火: 5, 土: 5 });
  // 大运：阴年男逆排，8年2月10天起运（2008-03-11），第一步乙亥
  assert.equal(b.qiYun.solar, '2008-03-11');
  assert.equal(b.daYun[1].ganZhi, '乙亥');
  assert.equal(b.daYun[1].startAge, 9);
});

test('真太阳时经度校正', () => {
  assert.deepEqual(solarTimeCorrection('12:00', 116.4), { corrected: '11:46', minutes: -14 }); // 北京
  assert.deepEqual(solarTimeCorrection('12:00', 87.6), { corrected: '09:50', minutes: -130 }); // 乌鲁木齐
  assert.deepEqual(solarTimeCorrection('12:00', undefined), { corrected: '12:00', minutes: 0 });
});

test('女性大运顺排（2000-01-01 12:00 女阴年顺排，首运丁丑）', () => {
  const b = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'female' });
  assert.equal(b.daYun[1].ganZhi, '丁丑');
});
