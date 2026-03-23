import type { ProtocolMessage } from "@/features/networking/protocol/messageTypes";

import type { PeerRole, PeerTransportStatus } from "./peerTypes";

export type PeerTransportEvent = Readonly<
  | {
      type: "peer/status";
      role: PeerRole;
      roomId: string | null;
      peerId: string | null;
      status: PeerTransportStatus;
      timestampMs: number;
      detail?: string;
    }
  | {
      type: "peer/open";
      role: PeerRole;
      roomId: string | null;
      peerId: string;
      timestampMs: number;
    }
  | {
      type: "peer/connection-open";
      role: PeerRole;
      roomId: string | null;
      peerId: string;
      remotePeerId: string;
      connectionId: string;
      timestampMs: number;
    }
  | {
      type: "peer/connection-close";
      role: PeerRole;
      roomId: string | null;
      peerId: string;
      remotePeerId: string;
      connectionId: string;
      timestampMs: number;
      reason?: string;
    }
  | {
      type: "peer/message";
      role: PeerRole;
      roomId: string | null;
      peerId: string | null;
      remotePeerId: string;
      connectionId: string;
      message: ProtocolMessage;
      timestampMs: number;
    }
  | {
      type: "peer/error";
      role: PeerRole;
      roomId: string | null;
      peerId: string | null;
      message: string;
      timestampMs: number;
      error?: unknown;
    }
>;

export type PeerTransportEventListener = (event: PeerTransportEvent) => void;

export type PeerEventBus = Readonly<{
  emit: (event: PeerTransportEvent) => void;
  subscribe: (listener: PeerTransportEventListener) => () => void;
  clear: () => void;
  size: () => number;
}>;

export const createPeerEventBus = (
  initialListeners: readonly PeerTransportEventListener[] = [],
): PeerEventBus => {
  const listeners = new Set<PeerTransportEventListener>(initialListeners);

  return {
    emit: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    clear: () => {
      listeners.clear();
    },
    size: () => listeners.size,
  };
};

export const emitPeerStatus = (
  bus: PeerEventBus,
  event: Omit<Extract<PeerTransportEvent, { type: "peer/status" }>, "type">,
): void => {
  bus.emit({
    type: "peer/status",
    ...event,
  });
};
