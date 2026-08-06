import { useState } from 'react';
import { ExternalLinkIcon, FolderOpenIcon, DownloadIcon, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function Files() {
  useLocale();
  const [loading, setLoading] = useState<string | null>(null);

  const folders = [
    { id: 'downloads', name: t('files.downloads'), icon: DownloadIcon, desc: t('files.downloadsDesc'), cmd: 'open_windows_downloads_folder' },
    { id: 'documents', name: t('files.documents'), icon: FolderOpenIcon, desc: t('files.documentsDesc'), cmd: 'open_documents_folder' },
    { id: 'desktop', name: t('files.desktop'), icon: FolderOpenIcon, desc: t('files.desktopDesc'), cmd: 'open_desktop_folder' },
    { id: 'pictures', name: t('files.pictures'), icon: FolderOpenIcon, desc: t('files.picturesDesc'), cmd: 'open_pictures_folder' },
    { id: 'screenshots', name: t('files.screenshots'), icon: FolderOpenIcon, desc: t('files.screenshotsDesc'), cmd: 'open_screenshots_folder' },
    { id: 'appdata', name: t('files.appdata'), icon: FolderOpenIcon, desc: t('files.appdataDesc'), cmd: 'open_appdata_folder' },
    { id: 'localappdata', name: t('files.localappdata'), icon: FolderOpenIcon, desc: t('files.localappdataDesc'), cmd: 'open_localappdata_folder' },
    { id: 'steam', name: t('files.steam'), icon: FolderOpenIcon, desc: t('files.steamDesc'), cmd: 'open_steam_folder' },
    { id: 'steamapps', name: t('files.steamApps'), icon: FolderOpenIcon, desc: t('files.steamAppsDesc'), cmd: 'open_steam_games_folder' },
  ];

  const openFolder = async (id: string, cmd: string) => {
    setLoading(id);
    try {
      await invoke<string>(cmd);
    } catch (e) {
      console.error(e);
    }
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-mvo-text">{t('files.title')}</h1>
        <p className="text-mvo-textDim mt-1">{t('files.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {folders.map(folder => (
          <button key={folder.id} onClick={() => openFolder(folder.id, folder.cmd)} disabled={loading !== null} className="glass p-4 rounded-xl flex items-center gap-4 hover:border-mvo-borderBright/50 hover:bg-mvo-panelHover/30 transition-all group text-left disabled:opacity-50">
            <div className={`p-3 rounded-xl ${folder.id.startsWith('steam') ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
              {loading === folder.id ? <Loader2 className="w-6 h-6 animate-spin" /> : <folder.icon className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-mvo-text group-hover:text-cyan-400 transition-colors">{folder.name}</h3>
              <p className="text-xs text-mvo-textDim truncate">{folder.desc}</p>
            </div>
            <ExternalLinkIcon className="w-5 h-5 text-mvo-textDim group-hover:text-mvo-text transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
