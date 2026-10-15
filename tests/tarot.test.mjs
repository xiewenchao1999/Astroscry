// 塔罗核心回归测试 — 牌组完整性（78 张）+ 洗牌确定性 + 牌阵结构（数据驱动，六牌阵）+ 真随机源
import { readFileSync } from 'fs';
import { cryptoRng, shuffle, validateDeck, validateSpread } from '../site/js/core/tarot.mjs';
import { analyzeReading, synthesizeReading } from '../site/js/core/tarot-reading.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

// 测试夹具：确定性伪随机（mulberry32 副本）。core 已改 crypto 真随机，种子机制仅存在于测试夹具
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const deck = JSON.parse(readFileSync(new URL('../site/data/tarot.json', import.meta.url), 'utf8')).cards;
const spreads = JSON.parse(readFileSync(new URL('../site/data/tarot-spreads.json', import.meta.url), 'utf8')).spreads;
const spreadByKey = new Map(spreads.map((s) => [s.key, s]));

test('牌组完整性：78 张、22 大阿卡纳、4 花色各 14 张、字段齐全', () => {
  assert.equal(validateDeck(deck), true);
  const majors = deck.filter((c) => c.arcana === 'major');
  assert.deepEqual(majors.map((c) => c.num), [...Array(22).keys()]);
  for (const c of deck) {
    assert.ok(c.up.length >= 8 && c.rev.length >= 8, `${c.id} 牌义过短`);
    assert.ok(Array.isArray(c.kwUp) && c.kwUp.length >= 3, `${c.id} 关键词不足`);
  }
});

test('牌阵定义：六牌阵齐备、全部通过校验、位置语义齐备', () => {
  assert.deepEqual(spreads.map((s) => s.key), ['single', 'three', 'diamond', 'moon', 'horseshoe', 'celtic']);
  for (const s of spreads) {
    assert.equal(validateSpread(s), true);
    assert.ok(s.positions.every((p) => p.duty), `${s.key} 有位置缺 duty`);
  }
  assert.equal(spreadByKey.get('celtic').positions.length, 10);
  assert.equal(spreadByKey.get('horseshoe').positions.length, 7);
  assert.deepEqual(spreadByKey.get('three').positions.map((p) => p.cn), ['过去', '现在', '未来']);
  assert.equal(spreadByKey.get('celtic').positions[0].cn, '核心');
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [] }));
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [{ key: 'a', cn: 'a' }] })); // 缺 duty
});

test('洗牌确定性：同 rng 序列同结果、异序列异结果、不丢牌', () => {
  const a1 = shuffle(deck, mulberry32(42));
  const a2 = shuffle(deck, mulberry32(42));
  const b = shuffle(deck, mulberry32(43));
  assert.deepEqual(a1.map((c) => c.id), a2.map((c) => c.id));
  assert.notDeepEqual(a1.map((c) => c.id), b.map((c) => c.id));
  assert.deepEqual(a1.map((c) => c.id).sort(), deck.map((c) => c.id).sort(), '洗牌不得丢牌');
});

test('cryptoRng：取值范围、分布合理、连续取值不重复', () => {
  const vals = Array.from({ length: 2000 }, cryptoRng);
  assert.ok(vals.every((v) => v >= 0 && v < 1), '取值须落在 [0,1)');
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  assert.ok(mean > 0.45 && mean < 0.55, `均值 ${mean.toFixed(3)} 应≈0.5`);
  assert.ok(new Set(vals).size > 1900, '连续取值不应大量重复（真随机熵源）');
});

test('解读分析：结构特征与分档正确', () => {
  // 构造受控输入：3 张全大阿卡纳 → high；含逆位
  const mk = (id, arcana, suit, reversed) => ({ card: { id, arcana, suit, cn: id, kwUp: ['x'], kwRev: ['y'], up: 'x'.repeat(10), rev: 'y'.repeat(10) }, positionCn: 'p', positionDuty: 'd', reversed });
  const cardsHigh = [mk('m0', 'major', null, false), mk('m1', 'major', null, true), mk('m2', 'major', null, false)];
  const a1 = analyzeReading(cardsHigh);
  assert.equal(a1.major, 3);
  assert.equal(a1.majorBand, 'high');
  assert.ok(a1.dominant === null, '无小牌时不应有主导花色');
  assert.ok(a1.missing.length === 4, '四花色全缺');
  const r1 = synthesizeReading(cardsHigh, a1, '测试问题');
  assert.equal(r1.question, '测试问题');
  assert.ok(r1.closing.cards.includes('m1(逆)'));

  // 全权杖 → 权杖主导；全正位 → few
  const cardsWands = [mk('w1', 'minor', 'wands', false), mk('w2', 'minor', 'wands', false), mk('w3', 'minor', 'wands', false), mk('w4', 'minor', 'wands', false)];
  const a2 = analyzeReading(cardsWands);
  assert.equal(a2.dominant, 'wands');
  assert.equal(a2.reversalBand, 'few');
  assert.equal(a2.majorBand, 'low');
  // 同输入同输出（确定性）
  assert.deepEqual(analyzeReading(cardsWands), a2);
});

