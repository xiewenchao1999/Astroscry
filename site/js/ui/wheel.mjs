// wheel.mjs — 西方星盘 SVG 轮自绘（整宫制；无依赖、可在 Node 生成用于测试）
// 输入 castNatal() 的输出；输出 SVG 字符串

const SIGN_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const PLANET_GLYPHS = { sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇', northnode: '☊' };
const ASPECT_COLORS = { conj: '#7dd3fc', sextile: '#86efac', trine: '#86efac', square: '#fca5a5', opp: '#fca5a5' };

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
  parts.push(`<text x="${ascLine[0]}" y="${ascLine[1] - 6}" text-anchor="middle" font-size="12" fill="#f0c86d">ASC ${Math.round(natal.asc)}°</text>`);
  const mcLine = pt(natal.mc, R_DEG);
  parts.push(`<line x1="${CX}" y1="${CY}" x2="${mcLine[0]}" y2="${mcLine[1]}" stroke="#f0c86d" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`);
  parts.push(`<text x="${mcLine[0]}" y="${mcLine[1] + 14}" text-anchor="middle" font-size="12" fill="#f0c86d">MC ${Math.round(natal.mc)}°</text>`);

  // 相位线
  for (const asp of natal.aspects) {
    const a = natal.planets[asp.a], b = natal.planets[asp.b];
    if (!a || !b) continue;
    const [x0, y0] = pt(a.lon, R_ASPECT), [x1, y1] = pt(b.lon, R_ASPECT);
    parts.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${ASPECT_COLORS[asp.aspect] || '#888'}" stroke-width="${Math.max(1, 2 - asp.orb / 4)}" opacity="0.55"/>`);
  }

  // 行星（同度重叠错开）
  const placed = [];
  const entries = Object.values(natal.planets).filter((p) => p.key !== 'northnode').concat(natal.planets.northnode ? [natal.planets.northnode] : []);
  entries.sort((a, b) => a.lon - b.lon);
  for (const p of entries) {
    let r = R_PLANET;
    for (const q of placed) {
      if (Math.abs(((q.lon - p.lon + 540) % 360) - 180) > 168 && Math.abs(q.r - r) < 1) r -= 22; // 近度数再排一层
    }
    placed.push({ lon: p.lon, r });
    const [x, y] = pt(p.lon, r);
    const color = p.retrograde ? '#fca5a5' : '#e9ecfa';
    parts.push(`<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" fill="${color}">${PLANET_GLYPHS[p.key] || p.key}${p.retrograde ? '℞' : ''}</text>`);
    const [tx, ty] = pt(p.lon, r - 15);
    parts.push(`<text x="${tx}" y="${ty + 3}" text-anchor="middle" font-size="8.5" fill="#9aa2c9">${Math.floor(p.degInSign)}°${p.signCn}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}
