import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { toast } from 'sonner';
import { parseDeckList, fetchScryfallCards } from '../../../utils/deckImport';
import { useGameStore } from '../../../store/gameStore';
import { v4 as uuidv4 } from 'uuid';

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

    const handleImport = async () => {
        if (!importText.trim()) return;

        setIsImporting(true);
        setError(null);

        try {
            const parsedDeck = parseDeckList(importText);
            if (parsedDeck.length === 0) {
                throw new Error("No valid cards found in the list.");
            }

            const cards = await fetchScryfallCards(parsedDeck);

            cards.forEach(cardData => {
                let zoneId = `${playerId}-library`;
                if (cardData.section === 'commander') {
                    zoneId = `${playerId}-command`;
                }

                addCard({
                    id: uuidv4(),
                    name: cardData.name || 'Unknown Card',
                    typeLine: cardData.typeLine || 'Card',
                    imageUrl: cardData.imageUrl,
                    controllerId: playerId,
                    ownerId: playerId,
                    zoneId: zoneId,
                    position: { x: 0, y: 0 },
                    tapped: false,
                    counters: [],
                    faceDown: zoneId.includes('library'), // Only face down in library
                    rotation: 0
                });
            });

            setDeckLoaded(playerId, true);
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
