// 民俗占卜回归测试 — 掷筊判定表穷举 + 连掷惯例 + 求签确定性 + 数据闭合与缺键容忍
import { readFileSync } from 'node:fs';
import { drawSign, signById, validateSigns } from '../site/js/core/guanyin.mjs';
import { castMoonblock, voteThree } from '../site/js/core/jiaobei.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const signsData = JSON.parse(readFileSync(new URL('../site/data/guanyin-signs.json', import.meta.url), 'utf8'));
const interp = JSON.parse(readFileSync(new URL('../site/data/interpret-guanyin.json', import.meta.url), 'utf8'));

// 确定性 rng 桩：按队列依次返回（每枚杯面消费一个值；<0.5 记平/阳面、≥0.5 记凸/阴面）
const rngQueue = (values) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('rng 队列耗尽');
    return values[i++];
  };
};

test('掷筊判定表：两枚组合 100% 分支覆盖（一平一凸=圣 / 两平=笑 / 两凸=阴）', () => {
  // 组合穷举（按 jiaobei-rules.md 口径；程序只依赖组合判定，不依赖平/凸与阴阳的命名争议）
  const cases = [
    [[0, 0.9], 'sheng', '圣筊', '允'],  // 平+凸
    [[0.9, 0], 'sheng', '圣筊', '允'],  // 凸+平（顺序无关）
    [[0, 0], 'xiao', '笑筊', '未明'],   // 两平（两阳面）→ 未置可否
    [[0.9, 0.9], 'yin', '阴筊', '否'],  // 两凸（两阴面）→ 否定
  ];
  for (const [queue, key, cn, verdict] of cases) {
    const c = castMoonblock(rngQueue(queue));
    assert.equal(c.key, key, `组合 ${queue} 应为 ${cn}`);
    assert.equal(c.cn, cn);
    assert.equal(c.verdict, verdict);
    assert.equal(c.faces.length, 2);
  }
});

test('voteThree 惯例：三圣=允 / 见阴=否 / 其余=未明，且圣筊计数正确', () => {
  // 三掷全圣：每掷需一平一凸 → 序列 [0,0.9] ×3
  const all = voteThree(rngQueue([0, 0.9, 0, 0.9, 0, 0.9]));
  assert.equal(all.shengCount, 3);
  assert.equal(all.yinCount, 0);
  assert.equal(all.verdict, '允', '连续三次圣筊应判允');

  // 至少一掷阴筊（两掷圣 + 第三掷两凸）→ 否
  const hasYin = voteThree(rngQueue([0, 0.9, 0, 0.9, 0.9, 0.9]));
  assert.equal(hasYin.yinCount, 1);
  assert.equal(hasYin.verdict, '否', '三掷中见阴筊应判否');

  // 无圣无阴（全笑筊）→ 未明
  const allXiao = voteThree(rngQueue([0, 0, 0, 0, 0, 0]));
  assert.equal(allXiao.shengCount, 0);
  assert.equal(allXiao.yinCount, 0);
  assert.equal(allXiao.verdict, '未明');

  // 混合（圣+笑+笑）→ 未明
  const mixed = voteThree(rngQueue([0, 0.9, 0, 0, 0, 0]));
  assert.equal(mixed.shengCount, 1);
  assert.equal(mixed.verdict, '未明');
  assert.equal(mixed.casts.length, 3, '固定连掷三次');
});

test('drawSign：注入 rng 确定性、范围 1..100、越界防护', () => {
  assert.equal(drawSign(rngQueue([0])), 1, 'rng=0 → 第 1 签');
  assert.equal(drawSign(rngQueue([0.999])), 100, 'rng≈1 → 第 100 签');
  assert.equal(drawSign(rngQueue([0.415])), 42, '0.415*100+1 → 42（floor）');
  // 全值域扫描不越界
  for (let i = 0; i < 100; i++) {
    const id = drawSign(rngQueue([i / 100]));
    assert.ok(id >= 1 && id <= 100);
  }
  assert.throws(() => drawSign(undefined));
});

test('validateSigns：签库数据闭合（id 1..100 连续、luck 三档、签诗 4 句）', () => {
  const v = validateSigns(signsData);
  assert.deepEqual(v, { ok: true, errors: [] }, `校验失败：${v.errors.join('；')}`);
  assert.equal(signsData.signs.length, 100);
});

test('signById：闭合数据恒可命中；越界抛错', () => {
  assert.equal(signById(signsData, 1).id, 1);
  assert.equal(signById(signsData, 100).id, 100);
  assert.throws(() => signById(signsData, 0));
  assert.throws(() => signById(signsData, 101));
});

test('interpret 缺键容忍：domainsOrder 覆盖全部分项键；渲染层有「此签未列」兜底可用', () => {
  const order = interp.domainsOrder;
  assert.equal(order.length, 16, 'domainsOrder 应为 16 类');
  // 每签 interpret 的键都落在 domainsOrder 内（渲染不会漏键）
  const orderSet = new Set(order);
  for (const s of signsData.signs) {
    for (const k of Object.keys(s.interpret ?? {})) {
      assert.ok(orderSet.has(k), `签 ${s.id} 的分项键「${k}」不在 domainsOrder 中`);
    }
  }
  // 抽样验证「按签非全键」确实存在 → 渲染层缺键兜底（missingNote）有实际用武之地
  const partial = signsData.signs.filter((s) => Object.keys(s.interpret ?? {}).length < order.length);
  assert.ok(partial.length > 0, '应存在非全键的签（缺键兜底才有意义）');
  assert.ok(interp.missingNote && interp.missingNote.length > 0, 'interpret 缺 missingNote 兜底文案');
  // 抽样 3 签：缺键数 = domainsOrder 与该签键集之差，且均为正整数
  for (const s of partial.slice(0, 3)) {
    const missing = order.filter((k) => !(k in (s.interpret ?? {})));
    assert.ok(missing.length > 0 && Number.isInteger(missing.length));
  }
});
