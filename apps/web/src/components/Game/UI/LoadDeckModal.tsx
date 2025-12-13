import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { toast } from 'sonner';
import { parseDeckList, fetchScryfallCards, createCardFromImport, validateImportResult } from '../../../utils/deckImport';
import { useGameStore } from '../../../store/gameStore';
import { ZONE } from '../../../constants/zones';
import { getZoneByType } from '../../../lib/gameSelectors';
import { batchSharedMutations, getYDocHandles, getYProvider } from '../../../yjs/docManager';


interface LoadDeckModalProps {
    isOpen: boolean;
    onClose: () => void;
    playerId: string;
}

export const LoadDeckModal: React.FC<LoadDeckModalProps> = ({ isOpen, onClose, playerId }) => {
    const [importText, setImportText] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addCard = useGameStore((state) => state.addCard);
    const setDeckLoaded = useGameStore((state) => state.setDeckLoaded);
    const shuffleLibrary = useGameStore((state) => state.shuffleLibrary);
    const zones = useGameStore((state) => state.zones);

    const handleImport = async () => {
        if (!importText.trim()) return;

        const handles = getYDocHandles();
        const provider = getYProvider() as any;
        const providerReady = Boolean(handles && provider && (provider.wsconnected || provider.synced));
        if (!providerReady) {
            toast.error('Connecting to multiplayer, please wait a moment then try again.');
            return;
        }

        setIsImporting(true);
        setError(null);

        try {
            const parsedDeck = parseDeckList(importText);
            if (parsedDeck.length === 0) {
                throw new Error("No valid cards found in the list.");
            }

            const fetchResult = await fetchScryfallCards(parsedDeck);
            const validation = validateImportResult(parsedDeck, fetchResult);

            if (!validation.ok) {
                throw new Error(validation.error);
            }

            if (validation.warnings.length) {
                toast.warning('Imported with warnings', {
                    description: validation.warnings.join('\n'),
                });
            }

            // Batch all card additions into a single Yjs transaction
            // This reduces 100+ network messages to 1, dramatically improving sync performance
            batchSharedMutations(() => {
                fetchResult.cards.forEach(cardData => {
                    // Use existing zones if present (handles legacy '-command' ids)
                    const libraryZone = getZoneByType(zones, playerId, ZONE.LIBRARY);
                    const commanderZone = getZoneByType(zones, playerId, ZONE.COMMANDER);

                    let zoneId = libraryZone?.id ?? `${playerId}-${ZONE.LIBRARY}`;
                    if (cardData.section === 'commander') {
                        zoneId = commanderZone?.id ?? `${playerId}-${ZONE.COMMANDER}`;
                    }

                    const newCard = createCardFromImport(cardData, playerId, zoneId);
                    // Override faceDown for library
                    if (zoneId.includes(ZONE.LIBRARY)) {
                        newCard.faceDown = true;
                    }

                    addCard(newCard);
                });

                setDeckLoaded(playerId, true);
                shuffleLibrary(playerId, playerId);
            });
            toast.success("Deck successfully loaded");
            setImportText('');
            onClose();
        } catch (err: any) {
            console.error('Import failed:', err);
            setError(err.message || 'Failed to import deck. Please check the format.');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100">
                <DialogHeader>
                    <DialogTitle>Load Deck</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Paste your decklist below (e.g., "4 Lightning Bolt").
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <textarea
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder="4 Lightning Bolt&#10;20 Mountain..."
                        className="w-full h-64 bg-zinc-900 border border-zinc-800 rounded-md p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none placeholder:text-zinc-600"
                    />

                    {error && (
                        <div className="text-red-400 text-sm bg-red-950/30 p-2 rounded border border-red-900/50">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isImporting} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
                        Cancel
                    </Button>
                    <Button onClick={handleImport} disabled={isImporting || !importText.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                        {isImporting ? 'Loading...' : 'Load Deck'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
