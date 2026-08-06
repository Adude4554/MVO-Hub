export interface PageConfig {
  id: string
  label: string
  icon: string
  group: string
  description?: string
}

export const pageGroups = [
  { id: 'main', label: 'MAIN', order: 1 },
  { id: 'media', label: 'MOVIES & TV SHOWS', order: 2 },
  { id: 'gaming', label: 'GAMING', order: 3 },
  { id: 'tools', label: 'TOOLS', order: 4 },
  { id: 'system', label: 'SYSTEM', order: 5 },
] as const

export const availablePages: PageConfig[] = [
   { id: 'dashboard', label: 'Dashboard', icon: '📊', group: 'main', description: 'System overview & quick actions' },
   { id: 'moviestv', label: 'Movies & TV Shows', icon: '🎬', group: 'media', description: 'Watch movies & TV shows' },
   { id: 'gamelibrary', label: 'Game Library', icon: '🎮', group: 'gaming', description: 'Steam games & manual entries' },
   { id: 'gamevault', label: 'Game Vault', icon: '📦', group: 'gaming', description: 'Free games from GameVault' },
   { id: 'globalchat', label: 'Chat', icon: '💬', group: 'gaming', description: 'Global chat with servers per language' },
   { id: 'files', label: 'Files', icon: '📁', group: 'tools', description: 'Quick folder & system access' },
   { id: 'tools', label: 'Tools', icon: '🛠️', group: 'tools', description: 'External tool detection & launch' },
   { id: 'optimizer', label: 'Tools', icon: '🔧', group: 'system', description: 'System optimizer & advanced tools' },
   { id: 'settings', label: 'Settings', icon: '⚙️', group: 'system', description: 'App preferences & profiles' },
   { id: 'overlay', label: 'Overlay', icon: '📈', group: 'tools', description: 'In-game monitoring tools' },
   { id: 'performance', label: 'Performance', icon: '📈', group: 'tools', description: 'CPU, RAM, storage, GPU metrics' },
   { id: 'systemboost', label: 'System Boost', icon: '🚀', group: 'tools', description: 'One-click performance modes' },
   { id: 'aitools', label: 'AI Tools', icon: '🤖', group: 'tools', description: 'Local & cloud AI assistants' },
   { id: 'webhub', label: 'Web Hub', icon: '🌐', group: 'tools', description: 'Gaming & dev resource links' },
   { id: 'functiontest', label: 'Function Test', icon: '🧪', group: 'tools', description: 'Backend command testing' },
   { id: 'updates', label: 'Updates', icon: '🔄', group: 'system', description: 'App updates & version info' },
 ] as const

export type PageId = typeof availablePages[number]['id']

export const DEFAULT_HIDDEN_PAGES: string[] = [
  'overlay', 'streaming', 'performance', 'systemboost', 'aitools', 'webhub', 'functiontest', 'updates'
]
