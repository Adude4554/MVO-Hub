import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../components/Toast';

export interface AiProvider {
  id: string;
  name: string;
  description: string;
  requires_api_key: boolean;
  default_url?: string;
  default_models: string[];
}

export interface AiMessage {
  role: string;
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export function useAI() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState({ provider: 'openai', model: 'gpt-4o-mini', url: 'https://api.openai.com/v1', apiKey: '' });
  const toast = useToast();

  const loadProviders = useCallback(async () => {
    try {
      const data = await invoke<AiProvider[]>('get_ai_providers');
      setProviders(data);
    } catch (e) {
      console.error('AI providers load failed:', e);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await invoke<ChatSession[]>('chat_get_sessions');
      setSessions(data);
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await invoke<any[]>('chat_get_messages', { sessionId });
      setMessages(data.map(m => ({ role: m.role, content: m.content, timestamp: parseInt(m.createdAt) || Date.now() })));
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  }, []);

  const createSession = useCallback(async (title?: string) => {
    try {
      const id = await invoke<string>('chat_create_session', { title: title || 'New Chat' });
      const newSession: ChatSession = { id, title: title || 'New Chat', model: 'gpt-4o-mini', createdAt: String(Date.now()), updatedAt: String(Date.now()) };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(id);
      setMessages([]);
      return id;
    } catch (e) {
      console.error('Failed to create session:', e);
      return null;
    }
  }, []);

  const renameSession = useCallback(async (id: string, title: string) => {
    try {
      await invoke('chat_rename_session', { id, title });
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    } catch (e) {
      console.error('Failed to rename session:', e);
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await invoke('chat_delete_session', { id });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      toast.success('Chat deleted');
    } catch (e) {
      console.error('Failed to delete session:', e);
      toast.error('Failed to delete chat');
    }
  }, [activeSessionId]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const newId = await createSession(input.slice(0, 50));
      if (!newId) return;
      sessionId = newId;
    }

    const userMessage = { role: 'user' as const, content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      await invoke('chat_add_message', { sessionId, role: 'user', content: currentInput });

      const response = await invoke<string>('ask_ai', {
        provider: settings.provider,
        baseUrl: settings.url || 'https://api.openai.com/v1',
        apiKey: settings.apiKey || '',
        model: settings.model,
        prompt: currentInput,
        context: '',
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
      await invoke('chat_add_message', { sessionId, role: 'assistant', content: response });
      await loadSessions();
      return response;
    } catch (e: any) {
      const msg = String(e.message || e);
      let friendly = 'Something went wrong. Please try again.';
      if (msg.includes('credit_balance_exhausted') || msg.includes('insufficient_quota')) {
        friendly = 'Your API key has no credits remaining. Please add credits at platform.openai.com/settings/billing or switch to Ollama for free local AI.';
      } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key')) {
        friendly = 'Invalid API key. Please check your key in Settings and try again.';
      } else if (msg.includes('429') || msg.includes('Too Many Requests')) {
        friendly = 'Too many requests. Please wait a moment and try again.';
      } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
        friendly = 'Cannot reach the AI server. Check your Base URL in Settings.';
      } else if (msg.length > 200) {
        friendly = 'Request failed. Check your API key and settings.';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: friendly, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, settings, activeSessionId, createSession, loadSessions]);

  const testConnection = useCallback(async (provider: string, url: string, apiKey: string, model: string) => {
    return invoke('test_ai_api_connection', { provider, baseUrl: url, apiKey, model });
  }, []);

  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    await loadMessages(id);
  }, [loadMessages]);

  useEffect(() => { loadProviders(); loadSessions(); }, [loadProviders, loadSessions]);

  return {
    providers, sessions, activeSessionId, messages, input, setInput,
    loading, settings, setSettings, selectedProvider, setSelectedProvider,
    sendMessage, testConnection, loadProviders, loadSessions,
    createSession, renameSession, deleteSession, selectSession,
  };
}
