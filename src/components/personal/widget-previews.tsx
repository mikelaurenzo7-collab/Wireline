import type { ReactNode } from "react";
import { Bell, CreditCard, Mic, Sparkles } from "lucide-react";

/**
 * Faithful HTML/CSS previews of the native iOS widgets, so the web control
 * panel SHOWS the phone-screen design instead of just describing it. Colors and
 * layouts mirror `ios/WirelineWidgets/*` + `WidgetTheme.swift` exactly (Midnight):
 *   iris #7C9CFF · irisDeep #5570E6 · irisBright #A9BEFF
 *   canvas #0C0D11 · panel #14161D · mint #54E0B4 · amber #F4B45A · text #ECEDF1
 */

const C = {
  iris: "#7C9CFF",
  irisDeep: "#5570E6",
  irisBright: "#A9BEFF",
  canvas: "#0C0D11",
  panel: "#14161D",
  mint: "#54E0B4",
  amber: "#F4B45A",
  text: "#ECEDF1",
  text2: "#9B9DA8",
} as const;

const accentGradient = `linear-gradient(135deg, ${C.irisDeep} 0%, ${C.iris} 100%)`;
const panelGradient = `linear-gradient(135deg, ${C.panel} 0%, ${C.canvas} 100%)`;

/** A square Home Screen widget shell (~158pt iOS small widget). */
function Tile({
  children,
  background,
  label,
}: {
  children: ReactNode;
  background: string;
  label?: string;
}) {
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <div
        className="relative h-[140px] w-[140px] overflow-hidden rounded-[26px] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
        style={{ background }}
        aria-hidden="true"
      >
        {children}
      </div>
      {label && (
        <figcaption className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

export function AskWirelineTile() {
  return (
    <Tile background={accentGradient} label="Ask Wireline">
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <Mic size={26} fill="currentColor" strokeWidth={0} />
        <div>
          <div className="text-[15px] font-bold leading-tight">Ask Wireline</div>
          <div className="text-[11px] text-white/75">Tap to start</div>
        </div>
      </div>
    </Tile>
  );
}

export function NeedsAttentionTile({ count = 2 }: { count?: number }) {
  const settled = count === 0;
  return (
    <Tile background={panelGradient} label="Needs Attention">
      <div className="flex h-full flex-col justify-between p-4">
        <Bell
          size={22}
          style={{ color: settled ? C.mint : C.amber }}
          fill="currentColor"
          strokeWidth={0}
        />
        <div>
          <div
            className="font-display text-[44px] font-extrabold leading-none"
            style={{ color: settled ? C.mint : C.irisBright }}
          >
            {count}
          </div>
          <div className="mt-0.5 text-[11px] font-medium" style={{ color: C.text2 }}>
            {count === 1 ? "needs follow-up" : "need follow-up"}
          </div>
        </div>
      </div>
    </Tile>
  );
}

export function AssistantHandoffTile() {
  return (
    <Tile background={accentGradient} label="Assistant">
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <Sparkles size={24} fill="currentColor" strokeWidth={0} />
        <div>
          <div className="text-[14px] font-bold leading-tight">Send call to Assistant</div>
          <div className="text-[11px] text-white/75">Tap to route</div>
        </div>
      </div>
    </Tile>
  );
}

export function WalletTile({ balance = "$24.50" }: { balance?: string }) {
  return (
    <Tile background={panelGradient} label="Wallet">
      <div className="flex h-full flex-col justify-between p-4">
        <CreditCard size={22} style={{ color: C.irisBright }} />
        <div>
          <div
            className="font-display text-[26px] font-extrabold leading-none"
            style={{ color: C.mint }}
          >
            {balance}
          </div>
          <div className="mt-1 text-[11px] font-medium" style={{ color: C.text2 }}>
            available credits
          </div>
        </div>
      </div>
    </Tile>
  );
}

/** Lock Screen rectangular accessory (monochrome, glanceable). */
export function LockScreenAccessory({ count = 2 }: { count?: number }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <div className="flex h-[78px] w-[200px] items-center gap-3 rounded-[18px] bg-white/[0.07] px-4 ring-1 ring-white/15 backdrop-blur">
        <Bell size={22} className="shrink-0 text-white" fill="currentColor" strokeWidth={0} />
        <div className="leading-tight text-white">
          <div className="text-[15px] font-bold">{count} need attention</div>
          <div className="text-[11px] text-white/70">Calls need follow-up</div>
        </div>
      </div>
      <figcaption className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Lock Screen
      </figcaption>
    </figure>
  );
}

/**
 * A glanceable phone frame holding a widget — used in the Home hero + Get-the-App
 * to make the "phone-screen design" tangible.
 */
export function PhoneMock({ children }: { children?: ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[9/19] w-[230px] rounded-[40px] bg-[#070809] p-2.5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
      {/* screen */}
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-[32px] p-4"
        style={{
          background: `radial-gradient(120% 60% at 50% -10%, rgba(124,156,255,0.18), transparent 60%), ${C.canvas}`,
        }}
      >
        {/* notch */}
        <div className="absolute left-1/2 top-2 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-black/80" />
        {/* status row */}
        <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-white/80">
          <span>9:41</span>
          <span className="tracking-tight">Wireline</span>
        </div>
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-4">
          {children ?? (
            <>
              <div className="flex gap-3">
                <AskWirelineTile />
              </div>
              <LockScreenAccessory />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
