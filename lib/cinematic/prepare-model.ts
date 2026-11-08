import * as THREE from "three";
import type { CinematicVehicle } from "@/lib/cinematic/vehicles";

/**
 * Normalizes a loaded GLTF scene into the stage convention: rotationY (+180 so a glTF-forward +Z nose
 * ends at -Z, which the carousel tilt turns up the screen), longest horizontal extent = model.length,
 * centered on x/z, lowest point on y=0. Materials and textures are left exactly as authored except the optional paint tint (base colour factor of one material); the only
 * geometry change is dropping nodes/materials that are not part of the car (the Land Cruiser's ground plane).
 */
export function prepareModel(scene: THREE.Object3D, vehicle: CinematicVehicle) {
  const spec = vehicle.model;
  const root = scene.clone(true);
  const dropNodes = new Set(spec.dropNodes ?? []);
  const dropMats = new Set(spec.dropMaterials ?? []);
  const doomed: THREE.Object3D[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const mats = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    if (dropNodes.has(object.name) || (mats.length > 0 && mats.every((m) => dropMats.has(m.name)))) doomed.push(object);
  });
  doomed.forEach((object) => object.removeFromParent());

  // Paint: clone only the body-paint material and set its base colour factor. Maps, normal, roughness,
  // metalness, clearcoat, transmission and envMapIntensity stay exactly as authored.
  if (spec.paint) {
    const { material: paintName, color } = spec.paint;
    const tinted = new Map<THREE.Material, THREE.Material>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (original: THREE.Material) => {
        if (original.name !== paintName || !(original as THREE.MeshStandardMaterial).color) return original;
        if (!tinted.has(original)) {
          const copy = original.clone() as THREE.MeshStandardMaterial;
          copy.color.set(color);
          tinted.set(original, copy);
        }
        return tinted.get(original)!;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }

  const holder = new THREE.Group();
  holder.add(root);
  root.rotation.y = THREE.MathUtils.degToRad(spec.rotationY) + Math.PI;
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar(spec.length / Math.max(size.x, size.z, 0.001));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -box.min.y, -center.z);
  holder.updateMatrixWorld(true);
  return { root: holder };
}
