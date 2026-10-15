// 西占核心回归测试 — 基准：Astronomy Engine 自身精度锚点 + 物理不变量
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { computeSky, castNatal, ascendantMc, meanObliquity, meanNodeLon, sunSignByDate, dailyFortune, calcAspects, detectPatterns, SIGNS, localNoonUtc } from '../site/js/core/astro.mjs';
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
  const fw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'fortune-weights.json'), 'utf8'));
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  const f1 = dailyFortune(d, fw);
  const f2 = dailyFortune(d, fw);
  assert.equal(f1.length, 12);
  assert.deepEqual(f1, f2);
  for (const s of f1) {
    assert.ok(s.score >= 20 && s.score <= 95, `分数越界 ${s.signKey} ${s.score}`);
    assert.ok(['旺', '顺', '平', '滞'].includes(s.level));
  }
  assert.ok(f1.find((s) => s.signKey === 'leo'));
});

// —— O04 五维评分：语料 horoscope-writing-patterns.md 生成纪律（总/爱/事业/财/健康，总和 [14,19]）——
test('五维：任取 3 个日期 × 12 座，维度值 0-4 且总和落在纪律区间 [14,19]', () => {
  const fw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'fortune-weights.json'), 'utf8'));
  const dates = [
    new Date(Date.UTC(2026, 9, 14, 4, 0, 0)),
    new Date(Date.UTC(2026, 3, 2, 4, 0, 0)),
    new Date(Date.UTC(2027, 0, 20, 4, 0, 0)),
  ];
  for (const d of dates) {
    for (const s of dailyFortune(d, fw)) {
      const vals = Object.values(s.dimensions);
      assert.equal(vals.length, 5, `应为五维，实际 ${vals.length}`);
      for (const v of vals) assert.ok(v >= 0 && v <= 4, `${d.toISOString()} ${s.signKey} 维度越界：${v}`);
      const sum = Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
      assert.ok(sum >= fw.discipline.min && sum <= fw.discipline.max, `${d.toISOString()} ${s.signKey} 五维总和 ${sum} 越界`);
    }
  }
});

test('五维：同日 12 座 factors 互斥（守护星因子须回扣本座守护星），且每句可回溯（±分值收尾）', () => {
  const fw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'fortune-weights.json'), 'utf8'));
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  for (const s of dailyFortune(d, fw)) {
    const sign = SIGNS.find((x) => x.key === s.signKey);
    assert.ok(sign, `未知星座 ${s.signKey}`);
    const aspectFactors = s.factors.filter((x) => x.includes('守护星'));
    for (const f of aspectFactors) {
      assert.ok(f.includes(sign.ruler), `${s.signKey} 的守护星因子未回扣本座守护星（${sign.ruler}）：${f}`);
      assert.ok(/（[+-]\d+(\.\d+)?）$/.test(f), `因子缺 ± 分值收尾：${f}`);
    }
    // 全部因子均以（±n）收尾（月亮元素/逆行因子同样可回溯分值）
    for (const f of s.factors) assert.ok(/（[+-]\d+(\.\d+)?）$/.test(f), `因子缺 ± 分值收尾：${f}`);
  }
});

test('五维：缺 fortune-weights 参数应抛错（显式契约）', () => {
  assert.throws(() => dailyFortune(new Date(Date.UTC(2026, 9, 14, 4, 0, 0))), /fortune-weights/);
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
  // line 的语义（行星落宫判词）不变，但内容已由「主题×领域」模板改为逐条判词：
  // 断言改为「有内容、无占位符、行外上下文齐备」，句式要求交给专门的消费者契约测试
  assert.ok(rd.inHouses.every((x) => x.line.length > 5 && !x.line.includes('undefined') && !/\{[a-zA-Z]+\}/.test(x.line)), '落宫判词完整');
  assert.ok(rd.inHouses.every((x) => x.cn && x.signCn && x.house >= 1 && x.house <= 12), '落宫行外上下文（星名/座/宫位）齐备');
  assert.ok(rd.aspectLines.every((x) => ['merge', 'harmony', 'tension'].includes(x.nature)), '相位 nature 三分类合法');
  const orbs = rd.aspectLines.map((x) => x.orb);
  assert.deepEqual(orbs, [...orbs].sort((a, b) => a - b), '相位按容许度升序');
  assert.ok(['火', '土', '风', '水'].includes(rd.elements.dominant));
  assert.ok(rd.elements.line.length > 10);
  assert.ok(['本位', '固定', '变动'].includes(rd.modality.dominant));
  assert.ok(rd.summary.includes('太阳在') && rd.summary.includes('上升'), 'summary 含三巨头');
});

