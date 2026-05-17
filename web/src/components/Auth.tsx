import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, AtSign, ArrowRight, Sparkles, LogIn, ChevronLeft } from 'lucide-react';

export const Auth = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        // Validation for registration
        if (!username.trim() || username.includes(' ')) throw new Error('Invalid username');
        if (!displayName.trim()) throw new Error('Public name is required');

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: username.trim().toLowerCase(),
              display_name: displayName.trim(),
            }
          }
        });
        if (error) throw error;
        setError('Check your email for the confirmation link!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card glass-card"
      >
        <div className="auth-header">
          <div className="auth-logo">Kapsely ✦</div>
          <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{mode === 'login' ? 'Sign in to your digital time capsule' : 'Join our community of time travelers'}</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="auth-error"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleAuth} className="auth-form">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {mode === 'register' && (
                <>
                  <div className="input-group">
                    <label>Public Name</label>
                    <div className="input-wrapper">
                      <User size={18} />
                      <input 
                        type="text" 
                        placeholder="Alex Smith" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required 
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Username</label>
                    <div className="input-wrapper">
                      <AtSign size={18} />
                      <input 
                        type="text" 
                        placeholder="alex_88" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
                        required 
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="input-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} />
                  <input 
                    type="email" 
                    placeholder="name@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <button type="submit" className="btn btn-primary btn-auth" disabled={loading}>
            {loading ? (
              <div className="spinner-sm"></div>
            ) : (
              <>
                {mode === 'login' ? 'Log In' : 'Sign Up'}
                {mode === 'login' ? <LogIn size={18} /> : <Sparkles size={18} />}
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {mode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
            <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create one' : 'Log in here'}
            </button>
          </p>
        </div>
      </motion.div>

      <style>{`
        .auth-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FDFBFF;
          position: relative;
          overflow: hidden;
          padding: 20px;
        }
        .auth-background {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
        }
        .orb-1 {
          width: 400px;
          height: 400px;
          background: rgba(124, 92, 191, 0.1);
          top: -100px;
          left: -100px;
        }
        .orb-2 {
          width: 300px;
          height: 300px;
          background: rgba(192, 96, 144, 0.08);
          bottom: -50px;
          right: -50px;
        }

        .auth-card {
          width: 100%;
          max-width: 440px;
          padding: 50px;
          position: relative;
          z-index: 1;
        }
        .auth-header { text-align: center; margin-bottom: 40px; }
        .auth-logo { font-size: 1.8rem; font-weight: 800; color: var(--primary); margin-bottom: 15px; }
        .auth-header h2 { font-size: 1.8rem; margin-bottom: 8px; }
        .auth-header p { color: var(--text-sec); font-size: 0.95rem; }

        .auth-form { display: flex; flex-direction: column; gap: 15px; }
        .input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 5px; }
        .input-group label { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; padding-left: 5px; }
        .input-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--surface-alt);
          border: 1.5px solid var(--border);
          border-radius: 16px;
          padding: 0 16px;
          height: 56px;
          transition: all 0.2s;
        }
        .input-wrapper:focus-within {
          border-color: var(--primary);
          background: white;
          box-shadow: 0 0 0 4px var(--primary-light);
        }
        .input-wrapper input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: inherit;
          font-size: 1rem;
          color: var(--text);
        }
        .input-wrapper svg { color: var(--text-muted); }
        .input-wrapper:focus-within svg { color: var(--primary); }

        .btn-auth { width: 100%; height: 56px; margin-top: 15px; font-size: 1rem; }
        .auth-error {
          background: #FFF0F1;
          border: 1px solid #FFD6D9;
          color: #E53E3E;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 25px;
          text-align: center;
        }

        .auth-footer { margin-top: 30px; text-align: center; }
        .auth-footer p { color: var(--text-sec); font-size: 0.95rem; }
        .auth-footer button {
          background: none;
          border: none;
          color: var(--primary);
          font-weight: 700;
          cursor: pointer;
          font-family: inherit;
          margin-left: 5px;
        }
        .auth-footer button:hover { text-decoration: underline; }

        .spinner-sm {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
