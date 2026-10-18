import { useEffect, useRef, useState } from 'react';

type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = [], options: { pollMs?: number } = {}) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true }));
    loaderRef
      .current()
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (alive) {
          setState((prev) => ({ data: prev.data, error: error instanceof Error ? error.message : '加载失败', loading: false }));
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  useEffect(() => {
    if (!options.pollMs) return;
    const timer = setInterval(() => setNonce((n) => n + 1), options.pollMs);
    return () => clearInterval(timer);
  }, [options.pollMs]);

  return {
    ...state,
    reload: () => setNonce((n) => n + 1),
    patch: (updater: (prev: T) => T) =>
      setState((prev) => (prev.data ? { ...prev, data: updater(prev.data) } : prev)),
  };
}

export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
