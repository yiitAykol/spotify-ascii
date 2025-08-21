<script lang="ts">
  import { DEG2RAD } from 'three/src/math/MathUtils.js'
  import { Grid, OrbitControls , useGltf} from '@threlte/extras'
  import { SphereGeometry } from 'three'
  import { T, useThrelte , useTask} from '@threlte/core'
  import { base } from '$app/paths' 
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
  import { useLoader } from '@threlte/core'
  const gltf = useLoader(GLTFLoader).load(`${base}/models/scene.gltf`)
  
  // */
  let {
    exposure = 1
  }: {
    exposure?: number
  } = $props()
  const { renderer, invalidate } = useThrelte()
  $effect(() => {
    renderer.toneMappingExposure = exposure
    invalidate()
  })
  const sphereGeo = new SphereGeometry(2.5, 32, 32)

  let rotation = $state(0)
  useTask((delta) => {
    rotation += delta/2
  })
</script>



<T.PerspectiveCamera
  position={[0, 4, 9]}
  fov={60}
  near={1}
  far={20000}
  makeDefault
>
  <OrbitControls
    maxPolarAngle={85 * DEG2RAD}
    enableDamping
    target={[0, 0, 0]}
  />
</T.PerspectiveCamera>

{#if $gltf}
  
  <T
    is={$gltf.scene}
    rotation.y={rotation}
    position={[0, 0, 0]}          
    scale={[4, 4, 4]}       
    rotation={[0, Math.PI / 2, 0]}
    
    
  />
{/if}