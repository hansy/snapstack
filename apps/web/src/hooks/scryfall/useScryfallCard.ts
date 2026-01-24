/**
 * Hook to fetch full Scryfall card data on-demand
 *
 * Usage:
 * const { data, isLoading, error } = useScryfallCard(card.scryfallId);
 *
 * The data is cached in IndexedDB, so subsequent calls are instant.
 */

import { useState, useEffect, useMemo } from 'react';
import { ScryfallCard } from '@/types/scryfall';
import { getCard, getCards } from '@/services/scryfall/scryfallCache';
import { formatScryfallErrors } from '@/services/scryfall/scryfallErrors';

interface UseScryfallCardResult {
  data: ScryfallCard | null;
  isLoading: boolean;
  error: Error | null;
}

interface UseScryfallCardsResult {
  data: Map<string, ScryfallCard>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Fetch a single Scryfall card by ID
 */
export function useScryfallCard(
  scryfallId: string | undefined
): UseScryfallCardResult {
  const [data, setData] = useState<ScryfallCard | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!scryfallId) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchCard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getCard(scryfallId);
        if (!cancelled) {
          if (result.errors.length > 0) {
            const message = formatScryfallErrors(result.errors);
            setError(new Error(message));
          }
          setData(result.card);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch card'));
          setIsLoading(false);
        }
      }
    };

    fetchCard();

    return () => {
      cancelled = true;
    };
  }, [scryfallId]);

  return { data, isLoading, error };
}

/**
 * Fetch multiple Scryfall cards by ID
 */
export function useScryfallCards(
  scryfallIds: string[]
): UseScryfallCardsResult {
  const [data, setData] = useState<Map<string, ScryfallCard>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const idsKey = useMemo(() => {
    const unique = Array.from(
      new Set(scryfallIds.map((id) => id.trim()).filter(Boolean))
    );
    unique.sort();
    return unique.join("|");
  }, [scryfallIds.join("|")]);
  useEffect(() => {
    const deduped = idsKey ? idsKey.split("|").filter(Boolean) : [];
    if (!deduped.length) {
      setData(new Map());
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchCards = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getCards(deduped);
        if (!cancelled) {
          if (result.errors.length > 0) {
            const message = formatScryfallErrors(result.errors);
            setError(new Error(message));
          }
          setData(result.cards);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch cards'));
          setIsLoading(false);
        }
      }
    };

    fetchCards();

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return { data, isLoading, error };
}

/**
 * Get related parts (tokens, meld results, etc.) from a card
 * Fetches full data if not already cached
 */
export function useRelatedParts(scryfallId: string | undefined) {
  const { data: fullCard, isLoading, error } = useScryfallCard(scryfallId);

  const relatedParts = fullCard?.all_parts?.filter(
    (part) => part.component !== 'combo_piece'
  ) ?? [];

  return { relatedParts, isLoading, error };
}
