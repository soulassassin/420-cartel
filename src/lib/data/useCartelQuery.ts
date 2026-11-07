'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeToData } from './source';

export interface CartelQueryResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Minimal async read hook for the client data source.
 *
 * Re-runs when `deps` change and whenever the data source announces a write,
 * so a POS sale is reflected in the inventory grid and the shop stock gauges
 * without a reload. Results arriving after unmount or after a newer run are
 * discarded, so a slow first request can never overwrite a fresh second one.
 */
export function useCartelQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): CartelQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const runIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setLoading(true);

    loaderRef
      .current()
      .then((result) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        setError(caught instanceof Error ? caught.message : 'Could not load that data.');
      })
      .finally(() => {
        if (!mountedRef.current || runIdRef.current !== runId) return;
        setLoading(false);
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, [run, ...deps]);

  useEffect(() => subscribeToData(run), [run]);

  return { data, error, loading, refresh: run };
}
