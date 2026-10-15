// 数据完整性回归测试 — 保证 site/data 下新增语料/数据表结构闭合（改数据即校验）
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const D = (p) => JSON.parse(readFileSync(new URL('../site/data/' + p, import.meta.url), 'utf8'));

test('称骨：51 档闭合于 21~71 钱，字段齐备', () => {
  const c = D('chenggu.json');
  assert.equal(c.tiers.length, 51);
  assert.deepEqual(c.tiers.map((t) => t.qian), Array.from({ length: 51 }, (_, i) => i + 21));
  for (const t of c.tiers) {
    assert.ok(t.label && t.grade && t.verse, `档位 ${t.qian} 缺字段`);
    assert.ok(t.verse.length >= 20, `档位 ${t.qian} 歌诀过短`);
    assert.ok(Array.isArray(t.tags) && typeof t.scores === 'object');
    assert.ok(['career', 'wealth', 'marriage'].every((k) => k in t.scores), `档位 ${t.qian} 缺评分项`);
    assert.ok(Math.abs(t.liang - t.qian / 10) < 1e-9, `档位 ${t.qian} 两/钱换算不一致`);
  }
});

test('称骨：四项权重表完整（60 甲子 / 12 月 / 30 日 / 12 时辰）', () => {
  const w = D('chenggu.json').weights;
  assert.equal(Object.keys(w.year_weight_qian_by_ganzhi).length, 60);
  assert.equal(Object.keys(w.month_weight_qian).length, 12);
  assert.equal(Object.keys(w.day_weight_qian).length, 30);
  assert.equal(Object.keys(w.hour_weight_qian).length, 12);
  // 权重全为正整数（单位：钱）
  for (const table of Object.values(w)) {
    for (const v of Object.values(table)) {
      assert.ok(Number.isInteger(v) && v > 0, `权重非正整数：${v}`);
    }
  }
  // 年权重键必须都是合法六十甲子（干支阴阳同）
  const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
  for (const key of Object.keys(w.year_weight_qian_by_ganzhi)) {
    const [g, z] = key;
    assert.equal(GAN.indexOf(g) % 2, ZHI.indexOf(z) % 2, `${key} 非合法干支组合`);
  }
});

