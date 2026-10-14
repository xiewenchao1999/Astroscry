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
