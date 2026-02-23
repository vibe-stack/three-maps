'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useViewportStore } from '@/stores/viewport-store';

// Keeps the R3F camera in sync with the zustand camera state and reports back changes.
export function useCameraController() {
  const cameraState = useViewportStore((s) => s.camera);
  const activeSceneCameraId = useViewportStore((s) => s.activeCameraObjectId ?? null);
  const { camera } = useThree();

  // Only drive the R3F default camera from editor state when no scene camera is active.
  useEffect(() => {
    if (activeSceneCameraId) return;
    camera.position.set(
      cameraState.position.x,
      cameraState.position.y,
      cameraState.position.z
    );
    camera.lookAt(
      cameraState.target.x,
      cameraState.target.y,
      cameraState.target.z
    );
  // @ts-expect-error drei camera typing vs three
    camera.fov = cameraState.fov;
    camera.near = cameraState.near;
    camera.far = cameraState.far;
    camera.updateProjectionMatrix();
  }, [camera, cameraState, activeSceneCameraId]);
}
