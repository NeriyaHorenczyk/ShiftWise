import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SocketContext } from './SocketContext';
import useAuth from '../hooks/useAuth';

// Same host the REST API talks to (see services/api.js) — Socket.IO shares
// the same Express/http.Server instance on the backend (see server.js).
const SOCKET_URL = 'http://localhost:3000';

// Owns the single WebSocket connection lifecycle for the whole app: opens
// it once there's a logged-in session, tears it down on logout, and lets
// socket.io-client's built-in reconnection logic handle transient drops.
// `socket` is kept in state (not a ref) so consumers whose own effects
// depend on it re-run once the connection actually exists, instead of
// silently subscribing to a stale `null`.
export const SocketProvider = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // No session — nothing to connect. `socket`/`connected` start at their
    // reset values on first mount, and the previous effect's cleanup below
    // already resets them on logout, so there's nothing to do here.
    if (!token) return;

    const instance = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    // Real-time features are a layer on top of an app that already works
    // fully over plain HTTP — a connection failure (bad token, server
    // restarting, network blip) is logged and left to auto-reconnect,
    // never surfaced as a blocking error to the user.
    instance.on('connect_error', (err) => {
      console.warn('[socket] connection error:', err.message);
      setConnected(false);
    });

    // Storing the connection instance itself in state (so consumers re-run
    // their own effects once it exists) is exactly the "ref to an external
    // system" case React's docs call out as a valid exception to this rule
    // (https://react.dev/learn/you-might-not-need-an-effect) — there's no
    // event to hang this off of, since the instance itself is what's created.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
