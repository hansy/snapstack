import * as React from "react";

import type { ContextMenuItem } from "@/models/game/context-menu/menu";

type MouseEventLike = { preventDefault: () => void; clientX: number; clientY: number };

export type ContextMenuState =
  | { x: number; y: number; items: ContextMenuItem[]; title?: string }
  | null;

export type CountPromptState =
  | {
      title: string;
      message: string;
      onSubmit: (count: number) => void;
      initialValue?: number;
    }
  | null;

export type TextPromptState =
  | {
      title: string;
      message?: string;
      initialValue?: string;
      onSubmit: (value: string) => void;
    }
  | null;

export const useContextMenuState = () => {
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>(null);
  const [countPrompt, setCountPrompt] = React.useState<CountPromptState>(null);
  const [textPrompt, setTextPrompt] = React.useState<TextPromptState>(null);

  const openContextMenu = React.useCallback(
    (e: MouseEventLike, items: ContextMenuItem[], title?: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, items, title });
    },
    []
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(null);
  }, []);

  const openCountPrompt = React.useCallback((next: NonNullable<CountPromptState>) => {
    setCountPrompt(next);
  }, []);

  const closeCountPrompt = React.useCallback(() => {
    setCountPrompt(null);
  }, []);

  const openTextPrompt = React.useCallback((next: NonNullable<TextPromptState>) => {
    setTextPrompt(next);
  }, []);

  const closeTextPrompt = React.useCallback(() => {
    setTextPrompt(null);
  }, []);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
    countPrompt,
    openCountPrompt,
    closeCountPrompt,
    textPrompt,
    openTextPrompt,
    closeTextPrompt,
  };
};

