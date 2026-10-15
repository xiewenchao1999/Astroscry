// jiaobei.mjs — 掷圣杯（掷筊）核心计算（纯函数，无 DOM / 无网络）
// 判定表口径：docs/research/round2/corpus/eastern/jiaobei-rules.md（维基百科「掷筊」+ 鼎稔道學館，三来源组合判定一致）
//   一平一凸 = 圣筊（允）· 两平（两阳面）= 笑筊（未置可否，可再问）· 两凸（两阴面）= 阴筊/怒筊（不宜，宜改问法）
// ponytail: 真实筊杯凸面着地概率并非 50/50（杯型几何决定），v1 用 0.5/0.5 均匀近似；升级路径=可配置阴阳面概率

export const MOONBLOCK_TYPES = {
  sheng: { key: 'sheng', cn: '圣筊', verdict: '允', desc: '一平一凸：神明允准、同意，行事会顺利。' },
  xiao: { key: 'xiao', cn: '笑筊', verdict: '未明', desc: '两平（两阳面）：神明一笑、未置可否或考虑中；可重新禀明再掷。' },
  yin: { key: 'yin', cn: '阴筊', verdict: '否', desc: '两凸（两阴面）：神明否定、不悦或不宜行事；宜重新禀明、调整问法再请示。' },
};

/**
 * 单掷：两枚筊杯各随机得「平（阳面）/凸（阴面）」，查组合判定表。
 * @param {() => number} rng 返回 [0,1) 的随机源（<0.5 记平、≥0.5 记凸）
 * @returns {{ key: 'sheng'|'xiao'|'yin', cn: string, verdict: string, desc: string, faces: ['flat'|'convex', 'flat'|'convex'] }}
 */
export function castMoonblock(rng) {
  if (typeof rng !== 'function') throw new Error('castMoonblock 需要注入 rng');
  const faces = [rng() < 0.5 ? 'flat' : 'convex', rng() < 0.5 ? 'flat' : 'convex'];
  const flatCount = faces.filter((f) => f === 'flat').length;
  const key = flatCount === 1 ? 'sheng' : flatCount === 2 ? 'xiao' : 'yin';
  return { ...MOONBLOCK_TYPES[key], faces };
}

/**
 * 连掷三次（「连续三次圣筊方视为允准」惯例口径）。
 * 总评：三圣筊=允；至少一掷阴筊=否；其余（含笑筊）=未明，可再问。
 * @returns {{ casts: Array, shengCount: number, yinCount: number, verdict: '允'|'否'|'未明' }}
 */
export function voteThree(rng) {
  const casts = [castMoonblock(rng), castMoonblock(rng), castMoonblock(rng)];
  const shengCount = casts.filter((c) => c.key === 'sheng').length;
  const yinCount = casts.filter((c) => c.key === 'yin').length;
  const verdict = shengCount === 3 ? '允' : yinCount > 0 ? '否' : '未明';
  return { casts, shengCount, yinCount, verdict };
}
