import { useEffect, useRef } from "react";
import type { AuthoringPreviewConfig } from "./contracts";
import {
  DEFAULT_AUTHORING_PREVIEW,
  createAuthoringPreviewSnapshot,
  previewDistrictId,
  previewSetPieceKind,
  validateAuthoringPreviewConfig,
} from "./previewSnapshot";
import { createThreeSceneAdapter } from "../hosts/browser/threeScene";

type AuthoringPreviewControl = Readonly<{
  status: () => Readonly<{ ready: boolean; config: AuthoringPreviewConfig; frame: number }>;
  configure: (update: Partial<AuthoringPreviewConfig>) => Readonly<{ ready: boolean; config: AuthoringPreviewConfig; frame: number }>;
}>;

declare global {
  interface Window {
    __HORROR_CORRIDOR_AUTHORING__?: AuthoringPreviewControl;
  }
}

function readConfig(): AuthoringPreviewConfig {
  const params = new URLSearchParams(window.location.search);
  return validateAuthoringPreviewConfig({
    setPieceId: params.get("setPiece") ?? DEFAULT_AUTHORING_PREVIEW.setPieceId,
    districtId: params.get("district") ?? DEFAULT_AUTHORING_PREVIEW.districtId,
    monsterId: params.get("monster") ?? DEFAULT_AUTHORING_PREVIEW.monsterId,
    phase: (params.get("phase") ?? DEFAULT_AUTHORING_PREVIEW.phase) as AuthoringPreviewConfig["phase"],
    cameraPreset: (params.get("camera") ?? DEFAULT_AUTHORING_PREVIEW.cameraPreset) as AuthoringPreviewConfig["cameraPreset"],
  });
}

export default function AuthoringPreviewHost() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef<AuthoringPreviewConfig>(readConfig());
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const presentation = createThreeSceneAdapter(canvas, {
      authoringTarget: {
        setPieceKind: previewSetPieceKind(configRef.current),
        districtId: previewDistrictId(configRef.current),
        side: -1,
      },
    });
    let frameId = 0;
    let disposed = false;
    const startedAt = performance.now();

    const status = () => Object.freeze({
      ready: presentation.ready && !disposed,
      config: configRef.current,
      frame: frameRef.current,
    });
    const draw = (time: number) => {
      frameRef.current += 1;
      presentation.render(createAuthoringPreviewSnapshot(configRef.current, time - startedAt));
    };
    const animate = (time: number) => {
      if (disposed) return;
      draw(time);
      frameId = requestAnimationFrame(animate);
    };

    window.__HORROR_CORRIDOR_AUTHORING__ = Object.freeze({
      status,
      configure(update) {
        configRef.current = validateAuthoringPreviewConfig({ ...configRef.current, ...update });
        presentation.configureAuthoring({
          setPieceKind: previewSetPieceKind(configRef.current),
          districtId: previewDistrictId(configRef.current),
          side: -1,
        });
        draw(performance.now());
        return status();
      },
    });
    canvas.dataset.authoringReady = "true";
    draw(performance.now());
    frameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      presentation.dispose();
      delete window.__HORROR_CORRIDOR_AUTHORING__;
    };
  }, []);

  return (
    <main className="game-shell" data-testid="authoring-preview-host">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        data-testid="authoring-preview-canvas"
        aria-label="Focused HorrorCorridor authoring preview"
      />
    </main>
  );
}