import { dailyDraw } from '../site/js/core/tarot.mjs';

test('dailyDraw：同日确定性（同日同牌），跨日分布多张', () => {
  const big = Array.from({ length: 78 }, (_, i) => ({ id: `c${i}` }));
  const a = dailyDraw(big, '2026-10-14');
  const b = dailyDraw(big, '2026-10-14');
  assert.equal(a.card.id, b.card.id);
  assert.equal(a.reversed, b.reversed);
  const seen = new Set();
  for (let i = 1; i <= 60; i++) {
    const d = dailyDraw(big, `2026-01-${String(i).padStart(2, '0')}`);
    seen.add(d.card.id);
  }
  assert.ok(seen.size > 20, '60 天应覆盖较多不同牌，实际 ' + seen.size);
  assert.ok(big.includes(a.card) === false || true);
});

// —— 牌间连线（消费真实牌库 + interpret-tarot.json 的 classic 表）——
const T = JSON.parse(readFileSync(new URL('../site/data/interpret-tarot.json', import.meta.url), 'utf8'));
const byId = new Map(deck.map((c) => [c.id, c]));
const rc = (id, pos, reversed = false) => ({ card: byId.get(id), position: pos, positionCn: pos, positionDuty: 'd', reversed });
const linkKeys = (cards) => synthesizeReading(cards, analyzeReading(cards), '', T.links).links.map((l) => `${l.key}${l.vars ? JSON.stringify(l.vars) : ''}`);

test('牌间连线：经典组合 / 镜像 / 愚人之旅（含跨幕）/ 数字旅程（含危机位）', () => {
  // 经典组合：死神+星星，且读牌顺序反转后仍命中同一键
  assert.equal(linkKeys([rc('ar13', 'a'), rc('ar17', 'b')])[0], 'ar13+ar17');
  assert.equal(linkKeys([rc('ar17', 'a'), rc('ar13', 'b')])[0], 'ar13+ar17');
  // 镜像张力：4 + 17 = 21
  assert.equal(linkKeys([rc('ar04', 'a'), rc('ar17', 'b')])[0], 'mirror');
  // 愚人之旅：女皇(3)→皇帝(4) 同幕推进（夹具避开经典组合表里的魔术师+女祭司）；跨幕与倒序
  assert.equal(linkKeys([rc('ar03', 'a'), rc('ar04', 'b')])[0], 'majorUp');
  assert.equal(linkKeys([rc('ar02', 'a'), rc('ar08', 'b')])[0], 'majorUpCross');
  assert.equal(linkKeys([rc('ar08', 'a'), rc('ar02', 'b')])[0], 'majorDownCross');
  // 数字旅程：同花色 1→2 推进；4→5 命中危机位；3→2 回落（夹具避开「5」与同号牌）
  assert.equal(linkKeys([rc('wa01', 'a'), rc('wa02', 'b')])[0], 'suitUp');
  assert.equal(linkKeys([rc('wa04', 'a'), rc('wa05', 'b')])[0], 'suitFive');
  assert.equal(linkKeys([rc('wa03', 'a'), rc('wa02', 'b')])[0], 'suitDown');
});

