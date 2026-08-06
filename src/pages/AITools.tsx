import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui';
import { Send, Loader2, Brain } from 'lucide-react';
import { useAI } from '../hooks/useAI';
import { useLocale } from '../hooks/useLocale';
import { t } from '../lib/i18n';

export function AITools({ ai }: any) {
  useLocale();
  const { providers, selectedProvider, setSelectedProvider, messages, input, setInput, loading, settings, setSettings, sendMessage, testConnection, loadProviders } = useAI();
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    await sendMessage();
  };

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-mvo-text">{t('ai.title')}</h1>
          <p className="text-mvo-textDim mt-1">{t('ai.subtitle')}</p>
        </div>
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="bg-mvo-panelHover/50 border-mvo-border/50 text-mvo-text text-sm px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/50 appearance-none cursor-pointer">
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setActiveTab('chat')} className={`px-4 py-2 rounded-xl text-sm font-medium ${activeTab === 'chat' ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30' : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'}`}>{t('ai.chatTab')}</button>
        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-xl text-sm font-medium ${activeTab === 'settings' ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/30' : 'text-mvo-textDim hover:text-mvo-text hover:bg-mvo-panelHover'}`}>{t('settings.title')}</button>
      </div>

      {activeTab === 'chat' && (
        <div className="glass flex flex-col h-[calc(100vh-300px)] min-h-[400px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={el => el?.scrollTo(0, el.scrollHeight)}>
            {messages.length === 0 && (
              <div className="text-center text-mvo-textDim py-8">
                <Brain className="w-12 h-12 mx-auto mb-4 text-mvo-border" />
                <p className="font-medium">{t('ai.welcome')}</p>
                <p className="text-sm mt-1">{t('ai.welcomeDesc')}</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-cyan-400/20 text-mvo-text' : 'bg-mvo-panelHover'}`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={async (e) => { e.preventDefault(); await sendMessage(); }} className="p-4 border-t border-mvo-border/30">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={t('ai.chatPlaceholder')}
                className="flex-1 input"
                disabled={loading}
              />
              <button type="submit" disabled={!input.trim() || loading} className="btn-primary px-6">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4">{t('ai.providerSettings')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-mvo-textDim mb-2">Provider</label>
                <select value={settings.provider} onChange={e => setSettings({...settings, provider: e.target.value})} className="w-full input">
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-mvo-textDim mb-2">Model</label>
                <input value={settings.model} onChange={e => setSettings({...settings, model: e.target.value})} className="w-full input" placeholder="llama3.1" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-mvo-textDim mb-2">Base URL</label>
                <input value={settings.url} onChange={e => setSettings({...settings, url: e.target.value})} className="w-full input" placeholder="http://localhost:11434" />
              </div>
              {settings.provider !== 'ollama' && (
                <div className="md:col-span-2">
                  <label className="block text-sm text-mvo-textDim mb-2">API Key</label>
                  <input type="password" value={settings.apiKey} onChange={e => setSettings({...settings, apiKey: e.target.value})} className="w-full input" placeholder="Enter API key" />
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">{t('ai.connectionTest')}</h3>
            <div className="flex gap-3">
              <button onClick={() => testConnection(settings.provider, settings.url, settings.apiKey, settings.model)} className="btn-primary" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : t('ai.testConnection')}
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="font-semibold mb-4">{t('ai.quickPrompts')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[t('ai.promptOptimize'), t('ai.promptExplain'), t('ai.promptBestSettings'), t('ai.promptStreaming'), t('ai.promptCrashLog'), t('ai.promptProfile')].map((p, i) => (
                <button key={i} onClick={() => { setInput(p); setActiveTab('chat'); }} className="text-left p-3 glass rounded-xl hover:border-cyan-400/50 transition-colors text-sm text-mvo-textDim hover:text-mvo-text">{p}</button>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}