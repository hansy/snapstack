import { createFileRoute } from '@tanstack/react-router';
import { MultiplayerBoard } from '@/components/game/board/MultiplayerBoard';
import { useGameStore } from '@/store/gameStore';
import { useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ZONE } from '@/constants/zones';

export const Route = createFileRoute('/layout-test')({
  component: LayoutTest,
});

function LayoutTest() {
  const players = useGameStore((state) => state.players);
  const addPlayer = useGameStore((state) => state.addPlayer);
  const addZone = useGameStore((state) => state.addZone);
  const hasHydrated = useGameStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;

    // Mock 3 extra players for testing if they don't exist
    const playerCount = Object.keys(players).length;
    if (playerCount < 4) {
      const needed = 4 - playerCount;
      for (let i = 0; i < needed; i++) {
        const id = uuidv4();
        addPlayer({
          id,
          name: `Mock Player ${i + 1}`,
          life: 40,
          counters: [],
          commanderDamage: {},
          commanderTax: 0,
        }, true); // isRemote=true so we don't broadcast mock data

        // Add zones for mock player
        const zoneTypes = [ZONE.LIBRARY, ZONE.HAND, ZONE.GRAVEYARD, ZONE.BATTLEFIELD, ZONE.COMMANDER, ZONE.EXILE] as const;
        zoneTypes.forEach(type => {
          addZone({
            id: `${id}-${type}`,
            type,
            ownerId: id,
            cardIds: [],
          }, true);
        });
      }
    }
  }, [hasHydrated, players, addPlayer, addZone]);

  if (!hasHydrated) return null;

  return <MultiplayerBoard sessionId="layout-test" />;
}
