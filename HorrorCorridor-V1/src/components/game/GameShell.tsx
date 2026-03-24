"use client";

import { useEffect, useRef, useState } from "react";

import type { LobbyPlayer, RoomState } from "@/types/shared";

import { createInitialGameState } from "@/features/game-state/domain/createInitialGameState";
import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";
import { createClient } from "@/features/networking/peer/createClient";
import { createHost } from "@/features/networking/peer/createHost";
import type { PeerTransportEvent } from "@/features/networking/peer/peerEvents";
import type {
  ClientTransportAdapter,
  HostTransportAdapter,
  PeerTransportStatus,
} from "@/features/networking/peer/peerTypes";
import { PROTOCOL_MESSAGE_TYPES } from "@/features/networking/protocol/messageTypes";
import {
  createFullSyncMessage,
  createHostStartMessage,
  createLobbyEventMessage,
} from "@/features/networking/protocol/syncSnapshot";

import CompleteScreen from "@/components/menus/CompleteScreen";
import GameCanvas from "./GameCanvas";
import HUDOverlay from "@/components/hud/HUDOverlay";
import JoinMenu from "@/components/menus/JoinMenu";
import LobbyScreen from "@/components/menus/LobbyScreen";
import PauseMenu from "@/components/menus/PauseMenu";
import StartMenu from "@/components/menus/StartMenu";

const makeId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const makeJoinCode = (): string =>
  Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");

const makeRoomId = (): string => `room-${makeId("corridor")}`;

const makePlayer = (
  id: string,
  name: string,
  isHost: boolean,
  ready: boolean,
  connectionState: LobbyPlayer["connectionState"] = "connected",
): LobbyPlayer => ({
  id,
  name,
  isHost,
  ready,
  connectionState,
});

