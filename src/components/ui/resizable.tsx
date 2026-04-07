import * as React from "react"
import { GripHorizontal, GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

type ResizableOrientation = "horizontal" | "vertical"

const ResizableContext = React.createContext<ResizableOrientation>("horizontal")

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => {
  const orientation = props.orientation || "horizontal"

  return (
    <ResizableContext.Provider value={orientation}>
      <ResizablePrimitive.Group
        className={cn(
          "flex h-full w-full",
          orientation === "vertical" && "flex-col",
          className
        )}
        {...props}
      />
    </ResizableContext.Provider>
  )
}

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) => {
  const orientation = React.useContext(ResizableContext)

  return (
    <ResizablePrimitive.Separator
      className={cn(
        "group relative flex shrink-0 select-none touch-none items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        orientation === "vertical" ? "h-1.5 w-full cursor-row-resize" : "h-full w-1.5 cursor-col-resize",
        "before:absolute before:bg-border before:transition-colors",
        orientation === "vertical"
          ? "before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2"
          : "before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2",
        "hover:before:bg-primary/60 data-[resize-handle-state=hover]:before:bg-primary/70 data-[resize-handle-state=drag]:before:bg-primary",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            "z-10 flex items-center justify-center rounded-sm border bg-border text-muted-foreground",
            orientation === "vertical" ? "h-3 w-6" : "h-6 w-3"
          )}
        >
          {orientation === "vertical" ? (
            <GripHorizontal className="h-2.5 w-2.5" />
          ) : (
            <GripVertical className="h-2.5 w-2.5" />
          )}
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
}

export type { PanelImperativeHandle as ImperativePanelHandle } from "react-resizable-panels"
