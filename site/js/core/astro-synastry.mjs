// astro-synastry.mjs — 跨盘相位引擎（合盘 synastry 与行运 transits 共用，纯函数，无 DOM / 无网络）
// 契约设计参考 RoxyAPI synastry-api 的响应结构（score/interAspects/summary/strengths/challenges），计算全部本地确定性实现
// 相位表/角差/行星权重统一 import 自 astro.mjs（O06 单一事实来源：ASPECTS 含 150°/30° 小相位，
// 发光体加成 luminaryBonus 已与本命口径归一为 2°；ponytail: 45°/135° 容许度极小且噪声大，暂缓收录）
import { ASPECTS, PLANET_WEIGHT, angDiff } from './astro.mjs';

/**
 * 跨盘相位：A 盘行星 × B 盘行星。
 * @param {object} planetsA {key:{key,cn,lon,...}}（castNatal().planets 或 computeSky().planets）
 * @param {object} planetsB 同上
 * @returns {{items:Array, summary:object}} items 按 strength 降序
 */
export function interAspects(planetsA, planetsB) {
  const items = [];
  for (const a of Object.values(planetsA)) {
    for (const b of Object.values(planetsB)) {
      if (a.key === 'northnode' || b.key === 'northnode') continue;
      const diff = angDiff(a.lon, b.lon);
      for (const def of ASPECTS) {
        const luminary = [a.key, b.key].some((k) => k === 'sun' || k === 'moon');
        const orbMax = def.orb + (luminary ? def.luminaryBonus : 0);
        const orb = Math.abs(diff - def.angle);
        if (orb > orbMax) continue;
        const w = (PLANET_WEIGHT[a.key] ?? 1) * (PLANET_WEIGHT[b.key] ?? 1);
        // 强度：越接近精确相位、行星权重越高 → 0-100
        const strength = Math.round(Math.max(0, (1 - orb / orbMax)) * 100 * Math.min(1, w / 4));
        const nature = def.key === 'conj' ? 'neutral' : def.nature;
        items.push({
          a: a.key, aCn: a.cn, b: b.key, bCn: b.cn,
          aspect: def.key, aspectCn: def.cn, angle: def.angle,
          orb: +orb.toFixed(2), nature, weight: w, strength,
        });
        break; // 每对行星只取最接近的一种相位
      }
    }
  }
  items.sort((x, y) => y.strength - x.strength);
  return { items, summary: summarize(items) };
}

function summarize(items) {
  const summary = { total: items.length, harmonious: 0, challenging: 0, neutral: 0, byType: {} };
  for (const it of items) {
    summary[it.nature === 'harmonious' ? 'harmonious' : it.nature === 'challenging' ? 'challenging' : 'neutral']++;
    summary.byType[it.aspectCn] = (summary.byType[it.aspectCn] ?? 0) + 1;
  }
  return summary;
}

/**
 * 兼容度评分 0-100：以相位强度×行星权重累加吉凶净值，映射到分数。
 * 全六合=高分，全刑冲=低分，无相位=中位 50。
 */
export function compatibilityScore(interAspectItems) {
  let delta = 0, maxPossible = 0;
  for (const it of interAspectItems) {
    const dir = it.nature === 'harmonious' ? 1 : it.nature === 'challenging' ? -1 : 0.25; // 合相略偏正面
    delta += dir * (it.strength / 100) * Math.min(4, it.weight);
    maxPossible += Math.min(4, it.weight);
  }
  if (maxPossible === 0) return 50;
  const score = 50 + (delta / maxPossible) * 45;
  return Math.round(Math.max(5, Math.min(95, score)));
}

/**
 * 优势与挑战：取最强和谐/挑战相位各前 N 条（结构化，文案由页面按语料拼装）。
 */
export function strengthsAndChallenges(items, n = 3) {
  const harmonious = items.filter((x) => x.nature === 'harmonious').slice(0, n);
  const challenging = items.filter((x) => x.nature === 'challenging').slice(0, n);
  const neutral = items.filter((x) => x.nature === 'neutral').slice(0, n);
  return { harmonious, challenging, neutral };
}

/** 组合键（用于查语料，如 sun+moon → 'sun-moon'，双向归一） */
export function pairKey(aKey, bKey) {
  return [aKey, bKey].sort().join('-');
}

/** 整宫制：黄经 → 相对上升星座的第几宫（1-12）。signIndex 缺省时由黄经推导（兼容 computeSky 输出） */
function wholeSignHouse(lon, ascSignIndex) {
  const signIndex = Math.floor((((lon % 360) + 360) % 360) / 30);
  return (((signIndex - ascSignIndex) % 12) + 12) % 12 + 1;
}

/**
 * 宫位叠加：A 的行星落入 B 的哪些宫（aInB），B 的行星落入 A 的哪些宫（bInA）。
 * @param {object} natalA/natalB {planets, ascSignIndex}（castNatal() 输出）
 * @returns {{aInB:Array, bInA:Array}} 各按宫位升序、同宫按行星权重降序
 */
export function houseOverlay(natalA, natalB) {
  const map = (planets, ascIdx) => Object.values(planets).map((p) => ({
    planet: p.key, planetCn: p.cn, signCn: p.signCn,
    house: wholeSignHouse(p.lon, ascIdx),
  })).sort((x, y) => x.house - y.house || (PLANET_WEIGHT[y.planet] ?? 1) - (PLANET_WEIGHT[x.planet] ?? 1));
  return { aInB: map(natalA.planets, natalB.ascSignIndex), bInA: map(natalB.planets, natalA.ascSignIndex) };
}

// 关系维度：按行星类别划分，顺序即优先级（每条相位只计入第一个命中的维度，保证互斥）
// ponytail: 划分为传统占星经验的粗分类（金火=吸引、水=沟通、日月=情感、木土=承诺），外行星（天/海/冥）不单独设维度
const DIMENSION_DEFS = [
  { key: 'romance', cn: '恋爱吸引', match: (a, b) => ['venus', 'mars'].includes(a) || ['venus', 'mars'].includes(b) },
  { key: 'mental', cn: '智识沟通', match: (a, b) => a === 'mercury' || b === 'mercury' },
  { key: 'emotional', cn: '情感共鸣', match: (a, b) => ['sun', 'moon'].includes(a) || ['sun', 'moon'].includes(b) },
  { key: 'stability', cn: '长期承诺', match: (a, b) => ['jupiter', 'saturn'].includes(a) || ['jupiter', 'saturn'].includes(b) },
];

/**
 * 兼容度分类维度：把跨盘相位按维度互斥分组，各维度独立评分（与总分同模型）。
 * @returns {object} {romance:{cn,count,score,top}, ...} 无相位的维度 score=null
 */
export function compatibilityDimensions(items) {
  const out = {};
  for (const def of DIMENSION_DEFS) {
    const subset = items.filter((it) => def.match(it.a, it.b));
    out[def.key] = {
      cn: def.cn, count: subset.length,
      score: subset.length ? compatibilityScore(subset) : null,
      top: subset[0] ?? null,
    };
  }
  return out;
}
