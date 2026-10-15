// 提示词出口测试（ADR-003）：零网络复制出口的完整性与纯函数边界
// 关注点：① 与站内流式解读共用同一份约束（避免两套模板漂移）② 提示词包含必要骨架 ③ 生成过程不触网
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const MODULE_PATH = join(import.meta.dirname, '..', 'site', 'js', 'ui', 'ai-reading.mjs');
const SRC = readFileSync(MODULE_PATH, 'utf8');
const { buildPromptText, buildCombinedPromptText, buildMessages, INTERPRET_RULES, domainLabel } =
  await import(new URL('../site/js/ui/ai-reading.mjs', import.meta.url));

/** 取两个函数之间的源码片段，用于断言纯函数边界 */
function sliceBetween(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  const b = SRC.indexOf(endMarker);
  assert.ok(a >= 0 && b > a, `源码中未找到片段标记：${startMarker} → ${endMarker}`);
  return SRC.slice(a, b);
}

const SAMPLE_BAZI = {
  input: { year: 2000, month: 1, day: 1, hour: 12, gender: 'male' },
  pillars: { year: '己卯', month: '丙子', day: '戊午', time: '戊午' },
};
const SAMPLE_QIMEN = { ju: 7, juName: '阳遁七局', zhiFuStar: '天冲', zhiFuPalace: 3, palaces: { 1: { stars: ['天蓬'], door: '休门' } } };

test('提示词出口：包含口径声明 / 解读约束 / 排盘数据 / 提问槽 / 免责', () => {
  const text = buildPromptText('bazi', SAMPLE_BAZI, '我今年适合换工作吗？');
  assert.ok(text.includes(INTERPRET_RULES), '必须内联同一份解读约束常量');
  assert.ok(text.includes('先声明口径'), '必须要求 AI 先声明口径');
  assert.ok(text.includes('禁止恐吓式语言'), '必须包含反恐吓约束');
  assert.ok(text.includes('本解读仅供文化参考'), '必须包含免责声明要求');
  assert.ok(text.includes('戊午'), '必须包含真实排盘数据');
  assert.ok(text.includes('八字四柱盘'), '必须声明盘面类型');
  assert.ok(text.includes('我今年适合换工作吗？'), '必须带上用户问题');
  assert.ok(text.length > 200, '提示词不应是空壳');
});

test('提示词出口：未填问题时给出可填写的槽位而不是报错', () => {
  const text = buildPromptText('qimen', SAMPLE_QIMEN, '');
  assert.ok(text.includes('【我的问题】'), '必须保留提问段');
  assert.ok(text.includes('在这里填写你的具体问题'), '留空时应给出填写指引');
});

test('提示词出口：含出生数据的使用提示（本功能本身会把数据带出浏览器）', () => {
  const text = buildPromptText('natal', { planets: [] }, '');
  assert.ok(text.includes('出生/排盘数据'), '必须提示内容含出生数据');
  assert.ok(text.includes('本站自身不会向任何服务器发送'), '必须说明站点自身不外呼');
});

test('站内解读与复制提示词共用同一份约束（单一事实来源）', () => {
  const messages = buildMessages('tarot', { cards: [{ pos: '过去', name: '愚者', reversed: false }] }, '');
  assert.ok(messages[0].content.includes(INTERPRET_RULES), 'system 必须使用同一份约束常量');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[1].content.includes('愚者'), 'user 消息必须含结构化数据');
});

test('提示词生成是纯函数：片段内无 fetch / 无 aiEnabled 判定', () => {
  const seg = sliceBetween('export function buildPromptText', 'export async function* streamReading');
  assert.ok(!/fetch\s*\(/.test(seg), '提示词出口不得包含任何网络调用');
  assert.ok(!/aiEnabled\s*\(/.test(seg), '提示词出口不得依赖 AI 开关（关闭态必须可用）');
});

test('跨页提示词：聚合多盘并保留各自领域标签', () => {
  const text = buildCombinedPromptText([
    { domain: 'bazi', summary: '日主戊土', structured: SAMPLE_BAZI },
    { domain: 'qimen', summary: '阳遁七局', structured: SAMPLE_QIMEN },
  ], '综合看看这段时间');
  assert.ok(text.includes(domainLabel('bazi')), '应含八字领域描述');
  assert.ok(text.includes(domainLabel('qimen')), '应含奇门领域描述');
  assert.ok(text.includes('综合看看这段时间'));
  assert.ok(text.includes('【盘 1】') && text.includes('【盘 2】'), '应按盘编号');
});

test('未支持的领域必须显式报错，不得静默产出空提示词', () => {
  assert.throws(() => buildPromptText('unknown', {}, ''), /暂未支持/);
  assert.throws(() => buildCombinedPromptText([], ''), /暂无可综合/);
});
