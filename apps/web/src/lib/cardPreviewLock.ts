export type CardPreviewLockRequest = {
  cardId: string;
  anchorEl?: HTMLElement | null;
};

type CardPreviewLockHandler = (request: CardPreviewLockRequest) => void;

let handler: CardPreviewLockHandler | null = null;

export const setCardPreviewLockHandler = (next: CardPreviewLockHandler | null) => {
  handler = next;
};

export const requestCardPreviewLock = (request: CardPreviewLockRequest) => {
  if (!handler) return;
  handler(request);
};
