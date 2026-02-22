/**
 * Desktop Share — WebRTC Signaling Server
 *
 * Implements room-based WebRTC signaling using SSE (server → client)
 * and POST (client → server) so two peers can establish a peer-to-peer
 * screen-sharing connection through the existing HTTP server — no extra
 * dependencies required.
 *
 * ── Flow ──────────────────────────────────────────────────────────────
 *
 *   1. Host opens /desktop, clicks "Share Screen"
 *   2. Host's browser calls getDisplayMedia(), creates RTCPeerConnection
 *   3. Host sends SDP offer → POST /v1/desktop/signal
 *   4. Viewer opens same /desktop?room=<id>
 *   5. Viewer receives offer via SSE GET /v1/desktop/signal/stream
 *   6. Viewer sends SDP answer → POST /v1/desktop/signal
 *   7. Both exchange ICE candidates the same way
 *   8. WebRTC data flows peer-to-peer (video + optional audio + data channel)
 *
 * ── Config (env vars) ─────────────────────────────────────────────────
 *
 *   DESKTOP_SHARE_ENABLED  — "true" to enable (default: "true")
 *   DESKTOP_ICE_SERVERS    — JSON array of STUN/TURN servers
 *                            (default: Google's public STUN)
 */

import { IncomingMessage, ServerResponse } from "node:http";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface Peer {
  id: string;
  name: string;
  role: "host" | "viewer";
  roomId: string;
  joinedAt: string;
  /** SSE response object for pushing signals */
  sseRes?: ServerResponse;
}

export interface Room {
  id: string;
  name: string;
  createdAt: string;
  hostId?: string;
  peers: Map<string, Peer>;
  /** Chat messages */
  chat: ChatMessage[];
}

export interface SignalMessage {
  from: string;
  to?: string;        // undefined = broadcast to room
  roomId: string;
  type: "offer" | "answer" | "ice-candidate" | "chat" | "cursor" | "control" | "ping";
  payload: unknown;
  timestamp: string;
}

export interface ChatMessage {
  from: string;
  fromName: string;
  text: string;
  timestamp: string;
}

// ────────────────────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────────────────────

const _rooms = new Map<string, Room>();
const _enabled =
  (process.env.DESKTOP_SHARE_ENABLED || "true").toLowerCase() !== "false";

