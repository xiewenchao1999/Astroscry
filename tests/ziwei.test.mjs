// 紫微核心回归测试 — 基准：iztro 官方示例盘 2000-8-16 0:00 女（MIT）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.iztro = require('../site/vendor/iztro.min.js');

import { castZiwei, toTimeIndex, ziweiHoroscope } from '../site/js/core/ziwei.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('时辰索引映射', () => {
  assert.equal(toTimeIndex(0), 0);   // 早子
  assert.equal(toTimeIndex(1), 1);   // 丑
  assert.equal(toTimeIndex(13), 7);  // 未
  assert.equal(toTimeIndex(22), 11); // 亥
  assert.equal(toTimeIndex(23), 12); // 晚子
});

test('官方示例盘 2000-8-16 0:00 女', () => {
  const z = castZiwei({ year: 2000, month: 8, day: 16, hour: 0, minute: 0, gender: 'female' });
  assert.equal(z.fiveElementsClass, '水二局');
  assert.equal(z.soul, '廉贞');
  assert.equal(z.body, '文昌');
  assert.equal(z.zodiac, '龙');
  assert.equal(z.sign, '狮子座');
  assert.equal(z.chineseDate, '庚辰 甲申 丙午 戊子');
  // 命宫：天机(得) + 太阴(利,化科)，且为身宫
  assert.ok(z.mingGong, '命宫存在');
  assert.deepEqual(z.mingGong.majorStars.map((s) => s.name), ['天机', '太阴']);
  assert.equal(z.mingGong.majorStars[1].brightness, '利');
  assert.equal(z.mingGong.majorStars[1].mutagen, '科');
  assert.equal(z.mingGong.isBodyPalace, true);
  assert.equal(z.soulPalaceBranch, '申');
  // 12 宫齐全
  assert.equal(z.palaces.length, 12);
  const names = z.palaces.map((p) => p.name);
  for (const n of ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '仆役', '官禄', '田宅', '福德', '父母']) {
    assert.ok(names.includes(n), `缺少 ${n}`);
  }
  // 财帛宫：天同(平,化忌)+右弼+文曲
  const cai = z.palaces.find((p) => p.name === '财帛');
  assert.deepEqual(cai.majorStars.map((s) => s.name), ['天同']);
  assert.equal(cai.majorStars[0].mutagen, '忌');
});

test('运限：2026-10-14 大限/流年结构', () => {
  const z = castZiwei({ year: 2000, month: 8, day: 16, hour: 0, gender: 'female' });
  const h = ziweiHoroscope(z.input, '2026-10-14');
  assert.ok(h.decadal, '有大限');
  assert.ok(h.decadal.stemBranch.length >= 2);
  assert.ok(Array.isArray(h.decadal.mutagen));
  assert.ok(h.yearly, '有流年');
});
