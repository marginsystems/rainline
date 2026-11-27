import * as THREE from 'three';

const CONE_VERTEX = `varying float vAlong; varying float vFacing;
void main(){
  mat4 local = modelMatrix;
  #ifdef USE_INSTANCING
    local = modelMatrix * instanceMatrix;
  #endif
  vec4 world = local * vec4(position, 1.0);
  vec3 outward = normalize(mat3(local) * normal);
  vFacing = abs(dot(outward, normalize(cameraPosition - world.xyz)));
  vAlong = uv.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const CONE_FRAGMENT = `uniform vec3 uColour; uniform float uStrength;
varying float vAlong; varying float vFacing;
void main(){
  float along = max(vAlong, 0.0);
  float facing = max(vFacing, 0.0);
  gl_FragColor = vec4(uColour, along * along * (1.0 - along * 0.6) * facing * facing * uStrength);
}`;

export function lightConeGeometry(radius: number, length: number): THREE.ConeGeometry {
  const cone = new THREE.ConeGeometry(radius, length, 24, 1, true);
  cone.translate(0, -length / 2, 0);
  return cone;
}

export function lightConeMaterial(colour: readonly [number, number, number], strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Vector3(...colour) }, uStrength: { value: strength } },
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}
