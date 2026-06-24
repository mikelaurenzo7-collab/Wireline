import React from 'react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg',
        'wl-toast',
        type === 'success' && 'border-green-500/30 bg-green-950 text-green-400',
        type === 'error' && 'border-red-500/30 bg-red-950 text-red-400',
        type === 'info' && 'border-border bg-card text-foreground'
      )}
    >
      <div className="flex-1 text-sm font-medium">{message}</div>
      {onClose && (
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ×
        </button>
      )}
    </div>
  );
};
