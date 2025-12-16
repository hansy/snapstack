import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface NumberPromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  initialValue?: number;
  onSubmit: (value: number) => void;
  onClose: () => void;
}

export const NumberPromptDialog: React.FC<NumberPromptDialogProps> = ({
  open,
  title,
  message,
  initialValue = 1,
  onSubmit,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState<string>(String(initialValue));

  useEffect(() => {
    if (!open) return;
    setValue(String(initialValue));

    // Ensure the default value is selected so the user can type immediately.
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }, [open, initialValue]);

  const handleSubmit = () => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSubmit(parsed);
    onClose();
  };

  const parsedValue = Number.parseInt(value, 10);
  const isValid = Number.isFinite(parsedValue) && parsedValue > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[380px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && <DialogDescription className="text-zinc-400">{message}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">
          <label className="text-xs font-medium text-zinc-400 mb-2 block">Value</label>
          <Input
            ref={inputRef}
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || /^\d+$/.test(next)) setValue(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="bg-zinc-900 border-zinc-800 text-zinc-100"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
