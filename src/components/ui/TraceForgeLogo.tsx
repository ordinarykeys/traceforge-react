import { cn } from "@/lib/utils";
import codexLogo from "@/assets/codex.png";

interface TraceForgeLogoProps {
  size?: number;
  className?: string;
}

export default function TraceForgeLogo({ size = 64, className }: TraceForgeLogoProps) {
  return (
    <div 
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* 
         回归原始：直接引用您的 codex.png
         使用 drop-shadow 以确保白色瓣缘在各种背景下都有立体感
      */}
      <img 
        src={codexLogo} 
        alt="TraceForge" 
        className="w-full h-full object-contain drop-shadow-sm select-none pointer-events-none"
      />
    </div>
  );
}
