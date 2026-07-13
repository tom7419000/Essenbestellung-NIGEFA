import { countVotes, evaluateVoting, pickRandom } from './tally.util';

describe('tally.util — Auszählung der Restaurant-Abstimmung', () => {
  const A = 'restaurant-a';
  const B = 'restaurant-b';
  const C = 'restaurant-c';

  describe('countVotes', () => {
    it('zählt Stimmen je Restaurant und initialisiert alle Optionen mit 0', () => {
      const counts = countVotes(
        [{ restaurantId: A }, { restaurantId: A }, { restaurantId: B }],
        [A, B, C],
      );
      expect(counts.get(A)).toBe(2);
      expect(counts.get(B)).toBe(1);
      expect(counts.get(C)).toBe(0);
    });

    it('ignoriert Stimmen für nicht zugelassene Restaurants', () => {
      const counts = countVotes([{ restaurantId: 'fremd' }, { restaurantId: A }], [A, B]);
      expect(counts.get(A)).toBe(1);
      expect(counts.has('fremd')).toBe(false);
    });
  });

  describe('evaluateVoting', () => {
    it('meldet no_votes, wenn keine gültige Stimme abgegeben wurde', () => {
      expect(evaluateVoting([], [A, B])).toEqual({ kind: 'no_votes' });
      expect(evaluateVoting([{ restaurantId: 'fremd' }], [A, B])).toEqual({ kind: 'no_votes' });
    });

    it('ermittelt den eindeutigen Gewinner nach den meisten Stimmen', () => {
      const outcome = evaluateVoting(
        [{ restaurantId: A }, { restaurantId: A }, { restaurantId: B }],
        [A, B, C],
      );
      expect(outcome).toEqual({ kind: 'winner', restaurantId: A, voteCount: 2 });
    });

    it('erkennt einen Gleichstand und liefert alle Kandidaten', () => {
      const outcome = evaluateVoting(
        [{ restaurantId: A }, { restaurantId: B }, { restaurantId: C }, { restaurantId: C }, { restaurantId: A }],
        [A, B, C],
      );
      expect(outcome.kind).toBe('tie');
      if (outcome.kind === 'tie') {
        expect(outcome.candidateIds.sort()).toEqual([A, C].sort());
        expect(outcome.voteCount).toBe(2);
      }
    });

    it('Dreifach-Gleichstand: alle drei sind Kandidaten', () => {
      const outcome = evaluateVoting(
        [{ restaurantId: A }, { restaurantId: B }, { restaurantId: C }],
        [A, B, C],
      );
      expect(outcome.kind).toBe('tie');
      if (outcome.kind === 'tie') expect(outcome.candidateIds).toHaveLength(3);
    });

    it('Stichwahl-Szenario: nur die Kandidaten werden gewertet', () => {
      // C wäre Sieger, steht aber nicht (mehr) zur Wahl
      const outcome = evaluateVoting(
        [{ restaurantId: C }, { restaurantId: C }, { restaurantId: A }],
        [A, B],
      );
      expect(outcome).toEqual({ kind: 'winner', restaurantId: A, voteCount: 1 });
    });
  });

  describe('pickRandom (Losentscheid)', () => {
    it('wählt deterministisch anhand der injizierten Zufallsfunktion', () => {
      expect(pickRandom([A, B, C], () => 0)).toBe(A);
      expect(pickRandom([A, B, C], () => 0.5)).toBe(B);
      expect(pickRandom([A, B, C], () => 0.999)).toBe(C);
    });

    it('wirft bei leerer Kandidatenliste', () => {
      expect(() => pickRandom([])).toThrow();
    });
  });
});
