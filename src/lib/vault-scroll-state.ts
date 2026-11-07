export interface VaultScrollState {
  /** Overall page scroll progress (0.0 to 1.0) */
  progress: number;
  /** Stage 1 (0.0 -> 0.32): Vault locking wheel & heavy door opening */
  vaultWheelRotation: number;
  vaultBoltsRetract: number;
  vaultDoorOpenAngle: number;
  /** Camera dolly along Z axis (starts outside vault at Z=8.5, pushes through to Z=2.6) */
  cameraZ: number;
  cameraY: number;
  /** Stage 2 (0.32 -> 0.78): Jar & Bud deconstruction */
  jarLidLift: number;
  jarGlassDrop: number;
  budCoreScale: number;
  terpeneRingsExpand: number;
  hudCalloutOpacity: number;
  /** Stage 3 (0.78 -> 1.0): Transition to Private Member Gate */
  scenePushBack: number;
}

export const vaultScrollState: VaultScrollState = {
  progress: 0,
  vaultWheelRotation: 0,
  vaultBoltsRetract: 0,
  vaultDoorOpenAngle: 0,
  cameraZ: 8.5,
  cameraY: 0,
  jarLidLift: 0,
  jarGlassDrop: 0,
  budCoreScale: 0.75,
  terpeneRingsExpand: 0,
  hudCalloutOpacity: 0,
  scenePushBack: 0,
};