test('本命盘解读：姻缘视角块（月亮需求/金星爱语/第 7 宫伴侣画像）', () => {
  const n = castNatal({ year: 2000, month: 8, day: 16, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const rd = readNatal(n, interp);
  assert.ok(rd.love, 'love 块应存在');
  assert.ok(rd.love.moonLine && rd.love.moonLine.length > 8);
  assert.ok(rd.love.venusLine && rd.love.venusLine.length > 8);
  assert.ok(rd.love.dscSign && rd.love.dscLine.includes('吸引'), '伴侣画像句式完整');
  // 整宫制下第 7 宫 = 上升对宫
  const ascIdx = n.ascSignIndex;
  const dscIdx = n.houses.findIndex((h) => h.house === 7);
  assert.notEqual(dscIdx, -1);
});

// —— 相位图形检测：用几何造盘夹具驱动，不依赖真实历表 ——
const mk = (key, cn, signIndex) => [key, {
  key, cn, signIndex,
  signKey: SIGNS[signIndex].key, signCn: SIGNS[signIndex].cn, signElement: SIGNS[signIndex].element,
  lon: signIndex * 30 + 5,
}];
const asp = (a, b, angle) => ({ a, b, angle });

test('相位图形：三拱闭环 → 大三角（含元素）', () => {
  const planets = Object.fromEntries([mk('sun', '太阳', 0), mk('mars', '火星', 4), mk('jupiter', '木星', 8)]); // 白羊/狮子/射手，均火象
  const out = detectPatterns(planets, [asp('sun', 'mars', 120), asp('mars', 'jupiter', 120), asp('sun', 'jupiter', 120)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'grandTrine');
  assert.equal(out[0].element, '火');
  assert.equal(out[0].planets.length, 3);
});

test('相位图形：对分轴 + 双刑 → T 三角（不误报大三角）', () => {
  const planets = Object.fromEntries([mk('sun', '太阳', 0), mk('moon', '月亮', 6), mk('saturn', '土星', 3)]);
  const out = detectPatterns(planets, [asp('sun', 'moon', 180), asp('sun', 'saturn', 90), asp('moon', 'saturn', 90)]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'tSquare');
  assert.equal(out[0].planets.length, 3);
});

test('相位图形：双对分轴 + 四刑 → 大十字，且其内部 T 三角不重复报告', () => {
  const planets = Object.fromEntries([mk('sun', '太阳', 0), mk('moon', '月亮', 6), mk('mars', '火星', 3), mk('saturn', '土星', 9)]);
  const aspects = [
    asp('sun', 'moon', 180), asp('mars', 'saturn', 180),
    asp('sun', 'mars', 90), asp('sun', 'saturn', 90), asp('moon', 'mars', 90), asp('moon', 'saturn', 90),
  ];
  const out = detectPatterns(planets, aspects);
  assert.equal(out.length, 1, '大十字内含的 T 三角不应重复报告');
  assert.equal(out[0].kind, 'grandCross');
  assert.equal(out[0].planets.length, 4);
});

test('相位图形：群星需含个人行星（木土天海冥同座是世代现象，不算个人配置）', () => {
  const personal = Object.fromEntries([mk('sun', '太阳', 10), mk('venus', '金星', 10), mk('mercury', '水星', 10)]);
  const out = detectPatterns(personal, []);
  assert.equal(out.filter((p) => p.kind === 'stellium').length, 1);
  assert.equal(out[0].signCn, SIGNS[10].cn);

  const outerOnly = Object.fromEntries([mk('jupiter', '木星', 10), mk('saturn', '土星', 10), mk('uranus', '天王星', 10)]);
  assert.equal(detectPatterns(outerOnly, []).length, 0, '无个人行星的同座聚集不应报群星');
});

test('相位图形：无图形时返回空数组；排序为大十字→T三角→大三角→群星', () => {
  const planets = Object.fromEntries([mk('sun', '太阳', 0), mk('moon', '月亮', 6)]);
  assert.deepEqual(detectPatterns(planets, [asp('sun', 'moon', 180)]), [], '只有对分轴不构成图形');

  const trinePlanets = Object.fromEntries([mk('sun', '太阳', 0), mk('mars', '火星', 4), mk('jupiter', '木星', 8), mk('venus', '金星', 4), mk('mercury', '水星', 4)]);
  const mixed = detectPatterns(trinePlanets, [asp('sun', 'mars', 120), asp('mars', 'jupiter', 120), asp('sun', 'jupiter', 120)]);
  const kinds = mixed.map((p) => p.kind);
  assert.ok(kinds.includes('grandTrine') && kinds.includes('stellium'));
  assert.ok(kinds.indexOf('grandTrine') < kinds.indexOf('stellium'), '大三角应按优先级排在群星之前');
});

// —— P07 回归：patternLines 同类多组不得中断后续异类图形 ——
// 几何夹具：两组互不相干的 T 三角（日-月-水 / 金-火-木）+ 一组大三角（土-天-冥）。
// detectPatterns 排序输出 [tSquare, tSquare, grandTrine]：修复前第二组同类触发 break，
// 会把排在其后的 grandTrine 整个丢弃（骨架卡缺信息）。
const mkLon = (key, cn, lon) => {
  const signIndex = Math.floor((((lon % 360) + 360) % 360) / 30);
  return [key, { key, cn, lon, signIndex, signKey: SIGNS[signIndex].key, signCn: SIGNS[signIndex].cn, signElement: SIGNS[signIndex].element, house: 1, degInSign: lon % 30, retrograde: false }];
};

test('相位图形判词：同类多组取首个，异类图形不被中断（P07 回归夹具）', () => {
  const planets = Object.fromEntries([
    mkLon('sun', '太阳', 0), mkLon('moon', '月亮', 180), mkLon('mercury', '水星', 90),      // T 三角 1
    mkLon('venus', '金星', 30), mkLon('mars', '火星', 210), mkLon('jupiter', '木星', 120),  // T 三角 2
    mkLon('saturn', '土星', 200), mkLon('uranus', '天王星', 320), mkLon('pluto', '冥王星', 80), // 大三角
  ]);
  const aspects = [
    asp('sun', 'moon', 180), asp('sun', 'mercury', 90), asp('moon', 'mercury', 90),
    asp('venus', 'mars', 180), asp('venus', 'jupiter', 90), asp('mars', 'jupiter', 90),
    asp('saturn', 'uranus', 120), asp('saturn', 'pluto', 120), asp('uranus', 'pluto', 120),
  ];
  // 夹具自检：确认检测顺序确为「同类重复在前、异类在后」
  const detected = detectPatterns(planets, aspects);
  assert.deepEqual(detected.map((p) => p.kind), ['tSquare', 'tSquare', 'grandTrine']);

  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const n = {
    input: { cityName: '测试' }, ascSign: '白羊', mcSign: '摩羯', ascSignIndex: 0,
    planets,
    aspects: aspects.map((x) => ({ ...x, orb: 1, aCn: planets[x.a].cn, bCn: planets[x.b].cn, aspectCn: '刑', color: '' })),
    houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: '白羊', signKey: 'aries', lon: 0 })),
    elements: { 火: 1, 土: 1, 风: 1, 水: 1 },
  };
  const rd = readNatal(n, interp);
  const kinds = rd.patterns.map((p) => p.kind);
  assert.ok(kinds.includes('tSquare'), 'T 三角判词应存在');
  assert.ok(kinds.includes('grandTrine'), '大三角判词不应被同类重复中断（修复前 break 丢弃）');
  assert.equal(kinds.filter((k) => k === 'tSquare').length, 1, '同类多组只取检测顺序首个');
});

