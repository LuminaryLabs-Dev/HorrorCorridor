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
  type PeerTransportEventListener,
} from "./peerEvents";
import type {
  ClientCreateOptions,
  ClientTransportAdapter,
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

const createPeerInstance = (
  peerId: ClientCreateOptions["peerId"],
  peerOptions: PeerOptions | undefined,
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

const resolvePeerId = (currentPeerId: string | null, fallbackPeerId: string | null): string =>
  currentPeerId ?? fallbackPeerId ?? "unknown-peer";

type LocalBridgePacket = Readonly<
  | {
      kind: "client-connect";
      remotePeerId: string;
      connectionId: string;
      message?: never;
      targetPeerId?: never;
    }
  | {
      kind: "client-disconnect";
      remotePeerId: string;
      connectionId: string;
      message?: never;
      targetPeerId?: never;
    }
  | {
      kind: "client-message";
      remotePeerId: string;
      connectionId: string;
      message: ProtocolMessage;
      targetPeerId?: never;
    }
  | {
      kind: "host-message";
      remotePeerId: string;
      connectionId: string;
      message: ProtocolMessage;
      targetPeerId: string | null;
    }
>;

export const createClient = (options: ClientCreateOptions): ClientTransportAdapter => {
  const codec = options.codec ?? defaultCodec;
  const eventBus: PeerEventBus = createPeerEventBus(options.onEvent ? [options.onEvent] : []);
  const peer: PeerInstance = createPeerInstance(options.peerId, options.peerOptions);
  const initialHostPeerId = options.hostPeerId ?? null;
  const localBridge =
    typeof BroadcastChannel !== "undefined" && initialHostPeerId
      ? new BroadcastChannel(`horrorcorridor:${initialHostPeerId}`)
      : null;

  let currentStatus: PeerTransportStatus = "opening";
  let currentPeerId: string | null = peer.id ?? options.peerId ?? null;
  let currentHostPeerId: string | null = initialHostPeerId;
  let activeConnection: PeerConnection | null = null;
  let localConnectionRecord: PeerConnectionRecord | null = null;

  const emitStatus = (detail?: string): void => {
    eventBus.emit({
      type: "peer/status",
      role: "client",
      roomId: options.roomId ?? null,
      peerId: currentPeerId,
      status: currentStatus,
      timestampMs: now(),
      detail,
    });
  };

  const setConnection = (connection: PeerConnection | null): void => {
    activeConnection = connection;
  };

  if (localBridge) {
    localBridge.onmessage = (event: MessageEvent<LocalBridgePacket>) => {
      const packet = event.data;

      if (!packet) {
        return;
      }

      if (packet.kind === "host-message") {
        if (packet.targetPeerId && packet.targetPeerId !== currentPeerId) {
          return;
        }

        eventBus.emit({
          type: "peer/message",
          role: "client",
          roomId: options.roomId ?? null,
          peerId: currentPeerId,
          remotePeerId: packet.remotePeerId,
          connectionId: packet.connectionId,
          message: packet.message,
          timestampMs: now(),
        });
        return;
      }

      if (packet.kind === "client-disconnect" && localConnectionRecord?.connectionId === packet.connectionId) {
        localConnectionRecord = null;
        currentStatus = "closed";
        eventBus.emit({
          type: "peer/connection-close",
          role: "client",
          roomId: options.roomId ?? null,
          peerId: resolvePeerId(currentPeerId, options.peerId ?? null),
          remotePeerId: packet.remotePeerId,
          connectionId: packet.connectionId,
          timestampMs: now(),
        });
        emitStatus("client disconnected");
      }
    };
  }

  const hookConnection = (connection: PeerConnection): void => {
    setConnection(connection);
    let connectionOpenEmitted = false;

    const emitConnectionOpen = (): void => {
      if (connectionOpenEmitted) {
        return;
      }

      connectionOpenEmitted = true;
      currentStatus = "connected";
      eventBus.emit({
        type: "peer/connection-open",
        role: "client",
        roomId: options.roomId ?? null,
        peerId: resolvePeerId(currentPeerId, options.peerId ?? null),
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        timestampMs: now(),
      });
      emitStatus();
    };

    connection.on("open", () => {
      emitConnectionOpen();
    });

    if (connection.open) {
      emitConnectionOpen();
    }

    connection.on("data", (data) => {
      const message = codec.deserialize(data);
      if (!message) {
        return;
      }

      eventBus.emit({
        type: "peer/message",
        role: "client",
        roomId: options.roomId ?? null,
        peerId: currentPeerId,
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        message,
        timestampMs: now(),
      });
    });

    connection.on("close", () => {
      if (activeConnection?.connectionId === connection.connectionId) {
        setConnection(null);
      }

      currentStatus = "closed";
      eventBus.emit({
        type: "peer/connection-close",
        role: "client",
        roomId: options.roomId ?? null,
        peerId: resolvePeerId(currentPeerId, options.peerId ?? null),
        remotePeerId: connection.peer,
        connectionId: connection.connectionId,
        timestampMs: now(),
      });
      emitStatus("host connection closed");
    });

    connection.on("error", (error) => {
      currentStatus = "error";
      eventBus.emit({
        type: "peer/error",
        role: "client",
        roomId: options.roomId ?? null,
        peerId: currentPeerId,
        message: error?.message ?? "Peer connection error",
        timestampMs: now(),
        error,
      });
      emitStatus("connection error");
    });
  };

  peer.on("open", (id) => {
    currentPeerId = id;
    currentStatus = "connected";
    eventBus.emit({
      type: "peer/open",
      role: "client",
      roomId: options.roomId ?? null,
      peerId: id,
      timestampMs: now(),
    });
    emitStatus();
  });

  if (!localBridge) {
    peer.on("connection", (connection) => {
      hookConnection(connection);
    });
  }

  peer.on("disconnected", () => {
    currentStatus = "reconnecting";
    emitStatus("disconnected from signalling server");
  });

  peer.on("close", () => {
    currentStatus = "closed";
    emitStatus("peer destroyed");
  });

  peer.on("error", (error) => {
    currentStatus = "error";
    eventBus.emit({
      type: "peer/error",
      role: "client",
      roomId: options.roomId ?? null,
      peerId: currentPeerId,
      message: error?.message ?? "Peer error",
      timestampMs: now(),
      error,
    });
    emitStatus("peer error");
  });

  const connectToHost = (hostPeerId = currentHostPeerId ?? undefined): boolean => {
    if (!hostPeerId) {
      return false;
    }

    if (activeConnection?.open) {
      return true;
    }

    currentHostPeerId = hostPeerId;
    currentStatus = "connecting";
    emitStatus("connecting to host");

    if (localBridge) {
      const connectionId = `local-${currentPeerId ?? options.peerId ?? "client"}`;
      localConnectionRecord = {
        remotePeerId: hostPeerId,
        connectionId,
        label: "",
        open: true,
      };

      localBridge.postMessage({
        kind: "client-connect",
        remotePeerId: currentPeerId ?? options.peerId ?? "unknown-peer",
        connectionId,
      } satisfies LocalBridgePacket);
      currentStatus = "connected";
      eventBus.emit({
        type: "peer/connection-open",
        role: "client",
        roomId: options.roomId ?? null,
        peerId: resolvePeerId(currentPeerId, options.peerId ?? null),
        remotePeerId: hostPeerId,
        connectionId,
        timestampMs: now(),
      });
      emitStatus();
      return true;
    }

    const connection = peer.connect(hostPeerId, options.connectOptions);
    hookConnection(connection);
    return true;
  };

  const send = (message: ProtocolMessage): boolean => {
    if (localBridge) {
      if (!localConnectionRecord) {
        return false;
      }

      localBridge.postMessage({
        kind: "client-message",
        remotePeerId: currentPeerId ?? options.peerId ?? "unknown-peer",
        connectionId: localConnectionRecord.connectionId,
        message,
      } satisfies LocalBridgePacket);
      return true;
    }

    if (!activeConnection?.open) {
      return false;
    }

    activeConnection.send(codec.serialize(message));
    return true;
  };

  emitStatus("client transport created");

  return {
    role: "client",
    roomId: options.roomId ?? null,
    get peerId() {
      return currentPeerId;
    },
    get status() {
      return currentStatus;
    },
    get hostPeerId() {
      return currentHostPeerId;
    },
    get connections() {
      if (localConnectionRecord) {
        return [localConnectionRecord];
      }

      return activeConnection ? [createConnectionRecord(activeConnection)] : [];
    },
    onEvent: (listener: PeerTransportEventListener) => {
      return eventBus.subscribe(listener);
    },
    destroy: () => {
      currentStatus = "closed";
      activeConnection = null;
      localConnectionRecord = null;
      localBridge?.close();
      peer.destroy();
      eventBus.clear();
    },
    connectToHost,
    send,
    disconnect: () => {
      if (localBridge && localConnectionRecord) {
        localBridge.postMessage({
          kind: "client-disconnect",
          remotePeerId: currentPeerId ?? options.peerId ?? "unknown-peer",
          connectionId: localConnectionRecord.connectionId,
        } satisfies LocalBridgePacket);
        localConnectionRecord = null;
        currentStatus = "closed";
        emitStatus("client disconnected");
        return;
      }

      activeConnection?.close();
      activeConnection = null;
      peer.disconnect();
      currentStatus = "closed";
      emitStatus("client disconnected");
    },
  };
};
