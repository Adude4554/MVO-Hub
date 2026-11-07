import { useLocale } from '@/hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard, Loader2 } from '@/components';
import { AlertTriangle, AssignmentIcon, BrainIcon, BuildingIcon, CalendarIcon, CheckCircleIcon, ClockIcon, CloudIcon, DashboardIcon, DownloadIcon, EditIcon, EyeIcon, FolderOpenIcon, HeartIcon, HardDriveIcon, HeartBrokenIcon, KeyIcon, LayoutDashboardIcon, LogOutIcon, MailIcon, MapMarkerIcon, MenuIcon, MinimizeIcon, MonitorIcon, MoonIcon, Moon2Icon, MouseIcon, Mouse2Icon, NotificationsIcon, PaletteIcon, PantsIcon, PasswordIcon, PauseIcon, PeekIcon, PersonIcon, PetsIcon, PlayIcon, PlugIcon, PocketIcon, PodcastIcon, PollIcon, PositionIcon, Position2Icon, PosterIcon, PowerIcon, PowerOffIcon, PreviousIcon, PrintIcon, PrivacyIcon, ProfileIcon, PullRequestIcon, PushPinIcon, QrCodeIcon, QuestionCircleIcon, QuoteIcon, RadioIcon, RefreshCwIcon, RemoveIcon, ReorderIcon, ResearchIcon, RssIcon, SaveIcon, SearchIcon, SendIcon, SettingIcon, SettingsIcon, ShieldIcon, ShoppingBagIcon, ShortcutIcon, SlidersIcon, SocketIcon, SoundIcon, SpeakerBadgeIcon, SpeakerOffIcon, StarIcon, StorageIcon, SunIcon, TabletIcon, TagIcon, TableIcon, TimerIcon, TrashIcon, Trash2Icon, TravelIcon, TriangleIcon, TrophyIcon, TrendingUpIcon, TwitterIcon, TypeIcon, UberIcon, UmiIcon, UndoIcon, UnlockIcon, UploadIcon, UpvoteIcon, UserIcon, UsersIcon, WarningIcon, WatchIcon, WrenchIcon, XIcon, YahooIcon, ZigZagIcon, ZipIcon, ZoomInIcon, ZoomOutIcon, AidKitIcon, AirplaneIcon, AlarmIcon, AlbumIcon, AlienIcon, AllergyIcon, AltitudeIcon, AnniversaryIcon, ArrowDownCircleIcon, ArrowDownIcon, ArrowLeftCircleIcon, ArrowLeftIcon, ArrowRightCircleIcon, ArrowRightIcon, ArrowUpCircleIcon, ArrowUpIcon, AwardIcon, BackpackIcon, BabyIcon, BankIcon, BarChartIcon, BaseballIcon, BasketballIcon, BathIcon, BellIcon, BellOffIcon, BikeIcon, BioIcon, BirdIcon, BirthdayCakeIcon, BlendIcon, BlockIcon, BloodDropIcon, BlueprintsIcon, BoardIcon, BookIcon, BookOpenIcon, BookmarkIcon, BooleanIcon, BracesIcon, BrainIcon, BrickIcon, BriefcaseIcon, BrotherIcon, BubbleChartIcon, BugIcon, BuildIcon, BullhornIcon, BurnerIcon, BusIcon, CactusIcon, CalculatorIcon, CalendarIcon, Calendar3Icon, CalendarCheckIcon, CalendarClockIcon, CalendarDaysIcon, CalendarEditIcon, CalendarEmptyIcon, CalendarEndIcon, CalendarExclamationIcon, CalendarExternalIcon, CalendarHeartIcon, CalendarMinusIcon, CalendarOfficeIcon, CalendarOutlineIcon, CalendarPayIcon, CalendarPlusIcon, CalendarRemoveIcon, CalendarSearchIcon, CalendarShareIcon, CalendarStarIcon, CalendarTextIcon, CalendarWeekIcon, CalendarXIcon, CameraIcon, CameraRetrospectiveIcon, CapsuleIcon, CandyIcon, CannabisIcon, CapIcon, CarSideIcon, CarFrontIcon, Car RearIcon, CarSideIcon, CarFrontIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, CartIcon, CastIcon, CellphoneIcon, CellsIcon, CenterIcon, CertificateIcon, ChainIcon, ChatBubbleIcon, ChatDotsIcon, ChatIcon, CheckIcon, CheckCircleIcon, CheckSquareIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, CircleIcon, ClockIcon, CloudRainIcon, CloudSnowIcon, CloudyIcon, CodeIcon, Code2Icon, CodepenIcon, CodesandboxIcon, CoffeeIcon, ColoncandlesIcon, ColorFillIcon, ColorPickerIcon, ColumnIcon, Column2Icon, CommandIcon, CompassIcon, CookieIcon, CornersIcon, CpuIcon, CreditCardIcon, CropIcon, CrossIcon, CrownIcon, CruiseIcon, CrateIcon, CursorIcon, DashboardIcon, DatabaseIcon, DeleteIcon, DialIcon, DiscountIcon, DividerIcon, DockIcon, DocumentDownloadIcon, DocumentUploadIcon, DocumentWidthIcon, DocumentIcon, DocumentTextIcon, DogIcon, DiscordIcon, DividerHorizontalIcon, DividerVerticalIcon, DNSIcon, DockIcon, DockerIcon, DogIcon, DollarSignIcon, DoorIcon, DownloadIcon, DrawerIcon, DropletIcon, DribbbleIcon, EditIcon, EggplantIcon, EjectIcon, EllipsisHorizontalIcon, EllipsisVerticalIcon, EnvelopeIcon, EraserIcon, ErrorIcon, EscalatorIcon, EuroIcon, ExchangeAltIcon, ExchangeIcon, ExclamationCircleIcon, ExitIcon, EyedropperIcon, FaceIcon, FanIcon, FastBackwardIcon, FastForwardIcon, FeatherIcon, FigmaIcon, FileAddIcon, FileArchiveIcon, FileAudioIcon, FileBinaryIcon, FileCsvIcon, FileCheckboxIcon, FileCodeIcon, FileExcelIcon, FileImageIcon, FileInputIcon, FileLinkIcon, FileLockIcon, FileMenuIcon, FileMinusIcon, FileOutputIcon, FilePdfIcon, FilePictureIcon, FilePlusIcon, FilePowerpointIcon, FileSearchIcon, FileSpreadsheetIcon, FileStarIcon, FileSubtractIcon, FileSyncIcon, TableTableIcon, TabletIcon, TagIcon, TerminalIcon, TextCursorIcon, TextResizeIcon, TheaterIcon, ThumbsDownIcon, ThumbsUpIcon, TicketIcon, ToggleLeftIcon, ToggleRightIcon, ToolsIcon, TrackIcon, TransferIcon, TrashIcon, Trash2Icon, TrelloIcon, TriangleIcon, TrendingUpIcon, TruckIcon, TwitterIcon, TypeIcon, UberIcon, UmiIcon, UndoIcon, UnlockIcon, UploadIcon, UpvoteIcon, UserIcon, UsersIcon, VimeoIcon, Volume1Icon, Volume2Icon, Volume3Icon, Volume4Icon, VolumeMuteIcon, WallpaperIcon, WalletIcon, WatchIcon, WeatherCloudIcon, WeatherRainIcon, WeatherSnowIcon, WeatherSunnyIcon, WebcamIcon, WidgetIcon, WindowMaximizeIcon, WindowMinimizeIcon, WindowRestoreIcon, WindowsIcon, WrenchIcon, XCircleIcon, XSquareIcon, YahooIcon, ZigZagIcon, ZipIcon, ZoomInIcon, ZoomOutIcon, AidKitIcon, AirplaneIcon, AlarmIcon, AlbumIcon, AlienIcon, AllergyIcon, AltitudeIcon, AnniversaryIcon, ArrowDownCircleIcon, ArrowDownIcon, ArrowLeftCircleIcon, ArrowLeftIcon, ArrowRightCircleIcon, ArrowRightIcon, ArrowUpCircleIcon, ArrowUpIcon, AwardIcon, BackpackIcon, BabyIcon, BankIcon, BarChartIcon, BaseballIcon, BasketballIcon, BathIcon, BellIcon, BellOffIcon, BikeIcon, BioIcon, BirdIcon, BirthdayCakeIcon, BlendIcon, BlockIcon, BloodDropIcon, BlueprintsIcon, BoardIcon, BookIcon, BookOpenIcon, BookmarkIcon, BooleanIcon, BracesIcon, BrainIcon, BrickIcon, BriefcaseIcon, BrotherIcon, BubbleChartIcon, BugIcon, BuildIcon, BullhornIcon, BurnerIcon, BusIcon, CactusIcon, CalculatorIcon, CalendarIcon, Calendar3Icon, CalendarCheckIcon, CalendarClockIcon, CalendarDaysIcon, CalendarEditIcon, CalendarEmptyIcon, CalendarEndIcon, CalendarExclamationIcon, CalendarExternalIcon, CalendarHeartIcon, CalendarMinusIcon, CalendarOfficeIcon, CalendarOutlineIcon, CalendarPayIcon, CalendarPlusIcon, CalendarRemoveIcon, CalendarSearchIcon, CalendarShareIcon, CalendarStarIcon, CalendarTextIcon, CalendarWeekIcon, CalendarXIcon, CameraIcon, CameraRetrospectiveIcon, CapsuleIcon, CandyIcon, CannabisIcon, CapIcon, CarSideIcon, CarFrontIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, CartIcon, CastIcon, CellphoneIcon, CellsIcon, CenterIcon, CertificateIcon, ChainIcon, ChatBubbleIcon, ChatDotsIcon, ChatIcon, CheckIcon, CheckCircleIcon, CheckSquareIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, CircleIcon, ClockIcon, CloudRainIcon, CloudSnowIcon, CloudyIcon, CodeIcon, Code2Icon, CodepenIcon, CodesandboxIcon, CoffeeIcon, ColoncandlesIcon, ColorFillIcon, ColorPickerIcon, ColumnIcon, Column2Icon, CommandIcon, CompassIcon, CookieIcon, CornersIcon, CpuIcon, CreditCardIcon, CropIcon, CrossIcon, CrownIcon, CruiseIcon, CrateIcon, CursorIcon, DashboardIcon, DatabaseIcon, DeleteIcon, DialIcon, DiscountIcon, DividerIcon, DockIcon, DocumentDownloadIcon, DocumentUploadIcon, DocumentWidthIcon, DocumentIcon, DocumentTextIcon, DogIcon, DiscordIcon, DividerHorizontalIcon, DividerVerticalIcon, DNSIcon, DockIcon, DockerIcon, DogIcon, DollarSignIcon, DoorIcon, DownloadIcon, DrawerIcon, DropletIcon, DribbbleIcon, EditIcon, EggplantIcon, EjectIcon, EllipsisHorizontalIcon, EllipsisVerticalIcon, EnvelopeIcon, EraserIcon, ErrorIcon, EscalatorIcon, EuroIcon, ExchangeAltIcon, ExchangeIcon, ExclamationCircleIcon, ExitIcon, EyedropperIcon, FaceIcon, FanIcon, FastBackwardIcon, FastForwardIcon, FeatherIcon, FigmaIcon, FileAddIcon, FileArchiveIcon, FileAudioIcon, FileBinaryIcon, FileCsvIcon, FileCheckboxIcon, FileCodeIcon, FileExcelIcon, FileImageIcon, FileInputIcon, FileLinkIcon, FileLockIcon, FileMenuIcon, FileMinusIcon, FileOutputIcon, FilePdfIcon, FilePictureIcon, FilePlusIcon, FilePowerpointIcon, FileSearchIcon, FileSpreadsheetIcon, FileStarIcon, FileSubtractIcon, FileSyncIcon, TableTableIcon, TabletIcon, TagIcon, TerminalIcon, TextCursorIcon, TextResizeIcon, TheaterIcon, ThumbsDownIcon, ThumbsUpIcon, TicketIcon, ToggleLeftIcon, ToggleRightIcon, ToolsIcon, TrackIcon, TransferIcon, TrashIcon, Trash2Icon, TrelloIcon, TriangleIcon, TrendingUpIcon, TruckIcon, TwitterIcon, TypeIcon, UberIcon, UmiIcon, UndoIcon, UnlockIcon, UploadIcon, UpvoteIcon, UserIcon, UsersIcon, VimeoIcon, Volume1Icon, Volume2Icon, Volume3Icon, Volume4Icon, VolumeMuteIcon, WallpaperIcon, WalletIcon, WatchIcon, WeatherCloudIcon, WeatherRainIcon, WeatherSnowIcon, WeatherSunnyIcon, WebcamIcon, WidgetIcon, WindowMaximizeIcon, WindowMinimizeIcon, WindowRestoreIcon, WindowsIcon, WrenchIcon, XCircleIcon, XSquareIcon, YahooIcon, ZigZagIcon, ZipIcon, ZoomInIcon, ZoomOutIcon, AidKitIcon, AirplaneIcon, AlarmIcon, AlbumIcon, AlienIcon, AllergyIcon, AltitudeIcon, AnniversaryIcon, ArrowDownCircleIcon, ArrowDownIcon, ArrowLeftCircleIcon, ArrowLeftIcon, ArrowRightCircleIcon, ArrowRightIcon, ArrowUpCircleIcon, ArrowUpIcon, AwardIcon, BackpackIcon, BabyIcon, BankIcon, BarChartIcon, BaseballIcon, BasketballIcon, BathIcon, BellIcon, BellOffIcon, BikeIcon, BioIcon, BirdIcon, BirthdayCakeIcon, BlendIcon, BlockIcon, BloodDropIcon, BlueprintsIcon, BoardIcon, BookIcon, BookOpenIcon, BookmarkIcon, BooleanIcon, BracesIcon, BrainIcon, BrickIcon, BriefcaseIcon, BrotherIcon, BubbleChartIcon, BugIcon, BuildIcon, BullhornIcon, BurnerIcon, BusIcon, CactusIcon, CalculatorIcon, CalendarIcon, Calendar3Icon, CalendarCheckIcon, CalendarClockIcon, CalendarDaysIcon, CalendarEditIcon, CalendarEmptyIcon, CalendarEndIcon, CalendarExclamationIcon, CalendarExternalIcon, CalendarHeartIcon, CalendarMinusIcon, CalendarOfficeIcon, CalendarOutlineIcon, CalendarPayIcon, CalendarPlusIcon, CalendarRemoveIcon, CalendarSearchIcon, CalendarShareIcon, CalendarStarIcon, CalendarTextIcon, CalendarWeekIcon, CalendarXIcon, CameraIcon, CameraRetrospectiveIcon, CapsuleIcon, CandyIcon, CannabisIcon, CapIcon, CarSideIcon, CarFrontIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon, CartIcon, CastIcon, CellphoneIcon, CellsIcon, CenterIcon, CertificateIcon, ChainIcon, ChatBubbleIcon, ChatDotsIcon, ChatIcon, CheckIcon, CheckCircleIcon, CheckSquareIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, CircleIcon, ClockIcon, CloudRainIcon, CloudSnowIcon, CloudyIcon, CodeIcon, Code2Icon, CodepenIcon, CodesandboxIcon, CoffeeIcon, ColoncandlesIcon, ColorFillIcon, ColorPickerIcon, ColumnIcon, Column2Icon, CommandIcon, CompassIcon, CookieIcon, CornersIcon, CpuIcon, CreditCardIcon, CropIcon, CrossIcon, CrownIcon, CruiseIcon, CrateIcon, CursorIcon, DashboardIcon, DatabaseIcon, DeleteIcon, DialIcon, DiscountIcon, DividerIcon, DockIcon, DocumentDownloadIcon, DocumentUploadIcon, DocumentWidthIcon, DocumentIcon, DocumentTextIcon, DogIcon, DiscordIcon, DividerHorizontalIcon, DividerVerticalIcon, DNSIcon, DockIcon, DockerIcon, DogIcon, DollarSignIcon, DoorIcon, DownloadIcon, DrawerIcon, DropletIcon, DribbbleIcon, EditIcon, EggplantIcon, EjectIcon, EllipsisHorizontalIcon, EllipsisVerticalIcon, EnvelopeIcon, EraserIcon, ErrorIcon, EscalatorIcon, EuroIcon, ExchangeAltIcon, ExchangeIcon, ExclamationCircleIcon, ExitIcon, EyedropperIcon, FaceIcon, FanIcon, FastBackwardIcon, FastForwardIcon, FeatherIcon, FigmaIcon, FileAddIcon, FileArchiveIcon, FileAudioIcon, FileBinaryIcon, FileCsvIcon, FileCheckboxIcon, FileCodeIcon, FileExcelIcon, FileImageIcon, FileInputIcon, FileLinkIcon, FileLockIcon, FileMenuIcon, FileMinusIcon, FileOutputIcon, FilePdfIcon, FilePictureIcon, FilePlusIcon, FilePowerpointIcon, FileSearchIcon, FileSpreadsheetIcon, FileStarIcon, FileSubtractIcon, FileSyncIcon, TableTableIcon, TabletIcon, TagIcon, TerminalIcon, TextCursorIcon, TextResizeIcon, TheaterIcon, ThumbsDownIcon, ThumbsUpIcon, TicketIcon, ToggleLeftIcon, ToggleRightIcon, ToolsIcon, TrackIcon, TransferIcon, TrashIcon, Trash2Icon, TrelloIcon, TriangleIcon, TrendingUpIcon, TruckIcon, TwitterIcon, TypeIcon, UberIcon, UmiIcon, UndoIcon, UnlockIcon, UploadIcon, UpvoteIcon, UserIcon, UsersIcon, VimeoIcon, Volume1Icon, Volume2Icon, Volume3Icon, Volume4Icon, VolumeMuteIcon, WallpaperIcon, WalletIcon, WatchIcon, WeatherCloudIcon, WeatherRainIcon, WeatherSnowIcon, WeatherSunnyIcon, WebcamIcon, WidgetIcon, WindowMaximizeIcon, WindowMinimizeIcon, WindowRestoreIcon, WindowsIcon, WrenchIcon, XCircleIcon, XSquareIcon, YahooIcon, ZigZagIcon, ZipIcon, ZoomInIcon, ZoomOutIcon

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Mirrors Rust's `is_trusted_url`: absolute HTTPS only. */
function isTrustedUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  const rest = value.slice('https://'.length);
  if (rest.length === 0 || rest.startsWith('/')) return false;
  return !/[\s\\]/.test(rest);
}

