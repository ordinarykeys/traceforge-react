import * as React from "react"
import { GripHorizontal, GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

/**
 * Custom Resizable Component Context for TraceForge (v4.9.0 compliant)
 * Uses React Context to reliably pass orientation to children,
 * bypassing potential data-attribute synchronization issues.
 */
type ResizableOrientation = "horizontal" | "vertical";
const ResizableContext = React.createContext<ResizableOrientation>("horizontal");

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => {
  const orientation = props.orientation || "horizontal";
  
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
  );
}

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) => {
  const orientation = React.useContext(ResizableContext);

  return (
    <ResizablePrimitive.Separator
      className={cn(
        "relative flex items-center justify-center bg-border transition-all hover:bg-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        orientation === "vertical" ? "h-px w-full" : "w-px h-full",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        orientation === "vertical" && "after:inset-x-0 after:inset-y-auto after:h-1 after:-translate-y-1/2",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-3 w-9 items-center justify-center rounded-full border bg-background shadow-sm transition-all hover:border-primary/50 group">
          {orientation === "vertical" ? (
            <GripHorizontal className="h-2.5 w-2.5 text-muted-foreground/60 transition-colors group-hover:text-primary" />
          ) : (
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground/60 transition-colors group-hover:text-primary" />
          )}
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
}

export { 
  ResizablePanelGroup, 
  ResizablePanel, 
  ResizableHandle 
}

export type { PanelImperativeHandle as ImperativePanelHandle } from "react-resizable-panels"
