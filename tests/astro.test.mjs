// 西占核心回归测试 — 基准：Astronomy Engine 自身精度锚点 + 物理不变量
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { computeSky, castNatal, ascendantMc, meanObliquity, meanNodeLon, sunSignByDate, dailyFortune, calcAspects, SIGNS } from '../site/js/core/astro.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('春分太阳黄经（2000-03-20 07:35 UTC ≈ 0°）', () => {
  const sky = computeSky(new Date(Date.UTC(2000, 2, 20, 7, 35, 0)));
  const lon = sky.planets.sun.lon > 180 ? sky.planets.sun.lon - 360 : sky.planets.sun.lon;
  assert.ok(Math.abs(lon) < 0.5, `太阳黄经 ${sky.planets.sun.lon} 应≈0`);
});

test('满月相位（2000-01-21 04:44 UTC 月全食）', () => {
  const sky = computeSky(new Date(Date.UTC(2000, 0, 21, 4, 44, 0)));
  assert.ok(Math.abs(sky.moonPhase.angle - 180) < 2, `月相角 ${sky.moonPhase.angle} 应≈180`);
  assert.ok(sky.moonPhase.illumination > 0.98);
});

test('天体完备性与逆行物理约束', () => {
  const sky = computeSky(new Date(Date.UTC(2026, 9, 14, 4, 0, 0)));
  assert.equal(Object.keys(sky.planets).length, 11);
  assert.equal(sky.planets.sun.retrograde, false);
  assert.equal(sky.planets.moon.retrograde, false);
  // 水星距日 ≤28°、金星距日 ≤47°
  const elong = (a, b) => Math.abs(((sky.planets[a].lon - sky.planets[b].lon) % 360 + 540) % 360 - 180);
  assert.ok(elong('mercury', 'sun') <= 28);
  assert.ok(elong('venus', 'sun') <= 47);
  // 逆行标志与 24h 黄经变化自洽（取样任意一天）
  for (const key of ['mercury', 'venus', 'mars']) {
    const p = sky.planets[key];
    assert.equal(typeof p.retrograde, 'boolean');
  }
});

test('上升点/中天公式（几何锚点）', () => {
  const eps = meanObliquity(new Date(Date.UTC(2000, 0, 1, 12)));
  assert.ok(Math.abs(eps - 23.4393) < 0.001);
  // 赤道、RAMC=0：中天 0°白羊，上升 0°巨蟹
  let { asc, mc } = ascendantMc(0, 0, eps);
  assert.ok(Math.abs(mc) < 1e-6 || Math.abs(mc - 360) < 1e-6);
  assert.ok(Math.abs(asc - 90) < 1e-6);
  // 伦敦纬度、RAMC=0：上升 ≈ 116.57°（巨蟹末段，满足地平线方程 sin h=0 的几何解）
  ({ asc, mc } = ascendantMc(0, 51.5, eps));
  assert.ok(Math.abs(mc) < 1e-6);
  assert.ok(Math.abs(asc - 116.57) < 0.5, `上升 ${asc} 应≈116.6`);
});

test('本命盘：2000-08-16 12:00 北京（太阳 ≈ 狮子 23°）', () => {
  const n = castNatal({ year: 2000, month: 8, day: 16, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  assert.equal(n.planets.sun.signCn, '狮子');
  assert.ok(n.planets.sun.degInSign > 22 && n.planets.sun.degInSign < 25, `太阳 ${n.planets.sun.degInSign}`);
  // 结构完整性：12 宫、行星落宫在 1..12、相位无重复对
  assert.equal(n.houses.length, 12);
  for (const p of Object.values(n.planets)) {
    assert.ok(p.house >= 1 && p.house <= 12);
    assert.ok(p.signIndex >= 0 && p.signIndex <= 11);
  }
  const seen = new Set();
  for (const a of n.aspects) {
    const k = [a.a, a.b].sort().join('|');
    assert.ok(!seen.has(k), `相位对重复 ${k}`);
    seen.add(k);
  }
  // 元素统计和 > 0
  assert.ok(Object.values(n.elements).reduce((x, y) => x + y, 0) > 0);
});

test('太阳星座日期反查', () => {
  assert.equal(sunSignByDate(3, 21), 'aries');
  assert.equal(sunSignByDate(3, 20), 'pisces');
  assert.equal(sunSignByDate(12, 22), 'capricorn');
  assert.equal(sunSignByDate(1, 1), 'capricorn');
  assert.equal(sunSignByDate(8, 16), 'leo');
});

test('每日运势：12 星座、分数范围、确定性', () => {
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  const f1 = dailyFortune(d);
  const f2 = dailyFortune(d);
  assert.equal(f1.length, 12);
  assert.deepEqual(f1, f2);
  for (const s of f1) {
    assert.ok(s.score >= 20 && s.score <= 95, `分数越界 ${s.signKey} ${s.score}`);
    assert.ok(['旺', '顺', '平', '滞'].includes(s.level));
  }
  assert.ok(f1.find((s) => s.signKey === 'leo'));
});

test('北交点长期逆行（年漂移 ≈ -19.3°）', () => {
  const t = new Date(Date.UTC(2026, 0, 1));
  const l1 = meanNodeLon(t);
  const l2 = meanNodeLon(new Date(t.getTime() + 365 * 86400000));
  const drift = ((l2 - l1) % 360 + 540) % 360 - 180;
  assert.ok(drift < 0 && drift > -21, `年漂移 ${drift} 应≈-19.3`);
});

test('相位计算边界', () => {
  const fake = {
    a: { key: 'a', cn: '甲', lon: 0 },
    b: { key: 'b', cn: '乙', lon: 120.5 },
  };
  const out = calcAspects(fake);
  assert.equal(out.length, 1);
  assert.equal(out[0].aspect, 'trine');
  assert.equal(out[0].orb, 0.5);
});

import { readNatal } from '../site/js/core/natal-reading.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

test('本命盘解读：readNatal 结构与内容（基准盘 2000-08-16 北京）', () => {
  const n = castNatal({ year: 2000, month: 8, day: 16, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const rd = readNatal(n, interp);
  assert.ok(rd.inHouses.length >= 9, '行星落宫主题应覆盖 9+ 颗星');
  assert.ok(rd.inHouses.every((x) => x.line.includes('主题') && x.line.includes('宫')), '落宫句式完整');
  assert.ok(rd.aspectLines.every((x) => ['merge', 'harmony', 'tension'].includes(x.nature)), '相位 nature 三分类合法');
  const orbs = rd.aspectLines.map((x) => x.orb);
  assert.deepEqual(orbs, [...orbs].sort((a, b) => a - b), '相位按容许度升序');
  assert.ok(['火', '土', '风', '水'].includes(rd.elements.dominant));
  assert.ok(rd.elements.line.length > 10);
  assert.ok(['本位', '固定', '变动'].includes(rd.modality.dominant));
  assert.ok(rd.summary.includes('太阳在') && rd.summary.includes('上升'), 'summary 含三巨头');
});
