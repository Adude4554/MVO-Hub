import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export function useAI() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('ollama');
  const [input, setInput] = useState('');
  const [settings, setSettings] = useState({ provider: 'ollama', model: 'llama3.1', url: 'http://localhost:11434', apiKey: '' });

  const loadProviders = useCallback(async () => {
    try {
      const data = await invoke<AiProvider[]>('get_ai_providers');
      setProviders(data);
    } catch (e) {
      console.error('AI providers load failed:', e);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = { role: 'user' as const, content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    try {
      const response = await invoke<string>('ask_ai', {
        provider: settings.provider,
        baseUrl: settings.url || 'http://localhost:11434',
        apiKey: settings.apiKey || '',
        model: settings.model,
        prompt: currentInput,
        context: '',
      });
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }]);
      return response;
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message || e}`, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, settings]);

  const testConnection = useCallback(async (provider: string, url: string, apiKey: string, model: string) => {
    return invoke('test_ai_api_connection', { provider, baseUrl: url, apiKey, model });
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  return { providers, selectedProvider, setSelectedProvider, messages, input, setInput, loading, settings, setSettings, sendMessage, testConnection, loadProviders };
}
