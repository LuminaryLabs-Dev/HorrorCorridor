import type { DataConnection, Peer, PeerConnectOption, PeerOptions } from "peerjs";

import type { ProtocolMessage } from "@/features/networking/protocol/messageTypes";

export type PeerRole = "host" | "client";

export type PeerTransportStatus =
  | "idle"
  | "opening"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export type PeerEventListener = (event: import("./peerEvents").PeerTransportEvent) => void;

export type ProtocolCodec = Readonly<{
  serialize: (message: ProtocolMessage) => string;
  deserialize: (value: unknown) => ProtocolMessage | null;
}>;

export type PeerConnectionRecord = Readonly<{
  remotePeerId: string;
  connectionId: string;
  label: string;
  open: boolean;
}>;

export type PeerTransportOptions = Readonly<{
  peerId?: string;
  peerOptions?: PeerOptions;
  connectOptions?: PeerConnectOption;
  codec?: ProtocolCodec;
  onEvent?: PeerEventListener;
}>;

export type HostCreateOptions = Readonly<{
  roomId: string;
  joinCode: string;
} & PeerTransportOptions>;

export type ClientCreateOptions = Readonly<{
  roomId?: string | null;
  hostPeerId?: string | null;
} & PeerTransportOptions>;

export type PeerTransportBase = Readonly<{
  role: PeerRole;
  roomId: string | null;
  peerId: string | null;
  status: PeerTransportStatus;
  connections: readonly PeerConnectionRecord[];
  onEvent: (listener: PeerEventListener) => () => void;
  destroy: () => void;
}>;

export type HostTransportAdapter = PeerTransportBase &
  Readonly<{
    role: "host";
    roomId: string;
    joinCode: string;
    broadcast: (message: ProtocolMessage) => number;
    sendTo: (remotePeerId: string, message: ProtocolMessage) => boolean;
    disconnectPeer: (remotePeerId: string) => boolean;
  }>;

export type ClientTransportAdapter = PeerTransportBase &
  Readonly<{
    role: "client";
    roomId: string | null;
    hostPeerId: string | null;
    connectToHost: (hostPeerId?: string) => boolean;
    send: (message: ProtocolMessage) => boolean;
    disconnect: () => void;
  }>;

export type PeerInstance = Peer;
export type PeerConnection = DataConnection;
