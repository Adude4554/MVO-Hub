import { useState, useEffect } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

let _tmdbKey = '';
async function getTmdbKey() {
  if (!_tmdbKey) _tmdbKey = await invoke<string>('get_tmdb_api_key');
  return _tmdbKey;
}

interface FeaturedItem {
  title: string;
  tmdbId: string;
  imdbId?: string;
  mediaType: 'movie' | 'tv';
}

interface FeaturedProps {
  items: FeaturedItem[];
  onSelect: (item: FeaturedItem & { embed_url: string }) => void;
}

export function FeaturedRow({ items, onSelect }: FeaturedProps) {
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPosters({});
    const CONCURRENT = 2;
    const DELAY = 500;

    const fetchOne = async (item: FeaturedItem) => {
      if (cancelled) return;
      try {
        const key = await getTmdbKey();
        const resp = await fetch(`https://api.themoviedb.org/3/${item.mediaType}/${item.tmdbId}?api_key=${key}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.poster_path && !cancelled) {
          setPosters(prev => ({ ...prev, [item.tmdbId]: `https://image.tmdb.org/t/p/w500${data.poster_path}` }));
        }
      } catch {}
    };

    const loadAll = async () => {
      for (let i = 0; i < items.length; i += CONCURRENT) {
        if (cancelled) break;
        await Promise.all(items.slice(i, i + CONCURRENT).map(fetchOne));
        if (!cancelled && i + CONCURRENT < items.length) {
          await new Promise(r => setTimeout(r, DELAY));
        }
      }
      if (!cancelled) setLoading(false);
    };
    loadAll();
    return () => { cancelled = true; };
  }, [items]);

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
                ? `https://vidsrcme.ru/embed/movie?imdb=${item.imdbId}`
                : `https://vidsrcme.ru/embed/tv?tmdb=${item.tmdbId}`;
              onSelect({ ...item, embed_url: embedUrl });
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