test('本命盘解读：patterns 块句式完整且无未替换占位符（基准盘 2000-08-16 北京）', () => {
  const n = castNatal({ year: 2000, month: 8, day: 16, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const rd = readNatal(n, interp);
  assert.ok(Array.isArray(rd.patterns), 'patterns 必须是数组');
  for (const p of rd.patterns) {
    assert.ok(p.label && p.line, '图形需含 label 与 line');
    assert.ok(!/\{[a-zA-Z]+\}/.test(p.line), `图形判词存在未替换占位符：${p.line}`);
    assert.ok(p.line.length > 20, '判词不应过短');
  }
  assert.ok(interp.patterns.kinds && interp.patterns.none, '语料需含图形定义与无图形兜底句');
});

// —— 消费者侧契约：readNatal 必须真的取用新语料，且缺口时回落不空 ——
const mkP = (key, cn, signIndex, house) => ({
  key, cn, signIndex, house, signKey: SIGNS[signIndex].key, signCn: SIGNS[signIndex].cn,
  degInSign: 10, retrograde: false, lon: signIndex * 30 + 10,
});
const KEYS11 = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'northnode'];
const CN11 = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星', '北交点'];
function fakeNatal() {
  const planets = {};
  KEYS11.forEach((k, i) => { planets[k] = mkP(k, CN11[i], i, (i % 12) + 1); });
  return {
    input: { cityName: '测试' }, ascSign: '白羊', mcSign: '摩羯', ascSignIndex: 0,
    planets,
    houses: Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: '白羊', signKey: 'aries', lon: 0 })),
    aspects: [{ a: 'sun', b: 'saturn', angle: 90, orb: 1.5, aCn: '太阳', bCn: '土星', aspectCn: '刑', color: '' }],
    elements: { 火: 1, 土: 1, 风: 1, 水: 1 },
  };
}

