// 独立补测（阶段三B·QA 二期验证）——填补工程师自测盲区，不重复既有断言：
//   1) resolveReading 朱熹七档边界：非乾坤 6 动之卦辞、3 动双辞次序、2 动非相邻「以上爻为主」、
//      4/5 动不动爻取位方向、动爻去重排序、动爻辞独立样本
//   2) plumTimeCast 独立复算：测试内自实现标准梅花式 + vendor lunar.js 现场推导（不采信源码注释基准值）
//   3) drawSign / drawCards 分布性：全值域扫描、不重复、不越界、逆位率随 rate 单调、不改输入
//   4) dailyFortune 极端 fw 夹具：base=0 触发放大兜底、base=4 触发等比缩、min=max 精确收敛、缺键 fw 抛错
//   5) voteThree 64 序列穷举：三掷序列与计数/总评完全自洽
//   6) 数据完整性：进站语料与 docs/research/round2/corpus 源数据逐字段比对（快扫修正处除外并反向锁定）
//   7) 静态不变量独立 grep：core 纯净 / HTML 零 inline 事件 / AI 字面量仅限 ui/ai-*.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js')); // 梅花时间卦独立复算
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js'); // dailyFortune 极端夹具

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { castCoinHexagram, plumTimeCast, hexagramByBits, resolveReading, changedBits } from '../site/js/core/iching.mjs';
import { drawSign } from '../site/js/core/guanyin.mjs';
import { castMoonblock, voteThree } from '../site/js/core/jiaobei.mjs';
import { drawCards } from '../site/js/core/tarot.mjs';
import { dailyFortune } from '../site/js/core/astro.mjs';

const ROOT = join(import.meta.dirname, '..');
const readJSON = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const iching = readJSON('site/data/iching.json');
const signsData = readJSON('site/data/guanyin-signs.json');
const tarotDeck = (() => { const raw = readJSON('site/data/tarot.json'); return raw.cards ?? raw; })();
const fwReal = readJSON('site/data/fortune-weights.json');

const byName = (name) => iching.hexagrams.find((h) => h.full === name);
const rngQueue = (values) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('rng 队列耗尽');
    return values[i++];
  };
};

// ============================================================
// 1) resolveReading 朱熹七档边界（独立样本，与 iching.test.mjs 不重叠）
// ============================================================

test('朱熹·1 动阴爻样本：坤初六「履霜，坚冰至」', () => {
  const KUN = byName('坤为地');
  const rd = resolveReading(iching, KUN, [1]);
  assert.equal(rd.movingCount, 1);
  assert.ok(rd.citations[0].source.includes('初六'));
  assert.equal(rd.citations[0].text, '履霜，坚冰至。');
});

test('朱熹·2 动非相邻：乾 [3,6] 应以最大的上爻（上九）为主，九三兼读', () => {
  const rd = resolveReading(iching, byName('乾为天'), [3, 6]);
  assert.equal(rd.citations[0].source.includes('上九'), true, `主取应含上九，实际 ${rd.citations[0].source}`);
  assert.equal(rd.citations[0].text, '亢龙有悔。');
  assert.ok(rd.citations[1].source.includes('九三'), '次取应为九三');
});

test('朱熹·2 动输入去重与排序：[2,1] 与 [1,2] 结果全同；[3,3] 按一爻动处理', () => {
  const QIAN = byName('乾为天');
  const a = resolveReading(iching, QIAN, [2, 1]);
  const b = resolveReading(iching, QIAN, [1, 2]);
  assert.deepEqual(a, b, '动爻列表应归一化（去重升序）');
  const dup = resolveReading(iching, QIAN, [3, 3]);
  assert.equal(dup.movingCount, 1, '重复动爻应去重');
  assert.ok(dup.citations[0].source.includes('九三'));
});

