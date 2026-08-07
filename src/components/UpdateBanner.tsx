import { ArrowUpCircle, X, ExternalLink } from 'lucide-react';
import type { UpdateInfo } from '../hooks/useUpdater';

interface UpdateBannerProps {
  update: UpdateInfo;
  onUpdate: () => void;
  onDismiss: () => void;
  onViewChanges: () => void;
}

export function UpdateBanner({ update, onUpdate, onDismiss, onViewChanges }: UpdateBannerProps) {
  return (
    <div className="relative mb-6 p-4 rounded-2xl bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-purple-500/10 border border-cyan-400/30 backdrop-blur-sm animate-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-400/20 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="w-6 h-6 text-cyan-400 animate-bounce" />
          </div>
          <div>
            <p className="font-semibold text-cyan-400">Update Available</p>
            <p className="text-sm text-mvo-textDim">
              Version <span className="text-cyan-300 font-mono">{update.version}</span> is ready
              {update.pub_date && <span className="text-mvo-textMuted ml-2">• {update.pub_date}</span>}
            </p>
            {update.notes && (
              <p className="text-xs text-mvo-textMuted mt-1 line-clamp-1">{update.notes}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewChanges}
            className="px-3 py-1.5 text-xs text-mvo-textDim hover:text-cyan-400 border border-mvo-border/50 rounded-lg transition-colors"
          >
            View Changes
          </button>
          <button
            onClick={onUpdate}
            className="px-4 py-1.5 text-xs font-medium bg-cyan-400 text-black rounded-lg hover:bg-cyan-300 transition-colors"
          >
            Update Now
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-mvo-textMuted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
