import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Search, Plus, Minus, Loader2 } from 'lucide-react';
import { createDebouncedTokenSearch } from '../../../services/scryfallTokens';
import { ScryfallCard } from '../../../types/scryfall';
import { useGameStore } from '../../../store/gameStore';
import { v4 as uuidv4 } from 'uuid';
import { ZONE } from '../../../constants/zones';
import { clampNormalizedPosition, findAvailablePositionNormalized, GRID_STEP_X, GRID_STEP_Y } from '../../../lib/positions';
import { toast } from 'sonner';

interface TokenCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    playerId: string;
}

export const TokenCreationModal: React.FC<TokenCreationModalProps> = ({ isOpen, onClose, playerId }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ScryfallCard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [selectedToken, setSelectedToken] = useState<ScryfallCard | null>(null);
    const [quantity, setQuantity] = useState(1);

    const addCard = useGameStore((state) => state.addCard);

    // Setup debounced search
    const [debouncedSearch] = useState(() => createDebouncedTokenSearch());

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setIsLoading(false);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        setHasSearched(false);
        debouncedSearch.search(query)
            .then((data) => {
                if (data && data.data) {
                    setResults(data.data);
                } else {
                    setResults([]);
                }
                setHasSearched(true);
            })
            .catch((err) => {
                if ((err as any)?.name === 'AbortError') return;
                console.error("Token search error:", err);
                setHasSearched(true);
            })
            .finally(() => {
                setIsLoading(false);
            });

        return () => {
            debouncedSearch.cancel();
        };
    }, [query, debouncedSearch]);

    const handleCreate = () => {
        if (!selectedToken) return;

        const battlefieldId = `${playerId}-${ZONE.BATTLEFIELD}`;
        const state = useGameStore.getState();
        const battlefield = state.zones[battlefieldId];
        const frontFace = selectedToken.card_faces?.[0];
        const imageUrl = selectedToken.image_uris?.normal || frontFace?.image_uris?.normal;
        const name = frontFace?.name || selectedToken.name;

        for (let i = 0; i < quantity; i++) {
            const base = clampNormalizedPosition({
                x: 0.1 + (i * GRID_STEP_X),
                y: 0.1 + (i * GRID_STEP_Y),
            });
            const position = battlefield ? findAvailablePositionNormalized(base, battlefield.cardIds, state.cards) : base;

            addCard({
                id: uuidv4(),
                name,
                typeLine: selectedToken.type_line,
                controllerId: playerId,
                ownerId: playerId,
                zoneId: battlefieldId,
                position,
                tapped: false,
                counters: [],
                faceDown: false,
                rotation: 0,
                scryfallId: selectedToken.id,
                oracleText: selectedToken.oracle_text,
                imageUrl,
                scryfall: selectedToken,
                currentFaceIndex: 0,
                isToken: true
            });
        }

        toast.success(`Created ${quantity} ${selectedToken.name} token${quantity > 1 ? 's' : ''}`);
        handleClose();
    };

    const handleClose = () => {
        setQuery('');
        setResults([]);
        setSelectedToken(null);
        setQuantity(1);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col bg-zinc-950 border-zinc-800 text-zinc-100 p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b border-zinc-800">
                    <DialogTitle>Create Token</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Search Bar */}
                    <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 h-4 w-4" />
                            <Input
                                value={query}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setQuery(next);
                                    if (next.trim().length >= 3) {
                                        setIsLoading(true);
                                    } else {
                                        setIsLoading(false);
                                        setHasSearched(false);
                                    }
                                }}
                                placeholder="Search for tokens (e.g. 'Goblin', 'Treasure')..."
                                className="pl-9 bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-indigo-500"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Results Grid */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Searching...</span>
                            </div>
                        ) : results.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {results.map((token) => {
                                    const imageUrl = token.image_uris?.normal || token.card_faces?.[0]?.image_uris?.normal;
                                    const isSelected = selectedToken?.id === token.id;

                                    return (
                                        <div
                                            key={token.id}
                                            onClick={() => setSelectedToken(token)}
                                            className={`
                                                relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all
                                                ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-transparent hover:border-zinc-700'}
                                            `}
                                        >
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={token.name}
                                                    className="w-full h-auto object-cover aspect-[2.5/3.5]"
                                                />
                                            ) : (
                                                <div className="w-full aspect-[2.5/3.5] bg-zinc-900 flex items-center justify-center p-2 text-center text-xs text-zinc-500">
                                                    No Image Available
                                                </div>
                                            )}

                                            <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-xs truncate text-center">
                                                {token.name}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : hasSearched && query.length >= 3 ? (
                            <div className="flex items-center justify-center h-full text-zinc-500">
                                No tokens found.
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                                Type at least 3 characters to search.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <label className="text-zinc-400 text-sm font-medium">Quantity:</label>
                        <div className="flex items-center gap-2 bg-zinc-900 rounded-md border border-zinc-700 p-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-sm hover:bg-zinc-800"
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            >
                                <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-mono">{quantity}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-sm hover:bg-zinc-800"
                                onClick={() => setQuantity(quantity + 1)}
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300">
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!selectedToken}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[100px]"
                        >
                            Create
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
