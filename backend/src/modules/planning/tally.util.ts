/**
 * Pure Auszählungslogik der Restaurant-Abstimmung — ohne Seiteneffekte,
 * dadurch vollständig unit-testbar.
 */

export interface VoteLike {
  restaurantId: string;
}

export type VotingOutcome =
  | { kind: 'no_votes' }
  | { kind: 'winner'; restaurantId: string; voteCount: number }
  | { kind: 'tie'; candidateIds: string[]; voteCount: number };

/** Zählt Stimmen je Restaurant; nur zugelassene Optionen werden gewertet. */
export function countVotes(votes: VoteLike[], allowedRestaurantIds: string[]): Map<string, number> {
  const allowed = new Set(allowedRestaurantIds);
  const counts = new Map<string, number>();
  for (const id of allowedRestaurantIds) counts.set(id, 0);
  for (const vote of votes) {
    if (!allowed.has(vote.restaurantId)) continue;
    counts.set(vote.restaurantId, (counts.get(vote.restaurantId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Ermittelt das Ergebnis eines Wahlgangs:
 * - keine Stimme            → no_votes
 * - eindeutiges Maximum     → winner
 * - mehrere mit Maximum     → tie (Kandidatenliste)
 */
export function evaluateVoting(votes: VoteLike[], allowedRestaurantIds: string[]): VotingOutcome {
  const counts = countVotes(votes, allowedRestaurantIds);
  let max = 0;
  for (const count of counts.values()) max = Math.max(max, count);
  if (max === 0) return { kind: 'no_votes' };

  const top = [...counts.entries()]
    .filter(([, count]) => count === max)
    .map(([restaurantId]) => restaurantId);

  if (top.length === 1) {
    return { kind: 'winner', restaurantId: top[0], voteCount: max };
  }
  return { kind: 'tie', candidateIds: top.sort(), voteCount: max };
}

/** Losentscheid — rng injizierbar für deterministische Tests. */
export function pickRandom<T>(items: T[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error('pickRandom: leere Liste');
  const index = Math.floor(rng() * items.length);
  return items[Math.min(index, items.length - 1)];
}
