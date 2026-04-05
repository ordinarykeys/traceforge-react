import TraceForgeLogo from "@/components/ui/TraceForgeLogo";

export default function LoadingView() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-6 animate-in fade-in duration-500">
      <div className="relative">
        {/* Pulsing Aura */}
        <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-125 animate-pulse" />
        
        {/* Centered Logo/Icon */}
        <div className="relative flex items-center justify-center p-10 bg-card/40 rounded-full border border-border/10 backdrop-blur-sm shadow-2xl">
          <TraceForgeLogo 
            size={100} 
            className="animate-pulse duration-[2000ms]" 
          />
        </div>

        {/* Outer Ring Animation */}
        <div className="absolute inset-[-15px] border border-primary/5 rounded-full border-t-primary/20 animate-spin transition-duration-[3000ms]" />
      </div>
    </div>
  );
}