// Default ICE servers (Google public STUN — works for most LAN setups)
let _iceServers: object[] = [{ urls: "stun:stun.l.google.com:19302" }];
try {
  const envIce = process.env.DESKTOP_ICE_SERVERS;
  if (envIce) _iceServers = JSON.parse(envIce);
} catch { /* keep default */ }

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Generate a short room/peer ID. */
function makeId(prefix: string, len = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = prefix;
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function getOrCreateRoom(roomId?: string, name?: string): Room {
  if (roomId && _rooms.has(roomId)) return _rooms.get(roomId)!;
  const id = roomId || makeId("room-");
  const room: Room = {
    id,
    name: name || `Desktop Session ${_rooms.size + 1}`,
    createdAt: new Date().toISOString(),
    peers: new Map(),
    chat: [],
  };
  _rooms.set(id, room);
  console.log(`🖥️  Desktop share room created: ${id}`);
  return room;
}

/** Send an SSE event to a specific peer. */
function sendSSE(peer: Peer, event: string, data: unknown): void {
  if (!peer.sseRes || peer.sseRes.writableEnded) return;
  peer.sseRes.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Broadcast an SSE event to all peers in a room (optionally excluding one). */
function broadcastSSE(room: Room, event: string, data: unknown, excludePeerId?: string): void {
  for (const [id, peer] of room.peers) {
    if (id !== excludePeerId) sendSSE(peer, event, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export function isDesktopShareEnabled(): boolean {
  return _enabled;
}

export function getIceServers(): object[] {
  return _iceServers;
}

export function listRooms(): Room[] {
  return Array.from(_rooms.values());
}

export function getRoom(roomId: string): Room | undefined {
  return _rooms.get(roomId);
}

export function deleteRoom(roomId: string): boolean {
  const room = _rooms.get(roomId);
  if (!room) return false;
  // Close all SSE connections
  for (const peer of room.peers.values()) {
    if (peer.sseRes && !peer.sseRes.writableEnded) {
      peer.sseRes.end();
    }
  }
  _rooms.delete(roomId);
  console.log(`🗑️  Desktop share room deleted: ${roomId}`);
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP Handlers (called from server.ts)
// ────────────────────────────────────────────────────────────────────────────

/** POST /v1/desktop/rooms — create or join a room */
export function handleJoinRoom(body: {
  roomId?: string;
  roomName?: string;
  peerId?: string;
  peerName?: string;
  role?: "host" | "viewer";
}): { room: { id: string; name: string; createdAt: string }; peer: { id: string; name: string; role: string }; iceServers: object[] } {
  const room = getOrCreateRoom(body.roomId, body.roomName);
  const peerId = body.peerId || makeId("peer-");
  const role = body.role || (room.hostId ? "viewer" : "host");

  const peer: Peer = {
    id: peerId,
    name: body.peerName || (role === "host" ? "Host" : `Viewer ${room.peers.size}`),
    role: role as "host" | "viewer",
    roomId: room.id,
    joinedAt: new Date().toISOString(),
  };

  room.peers.set(peerId, peer);
  if (role === "host") room.hostId = peerId;

  // Notify existing peers
  broadcastSSE(room, "peer-joined", {
    peerId: peer.id,
    peerName: peer.name,
    role: peer.role,
  }, peerId);

  console.log(`🖥️  [${room.id}] ${peer.name} joined as ${role}`);

  return {
    room: { id: room.id, name: room.name, createdAt: room.createdAt },
    peer: { id: peer.id, name: peer.name, role: peer.role },
    iceServers: _iceServers,
  };
}

/** GET /v1/desktop/signal/stream?room=X&peer=Y — SSE stream */
export function handleSignalStream(
  req: IncomingMessage,
  res: ServerResponse,
  roomId: string,
  peerId: string,
): void {
  const room = _rooms.get(roomId);
  if (!room) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Room not found" }));
    return;
  }

  const peer = room.peers.get(peerId);
  if (!peer) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Peer not found in room" }));
    return;
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });

  // Store the response so we can push signals to this peer
  peer.sseRes = res;

  // Send initial "connected" event
  sendSSE(peer, "connected", {
    peerId: peer.id,
    roomId: room.id,
    peers: Array.from(room.peers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
    })),
  });

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(": heartbeat\n\n");
  }, 15000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    peer.sseRes = undefined;
    room.peers.delete(peerId);
    if (room.hostId === peerId) room.hostId = undefined;

    broadcastSSE(room, "peer-left", { peerId, peerName: peer.name });
    console.log(`🖥️  [${room.id}] ${peer.name} disconnected`);

    // Auto-cleanup empty rooms
    if (room.peers.size === 0) {
      _rooms.delete(room.id);
      console.log(`🗑️  Room ${room.id} auto-deleted (empty)`);
    }
  });
}

/** POST /v1/desktop/signal — relay a WebRTC signal to peer(s) */
export function handleSignal(signal: SignalMessage): { relayed: boolean; recipients: number } {
  const room = _rooms.get(signal.roomId);
  if (!room) return { relayed: false, recipients: 0 };

  let recipients = 0;
  const data = {
    from: signal.from,
    type: signal.type,
    payload: signal.payload,
    timestamp: signal.timestamp || new Date().toISOString(),
  };

  if (signal.to) {
    // Targeted signal
    const target = room.peers.get(signal.to);
    if (target) {
      sendSSE(target, "signal", data);
      recipients = 1;
    }
  } else {
    // Broadcast to all except sender
    for (const [id, peer] of room.peers) {
      if (id !== signal.from) {
        sendSSE(peer, "signal", data);
        recipients++;
      }
    }
  }

  return { relayed: true, recipients };
}

/** POST /v1/desktop/chat — send chat message */
export function handleChat(roomId: string, from: string, text: string): ChatMessage | null {
  const room = _rooms.get(roomId);
  if (!room) return null;

  const peer = room.peers.get(from);
  const msg: ChatMessage = {
    from,
    fromName: peer?.name || from,
    text,
    timestamp: new Date().toISOString(),
  };

  room.chat.push(msg);
  broadcastSSE(room, "chat", msg);
  return msg;
}

/** GET /v1/desktop/rooms — list active rooms */
export function getRoomList(): Array<{
  id: string;
  name: string;
  createdAt: string;
  peerCount: number;
  hasHost: boolean;
}> {
  return Array.from(_rooms.values()).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    peerCount: r.peers.size,
    hasHost: !!r.hostId,
  }));
}
