// guanyin.mjs — 观音灵签核心计算（纯函数，无 DOM / 无网络）
// 数据：site/data/guanyin-signs.json（浅草寺一百观音签体系，来源注记见其 _meta.provenance）
// 签运 luck ∈ {上签, 中签, 下签}；interpret 分项解按签非全键，渲染层需容忍缺键（见 interpret-guanyin.json domainsOrder）

/**
 * 求签：100 签均匀抽取，返回签号 1..100（rng 注入可测；页面传 cryptoRng 真随机）。
 * @param {() => number} rng 返回 [0,1) 的随机源
 * @returns {number} 签号 1..100
 */
export function drawSign(rng) {
  if (typeof rng !== 'function') throw new Error('drawSign 需要注入 rng');
  const n = Math.floor(rng() * 100) + 1;
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error(`签号越界：${n}`);
  return n;
}

/** 签号 → 签对象（数据闭合校验后恒可命中，越界抛错） */
export function signById(data, id) {
  const sign = data?.signs?.[id - 1];
  if (!sign || sign.id !== id) throw new Error(`签号 ${id} 不存在`);
  return sign;
}

/**
 * 数据闭合校验：id 1..100 连续、luck 三档合法、poem 为 4 句数组、story/storyDetail 非空。
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSigns(data) {
  const errors = [];
  const signs = data?.signs;
  if (!Array.isArray(signs) || signs.length !== 100) return { ok: false, errors: [`签数应为 100，实际 ${signs?.length}`] };
  signs.forEach((s, i) => {
    if (s.id !== i + 1) errors.push(`签序不连续：第 ${i + 1} 位 id=${s.id}`);
    if (!['上签', '中签', '下签'].includes(s.luck)) errors.push(`签 ${s.id} luck 非法：${s.luck}`);
    if (!Array.isArray(s.poem) || s.poem.length !== 4 || s.poem.some((l) => !l)) errors.push(`签 ${s.id} 签诗应恰为 4 句`);
    if (!s.story) errors.push(`签 ${s.id} 缺典故名`);
    if (!s.storyDetail) errors.push(`签 ${s.id} 缺典故详解`);
  });
  return { ok: errors.length === 0, errors };
}