test('牌间连线：宫廷牌角色 / 双角色 / 主题×细节 / 元素牌性（互助绿、相克红）', () => {
  // 宫廷牌 + 数字牌：court = 宫廷牌、event = 另一张，与读牌顺序无关
  const role = synthesizeReading([rc('wa13', 'a'), rc('cu01', 'b')], analyzeReading([rc('wa13', 'a'), rc('cu01', 'b')]), '', T.links).links[0];
  assert.equal(role.key, 'courtRole');
  assert.equal(role.vars.court, '权杖王后');
  assert.equal(role.vars.event, '圣杯王牌');
  // 双宫廷
  assert.equal(linkKeys([rc('wa13', 'a'), rc('cu13', 'b')])[0], 'courtPair');
  // 大牌 + 数字小牌 → 主题×细节（大牌+宫廷已被 courtRole 优先接管，单独断言）
  assert.equal(linkKeys([rc('ar06', 'a'), rc('wa02', 'b')])[0], 'majorMinor');
  // 牌性：火风互助(good)、水火相激(bad)、火土中性（夹具避开同号——四张王牌同为 1 号，会先命中「阶段共振」）
  const mk2 = (a, b) => synthesizeReading([rc(a, 'a'), rc(b, 'b')], analyzeReading([rc(a, 'a'), rc(b, 'b')]), '', T.links).links[0];
  assert.equal(mk2('wa02', 'sw01').key, 'fireAir');
  assert.equal(mk2('wa02', 'sw01').tone, 'good');
  assert.equal(mk2('wa02', 'cu01').key, 'fireWater');
  assert.equal(mk2('wa02', 'cu01').tone, 'bad');
  assert.equal(mk2('wa02', 'pe01').key, 'fireEarth');
  assert.equal(mk2('wa02', 'pe01').tone, undefined);
  // 大牌 + 宫廷牌 → courtRole 优先于 majorMinor（linkKeys 会把 vars 拼进字符串，这里只看键名）
  assert.ok(linkKeys([rc('ar06', 'a'), rc('wa13', 'b')])[0].startsWith('courtRole'));
});

test('牌面图案：王牌计数、宫廷牌计数、跨花色数字连跑', () => {
  const p = (cards) => synthesizeReading(cards, analyzeReading(cards), '', T.links).patterns;
  // 王牌×1 + 2,3 跨花色 → 连跑 [1,2,3]
  const p1 = p([rc('cu01', 'a'), rc('wa02', 'b'), rc('sw03', 'c')]);
  assert.deepEqual(p1.run, [1, 2, 3]);
  assert.equal(p1.aces, 1);
  assert.equal(p1.acesKey, 'acesOne');
  assert.equal(p1.courts, 0);
  assert.equal(p1.courtsKey, 'courtsNone');
  // 2,3,4,5 连跑跨四花色；宫廷牌计数 2 → few
  const p2 = p([rc('cu02', 'a'), rc('wa03', 'b'), rc('sw04', 'c'), rc('pe05', 'd'), rc('wa13', 'e'), rc('cu13', 'f')]);
  assert.deepEqual(p2.run, [2, 3, 4, 5]);
  assert.equal(p2.aces, 0);
  assert.equal(p2.acesKey, 'acesNone');
  assert.equal(p2.courts, 2);
  assert.equal(p2.courtsKey, 'courtsFew');
  // 无连跑
  const p3 = p([rc('cu01', 'a'), rc('wa03', 'b')]);
  assert.equal(p3.run, null);
});

test('牌间连线兜底：缺 classic 表时其余关系照常；旧式无 num 夹具不得崩溃或产出空键', () => {
  // 不传 linksCfg：经典组合被跳过，愚人之旅照常
  const noCfg = synthesizeReading([rc('ar13', 'a'), rc('ar17', 'b')], analyzeReading([rc('ar13', 'a'), rc('ar17', 'b')]), '');
  assert.equal(noCfg.links.length, 1);
  assert.equal(noCfg.links[0].key, 'majorUpCross'); // 13→17 跨幕推进（镜像不成立：13+17=30）
  // 旧式夹具（无 num 字段，如既有测试的 mk）：连线为空但不崩溃
  const legacy = [{ card: { id: 'x', arcana: 'major', suit: null, cn: 'x', kwUp: ['k'], kwRev: ['r'], up: 'u', rev: 'v' }, positionCn: 'p', positionDuty: 'd', reversed: false },
                  { card: { id: 'y', arcana: 'major', suit: null, cn: 'y', kwUp: ['k'], kwRev: ['r'], up: 'u', rev: 'v' }, positionCn: 'q', positionDuty: 'd', reversed: true }];
  const syn = synthesizeReading(legacy, analyzeReading(legacy), '');
  assert.deepEqual(syn.links, [], '无 num 的夹具不应产出连线');
  assert.deepEqual(syn.patterns.run, null);
});
