// 紫微核心回归测试 — 基准：iztro 官方示例盘 2000-8-16 0:00 女（MIT）
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
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

test('运限：index 可回查本命盘宫位，四化顺序为 禄/权/科/忌', () => {
  const z = castZiwei({ year: 2000, month: 8, day: 16, hour: 0, gender: 'female' });
  const h = ziweiHoroscope(z.input, '2026-10-14');
  // 页面用 palaces[index] 反查「限内命宫落在本命盘哪一宫」，index 必须落在 12 宫范围内
  for (const step of [h.decadal, h.yearly]) {
    assert.ok(Number.isInteger(step.index) && step.index >= 0 && step.index < 12, `index ${step.index} 越界`);
    assert.ok(z.palaces[step.index]?.name, 'index 必须能回查到具名宫位');
    // 限内命宫即 index 所指宫位，故该宫的 palaceNames[index] 应为「命宫」
    assert.equal(step.palaceNames[step.index], '命宫', '限内命宫应与 index 自洽');
    assert.equal(step.mutagen.length, 4, '四化应恰为 4 颗（禄/权/科/忌）');
  }
  // 大限范围应覆盖当年虚岁
  const range = z.palaces[h.decadal.index].decadal.range;
  assert.ok(h.age.nominalAge >= range[0] && h.age.nominalAge <= range[1], '虚岁应落在大限区间内');
});

test('紫微语料：运限段落齐备且模板占位符可闭合', () => {
  const i = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-ziwei.json'), 'utf8'));
  const hz = i.horoscope;
  assert.ok(hz, '缺 horoscope 段落');
  for (const k of ['title', 'intro', 'decadal', 'yearly', 'mutagen', 'decadalNote', 'yearlyNote', 'fail', 'note']) {
    assert.ok(typeof hz[k] === 'string' && hz[k].length > 4, `运限缺 ${k}`);
  }
  for (const tpl of [hz.decadal, hz.yearly, hz.mutagen]) {
    for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
      assert.ok(['stem', 'from', 'to', 'palace', 'age', 'list'].includes(m[1]), `未知占位符 {${m[1]}}`);
    }
  }
  assert.ok(hz.decadal.includes('{from}') && hz.decadal.includes('{to}'), '大限句需含虚岁区间');
  assert.ok(hz.yearly.includes('{age}'), '流年句需含虚岁');
});

test('紫微语料：星性表 14 主星齐备、亮度七档齐备（顺序固定）', () => {
  const i = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-ziwei.json'), 'utf8'));
  assert.deepEqual(Object.keys(i.starNature), Object.keys(i.majorStars), '星性表的星与 majorStars 应一一对应（键序一致）');
  for (const [name, text] of Object.entries(i.starNature)) {
    assert.ok(text.length >= 18, `${name} 星性过短`);
    // 星性必须与宫位解耦：不得把「命宫」写死在内，否则复用到其他宫就是错误陈述
    assert.ok(!text.includes('命宫'), `${name} 的星性写死了「命宫」，无法复用到其他宫位`);
    assert.ok(!text.includes('坐命'), `${name} 的星性写死了「坐命」`);
  }
  assert.deepEqual(Object.keys(i.brightness), ['庙', '旺', '得', '利', '平', '不', '陷'], '亮度七档与键序应稳定');
  for (const [k, v] of Object.entries(i.brightness)) assert.ok(v.length >= 12, `亮度 ${k} 判词过短`);
  for (const k of ['palaceStarTitle', 'palaceStarNote', 'palaceStarBoundary']) {
    assert.ok(i[k] && i[k].length >= 6, `缺 palaceStar 段落 ${k}`);
  }
  for (const k of ['palaceStarStarLabel', 'palaceStarDutyLabel']) {
    assert.ok(i[k] && i[k].length >= 2, `缺 palaceStar 标签 ${k}`);
  }
  // 宫职表必须覆盖十二宫，否则主星速览会缺行
  assert.equal(Object.keys(i.palaces).length, 12, '宫职释义应为 12 宫');
});

test('紫微速览渲染契约：每宫主星都能查到星性，亮度的七个取值都被覆盖', () => {
  const i = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-ziwei.json'), 'utf8'));
  const z = castZiwei({ year: 2000, month: 8, day: 16, hour: 0, gender: 'female' });
  assert.equal(z.palaces.length, 12);
  const brightSeen = new Set();
  for (const p of z.palaces) {
    assert.ok(i.palaces[p.name], `宫职表缺 ${p.name}`);
    for (const s of p.majorStars) {
      assert.ok(i.starNature[s.name], `${p.name}的主星 ${s.name} 缺星性释义`);
      if (s.brightness) {
        brightSeen.add(s.brightness);
        assert.ok(i.brightness[s.brightness], `亮度档 ${s.brightness} 缺判词`);
      }
    }
  }
  assert.ok(brightSeen.size >= 3, `基准盘应出现至少三种亮度档（实得 ${[...brightSeen].join('/')}）`);
});
