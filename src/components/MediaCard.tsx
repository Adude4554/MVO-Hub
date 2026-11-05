import { Play, Star } from 'lucide-react';
import { getPosterUrl } from '../services/tmdb';
import type { TMDBMovie, TMDBTVShow } from '../types';

interface MediaCardProps {
  item: TMDBMovie | TMDBTVShow;
  onClick: () => void;
  onWatch?: () => void;
  showProgress?: boolean;
  progressPercent?: number;
}

const isMovie = (item: TMDBMovie | TMDBTVShow): item is TMDBMovie => (item as TMDBMovie).title !== undefined;

export function MediaCard({ item, onClick, onWatch, showProgress, progressPercent }: MediaCardProps) {
  const movie = isMovie(item);
  const title = movie ? item.title : item.name;
  const date = movie ? item.release_date : item.first_air_date;
  const year = date ? new Date(date).getFullYear() : null;
  const rating = item.vote_average > 0 ? item.vote_average.toFixed(1) : null;

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      tabIndex={0}
      role="button"
      aria-label={title}
      className="group cursor-pointer rounded-xl overflow-hidden bg-mvo-panel border border-mvo-border/30 hover:border-cyan-400/40 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-400/5 focus:outline-none"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-mvo-bg">
        {item.poster_path ? (
          <img
            src={getPosterUrl(item.poster_path, 'w342')}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-mvo-panelHover/50 text-mvo-textDim text-xs">
            No Image
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {onWatch && (
          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onWatch(); }}
              className="flex items-center gap-1.5 rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-cyan-400/40 hover:bg-cyan-300 transition-colors"
            >
              <Play className="h-3 w-3" />
              Watch
            </button>
          </div>
        )}

        {showProgress && progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.min(progressPercent * 100, 100)}%` }} />
          </div>
        )}
      </div>

      <div className="mt-2 px-0.5">
        <h3 className="text-sm font-medium text-mvo-text line-clamp-1">{title}</h3>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-mvo-textMuted">
          {year && <span>{year}</span>}
          {rating && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              {rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
