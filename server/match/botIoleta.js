// Local owner AI policy (2026-10-15): three deployed elites before L2, six before L3;
// preserve elites, with independent three-member goals for 坚守 / 精准 / 奥术. This changes
// decisions only, not 统御号令 or the game's upgrade / bond rules.
export const isIoleta = (ps) => ps.bandId === 'band_ioleta';
export const eliteCount = (gd, pieces) => pieces.filter((p) => p.kind === 'chess' && gd.isGolden(p.id)).length;

// [ASSUMED] Heuristic weights: a deployed elite outweighs a normal bond improvement;
// member and completion bonuses stay below the elite value; fourth members add no bonus.
export const IOLETA_ELITE_VALUE = 120;
const BONDS = [['steadShip', 12], ['preciShip', 10], ['arcaneShip', 8]];

export function ioletaBuyBondBonus(gd, rec, owned) {
  return BONDS.reduce((score, [id, weight]) => score + (!gd.modeInactiveBonds.has(id)
    && rec.bonds.includes(id) && (owned.counts.get(id) || 0) < 3
    ? weight * ((owned.counts.get(id) || 0) === 2 ? 3 : 1) : 0), 0);
}

export function ioletaBondScore(gd, bonds) {
  let score = 0;
  for (const [id, weight] of BONDS) {
    if (gd.modeInactiveBonds.has(id)) continue;
    const n = Math.min(3, bonds[id]?.count || 0);
    score += weight * (n + (n === 3 ? 2 : 0));
  }
  return score;
}

export function ioletaCanLevel(ps) {
  if (!isIoleta(ps) || ps.shop.level >= 3) return true;
  const required = ps.shop.level === 1 ? 3 : 6;
  return eliteCount(ps.gd, [...ps.board.values()]) >= required;
}
