/**
 * Typed representation of the Scryfall card schema.
 * Source: https://scryfall.com/docs/api/cards
 *
 * The interface is intentionally partial but covers the fields we either use today
 * or are likely to render in the UI. Most properties are optional because Scryfall
 * omits them depending on layout/printing.
 */
export type ScryfallColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export type ScryfallLayout =
  | 'adventure'
  | 'art_series'
  | 'augment'
  | 'class'
  | 'dfc'
  | 'double_faced_token'
  | 'emblem'
  | 'flip'
  | 'host'
  | 'leveler'
  | 'meld'
  | 'modal_dfc'
  | 'normal'
  | 'planar'
  | 'reversible_card'
  | 'saga'
  | 'scheme'
  | 'split'
  | 'token'
  | 'transform'
  | 'vanguard'
  | string;

export type ScryfallLegality = 'legal' | 'not_legal' | 'restricted' | 'banned';

export type ScryfallFormat =
  | 'standard'
  | 'pioneer'
  | 'modern'
  | 'legacy'
  | 'pauper'
  | 'vintage'
  | 'commander'
  | 'oathbreaker'
  | 'penny'
  | 'alchemy'
  | 'historic'
  | 'brawl'
  | 'explorer'
  | 'duel'
  | 'oldschool'
  | 'premodern'
  | string;

export type ScryfallGame = 'paper' | 'arena' | 'mtgo' | string;

export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: ScryfallColor[];
  artist?: string;
  illustration_id?: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallPrices {
  usd?: string | null;
  usd_foil?: string | null;
  usd_etched?: string | null;
  eur?: string | null;
  eur_foil?: string | null;
  tix?: string | null;
}

export type ScryfallIdentifier =
  | { id: string }
  | { oracle_id: string }
  | { multiverse_id: number }
  | { mtgo_id: number }
  | { arena_id: number }
  | { set: string; collector_number: string }
  | { name: string; set?: string; collector_number?: string };

export interface ScryfallCard {
  object: 'card';
  id: string;
  oracle_id?: string;
  multiverse_ids?: number[];
  mtgo_id?: number;
  arena_id?: number;
  lang: string;
  name: string;
  printed_name?: string;
  layout: ScryfallLayout;
  released_at?: string;
  uri: string;
  scryfall_uri: string;
  rulings_uri?: string;
  prints_search_uri?: string;
  image_status?: 'missing' | 'placeholder' | 'lowres' | 'highres_scan';
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  mana_cost?: string;
  cmc?: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: ScryfallColor[];
  color_identity: ScryfallColor[];
  keywords: string[];
  legalities: Record<ScryfallFormat, ScryfallLegality>;
  games: ScryfallGame[];
  reserved?: boolean;
  foil?: boolean;
  nonfoil?: boolean;
  finishes?: Array<'nonfoil' | 'foil' | 'etched' | 'glossy' | string>;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic';
  artist?: string;
  illustration_id?: string;
  border_color?: string;
  frame?: string;
  frame_effects?: string[];
  security_stamp?: string;
  digital?: boolean;
  promo?: boolean;
  reprint?: boolean;
  variation?: boolean;
  card_back_id?: string;
  story_spotlight?: boolean;
  edhrec_rank?: number;
  prices: ScryfallPrices;
  related_uris: Record<string, string>;
  purchase_uris?: Record<string, string>;
}