test('朱熹·3 动双辞非连续样本：乾 [1,3,5] → 贞本卦卦辞 + 悔之卦（火水未济）卦辞', () => {
  const QIAN = byName('乾为天');
  const rd = resolveReading(iching, QIAN, [1, 3, 5]);
  assert.equal(rd.movingCount, 3);
  assert.equal(rd.citations[0].source, '本卦卦辞');
  assert.equal(rd.citations[0].text, '元亨，利贞。');
  assert.ok(rd.citations[1].source.includes('火水未济'), `之卦应为火水未济，实际 ${rd.citations[1].source}`);
  assert.equal(rd.citations[1].text, byName('火水未济').guaCi, '之卦卦辞应逐字引用');
  assert.equal(rd.changed.bits, '010101', '乾 1/3/5 爻动 → 之卦 bits 010101（坎下离上）');
});

test('朱熹·4 动不动爻在顶部：乾 [3,4,5,6] → 之卦地泽临，主取其下不动爻（初九）', () => {
  const rd = resolveReading(iching, byName('乾为天'), [3, 4, 5, 6]);
  assert.equal(rd.changed.full, '地泽临', '乾 3-6 爻动 → 之卦地泽临（兑下坤上）');
  assert.ok(rd.citations[0].source.includes('初九'), `应取之卦不动爻之下者（初九），实际 ${rd.citations[0].source}`);
  assert.equal(rd.citations[0].text, byName('地泽临').lines[0].text);
  assert.ok(rd.citations[1].source.includes('九二'), '兼读上一不动爻（九二）');
});

test('朱熹·5 动不动爻在底部：乾 [2,3,4,5,6] → 之卦地雷复，主取其唯一不动爻（初六）', () => {
  const rd = resolveReading(iching, byName('乾为天'), [2, 3, 4, 5, 6]);
  assert.equal(rd.changed.full, '地雷复', '乾 2-6 爻动 → 之卦地雷复（震下坤上）');
  assert.ok(rd.citations[0].source.includes('初九'), '复卦初爻为阳（一阳来复），应取初九');
  assert.equal(rd.citations[0].text, byName('地雷复').lines[0].text, '应逐字引用复卦初九爻辞');
});

test('朱熹·6 动非乾坤第二样本：泽天夬六爻全动 → 之卦（山地剥）卦辞，无 special 接管', () => {
  const GUA = byName('泽天夬');
  const rd = resolveReading(iching, GUA, [1, 2, 3, 4, 5, 6]);
  assert.equal(rd.rule.key, 'six');
  assert.equal(rd.changed.full, '山地剥', '夬 111110 全动 → 000001 山地剥');
  assert.ok(rd.citations[0].source.includes('之卦'));
  assert.equal(rd.citations[0].text, byName('山地剥').guaCi);
});

test('resolveReading 返回自洽：changedBits 与 changed.bits 一致；静卦 changed 为 null', () => {
  const QIAN = byName('乾为天');
  const rd = resolveReading(iching, QIAN, [1, 4]);
  assert.equal(rd.changedBits, rd.changed.bits);
  assert.equal(changedBits(QIAN.bits, [1, 4]), '011011');
  const st = resolveReading(iching, QIAN, []);
  assert.equal(st.changed, null);
  assert.equal(st.changedBits, null);
});

// ============================================================
// 2) plumTimeCast 独立复算（测试内自实现标准梅花式，双日期含跨农历年与晚子时）
// ============================================================

