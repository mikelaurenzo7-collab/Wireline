import React from "react";
import Medallion from "./ui/Medallion";

interface SpinnerGemProps {
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizeMap: Record<string, number> = {
  xs: 6,
  sm: 8,
  md: 12,
};

export default function SpinnerGem({ size = "sm", className }: SpinnerGemProps) {
  const dim = sizeMap[size] || 8;
  return (
    <Medallion size={size} shimmer withHalo={false} className={className}>
      <div 
        className="rounded-full bg-brand/80 shadow-[0_0_8px_rgba(107,43,153,0.4)]" 
        style={{ width: dim, height: dim }} 
      />
    </Medallion>
  );
}
