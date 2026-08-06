// MVO Game Artwork - Steam CDN URLs
export interface GameEntry {
  id: number;
  name: string;
  path: string;
  launcher: string;
  cover: string | null;
  app_id: string | null;
}

export function getSteamHeaderUrl(game: GameEntry): string {
  if (game.launcher !== "steam" || !game.app_id) return "";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/header.jpg`;
}

export function getSteamPosterUrl(game: GameEntry): string {
  if (game.launcher !== "steam" || !game.app_id) return "";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/library_600x900.jpg`;
}

export function getSteamHeroUrl(game: GameEntry): string {
  if (game.launcher !== "steam" || !game.app_id) return "";
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/library_hero.jpg`;
}

export function getGameInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

const LAUNCHER_COLORS: Record<string, string[]> = {
  steam: ["#1b2838", "#2a475e"],
  epic: ["#2a2a2a", "#0078f2"],
  gog: ["#86328a", "#c624d4"],
  origin: ["#f56c2e", "#c1272d"],
  ea: ["#f56c2e", "#c1272d"],
  ubisoft: ["#0066cc", "#0099ff"],
  battlenet: ["#00aeef", "#0070cc"],
  riot: ["#d32936", "#bd2632"],
  xbox: ["#107c10", "#0e6b0e"],
  rockstar: ["#ffc300", "#e6b800"],
  amazon: ["#00a8e1", "#0077b5"],
  heroic: ["#553986", "#8549ba"],
  custom: ["#3a3a3a", "#5a5a5a"],
  unknown: ["#292929", "#3a3a3a"],
};

export function getLauncherGradient(launcher: string): string {
  const colors = LAUNCHER_COLORS[launcher.toLowerCase()] || LAUNCHER_COLORS.unknown;
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
}

export function getGameImageUrl(game: GameEntry): string {
  const posterUrl = getSteamPosterUrl(game);
  if (posterUrl) return posterUrl;
  if (game.cover) return `file://${game.cover}`;
  return "";
}
