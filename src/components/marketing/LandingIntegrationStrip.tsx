import { CalendarDays, Database, Mail, MessageSquareText, PhoneCall, Sparkles } from "lucide-react";

const items = [
  { label: "OpenAI", icon: Sparkles },
  { label: "Google", icon: CalendarDays },
  { label: "Microsoft", icon: Mail },
  { label: "Twilio", icon: PhoneCall },
  { label: "Vapi", icon: MessageSquareText },
  { label: "Supabase", icon: Database },
] as const;

export default function LandingIntegrationStrip() {
  return (
    <div className="border-t border-[#1d1d1f]/10 pt-7">
      <p className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">
        Built to work with the tools around the call
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-[#54545b]">
        {items.map(({ label, icon: Icon }) => (
          <span className="inline-flex items-center gap-2" key={label}>
            <Icon className="h-4 w-4 text-[#1d1d1f]" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