const TIER_LABELS: Record<EnterpriseTier, string> = {
  community: 'Community',
  team: 'Team',
  enterprise: 'Enterprise',
};

function EnterpriseTab() {
  // ... existing code ...
}

export function Settings({ settings: parentSettings, onSettingsChange, user, defaultTab }: { settings?: any; onSettingsChange?: (s: any) => void; user?: any; defaultTab?: string } = {}) {
  useLocale();
  const [settings, setSettings] = useState<any>(parentSettings || {});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'ai' | 'sync' | 'advanced' | 'updates' | 'scanner' | 'plugins' | 'enterprise' | 'account' | 'discord' | 'tray'>((defaultTab as any) || 'general');

  useEffect(() => {
    if (parentSettings) setSettings(parentSettings);
  }, [parentSettings]);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab as any);
  }, [defaultTab]);

  // Helper: update local state AND notify parent
  const update = (patch: Partial<any>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (onSettingsChange) onSettingsChange(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await invoke('save_settings', { settings });
    } catch (e) {
      console.error('Settings save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      const data = await invoke<any>('reset_settings');
      setSettings(data);
      if (onSettingsChange) onSettingsChange(data);
    } catch (e) {
      console.error('Settings reset failed:', e);
    }
  };

  const exportSettings = async () => {
    const json = await invoke<string>('export_settings');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mvo-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await invoke('import_settings', { json: text });
    const data = await invoke<any>('load_settings');
    setSettings(data);
    if (onSettingsChange) onSettingsChange(data);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-cyan-400" /></div>;

  const tabs = [
    { id: 'general', label: t('settings.general'), icon: SettingsIcon },
    { id: 'ai', label: 'AI', icon: BrainIcon },
    { id: 'sync', label: 'Cloud Sync', icon: CloudIcon },
    { id: 'advanced', label: t('settings.advanced'), icon: ShieldIcon },
    { id: 'updates', label: 'Updates', icon: RefreshCwIcon },
    { id: 'scanner', label: 'Scanner', icon: DatabaseIcon },
    { id: 'plugins', label: 'Plugins', icon: PuzzleIcon },
    { id: 'enterprise', label: 'Enterprise', icon: BuildingIcon },
    { id: 'account', label: 'Account', icon: UserIcon },
    { id: 'discord', label: 'Discord RPC', icon: DiscordIcon },
    { id: 'tray', label: 'Tray & Shortcuts', icon: TrayIcon },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('settings.title')}</h1>
          <p className="text-mvo-textDim mt-1">{t('settings.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="btn-secondary" disabled={saving}>{t('settings.resetDefaults')}</button>
          <button onClick={exportSettings} className="btn-secondary">{t('settings.exportSettings')}</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? t('common.loading') : t('settings.saveChanges')}
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-mvo-border/50">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 rounded-xl text-sm font-medium ${activeTab === tab.id ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30' : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'}`}>
            <tab.icon className="w-4 h-4 mr-2 inline-block" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (/* ... existing general tab ... */)}

      {activeTab === 'ai' && (/* ... existing AI tab ... */)}

      {activeTab === 'sync' && (<CloudSyncTab settings={settings} update={update} />)}

      {activeTab === 'advanced' && (/* ... existing advanced tab ... */)}

      {activeTab === 'updates' && (<UpdatesTab />)}

      {activeTab === 'scanner' && (<ScannerSettingsTab />)}

      {activeTab === 'plugins' && (<PluginsTab />)}

      {activeTab === 'enterprise' && (<EnterpriseTab />)}

      {activeTab === 'account' && (<AccountTab user={user} />)}

      {activeTab === 'discord' && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><DiscordIcon className="w-5 h-5 text-mvo-crimsonBright" /> Discord Rich Presence</h3>
          <p className="text-[11.5px] text-mvo-textDim">
            Enables Rich Presence updates when games launch or close. Shows the current game title,
            session duration, and custom MVO Hub details in your Discord friend activity feed.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Enable Discord Rich Presence</label>
              <input
                type="checkbox"
                id="discord_rpc_enabled"
                checked={settings.discord_rpc_enabled ?? true}
                onChange={e => update({discord_rpc_enabled: e.target.checked})}
                className="w-4 h-4 accent-cyan-400 rounded"
              />
            </div>
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Client ID</label>
              <input
                value={settings.discord_client_id ?? ''}
                onChange={e => update({discord_client_id: e.target.value})}
                className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                placeholder="e.g., 123456789012345678"
                aria-label="Discord application client ID"
              />
              <p className="mt-1 text-[10px] text-mvo-textDim">
                Get a Client ID from the <a href="https://discord.com/developers/applications" target="_blank" className="text-mvo-crimsonBright underline">Discord Developer Portal</a>.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-mvo-border/30">
            <h4 className="font-medium text-[11px] text-mvo-textMuted mb-2">Current Presence</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-mvo-textMuted">
                <span>Large image:</span>
                <span id="discord_large_image" className="font-mono text-white/60">{settings.discord_large_image || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-mvo-textMuted">
                <span>Large text:</span>
                <span id="discord_large_text" className="font-mono text-white/60">{settings.discord_large_text || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-mvo-textMuted">
                <span>Small image:</span>
                <span id="discord_small_image" className="font-mono text-white/60">{settings.discord_small_image || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-mvo-textMuted">
                <span>Small text:</span>
                <span id="discord_small_text" className="font-mono text-white/60">{settings.discord_small_text || '—'}</span>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === 'tray' && (
        <GlassCard className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><TrayIcon className="w-5 h-5 text-mvo-crimsonBright" /> Tray & Shortcuts</h3>
          <p className="text-[11.5px] text-mvo-textMin">
            Minimize to tray on close, global keyboard shortcuts, and window persistence.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Minimize to tray on close</label>
              <input
                type="checkbox"
                id="minimize_to_tray"
                checked={settings.minimize_to_tray ?? true}
                onChange={e => update({minimize_to_tray: e.target.checked})}
                className="w-4 h-4 accent-cyan-400 rounded"
              />
            </div>
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Show in taskbar</label>
              <input
                type="checkbox"
                id="show_in_taskbar"
                checked={settings.show_in_taskbar ?? false}
                onChange={e => update({show_in_taskbar: e.target.checked})}
                className="w-4 h-4 accent-cyan-400 rounded"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Quick Launch shortcut</label>
              <input
                value={settings.quick_launch_shortcut || 'Ctrl+Shift+L'}
                onChange={e => update({quick_launch_shortcut: e.target.value})}
                className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                placeholder="e.g., Ctrl+Shift+L"
                aria-label="Quick Launch global shortcut"
              />
              <p className="mt-1 text-[10px] text-mvo-textDim">
                Ctrl+Shift+L by default. Press to quickly open the Game Library.
              </p>
            </div>
            <div>
              <label className="block text-sm text-mvo-textDim mb-1">Toggle Overlay shortcut</label>
              <input
                value={settings.overlay_toggle_shortcut || 'F12'}
                onChange={e => update({overlay_toggle_shortcut: e.target.value})}
                className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                placeholder="e.g., F12"
                aria-label="Toggle Overlay global shortcut"
              />
              <p className="mt-1 text-[10px] text-mvo-textDim">
                F12 by default. Press to toggle the MVO overlay.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-mvo-border/30">
            <h4 className="font-medium text-[11px] text-mvo-textMuted mb-2">Window Persistence</h4>
            <p className="text-xs text-mvo-textDim mb-2">
              Window position, size, and maximized state are remembered across app restarts.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-mvo-textMuted mb-1">Window X position</label>
                <input
                  value={String(settings.window_persistence?.position?.0 ?? 0)}
                  onChange={e => update({window_persistence: {...settings.window_persistence, position: [parseInt(e.target[0]), settings.window_persistence?.position?.1 ?? 0]})}
                  className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                  aria-label="Window X position"
                />
              </div>
              <div>
                <label className="block text-[10px] text-mvo-textMuted mb-1">Window Y position</label>
                <input
                  value={String(settings.window_persistence?.position?.1 ?? 0)}
                  onChange={e => update({window_persistence: {...settings.window_persistence, position: [settings.window_persistence?.position?.0 ?? 0, parseInt(e.target[0])]})}
                  className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                  aria-label="Window Y position"
                />
              </div>
              <div>
                <label className="block text-[10px] text-mvo-textMuted mb-1">Window width</label>
                <input
                  value={String(settings.window_persistence?.size?.0 ?? 1500)}
                  onChange={e => update({window_persistence: {...settings.window_persistence, size: [parseInt(e.target[0]), settings.window_persistence?.size?.1 ?? 900]})}
                  className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                  aria-label="Window width"
                />
              </div>
              <div>
                <label className="block text-[10px] text-mvo-textMuted mb-1">Window height</label>
                <input
                  value={String(settings.window_persistence?.size?.1 ?? 900)}
                  onChange={e => update({window_persistence: {...settings.window_persistence, size: [settings.window_persistence?.size?.0 ?? 1500, parseInt(e.target[0])]})}
                  className="w-full rounded-xl border bg-black/25 px-3 py-2 font-mono text-[12px] text-white outline-none transition-colors focus:border-mvo-crimson/50"
                  aria-label="Window height"
                />
              </div>
              <div>
                <label className="block text-[10px] text-mvo-textMuted mb-1">Remember maximized state</label>
                <input
                  type="checkbox"
                  id="remember_maximized"
                  checked={settings.window_persistence?.maximized ?? true}
                  onChange={e => update({window_persistence: {...settings.window_persistence, maximized: e.target.checked})}
                  className="w-4 h-4 accent-cyan-400 rounded"
                />
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}