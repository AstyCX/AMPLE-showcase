import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

export function createContactShadow(renderer, target, {
  width, depth, y, height = 9, opacity = 0.75, size = 512, blur: passes = [3.2, 2.2, 1.2, 0.6], falloff = 1.6,
}) {
  const rt = new THREE.WebGLRenderTarget(size, size);
  const rtBlur = new THREE.WebGLRenderTarget(size, size);
  rt.texture.generateMipmaps = rtBlur.texture.generateMipmaps = false;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  plane.scale.y = -1;
  plane.position.y = y + 0.02;
  plane.renderOrder = -1;

  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  cam.position.y = y;
  cam.rotation.x = Math.PI / 2;

  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      `gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, ${falloff.toFixed(2)} ) );`,
    );
  };
  depthMat.depthTest = depthMat.depthWrite = false;

  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  hBlur.depthTest = vBlur.depthTest = false;
  const quad = new FullScreenQuad();

  function blur(amount) {
    quad.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur);
    quad.render(renderer);
    quad.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt);
    quad.render(renderer);
  }

  function bake() {
    const scene = new THREE.Scene();
    scene.overrideMaterial = depthMat;
    const parent = target.parent;
    scene.add(target);
    const clearAlpha = renderer.getClearAlpha();
    const clear = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    for (const a of passes) blur(a);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, clearAlpha);
    parent?.add(target);
  }

  return {
    mesh: plane,
    bake,
    dispose() {
      rt.dispose();
      rtBlur.dispose();
      hBlur.dispose();
      vBlur.dispose();
      depthMat.dispose();
      quad.dispose();
    },
  };
}
