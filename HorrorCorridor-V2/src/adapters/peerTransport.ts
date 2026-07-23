import Peer, { type DataConnection } from "peerjs";
import type {
  HorrorCorridorNetworkMessage,
  HorrorCorridorV2Mode,
  NetworkAdapter,
  SharedExpeditionSnapshot,
} from "../contracts";

type PeerTransportOptions = Readonly<{
  mode: Exclude<HorrorCorridorV2Mode, "solo">;
  roomCode: string;
  explorerId: string;
}>;

function hostPeerId(roomCode: string): string {
  return `horror-corridor-v2-${roomCode.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
}

function isNetworkMessage(value: unknown): value is HorrorCorridorNetworkMessage {
  return Boolean(value && typeof value === "object" && "schema" in value && "type" in value);
}

export function createPeerNetworkAdapter(options: PeerTransportOptions): NetworkAdapter {
  const messageListeners = new Set<(message: HorrorCorridorNetworkMessage) => void>();
  const statusListeners = new Set<(status: SharedExpeditionSnapshot["connection"], peerId?: string) => void>();
  const connections = new Map<string, DataConnection>();
  const hostId = hostPeerId(options.roomCode);
  const safeExplorerId = options.explorerId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "listener";
  const peerId = options.mode === "host"
    ? hostId
    : `${safeExplorerId}-${Math.random().toString(36).slice(2, 7)}`;
  const peer = new Peer(peerId, { debug: 1 });
  let disposed = false;

  const report = (status: SharedExpeditionSnapshot["connection"], remoteId?: string) => {
    for (const listener of statusListeners) listener(status, remoteId);
  };

  const attach = (connection: DataConnection) => {
    connections.set(connection.peer, connection);
    connection.on("open", () => report("connected", connection.peer));
    connection.on("data", (value) => {
      if (isNetworkMessage(value)) {
        for (const listener of messageListeners) listener(value);
      }
    });
    connection.on("close", () => {
      connections.delete(connection.peer);
      report("recovering", connection.peer);
    });
    connection.on("error", () => report("recovering", connection.peer));
  };

  const connectToHost = () => {
    if (disposed || options.mode !== "client") return;
    const existing = connections.get(hostId);
    if (existing?.open) return;
    report("connecting", hostId);
    // Binary channels chunk payloads above PeerJS's 16,300-byte data-channel MTU.
    // Authoritative snapshots legitimately exceed that once the Monster Index is populated.
    attach(peer.connect(hostId, { reliable: true, serialization: "binary" }));
  };

  peer.on("open", () => {
    if (options.mode === "client") connectToHost();
    else report("connecting");
  });
  peer.on("connection", attach);
  peer.on("disconnected", () => report("recovering"));
  peer.on("error", () => report("recovering"));

  return Object.freeze({
    publish(message) {
      for (const connection of connections.values()) {
        if (connection.open) connection.send(message);
      }
    },
    onMessage(listener) {
      messageListeners.add(listener);
      return () => messageListeners.delete(listener);
    },
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    async reconnect() {
      if (disposed) return;
      report("recovering");
      if (peer.disconnected) peer.reconnect();
      if (options.mode === "client") connectToHost();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const connection of connections.values()) connection.close();
      connections.clear();
      peer.destroy();
      messageListeners.clear();
      statusListeners.clear();
    },
  });
}
