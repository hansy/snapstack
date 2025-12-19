import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { UsernameForm } from './UsernameForm';

type EditUsernameDialogProps = {
  open: boolean;
  onClose: () => void;
  initialValue: string;
  onSubmit: (username: string) => void;
};

export function EditUsernameDialog({ open, onClose, initialValue, onSubmit }: EditUsernameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Edit username</DialogTitle>
          <DialogDescription className="text-zinc-400">
            This updates your name in this room and saves it for future games.
          </DialogDescription>
        </DialogHeader>

        <UsernameForm
          key={open ? initialValue : 'closed'}
          initialValue={initialValue}
          submitLabel="Save"
          showCancel
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
