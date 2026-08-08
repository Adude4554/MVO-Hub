import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../components/Toast';

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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('llama3.1');
  const toast = useToast();

  const checkOllama = useCallback(async () => {
    try {
      const result = await invoke<{ running: boolean; models: string[] }>('get_ollama_models');
      setOllamaRunning(result.running);
      setOllamaModels(result.models);
      if (result.models.length > 0 && !result.models.includes(selectedModel)) {
        setSelectedModel(result.models[0]);
      }
    } catch {
      setOllamaRunning(false);
      setOllamaModels([]);
    }
  }, [selectedModel]);

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
      const newSession: ChatSession = { id, title: title || 'New Chat', model: selectedModel, createdAt: String(Date.now()), updatedAt: String(Date.now()) };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(id);
      setMessages([]);
      return id;
    } catch (e) {
      console.error('Failed to create session:', e);
      return null;
    }
  }, [selectedModel]);

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
    if (!ollamaRunning) {
      toast.error('Ollama is not running. Start it with: ollama serve');
      return;
    }

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
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        model: selectedModel,
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
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch') || msg.includes('Connect')) {
        friendly = 'Cannot connect to Ollama. Make sure it is running: ollama serve';
      } else if (msg.includes('model') && msg.includes('not found')) {
        friendly = `Model "${selectedModel}" not found. Pull it first: ollama pull ${selectedModel}`;
      } else if (msg.includes('429') || msg.includes('Too Many Requests')) {
        friendly = 'Ollama is busy. Please wait and try again.';
      } else if (msg.length > 200) {
        friendly = 'Request failed. Check that Ollama is running on localhost:11434.';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: friendly, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, ollamaRunning, selectedModel, activeSessionId, createSession, loadSessions, toast]);

  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    await loadMessages(id);
  }, [loadMessages]);

  useEffect(() => {
    checkOllama();
    loadSessions();
    const interval = setInterval(checkOllama, 10000);
    return () => clearInterval(interval);
  }, [checkOllama, loadSessions]);

  return {
    sessions, activeSessionId, messages, input, setInput,
    loading, selectedModel, setSelectedModel,
    ollamaRunning, ollamaModels,
    sendMessage, loadSessions,
    createSession, renameSession, deleteSession, selectSession,
    checkOllama,
  };
}