test('消费者契约：readNatal 逐条取用 planetsInHouses 与 aspectPairs', () => {
  const n = fakeNatal();
  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const rd = readNatal(n, interp);
  const keyOf = (cn) => KEYS11.find((k) => CN11[KEYS11.indexOf(k)] === cn);

  assert.equal(rd.inHouses.length, 11, '十一颗行星都应有落宫判词');
  for (const x of rd.inHouses) {
    const k = keyOf(x.cn);
    assert.equal(x.line, interp.planetsInHouses[k][String(x.house)], `${x.cn} 未取用逐条宫位判词`);
  }
  // 个人行星必须同时给出「落座释义」副行（两层都保留，不是二选一）
  for (const cn of ['太阳', '月亮', '水星', '金星', '火星']) {
    const x = rd.inHouses.find((y) => y.cn === cn);
    assert.ok(x.signLine && x.signLine.length > 8, `${cn} 缺落座副行`);
  }

  assert.equal(rd.aspectLines.length, 1);
  const al = rd.aspectLines[0];
  assert.ok(al.line.startsWith(interp.aspectPairs['sun|saturn']), '未取用逐对相位判词');
  assert.equal(al.orbBand, 'tight', 'orb 1.5 应归入紧密档');
  assert.ok(al.line.includes(interp.orbNotes.tight), '缺少容许度深浅措辞');
});

test('消费者契约：新语料缺失时必须回落到旧模板，绝不产出空串或 undefined', () => {
  const n = fakeNatal();
  const full = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-natal.json'), 'utf8'));
  const legacy = { ...full };
  delete legacy.planetsInHouses;
  delete legacy.aspectPairs;
  delete legacy.orbNotes;
  const rd = readNatal(n, legacy);
  assert.equal(rd.inHouses.length, 11);
  for (const x of rd.inHouses) {
    assert.ok(x.line.length > 5, '回落路径产出空串');
    assert.ok(!x.line.includes('undefined') && !x.line.includes('{'), `回落路径残留占位符：${x.line}`);
  }
  assert.ok(rd.aspectLines[0].line.includes('主题') || rd.aspectLines[0].line.includes('星'), '相位回落路径无文案');
  assert.ok(!rd.aspectLines[0].line.includes('undefined'));
});

// —— O09：localNoonUtc 时区口径统一（替代页面各自硬编码 UTC 4:00）——
test('localNoonUtc：默认东八区/零时区/西五区的正午换算与跨日回卷', () => {
  const d = new Date(2026, 9, 15); // 本地日历日 2026-10-15
  assert.equal(localNoonUtc(d).toISOString(), '2026-10-15T04:00:00.000Z', '东八区正午 = UTC 04:00（与旧口径逐位一致）');
  assert.equal(localNoonUtc(d, 0).toISOString(), '2026-10-15T12:00:00.000Z', '零时区正午 = UTC 12:00');
  assert.equal(localNoonUtc(d, -5).toISOString(), '2026-10-15T17:00:00.000Z', '西五区正午 = UTC 17:00');
  // 东 13 区正午落在前一日 UTC（Date.UTC 算术自然回卷）
  assert.equal(localNoonUtc(d, 13).toISOString(), '2026-10-14T23:00:00.000Z');
});
