import { Popover as BasePopover } from "@base-ui/react/popover"
import type { ComponentPropsWithoutRef, ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 轻量 Popover 原语,封装 @base-ui/react 的 Popover。
 * 用法:
 *   <Popover>
 *     <PopoverTrigger asChild><button>Open</button></PopoverTrigger>
 *     <PopoverContent>...</PopoverContent>
 *   </Popover>
 */

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

export function Popover({ open, onOpenChange, children }: PopoverProps) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </BasePopover.Root>
  )
}

type TriggerProps = ComponentPropsWithoutRef<typeof BasePopover.Trigger>

export function PopoverTrigger(props: TriggerProps) {
  return <BasePopover.Trigger {...props} />
}

interface PopoverContentProps
  extends ComponentPropsWithoutRef<typeof BasePopover.Popup> {
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  sideOffset?: number
  alignOffset?: number
  className?: string
  children: ReactNode
}

export function PopoverContent({
  side = "top",
  align = "start",
  sideOffset = 8,
  alignOffset = 0,
  className,
  children,
  ...rest
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <BasePopover.Popup
          {...rest}
          className={cn(
            "min-w-[8rem] rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none",
            "data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0",
            "data-[closed]:zoom-out-95 data-[open]:zoom-in-95",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  )
}