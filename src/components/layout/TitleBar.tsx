import { useEffect, useState } from "react";
import { X, Minus, Square, Copy, PanelLeft, PanelRight, ArrowLeft, ArrowRight } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ThemeSwitcher from "./ThemeSwitcher";

const appWindow = getCurrentWindow();

interface TitleBarProps {
  isSiderVisible?: boolean;
  onToggleSider?: () => void;
  isAgentMode?: boolean;
}

export default function TitleBar({ isSiderVisible, onToggleSider }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);

    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  return (
    <div
      className="relative z-[9999] flex h-[38px] w-full items-center justify-between bg-card border-b border-border text-foreground select-none transition-colors duration-300"
      data-tauri-drag-region
    >
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSider}
          className="h-[38px] w-[48px] rounded-none text-muted-foreground hover:text-foreground transition-colors"
          title={isSiderVisible ? "Collapse" : "Expand"}
        >
          {isSiderVisible ? <PanelRight size={16} /> : <PanelLeft size={16} />}
        </Button>

        <div className="group flex items-center h-full px-2 ml-0 cursor-default">
          <div className="flex items-center gap-0 h-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground bg-transparent hover:bg-transparent">
              <ArrowLeft size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/60 hover:text-foreground bg-transparent hover:bg-transparent -ml-1">
              <ArrowRight size={12} />
            </Button>
          </div>
        </div>

        <div className="flex items-center ml-2 space-x-0">
          <DropdownMenu modal={false} open={activeMenu === "file"} onOpenChange={(open) => setActiveMenu(open ? "file" : null)}>
            <DropdownMenuTrigger
              onPointerDown={(e) => {
                e.preventDefault();
                setActiveMenu(activeMenu === "file" ? null : "file");
              }}
              className="px-2 h-8 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground rounded-sm hover:bg-accent/50 outline-none transition-colors data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
            >
              File
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-[12px] min-w-[120px]">
              <DropdownMenuItem>New File <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Open File... <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Save <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Exit</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false} open={activeMenu === "edit"} onOpenChange={(open) => setActiveMenu(open ? "edit" : null)}>
            <DropdownMenuTrigger
              onPointerDown={(e) => {
                e.preventDefault();
                setActiveMenu(activeMenu === "edit" ? null : "edit");
              }}
              className="px-2 h-8 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground rounded-sm hover:bg-accent/50 outline-none transition-colors data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
            >
              Edit
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-[12px] min-w-[120px]">
              <DropdownMenuItem>Undo <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Redo <DropdownMenuShortcut>Ctrl+Shift+Z</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Cut <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Copy <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false} open={activeMenu === "view"} onOpenChange={(open) => setActiveMenu(open ? "view" : null)}>
            <DropdownMenuTrigger
              onPointerDown={(e) => {
                e.preventDefault();
                setActiveMenu(activeMenu === "view" ? null : "view");
              }}
              className="px-2 h-8 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground rounded-sm hover:bg-accent/50 outline-none transition-colors data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
            >
              View
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-[12px] min-w-[120px]">
              <DropdownMenuItem>Toggle Sider <DropdownMenuShortcut>Ctrl+B</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Full Screen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu modal={false} open={activeMenu === "window"} onOpenChange={(open) => setActiveMenu(open ? "window" : null)}>
            <DropdownMenuTrigger
              onPointerDown={(e) => {
                e.preventDefault();
                setActiveMenu(activeMenu === "window" ? null : "window");
              }}
              className="px-2 h-8 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground rounded-sm hover:bg-accent/50 outline-none transition-colors data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
            >
              Window
            </DropdownMenuTrigger>
          </DropdownMenu>

          <DropdownMenu modal={false} open={activeMenu === "help"} onOpenChange={(open) => setActiveMenu(open ? "help" : null)}>
            <DropdownMenuTrigger
              onPointerDown={(e) => {
                e.preventDefault();
                setActiveMenu(activeMenu === "help" ? null : "help");
              }}
              className="px-2 h-8 text-[13px] font-medium text-muted-foreground/80 hover:text-foreground rounded-sm hover:bg-accent/50 outline-none transition-colors data-[state=open]:bg-accent/50 data-[state=open]:text-foreground"
            >
              Help
            </DropdownMenuTrigger>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex h-full items-center">
        <ThemeSwitcher />
        <Separator orientation="vertical" className="h-4 mx-1 opacity-50" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMinimize}
          className="h-full w-10 rounded-none text-muted-foreground hover:bg-muted transition-colors"
        >
          <Minus size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMaximize}
          className="h-full w-10 rounded-none text-muted-foreground hover:bg-muted transition-colors font-bold"
        >
          {isMaximized ? <Copy size={13} className="rotate-90" /> : <Square size={10} />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-full w-10 rounded-none text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  );
}
