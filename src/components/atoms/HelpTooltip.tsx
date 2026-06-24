import React from 'react';
import { HelpCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface HelpTooltipProps {
  content: React.ReactNode;
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ content, className }) => {
  return (
    <div className={cn('group relative inline-flex', className)}>
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">
        {content}
      </div>
    </div>
  );
};
