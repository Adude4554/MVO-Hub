import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { UserIcon, MailIcon, LockIcon, Loader2, EyeIcon, EyeOffIcon } from 'lucide-react';

interface AuthScreenProps {
  onAuth: (user: { id: number; username: string; email: string }) => void;
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await invoke<string>('login', { email, password });
        const user = JSON.parse(result);
        await invoke('save_current_user', { userJson: result });
        onAuth(user);
      } else {
        if (!username.trim()) { setError('Username required'); setLoading(false); return; }
        const result = await invoke<string>('create_account', { username, email, password });
        const user = JSON.parse(result);
        await invoke('save_current_user', { userJson: result });
        onAuth(user);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-mvo-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mb-4">
            <span className="text-black font-display font-bold text-2xl">M</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-mvo-text">MVO Hub</h1>
          <p className="text-mvo-textDim mt-2">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mvo-textDim" />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-mvo-panel border border-mvo-border/50 rounded-xl text-mvo-text placeholder-mvo-textDim focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
            </div>
          )}

          <div className="relative">
            <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mvo-textDim" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-4 py-3 bg-mvo-panel border border-mvo-border/50 rounded-xl text-mvo-text placeholder-mvo-textDim focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
          </div>

          <div className="relative">
            <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mvo-textDim" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full pl-10 pr-10 py-3 bg-mvo-panel border border-mvo-border/50 rounded-xl text-mvo-text placeholder-mvo-textDim focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-mvo-textDim hover:text-mvo-text">
              {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center mt-6 text-mvo-textDim text-sm">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} className="text-cyan-400 hover:text-cyan-300 ml-1 font-medium">
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
