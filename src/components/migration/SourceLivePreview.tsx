export function SourceLivePreview() {
  return (
    <div className="rounded-[20px] border border-[#E8E7E3] bg-white p-5 shadow-[0_8px_32px_rgba(0,0,0,.05)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#2B5548] font-mono text-xs font-bold text-white">S</span>
          <div className="min-w-0"><strong className="block truncate text-sm text-[#1C1C1A]">Sarah — Front Desk</strong><small className="font-mono text-[10px] uppercase tracking-[.12em] text-[#3D9B73]">On a call</small></div>
        </div>
        <span className="rounded-full border border-[#E8E7E3] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-[#3D9B73]">Live</span>
      </div>
      <div className="mt-4 rounded-xl border border-[#F0EFEB] bg-[#FAFAF8] px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[.1em] text-[#A1A19B]">Answering · transcribing</div>
      <div className="mt-4 flex flex-col gap-2 text-[13px] leading-5"><p className="max-w-[88%] rounded-[14px_14px_14px_4px] bg-[#FAFAF8] px-3.5 py-2.5 text-[#6B6B65]">I’d like to book a service estimate.</p><p className="ml-auto max-w-[88%] rounded-[14px_14px_4px_14px] bg-[#2B5548] px-3.5 py-2.5 text-white">Friday at 11:30 works — should I lock it in?</p><p className="max-w-[88%] rounded-[14px_14px_14px_4px] bg-[#FAFAF8] px-3.5 py-2.5 text-[#6B6B65]">Yes, Friday is perfect.</p><p className="ml-auto max-w-[88%] rounded-[14px_14px_4px_14px] bg-[#2B5548] px-3.5 py-2.5 text-white">Booked. I’ll text a confirmation now.</p></div>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-medium text-[#2B5548]"><span className="rounded-full bg-[#EEF5F1] px-2.5 py-1">✓ Booked</span><span className="rounded-full bg-[#EEF5F1] px-2.5 py-1">✓ SMS sent</span><span className="rounded-full bg-[#EEF5F1] px-2.5 py-1">✓ Calendar updated</span></div>
    </div>
  );
}
