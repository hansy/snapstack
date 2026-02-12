import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";

interface TextPromptDialogProps {
    open: boolean;
    title: string;
    message?: string;
    initialValue?: string;
    onSubmit: (value: string) => void;
    onClose: () => void;
}

export const TextPromptDialog: React.FC<TextPromptDialogProps> = ({
    open,
    title,
    message,
    initialValue = "",
    onSubmit,
    onClose,
}) => {
    const [value, setValue] = useState<string>(initialValue);

    useEffect(() => {
        if (open) setValue(initialValue);
    }, [open, initialValue]);

    const handleSubmit = () => {
        onSubmit(value);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="ds-dialog-size-xs bg-zinc-950 border-zinc-800 text-zinc-100">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {message && <DialogDescription className="text-zinc-400">{message}</DialogDescription>}
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        value={value}
                        autoFocus
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
                        maxLength={280}
                        className="bg-zinc-900 border-zinc-800 text-zinc-100 min-h-[100px] resize-none"
                        placeholder="Enter text..."
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300">
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
