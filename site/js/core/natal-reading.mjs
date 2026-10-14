// natal-reading.mjs — 西占本命盘解读引擎（规则层，无 AI）
// 输入 castNatal 输出 + interpret-natal.json 语料；三巨头（日/月/升）逐星座释义由
// interpret-horoscope.json 的 signs.trait 承担（页面已有），本模块只产出增量解读。
// ponytail: 日/月/水/金/火五大个人行星已有逐座释义（signsByPlanet）；
//           木土天海冥为世代行星（一代人共享落座）不逐座，仍用「主题 × 宫位」拼装。

import { SIGNS } from './astro.mjs';

const aspectNature = (angle) => (angle === 0 ? 'merge' : (angle === 120 || angle === 60) ? 'harmony' : 'tension');

/**
 * 本命盘解读。
 * @returns {{
 *   summary: string,
 *   inHouses: Array<{ cn: string, signCn: string, house: number, line: string }>,
 *   aspectLines: Array<{ aCn: string, aspectCn: string, bCn: string, orb: number, nature: string, line: string }>,
 *   elements: { dominant: string, missing: string[], line: string },
 *   modality: { dominant: string, line: string }
 * }}
 */
export function readNatal(n, interp) {
  // 行星落宫：个人行星用逐座释义 + 宫位括注；其余行星用「主题 × 宫位领域」拼装
  const inHouses = Object.values(n.planets)
    .filter((p) => p.house && interp.planetThemes[p.key])
    .map((p) => {
      const theme = interp.planetThemes[p.key];
      const domain = interp.houseDomains[String(p.house)] ?? '未知领域';
      const signEntry = interp.signsByPlanet?.[p.key]?.[p.signKey];
      const line = signEntry
        ? `${signEntry}（${theme}主题落于${domain}——第${p.house}宫）`
        : interp.planetInHouseTpl
          .replace('{theme}', theme)
          .replace('{domain}', domain)
          .replace('{houseCn}', p.house);
      return { cn: p.cn, signCn: p.signCn, house: p.house, line };
    });

  // 相位判词：按容许度升序，紧的先讲
  const aspectLines = n.aspects
    .map((a) => {
      const nature = aspectNature(a.angle);
      return {
        aCn: a.aCn,
        aspectCn: a.aspectCn,
        bCn: a.bCn,
        orb: a.orb,
        nature,
        line: interp.aspectTpl
          .replace('{aCn}', a.aCn)
          .replace('{aTheme}', interp.planetThemes[a.a] ?? a.aCn)
          .replace('{bCn}', a.bCn)
          .replace('{bTheme}', interp.planetThemes[a.b] ?? a.bCn)
          .replace('{natureShort}', interp.natureShort[nature])
          .replace('{natureText}', interp.aspectNatures[nature]),
      };
    })
    .sort((x, y) => x.orb - y.orb);

  // 元素分布：主导 + 缺失
  const elTotal = Object.values(n.elements).reduce((a, b) => a + b, 0) || 1;
  const elEntries = Object.entries(n.elements).sort((a, b) => b[1] - a[1]);
  const elDominant = elEntries[0][0];
  const elMissing = elEntries.filter(([, v]) => v === 0).map(([k]) => k);
  const elDetail = elEntries.map(([k, v]) => `${k} ${Math.round((v / elTotal) * 100)}%`).join(' · ');
  const elements = {
    dominant: elDominant,
    missing: elMissing,
    line: interp.elementDominant[elDominant] + (elMissing.length ? '。' + interp.elementMissingTpl.replace('{els}', elMissing.join('、')) : ''),
    detail: interp.elementDetailTpl.replace('{detail}', elDetail),
  };

  // 三态（本位/固定/变动）：按行星落座统计
  const modCount = { 本位: 0, 固定: 0, 变动: 0 };
  for (const p of Object.values(n.planets)) {
    const s = SIGNS[p.signIndex];
    if (s) modCount[s.modality]++;
  }
  const modEntries = Object.entries(modCount).sort((a, b) => b[1] - a[1]);
  const modality = { dominant: modEntries[0][0], line: interp.modalityDominant[modEntries[0][0]] };

  const summary = interp.summaryTpl
    .replace('{el}', elDominant)
    .replace('{mod}', modality.dominant)
    .replace('{sun}', n.planets.sun.signCn)
    .replace('{moon}', n.planets.moon.signCn)
    .replace('{asc}', n.ascSign);

  return { summary, inHouses, aspectLines, elements, modality };
}
