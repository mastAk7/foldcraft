import * as THREE from 'three'

/**
 * MeshStandardMaterial with procedural voxel detail: block seams on integer boundaries,
 * an 8x8 "pixel" grain per face, side-face shading and depth darkening for the island underside.
 * No textures are loaded, so it's cheap and fully original.
 */
export function createVoxelMaterial({ grain = 0.07, seams = true, depthFade = true, vertexColors = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, vertexColors })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vFcWorld;
         varying vec3 vFcNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec4 fcW = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           fcW = instanceMatrix * fcW;
         #endif
         vFcWorld = (modelMatrix * fcW).xyz;
         vFcNormal = objectNormal;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vFcWorld;
         varying vec3 vFcNormal;
         float fcHash(vec3 p) {
           p = fract(p * 0.3183099 + 0.1);
           p *= 17.0;
           return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 n = abs(vFcNormal);
           vec3 p = vFcWorld + 0.5;
           vec2 uv = n.y > 0.5 ? p.xz : (n.x > 0.5 ? p.zy : p.xy);
           vec3 cellId = floor(p - sign(vFcNormal) * 0.01);
           vec2 sub = floor(fract(uv) * 8.0);
           float g = fcHash(cellId * 1.7 + vec3(sub, 3.0)) - 0.5;
           float c = fcHash(cellId) - 0.5;
           diffuseColor.rgb *= 1.0 + g * ${grain.toFixed(3)} + c * 0.06;
           ${
             seams
               ? `vec2 f = abs(fract(uv) - 0.5);
                  float edge = smoothstep(0.44, 0.5, max(f.x, f.y));
                  diffuseColor.rgb *= 1.0 - edge * 0.16;`
               : ''
           }
           if (n.y < 0.5) diffuseColor.rgb *= 0.9;
           if (vFcNormal.y < -0.5) diffuseColor.rgb *= 0.7;
           ${depthFade ? 'diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(-12.0, 1.0, vFcWorld.y));' : ''}
         }`,
      )
  }
  return mat
}

/** Lightly-shaded material for props: a subtle grain but no world-aligned seams. */
export function createPropMaterial() {
  return createVoxelMaterial({ grain: 0.05, seams: false, depthFade: false })
}
