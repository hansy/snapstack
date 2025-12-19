import React from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
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
    middleware: [offset(8), flip(), shift({ padding: 8 })],
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

  return (
    <>
      {React.cloneElement(children, {
        ref: refs.setReference,
        ...getReferenceProps(children.props),
      })}
      <FloatingPortal>
        {open && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[10000] bg-zinc-900 text-xs text-zinc-100 px-3 py-2 rounded border border-zinc-700 shadow-xl whitespace-nowrap",
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
