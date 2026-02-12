import React from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  size,
  shift,
  useDismiss,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useFloating,
  type Placement,
} from "@floating-ui/react";

import { cn } from "@/lib/utils";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: Placement;
  className?: string;
};

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  placement = "top",
  className,
}) => {
  const [open, setOpen] = React.useState(false);

  const { refs, floatingStyles, context } = useFloating({
    placement,
    open,
    onOpenChange: setOpen,
    middleware: [
      offset(8),
      flip({ padding: 8, fallbackAxisSideDirection: "start" }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.max(120, Math.floor(availableWidth))}px`,
            maxHeight: `${Math.max(40, Math.floor(availableHeight))}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
    strategy: "fixed",
  });

  const hover = useHover(context, { move: true, delay: { open: 80, close: 80 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  if (!React.isValidElement(children)) {
    return children;
  }

  const child = children as React.ReactElement<React.HTMLProps<HTMLElement>>;
  const referenceProps = getReferenceProps(child.props);

  return (
    <>
      {React.cloneElement(child, {
        ref: refs.setReference,
        ...referenceProps,
      })}
      <FloatingPortal>
        {open && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[10000] overflow-auto bg-zinc-900 text-xs text-zinc-100 px-3 py-2 rounded border border-zinc-700 shadow-xl whitespace-normal break-words",
              "transition-opacity duration-150",
              className
            )}
          >
            {content}
          </div>
        )}
      </FloatingPortal>
    </>
  );
};