const makeRoomState = (input: {
  roomId: string;
  joinCode: string;
  hostId: string | null;
  players: readonly LobbyPlayer[];
}): RoomState => ({
  roomId: input.roomId,
  joinCode: input.joinCode,
  hostId: input.hostId,
  phase: "lobby",
  maxPlayers: 4,
  players: input.players,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export default function GameShell() {
  const transportRef = useRef<HostTransportAdapter | ClientTransportAdapter | null>(null);
  const [transport, setTransport] = useState<HostTransportAdapter | ClientTransportAdapter | null>(null);
  const screen = useUiStore((state) => state.screen);
  const completion = useUiStore((state) => state.completion);
  const setScreen = useUiStore((state) => state.setScreen);
  const setGameScreen = useUiStore((state) => state.setGameScreen);
  const setOverlay = useUiStore((state) => state.setOverlay);
  const setPaused = useUiStore((state) => state.setPaused);
  const setCompletion = useUiStore((state) => state.setCompletion);
  const resetUi = useUiStore((state) => state.resetUi);

  const room = useSessionStore((state) => state.room);
  const sessionMode = useSessionStore((state) => state.sessionMode);
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const lobbyPlayers = useSessionStore((state) => state.lobbyPlayers);
  const peerIdentity = useSessionStore((state) => state.peerIdentity);
  const setRoom = useSessionStore((state) => state.setRoom);
  const setPeerIdentity = useSessionStore((state) => state.setPeerIdentity);
  const setSessionMode = useSessionStore((state) => state.setSessionMode);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);
  const setLobbyPlayers = useSessionStore((state) => state.setLobbyPlayers);
  const upsertLobbyPlayer = useSessionStore((state) => state.upsertLobbyPlayer);
  const removeLobbyPlayer = useSessionStore((state) => state.removeLobbyPlayer);
  const updatePeerIdentity = useSessionStore((state) => state.updatePeerIdentity);
  const clearSession = useSessionStore((state) => state.clearSession);

  const setAuthoritativeSnapshot = useRuntimeStore((state) => state.setAuthoritativeSnapshot);
  const setReadiness = useRuntimeStore((state) => state.setReadiness);
  const resetRuntime = useRuntimeStore((state) => state.resetRuntime);

  const toSessionConnectionStatus = (status: PeerTransportStatus) => {
    switch (status) {
      case "opening":
      case "connecting":
        return "connecting";
      case "connected":
        return "connected";
      case "reconnecting":
        return "reconnecting";
      case "closed":
        return "disconnected";
      case "error":
        return "error";
      case "idle":
      default:
        return "idle";
    }
  };

  const destroyTransport = (): void => {
    transportRef.current?.destroy();
    transportRef.current = null;
    setTransport(null);
  };

  const handleTransportEvent = (event: PeerTransportEvent): void => {
    if (event.type === "peer/status") {
      setConnectionStatus(toSessionConnectionStatus(event.status));
      return;
    }

    if (event.type === "peer/connection-open" && event.role === "host") {
      const roomState = useSessionStore.getState().room;
      const currentPlayers = useSessionStore.getState().lobbyPlayers;
      const existingPlayer = currentPlayers.find((player) => player.id === event.remotePeerId);
      const guestCount = currentPlayers.filter((player) => !player.isHost).length;
      const nextPlayer =
        existingPlayer ??
        makePlayer(
          event.remotePeerId,
          `Guest ${guestCount + 1}`,
          false,
          false,
          "connected",
        );

      upsertLobbyPlayer({
        ...nextPlayer,
        connectionState: "connected",
      });

      const nextRoom = useSessionStore.getState().room;

      if (roomState && nextRoom && transportRef.current?.role === "host") {
        transportRef.current.broadcast(
          createLobbyEventMessage({
            senderId: nextRoom.hostId ?? nextRoom.roomId,
            roomId: nextRoom.roomId,
            room: nextRoom,
            event: "player-joined",
            player: nextPlayer,
            message: `${nextPlayer.name} joined the lobby`,
          }),
        );
      }

      return;
    }

    if (event.type === "peer/connection-close" && event.role === "host") {
      const roomState = useSessionStore.getState().room;
      const playerToRemove = useSessionStore.getState().lobbyPlayers.find(
        (player) => player.id === event.remotePeerId,
      );

      if (playerToRemove) {
        removeLobbyPlayer(playerToRemove.id);
      }

      const nextRoom = useSessionStore.getState().room;

      if (roomState && nextRoom && transportRef.current?.role === "host") {
        transportRef.current.broadcast(
          createLobbyEventMessage({
            senderId: nextRoom.hostId ?? nextRoom.roomId,
            roomId: nextRoom.roomId,
            room: nextRoom,
            event: "player-left",
            player: playerToRemove ?? undefined,
            message: `${playerToRemove?.name ?? "A player"} left the lobby`,
          }),
        );
      }

      return;
    }

    if (event.type !== "peer/message") {
      return;
    }

    if (event.message.type === PROTOCOL_MESSAGE_TYPES.START_GAME) {
      setRoom(event.message.payload.room);
      setLobbyPlayers(event.message.payload.room.players);
      updatePeerIdentityIfNeeded(event.message.payload.hostPeerId);
      setConnectionStatus("connected");
      return;
    }

    if (event.message.type === PROTOCOL_MESSAGE_TYPES.SYNC) {
      setRoom(event.message.payload.room);
      setLobbyPlayers(event.message.payload.room.players);
      setAuthoritativeSnapshot(event.message.payload.snapshot);

      if (event.message.payload.snapshot.gameState === "victory") {
        setCompletion({
          status: "victory",
          message: "The corridor accepted the run.",
          atMs: event.timestampMs,
        });
        setScreen("COMPLETED");
        setGameScreen("victory");
        setPaused(false, "none");
      } else if (event.message.payload.snapshot.gameState === "paused") {
        setScreen("PAUSED");
        setGameScreen("paused");
        setPaused(true, "system");
      } else {
        setScreen("PLAYING");
        setGameScreen("playing");
        setPaused(false, "none");
      }

      setReadiness({
        simulation: true,
        rendering: true,
        networking: true,
        input: true,
      });
      return;
    }

    if (event.message.type === PROTOCOL_MESSAGE_TYPES.LOBBY_EVENT) {
      setRoom(event.message.payload.room);
      setLobbyPlayers(event.message.payload.players);
      setConnectionStatus("connected");
    }
  };

  const updatePeerIdentityIfNeeded = (hostPeerId: string): void => {
    if (peerIdentity.hostPeerId === hostPeerId) {
      return;
    }

    updatePeerIdentity({
      hostPeerId,
    });
  };

  const [joinCode, setJoinCode] = useState("HRC-1");
  const [playerName, setPlayerName] = useState("Wanderer");

  const returnToStart = (): void => {
    destroyTransport();
    clearSession();
    resetRuntime();
    resetUi();
    setScreen("START");
    setGameScreen("loading");
  };

  const enterHostLobby = (): void => {
    destroyTransport();
    resetUi();
    const normalizedName = playerName.trim() || "Host";
    const nextRoomId = makeRoomId();
    const nextJoinCode = makeJoinCode();
    const hostPlayerId = makeId("host-player");
    const hostPeerId = nextJoinCode;
    const hostPlayer = makePlayer(hostPlayerId, normalizedName, true, false);
    const roomState = makeRoomState({
      roomId: nextRoomId,
      joinCode: nextJoinCode,
      hostId: hostPlayerId,
      players: [hostPlayer],
    });

    setSessionMode("host");
    setPeerIdentity({
      peerId: hostPeerId,
      playerId: hostPlayerId,
      displayName: normalizedName,
      hostPeerId,
    });
    setRoom(roomState);
    setLobbyPlayers(roomState.players);
    setScreen("LOBBY_HOST");
    setGameScreen("lobby");
    setOverlay({
      kind: "lobby",
      message: `Hosting room ${nextJoinCode}`,
      visible: true,
    });
    setAuthoritativeSnapshot(null);
    setReadiness({
      simulation: false,
      rendering: false,
      networking: true,
      input: false,
    });

    transportRef.current = createHost({
      roomId: nextRoomId,
      joinCode: nextJoinCode,
      peerId: nextJoinCode,
      onEvent: handleTransportEvent,
    });
    setTransport(transportRef.current);
    setConnectionStatus("connecting");
  };

  const enterClientLobby = (): void => {
    destroyTransport();
    resetUi();
    const normalizedName = playerName.trim() || "Client";
    const normalizedJoinCode = joinCode.trim().toUpperCase() || makeJoinCode();
    const clientPlayerId = makeId("client-player");
    const clientPeerId = clientPlayerId;
    const clientPlayer = makePlayer(clientPlayerId, normalizedName, false, false);
    const roomState = makeRoomState({
      roomId: `room-${normalizedJoinCode.toLowerCase()}`,
      joinCode: normalizedJoinCode,
      hostId: null,
      players: [clientPlayer],
    });

    setSessionMode("client");
    setPeerIdentity({
      peerId: clientPeerId,
      playerId: clientPlayerId,
      displayName: normalizedName,
      hostPeerId: normalizedJoinCode,
    });
    setRoom(roomState);
    setLobbyPlayers(roomState.players);
    setScreen("LOBBY_CLIENT");
    setGameScreen("lobby");
    setOverlay({
      kind: "lobby",
      message: `Joined room ${normalizedJoinCode}`,
      visible: true,
    });
    setAuthoritativeSnapshot(null);
    setReadiness({
      simulation: false,
      rendering: false,
      networking: true,
      input: false,
    });

    const clientTransport = createClient({
      roomId: roomState.roomId,
      hostPeerId: normalizedJoinCode,
      peerId: clientPeerId,
      onEvent: handleTransportEvent,
    });
    transportRef.current = clientTransport;
    setTransport(clientTransport);
    clientTransport.connectToHost(normalizedJoinCode);
    setConnectionStatus("connecting");
  };

  const startPlay = (): void => {
    if (sessionMode !== "host") {
      toggleReady();
      return;
    }

    if (!room) {
      return;
    }

    const localPlayerId = peerIdentity.playerId ?? room.hostId ?? `${sessionMode}-player`;
    const localPlayerName = peerIdentity.displayName || "Host";
    const bootstrap = createInitialGameState({
      roomId: room.roomId,
      joinCode: room.joinCode,
      hostId: room.hostId ?? localPlayerId,
      players: lobbyPlayers,
      localPlayerId,
      localPlayerName,
      seedSource: room.roomId ?? room.joinCode ?? "horror-corridor",
    });

    setRoom(bootstrap.gameState.room);
    setLobbyPlayers(bootstrap.gameState.room.players);
    setAuthoritativeSnapshot(bootstrap.snapshot);
    resetUi();
    setScreen("PLAYING");
    setGameScreen("playing");
    setPaused(false, "none");
    setOverlay({
      kind: "none",
      message: null,
      visible: false,
    });
    setReadiness({
      simulation: true,
      rendering: true,
      networking: connectionStatus === "connected",
      input: true,
    });

    if (transportRef.current?.role === "host") {
      const senderId = peerIdentity.playerId ?? bootstrap.gameState.room.hostId ?? localPlayerId;
      transportRef.current.broadcast(
        createHostStartMessage({
          senderId,
          roomId: bootstrap.gameState.room.roomId,
          room: bootstrap.gameState.room,
          hostPeerId: transportRef.current.peerId ?? bootstrap.gameState.room.joinCode ?? senderId,
          hostPlayerId: localPlayerId,
          seed: bootstrap.gameState.seed,
          startedAtMs: bootstrap.gameState.timestampMs,
        }),
      );
      transportRef.current.broadcast(
        createFullSyncMessage({
          senderId,
          state: bootstrap.gameState,
          roomId: bootstrap.gameState.room.roomId,
          reason: "initial",
          timestampMs: bootstrap.gameState.timestampMs,
        }),
      );
    }
  };

  const resumePlay = (): void => {
    setPaused(false, "none");
    setScreen("PLAYING");
    setGameScreen("playing");
  };

  const returnToLobby = (): void => {
    resetUi();
    if (!room) {
      setScreen("START");
      setGameScreen("loading");
      return;
    }

    const nextScreen = sessionMode === "host" ? "LOBBY_HOST" : "LOBBY_CLIENT";
    setScreen(nextScreen);
    setGameScreen("lobby");
    setPaused(false, "none");
    setOverlay({
      kind: "lobby",
      message: room.joinCode ? `Room ${room.joinCode}` : "Lobby",
      visible: true,
    });
    setReadiness({
      simulation: false,
      rendering: false,
      networking: true,
      input: false,
    });
  };

  const addGuestPlaceholder = (): void => {
    const nextGuestIndex = lobbyPlayers.filter((player) => !player.isHost).length + 1;
    upsertLobbyPlayer(
      makePlayer(makeId("guest-player"), `Guest ${nextGuestIndex}`, false, false),
    );
  };

  const toggleReady = (): void => {
    const localPlayer = lobbyPlayers.find((player) => player.id === peerIdentity.playerId);

    if (!localPlayer) {
      return;
    }

    upsertLobbyPlayer({
      ...localPlayer,
      ready: !localPlayer.ready,
    });
  };

  useEffect(
    () => () => {
      destroyTransport();
    },
    [],
  );

  const currentPlayers = room?.players ?? lobbyPlayers;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020403] text-lime-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(63,255,119,0.08),transparent_34%),linear-gradient(180deg,rgba(1,10,5,0.98)_0%,rgba(1,5,3,0.96)_46%,rgba(0,0,0,1)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(127,255,140,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(127,255,140,0.03)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />

      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-lime-400/10 bg-black/50 px-5 py-4 backdrop-blur-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.45em] text-lime-300/70">
              Horror Corridor
            </p>
            <h1 className="mt-1 text-xl font-semibold uppercase tracking-[0.28em] text-white">
              Prototype Port
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-lime-200/80">
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Room: {room?.joinCode ?? peerIdentity.hostPeerId ?? "----"}
            </span>
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Mode: {sessionMode}
            </span>
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Status: {connectionStatus}
            </span>
          </div>
        </header>

        <main className="relative flex flex-1">
          {screen === "START" ? (
            <StartMenu
              sessionMode={sessionMode}
              connectionStatus={connectionStatus}
              onHostGame={enterHostLobby}
              onJoinGame={() => setScreen("JOIN_MENU")}
            />
          ) : null}

          {screen === "JOIN_MENU" ? (
            <JoinMenu
              joinCode={joinCode}
              playerName={playerName}
              connectionStatus={connectionStatus}
              onJoinCodeChange={setJoinCode}
              onPlayerNameChange={setPlayerName}
              onSubmit={enterClientLobby}
              onBack={() => setScreen("START")}
            />
          ) : null}

          {screen === "LOBBY_HOST" || screen === "LOBBY_CLIENT" ? (
            <LobbyScreen
              mode={sessionMode}
              connectionStatus={connectionStatus}
              room={room}
              players={currentPlayers}
              onPrimaryAction={startPlay}
              onSecondaryAction={sessionMode === "host" ? addGuestPlaceholder : toggleReady}
              onBackToTitle={returnToStart}
            />
          ) : null}

          {screen === "PLAYING" || screen === "PAUSED" || screen === "COMPLETED" ? (
            <div className="absolute inset-0">
              <GameCanvas transport={transport} />
              <HUDOverlay />
            </div>
          ) : null}

          {screen === "PAUSED" ? (
            <PauseMenu
              onResume={resumePlay}
              onReturnToLobby={returnToLobby}
              onQuitToTitle={returnToStart}
            />
          ) : null}

          {screen === "COMPLETED" ? (
            <CompleteScreen
              outcome={completion.status === "victory" ? "victory" : "failure"}
              message={completion.message}
              onRestart={returnToLobby}
              onQuitToTitle={returnToStart}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
