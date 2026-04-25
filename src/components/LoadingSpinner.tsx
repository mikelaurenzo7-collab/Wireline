import { Loader2 } from "lucide-react";

export function LoadingSpinner({ message = "Syncing Carrier Relay..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 md:p-24 space-y-8">
      <div className="relative">
        <Loader2 className="w-16 h-16 md:w-20 md:h-20 animate-spin text-brand" />
      </div>
      <p className="text-ink font-black uppercase tracking-[0.5em] text-[10px] md:text-xs italic animate-pulse">{message}</p>
    </div>
  );
}
