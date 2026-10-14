// natal-reading.mjs — 西占本命盘解读引擎（规则层，无 AI）
// 输入 castNatal 输出 + interpret-natal.json 语料；三巨头（日/月/升）逐星座释义由
// interpret-horoscope.json 的 signs.trait 承担（页面已有），本模块只产出增量解读。
// ponytail: 行星×星座逐条释义（120 条）未做，用「行星主题 × 宫位领域」规则拼装替代；
//           升级路径 = 语料补逐座条目后在此引擎切换数据源。

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
  // 行星落宫主题句（交点无落宫信息时跳过）
  const inHouses = Object.values(n.planets)
    .filter((p) => p.house && interp.planetThemes[p.key])
    .map((p) => ({
      cn: p.cn,
      signCn: p.signCn,
      house: p.house,
      line: interp.planetInHouseTpl
        .replace('{theme}', interp.planetThemes[p.key])
        .replace('{domain}', interp.houseDomains[String(p.house)] ?? '未知领域')
        .replace('{houseCn}', p.house),
    }));

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
