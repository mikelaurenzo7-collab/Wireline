type WirelineMarkProps = {
  className?: string;
  label?: string;
};

export default function WirelineMark({ className = "", label }: WirelineMarkProps) {
  return (
    <span
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-grid place-items-center font-semibold tracking-[-0.18em] ${className}`}
    >
      W
    </span>
  );
}
