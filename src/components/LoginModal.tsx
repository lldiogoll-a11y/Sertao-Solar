import { useState } from 'react';
import { Lock, LogIn, X } from 'lucide-react';
import { loginWithGoogle } from '../firebase.ts';

interface LoginModalProps {
  reason?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function LoginModal({ reason, onClose, onSuccess }: LoginModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onSuccess();
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Não foi possível concluir o login com Google.';
      if (msg.includes('popup-closed-by-user')) {
        setError('A janela de login foi fechada antes da conclusão.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-700" />
            <h2 id="login-modal-title" className="text-base font-semibold text-slate-900">
              Autenticação para Edição
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
            aria-label="Fechar login"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm">
          <p className="text-slate-600 leading-relaxed">
            {reason ||
              'Você está no modo somente leitura. Faça login com sua conta Google para cadastrar, editar, excluir, lançar consumos, importar PDFs ou confirmar pagamentos.'}
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-md px-3.5 py-2.5">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Conectando...' : 'Entrar com Google'}
          </button>

          <p className="text-xs text-slate-500 text-center">
            Visualização de relatórios e exportação de PDFs permanecem disponíveis sem alterar dados.
          </p>
        </div>
      </div>
    </div>
  );
}
