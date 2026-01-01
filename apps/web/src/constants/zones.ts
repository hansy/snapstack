import { ZoneType } from '@/types';

export const ZONE = {
  LIBRARY: 'library',
  HAND: 'hand',
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  EXILE: 'exile',
  COMMANDER: 'commander',
  SIDEBOARD: 'sideboard',
} as const satisfies Record<string, ZoneType>;

export const ZONE_LABEL: Record<ZoneType, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  commander: 'Commander',
  sideboard: 'Sideboard',
};
