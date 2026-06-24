import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
          'wl-badge',
          variant === 'success' && 'bg-green-500/10 text-green-400',
          variant === 'warning' && 'bg-yellow-500/10 text-yellow-400',
          variant === 'destructive' && 'bg-red-500/10 text-red-400',
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
