"use client";

import { useState } from "react";

import type { LobbyPlayer, RoomState } from "@/types/shared";

import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";

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
  hostId: string;
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
  const screen = useUiStore((state) => state.screen);
  const gameScreen = useUiStore((state) => state.gameScreen);
  const completion = useUiStore((state) => state.completion);
  const setScreen = useUiStore((state) => state.setScreen);
  const setGameScreen = useUiStore((state) => state.setGameScreen);
  const setOverlay = useUiStore((state) => state.setOverlay);
  const setPaused = useUiStore((state) => state.setPaused);
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
  const clearSession = useSessionStore((state) => state.clearSession);

  const setAuthoritativeSnapshot = useRuntimeStore((state) => state.setAuthoritativeSnapshot);
  const setReadiness = useRuntimeStore((state) => state.setReadiness);
  const resetRuntime = useRuntimeStore((state) => state.resetRuntime);

  const [joinCode, setJoinCode] = useState("HRC-1");
  const [playerName, setPlayerName] = useState("Wanderer");

  const returnToStart = (): void => {
    clearSession();
    resetRuntime();
    resetUi();
    setScreen("START");
    setGameScreen("loading");
  };

  const enterHostLobby = (): void => {
    resetUi();
    const normalizedName = playerName.trim() || "Host";
    const nextRoomId = makeRoomId();
    const nextJoinCode = makeJoinCode();
    const hostPlayerId = makeId("host-player");
    const hostPeerId = `peer-${hostPlayerId}`;
    const hostPlayer = makePlayer(hostPlayerId, normalizedName, true, false);
    const roomState = makeRoomState({
      roomId: nextRoomId,
      joinCode: nextJoinCode,
      hostId: hostPlayerId,
      players: [hostPlayer],
    });

    setSessionMode("host");
    setConnectionStatus("connected");
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
  };

  const enterClientLobby = (): void => {
    resetUi();
    const normalizedName = playerName.trim() || "Client";
    const normalizedJoinCode = joinCode.trim().toUpperCase() || makeJoinCode();
    const hostPlayerId = makeId("host-player");
    const clientPlayerId = makeId("client-player");
    const hostPeerId = `peer-${hostPlayerId}`;
    const clientPeerId = `peer-${clientPlayerId}`;
    const hostPlayer = makePlayer(hostPlayerId, "Host", true, true);
    const clientPlayer = makePlayer(clientPlayerId, normalizedName, false, false);
    const roomState = makeRoomState({
      roomId: `room-${normalizedJoinCode.toLowerCase()}`,
      joinCode: normalizedJoinCode,
      hostId: hostPlayerId,
      players: [hostPlayer, clientPlayer],
    });

    setSessionMode("client");
    setConnectionStatus("connected");
    setPeerIdentity({
      peerId: clientPeerId,
      playerId: clientPlayerId,
      displayName: normalizedName,
      hostPeerId,
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
  };

  const startPlay = (): void => {
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
              Screen: {screen}
            </span>
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Mode: {sessionMode}
            </span>
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Status: {connectionStatus}
            </span>
            <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1">
              Flow: {gameScreen}
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
              <GameCanvas />
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