test('梅花时间卦独立复算：四组日期（含跨农历年边界与晚子时）与 plumTimeCast 逐位一致', () => {
  const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const NUM = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };
  const BITS = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };
  // 独立实现（不 import iching.mjs 的 plumFromNumbers）：标准梅花时间卦
  const expectCast = (y, mo, d, h) => {
    const lunar = globalThis.Solar.fromDate(new Date(y, mo - 1, d, h, 0)).getLunar();
    const yz = ZHI.indexOf(lunar.getYearZhi()) + 1;
    const m = Math.abs(lunar.getMonth());
    const dd = lunar.getDay();
    const hh = Math.floor(((h + 1) % 24) / 2) + 1;
    const up = (yz + m + dd) % 8 || 8;
    const low = (yz + m + dd + hh) % 8 || 8;
    const mv = (yz + m + dd + hh) % 6 || 6;
    return { upper: NUM[up], lower: NUM[low], moving: mv, bits: BITS[NUM[low]] + BITS[NUM[up]] };
  };
  // 覆盖：当日基准 / 廿三大数 / 农历年已切换（2026-01-01 仍属乙巳年） / 凌晨寅时
  const cases = [
    [2026, 10, 15, 12],
    [1990, 6, 15, 8],
    [2026, 1, 1, 23],   // 晚子时：时辰归子(1)，农历年取巳(6)——ponytail 口径的边界路径
    [2025, 7, 20, 3],
  ];
  for (const [y, mo, d, h] of cases) {
    const want = expectCast(y, mo, d, h);
    const got = plumTimeCast(new Date(y, mo - 1, d, h, 0));
    assert.equal(got.upper, want.upper, `${y}-${mo}-${d} ${h}:00 上卦`);
    assert.equal(got.lower, want.lower, `${y}-${mo}-${d} ${h}:00 下卦`);
    // want.moving 为本文件独立实现的标量动爻位，核心契约 moving 为数组，故包一层比较
    assert.deepEqual(got.moving, [want.moving], `${y}-${mo}-${d} ${h}:00 动爻`);
    assert.equal(got.bits, want.bits, `${y}-${mo}-${d} ${h}:00 bits`);
  }
});

test('梅花时间卦基准锚点：2026-10-15 12:00 → 水风井·五爻动（独立查表复核）', () => {
  const cast = plumTimeCast(new Date(2026, 9, 15, 12, 0, 0));
  assert.equal(hexagramByBits(iching, cast.bits).full, '水风井');
  assert.deepEqual(cast.moving, [5]);
});

// ============================================================
// 3) drawSign / drawCards 分布性与无副作用
// ============================================================

test('drawSign 全值域扫描：1000 点网格全部落在 1..100 且两端均可达', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = drawSign(rngQueue([i / 1000]));
    assert.ok(Number.isInteger(id) && id >= 1 && id <= 100, `i=${i} 产出越界值 ${id}`);
    ids.add(id);
  }
  assert.ok(ids.has(1), 'rng=0 应命中第 1 签');
  assert.ok(ids.has(100), 'rng 接近 1 应命中第 100 签');
  assert.ok(ids.size >= 99, `连续网格应覆盖几乎全部签号，实际 ${ids.size}`);
});

test('drawCards：固定 rng 序列下逆位数量随 reversedRate 单调不减（0→1 端点为全正/全逆）', () => {
  const queue = Array.from({ length: 20 }, (_, i) => (i * 37 % 97) / 97); // 固定伪随机序列
  let prev = -1;
  for (const rate of [0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9, 1]) {
    const picks = drawCards(tarotDeck, 10, rngQueue(queue), rate);
    const n = picks.filter((p) => p.reversed).length;
    assert.ok(n >= prev, `rate=${rate} 逆位数 ${n} 低于 rate 更小时的 ${prev}`);
    if (rate === 0) assert.equal(n, 0, 'rate=0 应全正位');
    if (rate === 1) assert.equal(n, 10, 'rate=1 应全逆位');
    prev = n;
  }
});

