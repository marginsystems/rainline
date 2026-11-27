export const NATIVE_HEIGHT_PIXELS = 2000;
export const CHASE_VIEW = { nearMetres: 5, farMetres: 10, widestFovDegrees: 85 } as const;

export function metresPerPixel(distanceMetres: number, verticalFovDegrees: number, heightPixels: number): number {
  return (2 * distanceMetres * Math.tan((verticalFovDegrees * Math.PI) / 360)) / heightPixels;
}

export function pixelsAcross(widthMetres: number, distanceMetres: number, verticalFovDegrees: number, heightPixels: number): number {
  return widthMetres / metresPerPixel(distanceMetres, verticalFovDegrees, heightPixels);
}

export const smallestCleanFeatureMetres = (heightPixels: number = NATIVE_HEIGHT_PIXELS): number => metresPerPixel(CHASE_VIEW.farMetres, CHASE_VIEW.widestFovDegrees, heightPixels);