test('五行权重：藏干权重归一、十神分值齐 10 项', () => {
  const w = D('wuxing-weights.json');
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  assert.deepEqual(Object.keys(w.cangGan).join(''), ZHI, '十二地支藏干应齐备且有序');
  for (const [zhi, list] of Object.entries(w.cangGan)) {
    const sum = list.reduce((a, [, v]) => a + v, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${zhi} 藏干权重和 ${sum} ≠ 1`);
    assert.ok(list.length >= 1 && list.length <= 3, `${zhi} 藏干数应为 1~3`);
  }
  assert.equal(Object.keys(w.shiShenStrengthScore).length, 10);
  // 生扶为正、克耗为负
  for (const k of ['比肩', '劫财', '正印', '偏印']) assert.ok(w.shiShenStrengthScore[k] > 0, `${k} 应为正分`);
  for (const k of ['正财', '偏财', '正官', '七杀', '食神', '伤官']) assert.ok(w.shiShenStrengthScore[k] < 0, `${k} 应为负分`);
  assert.equal(w.monthMultiplier, 2.0);
});

test('五行关系表：合冲刑害条目数与配对合法性', () => {
  const w = D('wuxing-weights.json');
  const ZHI = '子丑寅卯辰巳午未申酉戌亥';
  assert.equal(w.ganHe.length, 5);
  assert.equal(w.zhiLiuHe.length, 6);
  assert.equal(w.sanHe.length, 4);
  assert.equal(w.banHe.length, 8);
  assert.equal(w.liuChong.length, 6);
  assert.equal(w.sanXing.length, 2);
  assert.equal(w.ziXing.length, 4);
  assert.equal(w.liuHai.length, 6);
  // 六合/六冲/六害的支对必须覆盖十二支各一次且互不重复
  for (const table of [w.zhiLiuHe, w.liuChong, w.liuHai]) {
    const used = new Set();
    for (const { pair } of table) {
      for (const z of pair) { assert.ok(!used.has(z), `${pair} 地支重复使用`); used.add(z); }
    }
    assert.equal(used.size, 12, '应覆盖全部十二地支');
  }
  // 三合局为四组三支，覆盖十二支
  const trioZhi = new Set(w.sanHe.flatMap((x) => [...x.trio]));
  assert.equal(trioZhi.size, 12);
  // 天干五合每干恰出现一次
  const ganUsed = new Set();
  for (const { pair } of w.ganHe) for (const g of pair) ganUsed.add(g);
  assert.equal(ganUsed.size, 10);
});

test('解读语料：新增段落齐备且模板占位符可闭合', () => {
  const i = D('interpret-bazi.json');
  for (const key of ['shiShenDetail', 'strengthAdvice', 'relations', 'geju', 'chenggu', 'shensha']) {
    assert.ok(i[key], `缺段落 ${key}`);
  }
  assert.equal(Object.keys(i.shiShenDetail).length, 10);
  assert.equal(Object.keys(i.geju.byShiShen).length, 10);
  // 模板占位符必须都有对应文案键
  for (const tpl of [i.strengthAdvice.result, i.chenggu.detailLine]) {
    for (const m of tpl.matchAll(/\{(\w+)\}/g)) assert.ok(m[1], '占位符为空');
  }
  assert.ok(i.strengthAdvice.note.includes('格局'));
});

test('名人案例：25 条且含出生信息与城市', () => {
  const c = D('celebrity-cases.json');
  assert.equal(c.cases.length, 25);
  for (const x of c.cases) {
    assert.ok(x.id && x.name && x.birth, `案例 ${x.id} 缺字段`);
    assert.ok(x.location && Number.isFinite(x.location.lat) && Number.isFinite(x.location.lng), `案例 ${x.id} 缺坐标`);
    assert.ok(x.note && x.note.length > 10);
  }
});

test('塔罗问事主题：六主题齐备、字段闭合、general 排首位', () => {
  const t = D('interpret-tarot.json');
  const keys = Object.keys(t.topicLens ?? {});
  assert.deepEqual(keys, ['general', 'love', 'career', 'money', 'health', 'spirit'], '主题键与顺序应稳定（首个为综合，作为选择器默认值）');
  for (const k of keys) {
    const lens = t.topicLens[k];
    assert.ok(typeof lens.label === 'string' && lens.label.length >= 2, `主题 ${k} 的 label 缺失或过短`);
    for (const f of ['askHint', 'focus', 'exit']) {
      assert.ok(typeof lens[f] === 'string' && lens[f].length >= 6, `主题 ${k} 的 ${f} 缺失或过短`);
    }
  }
  assert.ok(t.topicNote && t.topicNote.length > 10, '缺 topicNote 说明');
  // 健康主题必须自带现实就医提示（高风险话题不可只留在总免责里）
  assert.ok(t.topicLens.health.focus.includes('就医'), '健康主题的聚焦句必须提示现实就医');
});

test('十二星座六域评语：每座 keywords + 六域 + 相性齐备（覆盖率 100%）', () => {
  const h = D('interpret-horoscope.json');
  const domains = Object.keys(h.domainsLabels);
  assert.deepEqual(domains, ['love', 'career', 'money', 'social', 'health', 'growth'], '六域键与顺序应稳定');
  for (const d of domains) assert.ok(h.domainsLabels[d].length >= 2, `域标签 ${d} 缺失`);

  const signKeys = Object.keys(h.signs);
  assert.equal(signKeys.length, 12, '十二星座齐备');
  for (const k of signKeys) {
    const s = h.signs[k];
    assert.ok(s.cn && s.trait, `${k} 缺基础字段`);
    assert.ok(Array.isArray(s.keywords) && s.keywords.length >= 3, `${k} 缺关键词`);
    // 覆盖率：六个域一个都不能少，且不能是空串
    assert.deepEqual(Object.keys(s.domains), domains, `${k} 的六域键不齐或顺序不符`);
    for (const d of domains) {
      assert.ok(typeof s.domains[d] === 'string' && s.domains[d].length >= 20, `${k}.${d} 评语缺失或过短`);
    }
    for (const which of ['best', 'hard']) {
      const m = s.match?.[which];
      assert.ok(m && Array.isArray(m.signs) && m.signs.length >= 2, `${k} 缺 ${which} 相性`);
      for (const sk of m.signs) assert.ok(h.signs[sk], `${k}.${which} 引用了不存在的星座 ${sk}`);
      assert.ok(m.text.length >= 15, `${k}.${which} 相性说明过短`);
    }
  }
  // 档位文案深化：不再是「今天星象对你格外友好」这种一句话
  for (const lv of ['旺', '顺', '平', '滞']) assert.ok(h.levels[lv].length >= 25, `档位 ${lv} 文案过薄`);
});

test('十二星座六域评语：同域文本不得跨星座重复（防模板化灌水）', () => {
  const h = D('interpret-horoscope.json');
  for (const d of Object.keys(h.domainsLabels)) {
    const texts = Object.values(h.signs).map((s) => s.domains[d]);
    assert.equal(new Set(texts).size, texts.length, `域 ${d} 出现重复文本`);
  }
  const kws = Object.values(h.signs).map((s) => s.keywords.join('/'));
  assert.equal(new Set(kws).size, kws.length, '星座关键词出现重复');
});

test('本命盘语料：行星×宫位逐条判词 11×12 全覆盖且不重复', () => {
  const n = D('interpret-natal.json');
  const planets = Object.keys(n.planetThemes);
  assert.equal(planets.length, 11, '行星主题应为 11 颗');
  const houses = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const all = [];
  for (const p of planets) {
    const m = n.planetsInHouses?.[p];
    assert.ok(m, `缺行星 ${p} 的宫位判词`);
    assert.deepEqual(Object.keys(m), houses, `${p} 的十二宫键不齐或顺序不符`);
    for (const h of houses) {
      assert.ok(typeof m[h] === 'string' && m[h].length >= 20, `${p}|${h} 判词缺失或过短`);
      all.push(m[h]);
    }
  }
  assert.equal(all.length, 132, '行星×宫位应为 11×12=132 条');
  assert.equal(new Set(all).size, all.length, '行星×宫位判词出现重复文本');
});

test('本命盘语料：七主星两两逐对判词 21 对，键序与取相位遍历顺序一致', () => {
  const n = D('interpret-natal.json');
  // 与 core/astro.mjs 的 PLANETS 顺序一致：/+ 用于校验 pair key 的 a 必须排在 b 之前
  const ORDER = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const pairs = Object.keys(n.aspectPairs ?? {});
  assert.equal(pairs.length, (ORDER.length * (ORDER.length - 1)) / 2, '应为 C(7,2)=21 对');
  const seen = new Set();
  for (const key of pairs) {
    const [a, b] = key.split('|');
    assert.ok(ORDER.includes(a) && ORDER.includes(b), `${key} 含未知行星`);
    assert.ok(ORDER.indexOf(a) < ORDER.indexOf(b), `${key} 键序与 calcAspects 遍历顺序不一致（会静默失配）`);
    assert.ok(n.aspectPairs[key].length >= 15, `${key} 判词过短`);
    seen.add([a, b].sort().join('|'));
  }
  assert.equal(seen.size, pairs.length, '出现重复的行星对');
  assert.deepEqual(Object.keys(n.orbNotes ?? {}), ['tight', 'mid', 'loose'], '容许度深浅措辞应为三档');
});

test('塔罗逐牌分域释义：大阿卡纳 22 张 × 5 域全覆盖、花色兜底 4 类，键与问事主题一致', () => {
  const t = D('interpret-tarot.json');
  const cards = D('tarot.json').cards;
  const topics = Object.keys(t.topicLens).filter((k) => k !== 'general');
  assert.deepEqual(topics, ['love', 'career', 'money', 'health', 'spirit'], '域键必须与问事主题（除综合外）一致');

  const cd = t.cardDomains;
  assert.ok(cd, '缺 cardDomains 节');
  const majorIds = cards.filter((c) => c.arcana === 'major').map((c) => c.id);
  assert.equal(Object.keys(cd.majors).length, 22, '大阿卡纳应为 22 张');
  assert.deepEqual(Object.keys(cd.majors), majorIds, '大阿卡纳键应与 tarot.json 的 id 一一对应且同序');

  const all = [];
  for (const id of majorIds) {
    for (const tp of topics) {
      const text = cd.majors[id][tp];
      assert.ok(typeof text === 'string' && text.length >= 10, `${id}.${tp} 缺失或过短`);
      all.push(text);
    }
  }
  const suitKeys = cards.filter((c) => c.arcana === 'minor').map((c) => c.suit);
  const uniqSuits = [...new Set(suitKeys)];
  assert.deepEqual(Object.keys(cd.suits).sort(), uniqSuits.sort(), '花色兜底应与牌库中的花色一致');
  for (const s of uniqSuits) {
    for (const tp of topics) {
      const text = cd.suits[s][tp];
      assert.ok(typeof text === 'string' && text.length >= 10, `${s}.${tp} 缺失或过短`);
      all.push(text);
    }
  }
  assert.equal(all.length, 22 * 5 + 4 * 5, '总条目应为 22×5 + 4×5 = 130');
  assert.equal(new Set(all).size, all.length, '逐牌分域释义出现重复文本');

  // 覆盖率：牌库里每一张牌都必须能取到对应域释义（大阿卡纳按 id，其余按花色）
  for (const c of cards) {
    const src = c.arcana === 'major' ? cd.majors[c.id] : cd.suits[c.suit];
    assert.ok(src, `牌 ${c.id}（${c.cn}）取不到分域释义`);
    for (const tp of topics) assert.ok(src[tp], `牌 ${c.id} 的 ${tp} 域缺失`);
  }
});

test('塔罗牌间连线语料：经典组合键合法、全部模板占位符可闭合', () => {
  const t = D('interpret-tarot.json');
  const L = t.links;
  assert.ok(L, '缺 links 节');
  assert.ok(L.title && L.title.length >= 4, '缺 links.title');
  for (const k of ['note', 'patternsTitle', 'patternsNote', 'runTpl']) assert.ok(L[k] && L[k].length >= 6, `缺 links.${k}`);

  // 经典组合：键必须为「两个真实牌 id 升序排序后 + 连接」，且每键有文案
  const deckIds = new Set(D('tarot.json').cards.map((c) => c.id));
  const classicKeys = Object.keys(L.classic ?? {});
  assert.ok(classicKeys.length >= 10, '经典组合应不少于 10 组');
  for (const key of classicKeys) {
    const [a, b] = key.split('+');
    assert.equal(2, key.split('+').length, `经典组合键 ${key} 应恰含两张牌`);
    assert.ok(deckIds.has(a) && deckIds.has(b), `经典组合 ${key} 引用了不存在的牌`);
    assert.equal(key, [a, b].sort().join('+'), `经典组合键 ${key} 未按 id 升序（引擎用 sort 后查表，乱序会静默失配）`);
    assert.ok(L.classic[key].length >= 10, `经典组合 ${key} 文案过短`);
  }

  // 模板占位符
  const need = (key, ph) => {
    assert.ok(L[key], `缺 links.${key}`);
    for (const p of ph) assert.ok(L[key].includes(`{${p}}`), `links.${key} 缺占位符 {${p}}`);
  };
  need('echo', ['aCn', 'bCn', 'num']);
  need('courtRole', ['court', 'event']);
  need('acesMany', ['n']);
  need('courtsFew', ['n']);
  need('courtsMany', ['n']);
  need('runTpl', ['nums']);
  for (const k of ['mirror', 'majorUp', 'majorDown', 'majorUpCross', 'majorDownCross', 'suitUp', 'suitDown', 'suitFive', 'courtPair', 'majorMinor', 'fireAir', 'waterEarth', 'fireWater', 'airEarth', 'fireEarth', 'waterAir']) {
    need(k, ['aCn', 'bCn']);
  }
  for (const k of ['acesNone', 'acesOne', 'courtsNone']) assert.ok(L[k] && L[k].length >= 10, `缺 links.${k}`);

  // 五段式三句必须含 {kw}（本轮的核心升级点）
  for (const k of ['opening', 'tension', 'turn']) {
    assert.ok(t.synthesis[k].includes('{kw}'), `synthesis.${k} 缺 {kw}（关键词织入）`);
  }
});
