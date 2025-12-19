import { GameState } from '@/types';

// Basic integrity checks: ownership present, zone references consistent.
export function validateState(state: GameState) {
  const issues: string[] = [];

  Object.values(state.cards).forEach(card => {
    if (!card.ownerId) issues.push(`Card ${card.id} missing owner`);

    const zone = state.zones[card.zoneId];
    if (!zone) {
      issues.push(`Card ${card.id} has missing zone ${card.zoneId}`);
      return;
    }

    if (!zone.cardIds.includes(card.id)) {
      issues.push(`Zone ${zone.id} missing reference to card ${card.id}`);
    }
  });

  return issues;
}
