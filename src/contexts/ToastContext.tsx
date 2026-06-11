import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { TOAST_DURATION } from '../constants';
import Toast from '../components/Toast';

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (
    type: ToastType,
    message: string,
    duration?: number,
    action?: ToastAction,
  ) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// TODO: split into Provider/hook files to enable Fast Refresh fully
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timeoutId = timeoutMapRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutMapRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (
      type: ToastType,
      message: string,
      duration = TOAST_DURATION,
      action?: ToastAction,
    ) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setToasts((prev) => [...prev, { id, type, message, action }]);

      const timeoutId = setTimeout(() => {
        removeToast(id);
      }, duration);

      timeoutMapRef.current.set(id, timeoutId);
    },
    [removeToast],
  );

  useEffect(() => {
    const map = timeoutMapRef.current;
    return () => {
      map.forEach((timeoutId) => clearTimeout(timeoutId));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: removeToast }}>
      {children}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}
