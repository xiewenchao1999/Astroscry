// wheel.mjs — 西方星盘 SVG 轮自绘（整宫制；无依赖、可在 Node 生成用于测试）
// 输入 castNatal() 的输出；输出 SVG 字符串

import { ASPECTS } from '../core/astro.mjs';

const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const PLANET_GLYPHS = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', northnode: '☊' };
// O06：颜色随单一相位表派生；本命轮只画 inNatal:true 的相位（150°/30° 小相位仅合盘/行运使用）
const ASPECT_COLORS = Object.fromEntries(ASPECTS.map((a) => [a.key, a.color]));
const IN_NATAL = new Set(ASPECTS.filter((a) => a.inNatal).map((a) => a.key));

const R_OUT = 210, R_SIGN = 178, R_DEG = 156, R_PLANET = 128, R_ASPECT = 96, CX = 220, CY = 220;

function pt(angleDeg, radius) {
  // 占星黄经：0°白羊在左侧（9 点钟方向），逆时针增长
  const a = (180 - angleDeg) * Math.PI / 180;
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

/**
 * @param {object} natal castNatal() 输出
 * @returns {string} SVG
 */
export function renderWheel(natal) {
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440" width="440" height="440" role="img" aria-label="星盘轮">`);
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_OUT}" fill="rgba(255,255,255,0.03)" stroke="#8ea8ff55"/>`);
  // 12 星座扇区
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30, a1 = (i + 1) * 30;
    const [x0, y0] = pt(a0, R_OUT), [x1, y1] = pt(a1, R_OUT);
    const [xi, yi] = pt(a0, R_DEG), [xj, yj] = pt(a1, R_DEG);
    parts.push(`<path d="M${x0},${y0} A${R_OUT},${R_OUT} 0 0 1 ${x1},${y1} L${xj},${yj} A${R_DEG},${R_DEG} 0 0 0 ${xi},${yi} Z" fill="rgba(255,255,255,${i % 2 ? 0.045 : 0.02})" stroke="#8ea8ff33"/>`);
    const [gx, gy] = pt(a0 + 15, (R_OUT + R_SIGN) / 2);
    parts.push(`<text x="${gx}" y="${gy + 6}" text-anchor="middle" font-size="17" fill="#f0c86d">${SIGN_GLYPHS[i]}</text>`);
  }
  // 内圈
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DEG}" fill="none" stroke="#8ea8ff44"/>`);
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_ASPECT}" fill="none" stroke="#8ea8ff22"/>`);
  // 度数刻度（每 10°）
  for (let d = 0; d < 360; d += 10) {
    const long = d % 30 === 0 ? 8 : 4;
    const [x0, y0] = pt(d, R_SIGN), [x1, y1] = pt(d, R_SIGN - long);
    parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#8ea8ff55"/>`);
  }
  // 上升 / 中天轴
  const ascLine = pt(natal.asc, R_DEG);
  parts.push(`<line x1="${CX}" y1="${CY}" x2="${ascLine[0]}" y2="${ascLine[1]}" stroke="#f0c86d" stroke-width="1.6"/>`);
  parts.push(`<text x="${ascLine[0]}" y="${ascLine[1] - 6}" text-anchor="middle" font-size="12" fill="#f0c86d" stroke="#0a0e23" stroke-width="3" paint-order="stroke">ASC ${Math.round(natal.asc)}°</text>`);
  const mcLine = pt(natal.mc, R_DEG);
  parts.push(`<line x1="${CX}" y1="${CY}" x2="${mcLine[0]}" y2="${mcLine[1]}" stroke="#f0c86d" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`);
  parts.push(`<text x="${mcLine[0]}" y="${mcLine[1] + 14}" text-anchor="middle" font-size="12" fill="#f0c86d" stroke="#0a0e23" stroke-width="3" paint-order="stroke">MC ${Math.round(natal.mc)}°</text>`);

  // 相位线（本命口径：inNatal 过滤）
  for (const asp of natal.aspects) {
    if (!IN_NATAL.has(asp.aspect)) continue;
    const a = natal.planets[asp.a], b = natal.planets[asp.b];
    if (!a || !b) continue;
    const [x0, y0] = pt(a.lon, R_ASPECT), [x1, y1] = pt(b.lon, R_ASPECT);
    parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ASPECT_COLORS[asp.aspect] || '#888'}" stroke-width="${Math.max(1, 2 - asp.orb / 4)}" opacity="0.55"/>`);
  }

  // 行星布局：单层 + 最小弧距线性展开（专业星盘软件的标准做法）。
  // 从最大黄经空隙处切开拉直，正向展开保证相邻展示角间隔 ≥ sep；
  // 若展开跨度溢出（回卷间距不足），整体调小 sep 重试（标签在极密星群下优雅降级）。
  // 被挤开的行星画细引线指回真实黄经，标签始终显示真实度数。
  // ponytail: sep 最低降到 8°（宽度 46px 标签在 128px 半径需 20.6°），极端密排星群仍会有轻微标签交叠
  const MIN_SEP_DEG = 21, MIN_FLOOR = 8;
  const entries = Object.values(natal.planets).filter((p) => p.key !== 'northnode').concat(natal.planets.northnode ? [natal.planets.northnode] : []);
  entries.sort((a, b) => a.lon - b.lon);
  const n = entries.length;
  // 从最大黄经空隙之后开始展开：推移量吃进最空旷区域，最小化视觉偏移
  let startIdx = 0, maxGap = -1;
  for (let i = 0; i < n; i++) {
    const gap = (i === n - 1 ? entries[0].lon + 360 : entries[i + 1].lon) - entries[i].lon;
    if (gap > maxGap) { maxGap = gap; startIdx = (i + 1) % n; }
  }
  const ordered = Array.from({ length: n }, (_, k) => entries[(startIdx + k) % n]);
  let disp = ordered.map((p) => p.lon);
  let sep = MIN_SEP_DEG;
  for (; sep >= MIN_FLOOR; sep -= 1.5) {
    disp = ordered.map((p) => p.lon);
    for (let i = 1; i < n; i++) disp[i] = Math.max(disp[i], disp[i - 1] + sep);
    if (disp[n - 1] - disp[0] <= 360 - sep) break; // 回卷间距也 ≥ sep，全对成立
  }
  ordered.forEach((p, k) => {
    const show = disp[k] % 360;
    if (Math.abs(show - p.lon) > 0.5 && Math.abs(show - p.lon) < 359) {
      // 引线：真实黄经 → 展示位置
      const [x0, y0] = pt(p.lon, R_PLANET - 2);
      const [x1, y1] = pt(show, R_PLANET + 2);
      parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#f0c86d" stroke-width="0.8" opacity="0.7"/>`);
    }
    const [x, y] = pt(show, R_PLANET);
    const color = p.retrograde ? '#fca5a5' : '#e9ecfa';
    parts.push(`<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" fill="${color}" stroke="#0a0e23" stroke-width="3" paint-order="stroke">${PLANET_GLYPHS[p.key] || p.key}${p.retrograde ? '℞' : ''}</text>`);
    const [tx, ty] = pt(show, R_PLANET - 13);
    parts.push(`<text x="${tx}" y="${ty + 3}" text-anchor="middle" font-size="8.5" fill="#c3c9e8" stroke="#0a0e23" stroke-width="2.5" paint-order="stroke">${Math.floor(p.degInSign)}°${p.signCn}</text>`);
  });

  parts.push('</svg>');
  return parts.join('');
}
