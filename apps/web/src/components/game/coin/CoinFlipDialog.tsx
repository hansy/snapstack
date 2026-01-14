import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export type CoinFlipDialogProps = {
  open: boolean;
  onClose: () => void;
  onFlip: (params: { count: number }) => void;
};

const DEFAULT_COUNT = 1;

export const CoinFlipDialog: React.FC<CoinFlipDialogProps> = ({ open, onClose, onFlip }) => {
  const countRef = React.useRef<HTMLInputElement | null>(null);
  const [count, setCount] = React.useState<string>(String(DEFAULT_COUNT));

  React.useEffect(() => {
    if (!open) return;
    setCount(String(DEFAULT_COUNT));

    queueMicrotask(() => {
      const el = countRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open]);

  const parsedCount = Number.parseInt(count, 10);
  const isValid = Number.isFinite(parsedCount) && parsedCount > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onFlip({ count: parsedCount });
    onClose();
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next === "" || /^\d+$/.test(next)) setCount(next);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Flip Coin</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Choose how many coins to flip. Each coin will land on heads or tails.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Number of coins
            </label>
            <Input
              ref={countRef}
              inputMode="numeric"
              pattern="[0-9]*"
              value={count}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={handleNumericChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="bg-zinc-900 border-zinc-800 text-zinc-100"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Flip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
