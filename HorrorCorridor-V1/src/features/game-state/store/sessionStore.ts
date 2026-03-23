import { create } from "zustand";

import type { LobbyPlayer, PlayerId, RoomState } from "@/types/shared";

export type SessionMode = "host" | "client";

export type SessionConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type PeerIdentity = Readonly<{
  peerId: string | null;
  playerId: PlayerId | null;
  displayName: string;
  hostPeerId: string | null;
}>;

export type SessionState = Readonly<{
  room: RoomState | null;
  peerIdentity: PeerIdentity;
  sessionMode: SessionMode;
  connectionStatus: SessionConnectionStatus;
  lobbyPlayers: readonly LobbyPlayer[];
}>;

export type SessionActions = Readonly<{
  setRoom: (room: RoomState | null) => void;
  setPeerIdentity: (peerIdentity: PeerIdentity) => void;
  updatePeerIdentity: (patch: Partial<PeerIdentity>) => void;
  setSessionMode: (sessionMode: SessionMode) => void;
  setConnectionStatus: (connectionStatus: SessionConnectionStatus) => void;
  setLobbyPlayers: (lobbyPlayers: readonly LobbyPlayer[]) => void;
  upsertLobbyPlayer: (player: LobbyPlayer) => void;
  removeLobbyPlayer: (playerId: PlayerId) => void;
  clearSession: () => void;
}>;

export type SessionStore = SessionState & SessionActions;

const initialState: SessionState = {
  room: null,
  peerIdentity: {
    peerId: null,
    playerId: null,
    displayName: "",
    hostPeerId: null,
  },
  sessionMode: "client",
  connectionStatus: "idle",
  lobbyPlayers: [],
};

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,
  setRoom: (room) =>
    set(() => ({
      room,
      lobbyPlayers: room?.players ?? [],
    })),
  setPeerIdentity: (peerIdentity) =>
    set(() => ({
      peerIdentity,
    })),
  updatePeerIdentity: (patch) =>
    set((state) => ({
      peerIdentity: {
        ...state.peerIdentity,
        ...patch,
      },
    })),
  setSessionMode: (sessionMode) =>
    set(() => ({
      sessionMode,
    })),
  setConnectionStatus: (connectionStatus) =>
    set(() => ({
      connectionStatus,
    })),
  setLobbyPlayers: (lobbyPlayers) =>
    set((state) => ({
      lobbyPlayers,
      room: state.room
        ? {
            ...state.room,
            players: lobbyPlayers,
          }
        : state.room,
    })),
  upsertLobbyPlayer: (player) =>
    set((state) => {
      const nextPlayers = state.lobbyPlayers.some((current) => current.id === player.id)
        ? state.lobbyPlayers.map((current) => (current.id === player.id ? player : current))
        : [...state.lobbyPlayers, player];

      return {
        lobbyPlayers: nextPlayers,
        room: state.room
          ? {
              ...state.room,
              players: nextPlayers,
            }
          : state.room,
      };
    }),
  removeLobbyPlayer: (playerId) =>
    set((state) => {
      const nextPlayers = state.lobbyPlayers.filter((player) => player.id !== playerId);

      return {
        lobbyPlayers: nextPlayers,
        room: state.room
          ? {
              ...state.room,
              players: nextPlayers,
            }
          : state.room,
      };
    }),
  clearSession: () =>
    set(() => ({
      ...initialState,
    })),
}));
