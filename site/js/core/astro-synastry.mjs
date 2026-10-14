// astro-synastry.mjs — 跨盘相位引擎（合盘 synastry 与行运 transits 共用，纯函数，无 DOM / 无网络）
// 契约设计参考 RoxyAPI synastry-api 的响应结构（score/interAspects/summary/strengths/challenges），计算全部本地确定性实现
// ponytail: 小相位仅收录 150°/30°（45°/135° 容许度极小且噪声大，暂缓）；评分权重为经验值，非统计模型

const ASPECT_DEFS = [
  { angle: 0, key: 'conj', cn: '合相', orb: 8, nature: 'neutral' },
  { angle: 60, key: 'sextile', cn: '六合', orb: 4, nature: 'harmonious' },
  { angle: 90, key: 'square', cn: '刑相', orb: 6, nature: 'challenging' },
  { angle: 120, key: 'trine', cn: '拱相', orb: 6, nature: 'harmonious' },
  { angle: 150, key: 'quincunx', cn: '补十二分相', orb: 3, nature: 'challenging' },
  { angle: 30, key: 'semisextile', cn: '十二分相', orb: 2, nature: 'neutral' },
  { angle: 180, key: 'opp', cn: '冲相', orb: 8, nature: 'challenging' },
];

const PLANET_WEIGHT = {
  sun: 3, moon: 3, venus: 2.5, mars: 2.5,
  jupiter: 1.5, saturn: 1.5, mercury: 1.2,
  uranus: 0.8, neptune: 0.8, pluto: 0.8, northnode: 0.5,
};

function angDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

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
      for (const def of ASPECT_DEFS) {
        const luminary = [a.key, b.key].some((k) => k === 'sun' || k === 'moon');
        const orbMax = def.orb + (luminary ? 1.5 : 0);
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
