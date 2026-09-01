import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identity, password);
      navigate('/inicio', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Credenciales inválidas.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <ThemeToggle fixed />
      <div className="login-card">
        <h1>Carossio Vairolatti</h1>
        <p>
          <span style={{ color: 'var(--brand-dark)', fontWeight: 600 }}>Sistema Integral</span> · Iniciá sesión para
          continuar.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Usuario o email</label>
            <input
              type="text"
              required
              autoComplete="username"
              style={{ width: '100%' }}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              style={{ width: '100%' }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
          {error && (
            <div className="hint" style={{ color: 'var(--err)', marginTop: 10 }}>
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
