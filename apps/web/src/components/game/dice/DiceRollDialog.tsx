import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

export type DiceRollDialogProps = {
  open: boolean;
  onClose: () => void;
  onRoll: (params: { sides: number; count: number }) => void;
};

const DEFAULT_SIDES = 20;
const DEFAULT_COUNT = 1;

export const DiceRollDialog: React.FC<DiceRollDialogProps> = ({ open, onClose, onRoll }) => {
  const sidesRef = React.useRef<HTMLInputElement | null>(null);
  const [sides, setSides] = React.useState<string>(String(DEFAULT_SIDES));
  const [count, setCount] = React.useState<string>(String(DEFAULT_COUNT));

  React.useEffect(() => {
    if (!open) return;
    setSides(String(DEFAULT_SIDES));
    setCount(String(DEFAULT_COUNT));

    queueMicrotask(() => {
      const el = sidesRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open]);

  const parsedSides = Number.parseInt(sides, 10);
  const parsedCount = Number.parseInt(count, 10);
  const isValid =
    Number.isFinite(parsedSides) &&
    parsedSides > 0 &&
    Number.isFinite(parsedCount) &&
    parsedCount > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onRoll({ sides: parsedSides, count: parsedCount });
    onClose();
  };

  const handleNumericChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next === "" || /^\d+$/.test(next)) setter(next);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Roll Dice</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Choose the number of sides and how many dice to roll. Defaults to a single d20.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Number of sides
              </label>
              <Input
                ref={sidesRef}
                inputMode="numeric"
                pattern="[0-9]*"
                value={sides}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={handleNumericChange(setSides)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="bg-zinc-900 border-zinc-800 text-zinc-100"
              />
            </div>

            <div className="space-y-2 w-32">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Dice count
              </label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                value={count}
                onFocus={(e) => e.currentTarget.select()}
                onChange={handleNumericChange(setCount)}
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
            Roll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
