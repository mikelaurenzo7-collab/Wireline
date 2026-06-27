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
    <div className="border-t border-border pt-7">
      <p className="wl-overline">Built to work with the tools around the call</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold text-foreground">
        {items.map(({ label, icon: Icon }) => (
          <span className="inline-flex items-center gap-2" key={label}>
            <Icon className="h-4 w-4 text-foreground" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
