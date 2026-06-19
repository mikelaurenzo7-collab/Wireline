import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, ChevronDown, UserRound } from "lucide-react";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

type WorkspaceSwitcherProps = {
  mode: "business" | "personal";
};

export function WorkspaceSwitcher({ mode }: WorkspaceSwitcherProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const businessActive = mode === "business";
  const returnTo = encodeURIComponent(location.pathname + location.search);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative px-2">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "flex w-full items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
          "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white",
        )}
      >
        <span className="inline-flex items-center gap-2">
          {businessActive ? <Building2 size={13} /> : <UserRound size={13} />}
          {businessActive ? "Business" : "Personal"}
        </span>
        <ChevronDown
          size={14}
          className={cx("text-white/45 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-2 right-2 z-50 mt-1 overflow-hidden rounded-[14px] border border-white/10 bg-[#2a2540] py-1 shadow-xl"
        >
          <Link
            role="menuitem"
            to={`/app/business?from=${returnTo}`}
            onClick={() => setOpen(false)}
            className={cx(
              "flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              businessActive
                ? "bg-brand/15 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            <Building2 size={14} /> Business workspace
          </Link>
          <Link
            role="menuitem"
            to={`/app/personal?from=${returnTo}`}
            onClick={() => setOpen(false)}
            className={cx(
              "flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              !businessActive
                ? "bg-brand/15 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white",
            )}
          >
            <UserRound size={14} /> Personal workspace
          </Link>
        </div>
      ) : null}
    </div>
  );
}