test('drawCards：全值域扫描无越界、无重复、不修改输入牌库；n=0 与 n=全库边界', () => {
  const snapshot = JSON.parse(JSON.stringify(tarotDeck));
  for (let i = 0; i < 60; i++) {
    const picks = drawCards(tarotDeck, 7, rngQueue([i / 60, 0.9, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), 0.5);
    const ids = picks.map((p) => p.card.id);
    assert.equal(new Set(ids).size, 7, `i=${i} 抽出重复牌`);
    for (const id of ids) assert.ok(tarotDeck.some((c) => c.id === id), `抽出未知牌 ${id}`);
  }
  assert.deepEqual(tarotDeck, snapshot, 'drawCards 不得修改输入牌库');
  assert.deepEqual(drawCards(tarotDeck, 0, rngQueue([0.5]), 0.5), [], 'n=0 应返回空数组');
  const all = drawCards(tarotDeck, 78, rngQueue(Array(200).fill(0.5)), 0); // 整副抽取消耗 77 选择 + 78 掷币
  assert.equal(all.length, 78);
  assert.equal(new Set(all.map((p) => p.card.id)).size, 78, '整副抽取应无重复');
  assert.throws(() => drawCards(tarotDeck, -1, rngQueue([0.5])), /非法/);
  assert.throws(() => drawCards(tarotDeck, 2.5, rngQueue([0.5])), /非法/);
});

// ============================================================
// 4) dailyFortune 极端 fw 夹具（评分平衡纪律的边界路径）
// ============================================================

test('五维极端夹具：base=0 且 scale=0（近似零相位日）仍须收敛回 [14,19]、每维 0-4', () => {
  const fwZero = { ...fwReal, discipline: { min: 14, max: 19, base: 0, scale: 0 } };
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  for (const s of dailyFortune(d, fwZero)) {
    const vals = Object.entries(s.dimensions);
    assert.equal(vals.length, 5, `${s.signKey} 应恰为五维`);
    for (const [k, v] of vals) assert.ok(v >= 0 && v <= 4, `${s.signKey}.${k} 越界：${v}`);
    const sum = Math.round(vals.reduce((a, [, v]) => a + v, 0) * 10) / 10;
    assert.ok(sum >= 14 && sum <= 19, `${s.signKey} 极端夹具下总和 ${sum} 越出纪律区间`);
    for (const [k] of vals) assert.ok(fwReal.dimensions.includes(k), `输出维度键 ${k} 不在语料维度表内（脏键泄漏）`);
  }
});

test('五维极端夹具：base=4 触发等比缩放至 max；min=max 时精确收敛到目标总和', () => {
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  const fwHigh = { ...fwReal, discipline: { min: 14, max: 19, base: 4, scale: 0 } };
  for (const s of dailyFortune(d, fwHigh)) {
    const sum = Math.round(Object.values(s.dimensions).reduce((a, b) => a + b, 0) * 10) / 10;
    assert.ok(sum <= 19, `${s.signKey} base=4 缩放后总和 ${sum} 仍超上限`);
  }
  const fwFixed = { ...fwReal, discipline: { min: 17, max: 17, base: 2.5, scale: 0 } };
  for (const s of dailyFortune(d, fwFixed)) {
    const sum = Math.round(Object.values(s.dimensions).reduce((a, b) => a + b, 0) * 10) / 10;
    assert.equal(sum, 17, `${s.signKey} min=max=17 应精确收敛，实际 ${sum}`);
  }
});

test('dailyFortune：fw 结构残缺（缺 dimensionRules / 缺 dimensions / 空 transitWeights）均应抛错', () => {
  const d = new Date(Date.UTC(2026, 9, 14, 4, 0, 0));
  assert.throws(() => dailyFortune(d, { transitWeights: fwReal.transitWeights }), /fortune-weights/);
  assert.throws(() => dailyFortune(d, { transitWeights: fwReal.transitWeights, dimensionRules: fwReal.dimensionRules }), /fortune-weights/);
  // dimensions: [] 能通过 Array.isArray 守卫（守卫不查长度），在 destructuring discipline 处另行抛错——
  // 无论哪种错误，契约语义都是「结构残缺的 fw 必须抛错而不产出垃圾结果」
  assert.throws(() => dailyFortune(d, { transitWeights: {}, dimensionRules: {}, dimensions: [] }));
});

test('真实语料 fw × 连续 5 日全量扫描：五维值域、总和纪律、score 档位全部闭合', () => {
  for (let day = 1; day <= 5; day++) {
    const d = new Date(Date.UTC(2026, 9, day, 4, 0, 0));
    for (const s of dailyFortune(d, fwReal)) {
      const vals = Object.values(s.dimensions);
      const sum = Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
      assert.ok(sum >= fwReal.discipline.min && sum <= fwReal.discipline.max, `10-${day} ${s.signKey} 总和 ${sum}`);
      for (const v of vals) assert.ok(v >= 0 && v <= 4 && Number.isFinite(v), `10-${day} ${s.signKey} 维度值非法：${v}`);
      assert.ok(['旺', '顺', '平', '滞'].includes(s.level));
    }
  }
});

// ============================================================
// 5) voteThree 64 序列穷举（faces→判定→计数→总评 全链自洽）
// ============================================================

test('voteThree 穷举：2^6=64 条 rng 序列下序列/计数/总评完全一致（分支全覆盖）', () => {
  const comboKey = (faces) => (faces.filter((f) => f === 'flat').length === 1 ? 'sheng' : faces.filter((f) => f === 'flat').length === 2 ? 'xiao' : 'yin');
  for (let seq = 0; seq < 64; seq++) {
    // seq 位 0..5 → 6 次 rng（每次掷两枚）：bit=0 → 0(平) ，bit=1 → 0.9(凸)
    const values = Array.from({ length: 6 }, (_, i) => ((seq >> i) & 1) ? 0.9 : 0);
    const r = voteThree(rngQueue(values));
    assert.equal(r.casts.length, 3);
    // faces 与 rng 序列逐位自洽
    r.casts.forEach((c, i) => {
      const want = [values[i * 2], values[i * 2 + 1]].map((v) => (v < 0.5 ? 'flat' : 'convex'));
      assert.deepEqual(c.faces, want, `seq=${seq} 第 ${i + 1} 掷 faces 与 rng 不符`);
      assert.equal(c.key, comboKey(c.faces), `seq=${seq} 第 ${i + 1} 掷 key 与 faces 判定表不符`);
    });
    const sheng = r.casts.filter((c) => c.key === 'sheng').length;
    const yin = r.casts.filter((c) => c.key === 'yin').length;
    assert.equal(r.shengCount, sheng, `seq=${seq} 圣筊计数不符`);
    assert.equal(r.yinCount, yin, `seq=${seq} 阴筊计数不符`);
    assert.equal(sheng + yin + r.casts.filter((c) => c.key === 'xiao').length, 3);
    assert.equal(r.verdict, sheng === 3 ? '允' : yin > 0 ? '否' : '未明', `seq=${seq} 总评口径不符`);
  }
  // 穷举覆盖性自检：三种 verdict 都必须被触达
  const verdicts = new Set();
  for (let seq = 0; seq < 64; seq++) {
    const values = Array.from({ length: 6 }, (_, i) => ((seq >> i) & 1) ? 0.9 : 0);
    verdicts.add(voteThree(rngQueue(values)).verdict);
  }
  assert.deepEqual([...verdicts].sort(), ['允', '否', '未明']);
});

test('castMoonblock：rng 非函数抛错（与 core 契约一致）', () => {
  assert.throws(() => castMoonblock(undefined), /rng/);
  assert.throws(() => voteThree(undefined), /rng/);
});

// ============================================================
// 6) 数据完整性：进站语料 ↔ 源语料 逐字段比对（快扫修正处反向锁定）
// ============================================================

test('iching.json ↔ corpus/eastern/iching-64.json：64 卦卦名/bits/卦辞/爻辞原文逐字段一致', () => {
  const src = readJSON('docs/research/round2/corpus/eastern/iching-64.json');
  assert.equal(src.hexagrams.length, 64);
  const byId = new Map(iching.hexagrams.map((h) => [h.id, h]));
  let checked = 0;
  for (const sh of src.hexagrams) {
    const ss = byId.get(sh.id);
    assert.ok(ss, `进站数据缺卦 id=${sh.id}`);
    for (const f of ['name', 'full', 'symbol', 'bits', 'upper', 'lower', 'guaCi', 'daXiang']) {
      assert.equal(ss[f], sh[f], `卦 ${sh.id} 字段 ${f} 与源语料不一致`);
    }
    assert.equal(ss.lines.length, sh.lines.length);
    sh.lines.forEach((sl, i) => {
      assert.equal(ss.lines[i].pos, sl.pos, `卦 ${sh.id} 第 ${i + 1} 爻爻位不一致`);
      assert.equal(ss.lines[i].text, sl.text, `卦 ${sh.id} 第 ${i + 1} 爻爻辞与源语料不一致`);
      checked++;
    });
    if (sh.special) assert.equal(ss.special.text, sh.special.text, `卦 ${sh.id} special 与源语料不一致`);
  }
  assert.equal(checked, 384, `爻辞比对数应为 384，实际 ${checked}`);
});

test('iching.json 润色结构锁：386 条爻白话 + 64 卦辞白话 + 64 大象白话 + 64 场景白话非空且不少于下限（防回退）', () => {
  let n = 0;
  for (const h of iching.hexagrams) {
    for (const ln of h.lines) {
      assert.ok(typeof ln.baiHua === 'string' && ln.baiHua.trim().length >= 12, `卦 ${h.id} ${ln.pos} 白话过短或为空`);
      n++;
    }
    if (h.special) {
      assert.ok(typeof h.special.baiHua === 'string' && h.special.baiHua.trim().length >= 12, `卦 ${h.id} ${h.special.pos} 白话过短或为空`);
      n++;
    }
    assert.ok(typeof h.guaCiBaiHua === 'string' && h.guaCiBaiHua.trim().length >= 20, `卦 ${h.id} 卦辞白话过短或为空`);
    assert.ok(typeof h.daXiangBaiHua === 'string' && h.daXiangBaiHua.trim().length >= 25, `卦 ${h.id} 大象白话过短或为空`);
    assert.ok(typeof h.scene === 'string' && h.scene.trim().length >= 15, `卦 ${h.id} 场景白话过短或为空`);
  }
  assert.equal(n, 386, `爻白话条数应为 386，实际 ${n}`);
});

test('guanyin-signs.json ↔ corpus/eastern/guanyin-signs-100.json：结构字段一致；分项解已整体深润（键集一致 + 1478 条 + 非空下限 + 疾病就医红线）', () => {
  const src = readJSON('docs/research/round2/corpus/eastern/guanyin-signs-100.json');
  const QUICK_SCAN = new Set([7, 10, 51, 84]); // docs/research/round2/语料快扫记录.md 修正清单
  const byId = new Map(signsData.signs.map((s) => [s.id, s]));
  let checkedInterp = 0, illnessChecked = 0;
  for (const sc of src.signs) {
    const ss = byId.get(sc.id);
    assert.ok(ss, `进站数据缺签 id=${sc.id}`);
    for (const f of ['luck', 'poem', 'story']) assert.deepEqual(ss[f], sc[f], `签 ${sc.id} 字段 ${f} 与源语料不一致`);
    if (QUICK_SCAN.has(sc.id)) {
      assert.notEqual(ss.storyDetail, sc.storyDetail, `签 ${sc.id} storyDetail 应保留快扫修正，不应回退为源语料原文`);
    } else {
      assert.equal(ss.storyDetail, sc.storyDetail, `签 ${sc.id} storyDetail 与源语料不一致（快扫清单外不得改动）`);
    }
    // 分项解已于 2026-10-16 整体深度润色（docs/research/round2/语料润色记录.md）：
    // 不再与源语料逐字比对，改锁「键集一致 + 覆盖 1478 + 非空下限 12 + 疾病条就医红线」。
    assert.deepEqual(
      Object.keys(ss.interpret ?? {}).sort(),
      Object.keys(sc.interpret ?? {}).sort(),
      `签 ${sc.id} 分项解键集与源语料不一致（不得增删键）`
    );
    for (const [k, v] of Object.entries(ss.interpret ?? {})) {
      assert.ok(typeof v === 'string' && v.trim().length >= 12, `签 ${sc.id} 分项解「${k}」文案过短或为空`);
      if (k === '疾病') {
        assert.ok(v.includes('就医') || v.includes('遵医嘱'), `签 ${sc.id} 疾病条必须提示及时就医`);
        illnessChecked++;
      }
      checkedInterp++;
    }
  }
  assert.equal(checkedInterp, 1478, `分项解总数应为 1478，实际 ${checkedInterp}`);
  assert.ok(illnessChecked >= 90, `疾病条比对量异常：${illnessChecked}`);
  // 快扫清单精确性：iching.json 的 3 处 scene 修正同样须保留（防回退）
  const ichSrc = readJSON('docs/research/round2/corpus/eastern/iching-64.json');
  for (const id of [16, 34, 36]) {
    const sc = ichSrc.hexagrams.find((h) => h.id === id);
    const ss = byIchingId(id);
    assert.notEqual(ss.scene, sc.scene, `卦 ${id} scene 应保留快扫修正，不应回退`);
  }
  function byIchingId(id) { return iching.hexagrams.find((h) => h.id === id); }
});

test('tarot.json ↔ corpus/western/tarot-meanings-rws.json：en 原文逐字一致；cn 已于 2026-10-16 重译润色（156 条非空且 ≥10 字）', () => {
  const src = readJSON('docs/research/round2/corpus/western/tarot-meanings-rws.json').cards;
  assert.equal(tarotDeck.length, 78);
  let checked = 0;
  for (const c of tarotDeck) {
    const e = src[c.id];
    assert.ok(e, `语料缺牌 ${c.id}`);
    assert.equal(c.rws.up.en, e.en.up, `${c.id} rws.up.en 与 Waite 1911 原文不一致`);
    assert.equal(c.rws.rev.en, e.en.rev, `${c.id} rws.rev.en 与 Waite 1911 原文不一致`);
    // cn 已逐条重译润色（docs/research/round2/语料润色记录.md）：不再逐字比对源中译，改锁非空与下限
    for (const d of ['up', 'rev']) {
      assert.ok(typeof c.rws[d].cn === 'string' && c.rws[d].cn.trim().length >= 10, `${c.id} rws.${d}.cn 译文过短或为空`);
    }
    checked++;
  }
  assert.equal(checked, 78);
});

// ============================================================
// 7) 静态不变量独立 grep（与 no-network.test 互为双保险）
// ============================================================

test('静态不变量：core/*.mjs 零 DOM / 网络 / 存储（独立复核）', () => {
  const dir = join(ROOT, 'site/js/core');
  const bad = /\bdocument\.\b|\bwindow\.\b|localStorage|sessionStorage|\bfetch\s*\(|querySelector|getElementById|addEventListener|XMLHttpRequest/;
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.ok(!bad.test(text), `core/${f} 触碰浏览器/网络 API：${text.match(new RegExp(bad.source, 'g'))?.slice(0, 3)}`);
  }
});

test('静态不变量：全部 HTML 页面零 inline 事件处理器（P15 口径全站对齐）', () => {
  const files = ['site/index.html', ...readdirSync(join(ROOT, 'site/pages')).map((f) => `site/pages/${f}`)];
  const bad = /\son(click|change|submit|input|load|error|key\w*)\s*=\s*["']/;
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!bad.test(text), `${f} 存在 inline 事件处理器`);
  }
});

test('静态不变量：AI 字面量仅存在于 ui/ai-*.mjs（独立复核，不依赖 no-network.test 自身）', () => {
  const literals = /apiKey|api_key|API[ _-]?key|Authorization|Bearer |chat\/completions|baseURL|base_url/;
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  for (const file of walk(join(ROOT, 'site/js'))) {
    const rel = file.replace(/\\/g, '/');
    if (/ui\/ai-/.test(rel)) continue; // 边界模块豁免（ai-reading / ai-settings / ai-panel）
    const text = readFileSync(file, 'utf8');
    assert.ok(!literals.test(text), `${rel} 含 AI/端点字面量（越出 ui/ai-* 边界）`);
  }
});
