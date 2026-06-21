import { type ReactNode } from "react";
import { FolderCog, PanelLeft, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

function Card({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <article className="rounded-2xl border border-black/[.08] bg-white p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0f0ee]">{icon}</span><h2 className="mt-4 font-semibold tracking-[-.02em]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#65656c]">{detail}</p></article>;
}

export default function SettingsPage() {
  return <WorkspaceShell eyebrow="Admin" title="Settings"><section className="grid gap-4 py-7 lg:grid-cols-3"><Card icon={<FolderCog size={17} />} title="Workspace" detail="Business profile, operating hours, escalation destinations, and team access." /><Card icon={<PanelLeft size={17} />} title="Voice and channels" detail="Vapi phone handling, Deepgram Flux transcription, ElevenLabs voices, and optional OpenAI Realtime for web/mobile." /><Card icon={<ShieldCheck size={17} />} title="Safety and audit" detail="Action boundaries, approval requirements, compliance controls, and operational history." /></section><div className="rounded-2xl border border-black/[.08] bg-white p-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#77777f]">Managed AI runtime</p><h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">OpenAI primary · Gemini fallback</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#606067]">Structured work uses the existing `OPENAI_API_KEY` in Vercel first. Gemini is reserved for failure fallback. Vapi remains the telephone layer; Realtime is a separate optional web/mobile mode and does not replace phone routing.</p></div></WorkspaceShell>;
}
