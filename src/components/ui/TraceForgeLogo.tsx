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
      {/* Keep the original codex logo with subtle shadow for mixed backgrounds. */}
      <img
        src={codexLogo}
        alt="Lumo Coding"
        className="h-full w-full pointer-events-none select-none object-contain drop-shadow-sm"
      />
    </div>
  );
}