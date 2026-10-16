// Opt-in ports from sganggs/Stronghold-Protocol c24e17ee. Independent switches allow paired ablations.
// [ASSUMED] AI heuristics only; no game rules or boss-layout changes.
export const BOT_REFINEMENTS = ['preview', 'capacity', 'guards', 'medics', 'cheap'];
export const RECOMMENDED_REFINEMENTS = Object.freeze(['preview', 'capacity']);
export function defaultBotRefinements(m) {
  return m.botIoletaPolicy === 'experimental' && m.botFormationEnabled === false ? RECOMMENDED_REFINEMENTS : [];
}
export function botRefinement(m, key) {
  return (m.botRefinements ?? defaultBotRefinements(m)).includes(key);
}
