import { Peer } from "peerjs";
import type { PeerOptions } from "peerjs";

import {
  serializeProtocolMessage,
  deserializeProtocolMessage,
} from "@/features/networking/protocol/serializers";
import type { ProtocolMessage } from "@/features/networking/protocol/messageTypes";

import {
  createPeerEventBus,
  type PeerEventBus,
} from "./peerEvents";
import type {
  HostCreateOptions,
  HostTransportAdapter,
  PeerConnection,
  PeerConnectionRecord,
  PeerInstance,
  PeerTransportStatus,
  ProtocolCodec,
} from "./peerTypes";

const defaultCodec: ProtocolCodec = {
  serialize: serializeProtocolMessage,
  deserialize: deserializeProtocolMessage,
};

const now = () => Date.now();

const createConnectionRecord = (connection: PeerConnection): PeerConnectionRecord => ({
  remotePeerId: connection.peer,
  connectionId: connection.connectionId,
  label: connection.label ?? "",
  open: connection.open,
});

const setConnectionRecord = (
  connections: Map<string, PeerConnection>,
  connection: PeerConnection,
): void => {
  connections.set(connection.connectionId, connection);
};

const removeConnectionRecord = (
  connections: Map<string, PeerConnection>,
  connectionId: string,
): void => {
  connections.delete(connectionId);
};

const buildTransportStatus = (
  role: "host",
  roomId: string,
  peerId: string | null,
  status: PeerTransportStatus,
  detail?: string,
) => ({
  type: "peer/status" as const,
  role,
  roomId,
  peerId,
  status,
  timestampMs: now(),
  detail,
});

const createPeerInstance = (
  peerId: string | null | undefined,
  peerOptions?: PeerOptions,
): PeerInstance => {
  if (peerId && peerOptions) {
    return new Peer(peerId, peerOptions);
  }

  if (peerId) {
    return new Peer(peerId);
  }

  if (peerOptions) {
    return new Peer(peerOptions);
  }

  return new Peer();
};

const resolvePeerId = (currentPeerId: string | null, fallbackPeerId: string): string =>
  currentPeerId ?? fallbackPeerId ?? "unknown-peer";

export const createHost = (options: HostCreateOptions): HostTransportAdapter => {
  const codec = options.codec ?? defaultCodec;
  const eventBus: PeerEventBus = createPeerEventBus(options.onEvent ? [options.onEvent] : []);
  const peerId = options.peerId ?? options.joinCode;
  const peer: PeerInstance = createPeerInstance(peerId, options.peerOptions);
  const roomId = options.roomId;
  const joinCode = options.joinCode;
  const connections = new Map<string, PeerConnection>();

  let currentStatus: PeerTransportStatus = "opening";
  let currentPeerId: string | null = peer.id ?? peerId ?? null;

  const updateStatus = (status: PeerTransportStatus, detail?: string): void => {
    currentStatus = status;
    eventBus.emit(buildTransportStatus("host", roomId, currentPeerId, status, detail));
  };

  const sendMessage = (connection: PeerConnection, message: ProtocolMessage): boolean => {
    if (!connection.open) {
      return false;
    }

    connection.send(codec.serialize(message));
    return true;
  };

  peer.on("open", (id) => {
    currentPeerId = id;
    updateStatus("connected");
    eventBus.emit({
      type: "peer/open",
      role: "host",
      roomId,
      peerId: id,
      timestampMs: now(),
    });
  });

  peer.on("connection", (connection) => {
    setConnectionRecord(connections, connection);

    connection.on("open", () => {
      eventBus.emit({
        type: "peer/connection-open",
        role: "host",
        roomId,
        peerId: resolvePeerId(currentPeerId, peerId),
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        timestampMs: now(),
      });
    });

    connection.on("data", (data) => {
      const message = codec.deserialize(data);
      if (!message) {
        return;
      }

      eventBus.emit({
        type: "peer/message",
        role: "host",
        roomId,
        peerId: currentPeerId,
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        message,
        timestampMs: now(),
      });
    });

    connection.on("close", () => {
      removeConnectionRecord(connections, connection.connectionId);
      eventBus.emit({
        type: "peer/connection-close",
        role: "host",
        roomId,
        peerId: resolvePeerId(currentPeerId, peerId),
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        timestampMs: now(),
      });
    });

    connection.on("error", (error) => {
      eventBus.emit({
        type: "peer/error",
        role: "host",
        roomId,
        peerId: currentPeerId,
        message: error?.message ?? "Peer connection error",
        timestampMs: now(),
        error,
      });
    });
  });

  peer.on("disconnected", () => {
    updateStatus("reconnecting", "disconnected from signalling server");
  });

  peer.on("close", () => {
    currentStatus = "closed";
    eventBus.emit({
      type: "peer/status",
      role: "host",
      roomId,
      peerId: currentPeerId,
      status: "closed",
      timestampMs: now(),
    });
  });

  peer.on("error", (error) => {
    currentStatus = "error";
    eventBus.emit({
      type: "peer/error",
      role: "host",
      roomId,
      peerId: currentPeerId,
      message: error?.message ?? "Peer error",
      timestampMs: now(),
      error,
    });
  });

  eventBus.emit(buildTransportStatus("host", roomId, currentPeerId, currentStatus, "host transport created"));

  return {
    role: "host",
    roomId,
    joinCode,
    get peerId() {
      return currentPeerId;
    },
    get status() {
      return currentStatus;
    },
    get connections() {
      return Array.from(connections.values(), createConnectionRecord);
    },
    onEvent: (listener) => {
      return eventBus.subscribe(listener);
    },
    destroy: () => {
      currentStatus = "closed";
      connections.clear();
      peer.destroy();
      eventBus.clear();
    },
    broadcast: (message) => {
      let sent = 0;

      for (const connection of connections.values()) {
        if (sendMessage(connection, message)) {
          sent += 1;
        }
      }

      return sent;
    },
    sendTo: (remotePeerId, message) => {
      for (const connection of connections.values()) {
        if (connection.peer === remotePeerId) {
          return sendMessage(connection, message);
        }
      }

      return false;
    },
    disconnectPeer: (remotePeerId) => {
      for (const connection of connections.values()) {
        if (connection.peer === remotePeerId) {
          connection.close();
          return true;
        }
      }

      return false;
    },
  };
};
