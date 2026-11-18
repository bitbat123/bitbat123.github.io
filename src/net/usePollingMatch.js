import { useEffect, useRef, useState, useCallback } from 'react';
import { callAuth } from '../cloud.js';

const POLL_MS = 1200;

/**
 * 轮询式联机 hook（替代原 WebSocket 版本）。
 * 服务端把对局存进数据库，这里定时拉取；推进回合用乐观锁（expectedTurns）。
 */
export function usePollingMatch(game) {
  const [code, setCode] = useState(null);
  const [match, setMatch] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      const r = await callAuth('matchState', { code });
      if (r.ok) { setMatch(r.match); setMe(r.me); setError(null); }
      else setError(r.message);
    } catch (e) { setError(e.message); }
  }, [code]);

  // 轮询
  useEffect(() => {
    if (!code) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [code, refresh]);

  const create = useCallback(async (roomCode, seed, mapOrder) => {
    setBusy(true);
    setError(null);
    try {
      const r = await callAuth('matchCreate', { code: roomCode, game, seed, mapOrder });
      if (!r.ok) { setError(r.message); return null; }
      setCode(r.match.code);
      setMatch(r.match);
      return r.match;
    } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }, [game]);

  const join = useCallback(async (roomCode) => {
    setBusy(true);
    setError(null);
    try {
      const r = await callAuth('matchJoin', { code: roomCode });
      if (!r.ok) { setError(r.message); return null; }
      setCode(r.match.code);
      setMatch(r.match);
      return r.match;
    } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }, []);

  const submitCode = useCallback(async (src) => {
    if (!code) return;
    try {
      const r = await callAuth('matchCode', { code, src });
      if (r.ok) setMatch(r.match); else setError(r.message);
    } catch (e) { setError(e.message); }
  }, [code]);

  const setReady = useCallback(async (ready = true) => {
    if (!code) return;
    try {
      const r = await callAuth('matchReady', { code, ready });
      if (r.ok) setMatch(r.match); else setError(r.message);
    } catch (e) { setError(e.message); }
  }, [code]);

  /** 推进回合：只有拿到锁的一方才真正推进，另一方会用返回的最新状态 */
  const advance = useCallback(async (delta = 1) => {
    if (!code || !match) return null;
    try {
      const r = await callAuth('matchAdvance', { code, turns: match.turns, delta });
      if (r.ok) { setMatch(r.match); return r; }
      setError(r.message);
      return null;
    } catch (e) { setError(e.message); return null; }
  }, [code, match]);

  const finish = useCallback(async (result) => {
    if (!code) return;
    try {
      const r = await callAuth('matchFinish', { code, result });
      if (r.ok) setMatch(r.match);
    } catch { /* 忽略 */ }
  }, [code]);

  const leave = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCode(null);
    setMatch(null);
  }, []);

  return { code, match, me, error, busy, create, join, submitCode, setReady, advance, finish, leave, refresh };
}
