import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '../components/ui';
import { Send, Loader2, Brain, Plus, MessageSquare, Trash2, Edit3, Check, X, Settings } from 'lucide-react';
import { useAI } from '../hooks/useAI';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function AITools({ ai }: any) {
  useLocale();
  const {
    providers, sessions, activeSessionId, messages, input, setInput,
    loading, settings, setSettings, sendMessage, testConnection,
    createSession, renameSession, deleteSession, selectSession,
  } = useAI();
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    await sendMessage();
  };

  const handleNewChat = async () => {
    await createSession('New Chat');
  };

  const handleRename = async (id: string) => {
    if (editTitle.trim()) {
      await renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this chat?')) {
      await deleteSession(id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Sidebar - Sessions */}
      <div className="w-64 flex-shrink-0 flex flex-col glass rounded-xl overflow-hidden">
        <div className="p-3 border-b border-mvo-border/30">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && (
            <p className="text-xs text-mvo-textDim text-center py-4">No chats yet</p>
          )}
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => !editingId && selectSession(session.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? 'bg-cyan-400/10 text-cyan-400'
                  : 'text-mvo-textDim hover:bg-mvo-panelHover hover:text-mvo-text'
              }`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              {editingId === session.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRename(session.id)}
                    className="flex-1 bg-transparent border-b border-cyan-400/50 text-sm outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                  <button onClick={e => { e.stopPropagation(); handleRename(session.id); }} className="text-green-400 p-0.5"><Check className="w-3 h-3" /></button>
                  <button onClick={e => { e.stopPropagation(); setEditingId(null); }} className="text-red-400 p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{session.title}</span>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(session.id); setEditTitle(session.title); }}
                      className="text-mvo-textDim hover:text-mvo-text p-0.5"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(session.id); }}
                      className="text-mvo-textDim hover:text-red-400 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-mvo-border/30">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover rounded-xl text-sm transition-colors"
          >
            <Settings className="w-4 h-4" /> Settings
          </button>
        </div>
      </div>

      {/* Main - Chat */}
      <div className="flex-1 flex flex-col glass rounded-xl overflow-hidden">
        {showSettings ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h3 className="font-semibold text-lg">AI Provider Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-mvo-textDim mb-2">Provider</label>
                <select value={settings.provider} onChange={e => setSettings({...settings, provider: e.target.value})} className="w-full input">
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-mvo-textDim mb-2">Model</label>
                <input value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} className="w-full input" placeholder="gpt-4o-mini" />
                <p className="text-[10px] text-mvo-textDim mt-1">Free model: gpt-4o-mini</p>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-mvo-textDim mb-2">Base URL</label>
                <input value={settings.url} onChange={e => setSettings({...settings, url: e.target.value})} className="w-full input" placeholder="https://api.openai.com/v1" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-mvo-textDim mb-2">API Key</label>
                <input type="password" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} className="w-full input" placeholder="sk-..." />
              </div>
            </div>
            <button onClick={() => testConnection(settings.provider, settings.url, settings.apiKey, settings.model)} className="btn-primary" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
              Test Connection
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-mvo-textDim py-12">
                  <Brain className="w-16 h-16 mx-auto mb-4 text-mvo-border" />
                  <p className="font-medium text-lg">MVO AI Assistant</p>
                  <p className="text-sm mt-1">Ask me anything about gaming, streaming, or PC optimization</p>
                  <div className="grid grid-cols-2 gap-3 mt-6 max-w-lg mx-auto">
                    {['Optimize my PC for gaming', 'Best streaming settings', 'Explain GPU overclocking', 'Fix game crashes'].map((prompt, i) => (
                      <button key={i} onClick={() => setInput(prompt)} className="text-left p-3 glass rounded-xl hover:border-cyan-400/50 text-sm text-mvo-textDim hover:text-mvo-text transition-colors">{prompt}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-cyan-400/20 text-mvo-text' : 'bg-mvo-panelHover'}`}>
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-mvo-panelHover p-4 rounded-2xl">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-mvo-border/30">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask MVO AI..."
                  className="flex-1 input"
                  disabled={loading}
                />
                <button type="submit" disabled={!input.trim() || loading} className="btn-primary px-6">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[10px] text-mvo-textDim mt-2 text-center">
                Using {settings.model || 'gpt-4o-mini'} · API key stored locally
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
