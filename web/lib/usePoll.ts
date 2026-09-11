"use client";

// Shared polling hook. Every live view in this app is a contract read on an interval, and
// every one of them reports loading/error honestly instead of falling back to a default
// value — a page that cannot read the chain says so.

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_MS = 12_000;

export function usePoll<T>(fn: () => Promise<T>, deps: unknown[] = [], ms = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    try {
      const v = await fnRef.current();
      if (!alive.current) return;
      setData(v);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message.split("\n")[0] : "read failed");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    run();
    const t = setInterval(run, ms);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh: run };
}
