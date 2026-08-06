import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '../components/ui';
import { SendIcon, ImageIcon, SmileIcon, HashIcon, UsersIcon } from 'lucide-react';

interface ChatMessage {
  id: number;
  user: string;
  text: string;
  image?: string;
  timestamp: string;
  avatar?: string;
}

interface ChatServer {
  id: string;
  name: string;
  language: string;
  icon: string;
  color: string;
}

const SERVERS: ChatServer[] = [
  { id: 'en-general', name: 'General', language: 'English', icon: '💬', color: 'from-cyan-400 to-blue-600' },
  { id: 'en-gaming', name: 'Gaming', language: 'English', icon: '🎮', color: 'from-green-400 to-emerald-600' },
  { id: 'en-support', name: 'Support', language: 'English', icon: '🛠️', color: 'from-orange-400 to-red-600' },
  { id: 'ar-general', name: 'عام', language: 'العربية', icon: '💬', color: 'from-purple-400 to-pink-600' },
  { id: 'de-general', name: 'Allgemein', language: 'Deutsch', icon: '💬', color: 'from-yellow-400 to-amber-600' },
  { id: 'es-general', name: 'General', language: 'Español', icon: '💬', color: 'from-rose-400 to-fuchsia-600' },
  { id: 'fr-general', name: 'Général', language: 'Français', icon: '💬', color: 'from-indigo-400 to-violet-600' },
];

const AVATAR_COLORS = [
  'from-cyan-400 to-blue-600', 'from-purple-400 to-pink-600', 'from-green-400 to-emerald-600',
  'from-orange-400 to-red-600', 'from-yellow-400 to-amber-600', 'from-indigo-400 to-violet-600',
  'from-rose-400 to-fuchsia-600', 'from-teal-400 to-cyan-600',
];

function getColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const EMOJIS = ['😀','😂','😍','🤔','👍','👎','🔥','❤️','💯','🎮','🎉','😢','😎','🤝','💪','🚀','⭐','🏆','💎','🎯'];

export function GlobalChat({ user }: any) {
  const [activeServer, setActiveServer] = useState(SERVERS[0]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() => {
    const initial: Record<string, ChatMessage[]> = {};
    SERVERS.forEach(s => {
      initial[s.id] = [
        { id: 1, user: 'System', text: `Welcome to ${s.name}! Be respectful and have fun.`, timestamp: Date.now().toString() },
      ];
    });
    return initial;
  });
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [onlineUsers] = useState(['Admin', 'Player1', 'Gamer42', 'NightOwl']);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeServer.id]);

  const sendMessage = () => {
    if (!input.trim() || !user) return;
    const msg: ChatMessage = {
      id: Date.now(),
      user: user.username,
      text: input.trim(),
      timestamp: Date.now().toString(),
    };
    setMessages(prev => ({
      ...prev,
      [activeServer.id]: [...(prev[activeServer.id] || []), msg],
    }));
    setInput('');
    setShowEmoji(false);
  };

  const sendImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = () => {
      const msg: ChatMessage = {
        id: Date.now(),
        user: user.username,
        text: '',
        image: reader.result as string,
        timestamp: Date.now().toString(),
      };
      setMessages(prev => ({
        ...prev,
        [activeServer.id]: [...(prev[activeServer.id] || []), msg],
      }));
    };
    reader.readAsDataURL(file);
    setShowImageInput(false);
  };

  const formatTime = (ts: string) => {
    const d = new Date(parseInt(ts));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const serverMsgs = messages[activeServer.id] || [];

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Server list */}
      <div className="w-16 flex flex-col gap-2 items-center shrink-0">
        {SERVERS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveServer(s)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl transition-all ${
              activeServer.id === s.id
                ? `bg-gradient-to-br ${s.color} shadow-lg scale-110`
                : 'bg-mvo-panel hover:bg-mvo-panelHover hover:scale-105'
            }`}
            title={`${s.name} (${s.language})`}
          >
            {s.icon}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-mvo-border/30">
          <div className="flex items-center gap-2">
            <HashIcon className="w-5 h-5 text-mvo-textDim" />
            <span className="font-semibold text-mvo-text">{activeServer.name}</span>
            <span className="text-xs text-mvo-textDim bg-mvo-panel px-2 py-0.5 rounded">{activeServer.language}</span>
          </div>
          <div className="flex items-center gap-1 text-mvo-textDim text-xs">
            <UsersIcon className="w-4 h-4" />
            <span>{onlineUsers.length} online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {serverMsgs.map(msg => (
            <div key={msg.id} className="flex gap-3 group">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getColor(msg.user)} flex items-center justify-center shrink-0`}>
                <span className="text-white font-bold text-xs">{msg.user[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm text-mvo-text">{msg.user}</span>
                  <span className="text-xs text-mvo-textDim">{formatTime(msg.timestamp)}</span>
                </div>
                {msg.text && <p className="text-sm text-mvo-textDim mt-0.5 break-words">{msg.text}</p>}
                {msg.image && (
                  <img src={msg.image} alt="shared" className="mt-2 max-w-xs max-h-48 rounded-xl border border-mvo-border/30 object-cover" />
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-mvo-border/30">
          {showEmoji && (
            <div className="mb-2 flex flex-wrap gap-1 bg-mvo-panel/80 backdrop-blur-xl rounded-xl p-2 border border-mvo-border/30">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { setInput(i => i + e); setShowEmoji(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-mvo-panelHover rounded-lg text-lg transition-colors">
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={sendImage} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-colors" title="Share image">
              <ImageIcon className="w-5 h-5" />
            </button>
            <button onClick={() => setShowEmoji(!showEmoji)} className="p-2 rounded-xl text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover transition-colors" title="Emoji">
              <SmileIcon className="w-5 h-5" />
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={`Message #${activeServer.name}...`}
              className="flex-1 px-4 py-2.5 bg-mvo-panel border border-mvo-border/30 rounded-xl text-mvo-text placeholder-mvo-textDim text-sm focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
            <button onClick={sendMessage} disabled={!input.trim()} className="p-2.5 rounded-xl bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 transition-colors disabled:opacity-30">
              <SendIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Online users */}
      <div className="w-48 shrink-0 hidden lg:block">
        <GlassCard className="p-3">
          <h3 className="text-xs font-semibold uppercase text-mvo-textDim mb-2">Online — {onlineUsers.length}</h3>
          <div className="space-y-1.5">
            {onlineUsers.map(u => (
              <div key={u} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-mvo-panelHover transition-colors">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getColor(u)} flex items-center justify-center`}>
                  <span className="text-white font-bold text-[10px]">{u[0].toUpperCase()}</span>
                </div>
                <span className="text-sm text-mvo-text">{u}</span>
                <div className="w-2 h-2 rounded-full bg-green-400 ml-auto" />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
