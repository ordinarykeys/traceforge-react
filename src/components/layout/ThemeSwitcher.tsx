import { Palette } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemeStore, type Theme } from "@/hooks/useThemeStore";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const themes: { id: Theme; label: string; color: string }[] = [
  { id: "zinc", label: "Zinc", color: "bg-zinc-500" },
  { id: "slate", label: "Slate", color: "bg-slate-500" },
  { id: "stone", label: "Stone", color: "bg-stone-500" },
  { id: "gray", label: "Gray", color: "bg-gray-500" },
  { id: "neutral", label: "Neutral", color: "bg-neutral-500" },
];

export default function ThemeSwitcher() {
  const { theme, setTheme, isDark, toggleDark } = useThemeStore();

  return (
    <div className="flex items-center gap-1">
      <Select value={theme} onValueChange={(val) => setTheme(val as Theme)}>
        <SelectTrigger className="h-7 w-[90px] text-[10px] border-none bg-transparent hover:bg-transparent shadow-none focus:ring-0 px-2 font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Palette size={12} className="shrink-0" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[130px] bg-card border-border shadow-none">
          <div className="px-2 py-1.5 text-[9px] font-bold text-muted-foreground/60 uppercase">Theme</div>
          <Separator className="mb-1 opacity-50" />
          {themes.map((t) => (
            <SelectItem 
              key={t.id} 
              value={t.id} 
              className="text-[10px] focus:bg-transparent focus:text-primary cursor-pointer py-1.5"
            >
            <div className="flex items-center gap-2 whitespace-nowrap">
              <div className={`h-2 w-2 rounded-full ${t.color}`} />
              <span>{t.label}</span>
            </div>
            </SelectItem>
          ))}
          <Separator className="my-1 opacity-50" />
          <div className="flex items-center justify-between px-2 py-2 select-none">
            <Label htmlFor="dark-mode" className="text-[10px] font-medium text-muted-foreground cursor-pointer">Dark Mode</Label>
            <Switch 
              id="dark-mode"
              checked={isDark}
              onCheckedChange={toggleDark}
              className="scale-75 origin-right"
            />
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}
