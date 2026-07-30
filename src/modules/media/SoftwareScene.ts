import { CellFramebuffer } from './CellFramebuffer';

// invariant: Animation reuses one fixed framebuffer working set (src/modules/media/media.invariants.md)
class $SoftwareScene {
  protected rotationSine = 0;
  protected rotationCosine = 1;
  protected tiltSine = 0;
  protected tiltCosine = 1;
  protected activeScene: MediaSceneKind = 'cube';

  render(
    framebuffer: CellFramebuffer.Model,
    elapsedSeconds: number,
    requestedScene: MediaSceneKind | 'automatic' = 'automatic',
  ): MediaSceneKind {
    this.activeScene =
      requestedScene === 'automatic'
        ? Math.floor(elapsedSeconds / 5) % 2 === 0
          ? 'cube'
          : 'torus'
        : requestedScene;
    this.rotationSine = Math.sin(elapsedSeconds * 0.7);
    this.rotationCosine = Math.cos(elapsedSeconds * 0.7);
    this.tiltSine = Math.sin(elapsedSeconds * 0.43);
    this.tiltCosine = Math.cos(elapsedSeconds * 0.43);
    framebuffer.clear(5, 7, 18);
    this.paintBackground(framebuffer, elapsedSeconds);

    const aspectRatio = framebuffer.width / framebuffer.height;
    for (let rowIndex = 0; rowIndex < framebuffer.height; rowIndex++) {
      const screenY =
        (1 - ((rowIndex + 0.5) / framebuffer.height) * 2) / aspectRatio;
      for (
        let columnIndex = 0;
        columnIndex < framebuffer.width;
        columnIndex++
      ) {
        const screenX = ((columnIndex + 0.5) / framebuffer.width) * 2 - 1;
        const rayLength = Math.sqrt(screenX * screenX + screenY * screenY + 2);
        const rayDirectionX = screenX / rayLength;
        const rayDirectionY = screenY / rayLength;
        const rayDirectionZ = Math.SQRT2 / rayLength;
        this.traceRay(
          framebuffer,
          columnIndex,
          rowIndex,
          rayDirectionX,
          rayDirectionY,
          rayDirectionZ,
        );
      }
    }
    return this.activeScene;
  }

  protected paintBackground(
    framebuffer: CellFramebuffer.Model,
    elapsedSeconds: number,
  ): void {
    const glow = Math.round(5 + 4 * (Math.sin(elapsedSeconds * 0.5) + 1));
    for (let rowIndex = 0; rowIndex < framebuffer.height; rowIndex++) {
      const rowGlow = Math.round(
        (rowIndex / Math.max(1, framebuffer.height - 1)) * 14,
      );
      for (
        let columnIndex = 0;
        columnIndex < framebuffer.width;
        columnIndex++
      ) {
        framebuffer.setPixel(
          columnIndex,
          rowIndex,
          5 + Math.floor(rowGlow / 3),
          7 + Math.floor(rowGlow / 2),
          18 + rowGlow + glow,
          Number.POSITIVE_INFINITY - 1,
        );
      }
    }
  }

  protected traceRay(
    framebuffer: CellFramebuffer.Model,
    columnIndex: number,
    rowIndex: number,
    rayDirectionX: number,
    rayDirectionY: number,
    rayDirectionZ: number,
  ): void {
    let travelDistance = 0;
    let signedDistance = 0;
    for (let marchStep = 0; marchStep < 48; marchStep++) {
      const positionX = rayDirectionX * travelDistance;
      const positionY = rayDirectionY * travelDistance;
      const positionZ = -3.4 + rayDirectionZ * travelDistance;
      signedDistance = this.sceneDistance(positionX, positionY, positionZ);
      if (signedDistance < 0.008 || travelDistance > 7) break;
      travelDistance += signedDistance;
    }
    if (signedDistance >= 0.008 || travelDistance > 7) return;

    const positionX = rayDirectionX * travelDistance;
    const positionY = rayDirectionY * travelDistance;
    const positionZ = -3.4 + rayDirectionZ * travelDistance;
    const normalEpsilon = 0.006;
    const normalX =
      this.sceneDistance(positionX + normalEpsilon, positionY, positionZ) -
      this.sceneDistance(positionX - normalEpsilon, positionY, positionZ);
    const normalY =
      this.sceneDistance(positionX, positionY + normalEpsilon, positionZ) -
      this.sceneDistance(positionX, positionY - normalEpsilon, positionZ);
    const normalZ =
      this.sceneDistance(positionX, positionY, positionZ + normalEpsilon) -
      this.sceneDistance(positionX, positionY, positionZ - normalEpsilon);
    const normalLength =
      Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ) || 1;
    const normalizedX = normalX / normalLength;
    const normalizedY = normalY / normalLength;
    const normalizedZ = normalZ / normalLength;
    const lightLength = Math.sqrt(0.4 * 0.4 + 0.75 * 0.75 + 0.55 * 0.55);
    const diffuse = Math.max(
      0,
      (normalizedX * -0.4 + normalizedY * 0.75 + normalizedZ * -0.55) /
        lightLength,
    );
    const rim = Math.pow(
      Math.max(
        0,
        1 -
          Math.abs(
            normalizedX * rayDirectionX +
              normalizedY * rayDirectionY +
              normalizedZ * rayDirectionZ,
          ),
      ),
      2,
    );
    const brightness = Math.min(1, 0.12 + diffuse * 0.72 + rim * 0.35);
    const redBase = this.activeScene === 'cube' ? 80 : 205;
    const greenBase = this.activeScene === 'cube' ? 185 : 95;
    const blueBase = this.activeScene === 'cube' ? 245 : 220;
    framebuffer.setPixel(
      columnIndex,
      rowIndex,
      Math.round(redBase * brightness),
      Math.round(greenBase * brightness),
      Math.round(blueBase * brightness),
      travelDistance,
    );
  }

  protected sceneDistance(
    positionX: number,
    positionY: number,
    positionZ: number,
  ): number {
    const rotatedX =
      positionX * this.rotationCosine - positionZ * this.rotationSine;
    const firstRotatedZ =
      positionX * this.rotationSine + positionZ * this.rotationCosine;
    const rotatedY =
      positionY * this.tiltCosine - firstRotatedZ * this.tiltSine;
    const rotatedZ =
      positionY * this.tiltSine + firstRotatedZ * this.tiltCosine;
    if (this.activeScene === 'torus') {
      const ringDistance =
        Math.sqrt(rotatedX * rotatedX + rotatedZ * rotatedZ) - 0.76;
      return (
        Math.sqrt(ringDistance * ringDistance + rotatedY * rotatedY) - 0.25
      );
    }
    const distanceX = Math.abs(rotatedX) - 0.64;
    const distanceY = Math.abs(rotatedY) - 0.64;
    const distanceZ = Math.abs(rotatedZ) - 0.64;
    const outsideDistance = Math.sqrt(
      Math.max(distanceX, 0) ** 2 +
        Math.max(distanceY, 0) ** 2 +
        Math.max(distanceZ, 0) ** 2,
    );
    return (
      outsideDistance +
      Math.min(Math.max(distanceX, Math.max(distanceY, distanceZ)), 0)
    );
  }
}

export namespace SoftwareScene {
  export const $Class = $SoftwareScene;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type MediaSceneKind = 'cube' | 'torus';
