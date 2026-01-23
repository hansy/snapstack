import { ZoneType } from '@/types';
import { ZONE, isCommanderZoneType } from '@mtg/shared/constants/zones';

export { ZONE, isCommanderZoneType };

export const ZONE_LABEL: Record<ZoneType, string> = {
  library: 'Library',
  hand: 'Hand',
  battlefield: 'Battlefield',
  graveyard: 'Graveyard',
  exile: 'Exile',
  commander: 'Commander',
  sideboard: 'Sideboard',
};
