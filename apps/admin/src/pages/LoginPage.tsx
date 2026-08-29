import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';

export function LoginPage(): React.JSX.Element {
  const { login, isAuthenticated, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await login(email, password);
    } catch {
      // loginError already set by the context
    }
  }

  return (
    <div className="login-screen">
      <div className="login-screen__art">
        <div className="login-screen__art-brand">
          <div className="sidebar__brand-mark">
            <Icon name="route" size={18} />
          </div>
          VAYA <span>Admin</span>
        </div>
        <div className="login-screen__art-content">
          <h1 className="login-screen__art-title">Mobility operations, at a glance.</h1>
          <p className="login-screen__art-sub">
            Manage drivers, rides, verifications, and marketplace health from a single operations
            console built for the VAYA team.
          </p>
        </div>
      </div>
      <div className="login-screen__panel">
        <div className="login-card">
          <div className="login-card__brand">
            Operations <span>console</span>
          </div>
          <div className="login-card__sub">Sign in to manage the marketplace.</div>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {loginError ? <p className="field__error">{loginError}</p> : null}
            <button
              type="submit"
              className="btn btn--primary btn--lg"
              style={{ width: '100%' }}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
