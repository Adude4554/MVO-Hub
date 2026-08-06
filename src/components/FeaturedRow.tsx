import { useState, useEffect } from 'react';
import { Play, Loader2, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface FeaturedItem {
  title: string;
  tmdbId: string;
  mediaType: 'movie' | 'tv';
}

interface FeaturedProps {
  items: FeaturedItem[];
  onSelect: (item: { embed_url: string; title: string; quality: string }) => void;
}

function posterSrc(localPath: string) {
  return convertFileSrc(localPath.replace(/\\/g, '/'));
}

export function FeaturedRow({ items, onSelect }: FeaturedProps) {
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      for (const item of items) {
        if (cancelled) return;
        if (posters[item.tmdbId]) continue;

        try {
          const cached = await invoke<string>('get_cached_poster', { tmdbId: item.tmdbId });
          if (cached && !cancelled) {
            setPosters(prev => ({ ...prev, [item.tmdbId]: posterSrc(cached) }));
            continue;
          }
        } catch {}

        try {
          const result = await invoke<{ poster_path: string }>('fetch_tmdb_poster', {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            apiKey: '',
          });
          if (result.poster_path && !cancelled) {
            setPosters(prev => ({ ...prev, [item.tmdbId]: posterSrc(result.poster_path) }));
          }
        } catch {}

        await new Promise(r => setTimeout(r, 150));
      }
      if (!cancelled) setLoading(false);
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold text-mvo-text">Featured</h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(item => (
          <FeaturedCard
            key={item.tmdbId}
            item={item}
            poster={posters[item.tmdbId]}
            onClick={() => {
              const embedUrl = item.mediaType === 'movie'
                ? `https://vidsrcme.ru/embed/movie?tmdb=${item.tmdbId}`
                : `https://vidsrcme.ru/embed/tv/${item.tmdbId}`;
              onSelect({ embed_url: embedUrl, title: item.title, quality: 'HD' });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FeaturedCard({ item, poster, onClick }: { item: FeaturedItem; poster?: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-[140px] cursor-pointer group rounded-xl overflow-hidden bg-mvo-panel border border-mvo-border/30 hover:border-cyan-400/40 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-400/5"
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        {poster ? (
          <img src={poster} alt={item.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
            <span className="text-2xl font-bold text-white/40">{item.title.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
          </div>
        </div>
      </div>
      <div className="p-2">
        <h3 className="text-xs font-medium text-mvo-text line-clamp-2 leading-tight">{item.title}</h3>
      </div>
    </div>
  );
}
