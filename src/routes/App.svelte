<script lang="ts">
  import Scene from './Scene.svelte'
  export const ssr = false;
  
  import type { Preset } from './preset'
  import { Canvas } from '@threlte/core'
  
  import { Sky } from '@threlte/extras'
  import { Spring } from 'svelte/motion'
  import { presets } from './preset'
  import type { AsciiEffectOptions } from 'three/examples/jsm/Addons.js'
  import { AsciiRenderer } from '@threlte/extras'
  import { Button, Checkbox, Color, Folder, Pane, Slider, Text } from 'svelte-tweakpane-ui'
  const entries = Object.entries(presets)

  let fgColor = $state('#ff2400')
  let bgColor = $state('#000000')
  const defaultCharacters = ' .:-+*=%0#'
  let characters = $state(defaultCharacters)
  let alpha = $state(true)
  let block = $state(false)
  let color = $state(true)
  let invert = $state(true)
  let resolution = $state(0.12)
  let scale = $state(1)
  
  const options: AsciiEffectOptions = $derived({
    alpha,
    block,
    color,
    invert,
    resolution,
    scale
  })



  //asasas
  const presetSpring = new Spring(presets.sunset, {
    damping: 0.95,
    precision: 0.0001,
    stiffness: 0.05
  })
  let setEnvironment = $state(true)
  let azimuth = $state(0)
  let elevation = $state(0)
  let exposure = $state(0)
  let mieCoefficient = $state(0)
  let mieDirectionalG = $state(0)
  let rayleigh = $state(0)
  let turbidity = $state(0)
  const applyPreset = (preset: Preset) => {
    azimuth = preset.azimuth
    elevation = preset.elevation
    exposure = preset.exposure
    mieCoefficient = preset.mieCoefficient
    mieDirectionalG = preset.mieDirectionalG
    rayleigh = preset.rayleigh
    turbidity = preset.turbidity
  }
  applyPreset(presets.noon)
  $effect(() => {
    presetSpring.set({
      azimuth,
      elevation,
      exposure,
      mieCoefficient,
      mieDirectionalG,
      rayleigh,
      turbidity
    })
  })
  let autoRotate = $state(false)
</script>
<!--
<Pane
  title="Sky"
  position="fixed"
>
  <Checkbox
    bind:value={setEnvironment}
    label="Set Environment"
  />
  <Slider
    label="Turbidity"
    bind:value={turbidity}
    min={0}
    max={20}
  />
  <Slider
    label="Rayleigh"
    bind:value={rayleigh}
    min={0}
    max={4}
  />
  <Slider
    label="Azimuth"
    bind:value={azimuth}
    min={-180}
    max={180}
  />
  <Slider
    label="Elevation"
    bind:value={elevation}
    min={-5}
    max={90}
  />
  <Slider
    label="Mie Coefficient"
    bind:value={mieCoefficient}
    min={0}
    max={0.1}
  />
  <Slider
    label="Mie Directional G"
    bind:value={mieDirectionalG}
    min={0}
    max={1}
  />
  <Slider
    label="Exposure"
    bind:value={exposure}
    min={0}
    max={2}
  />
  <Folder title="Presets">
    {#each entries as [title, preset]}
      <Button
        {title}
        on:click={() => {
          applyPreset(preset)
        }}
      />
    {/each}
  </Folder>
</Pane>-->

<Canvas>

  <AsciiRenderer
      {bgColor}
      {characters}
      {fgColor}
      {options}
    >
      <!-- Add children content here, for example: -->
      <Scene />
      <div></div>
    </AsciiRenderer>
  <!--
  <Sky
    {setEnvironment}
    {...presetSpring.current}
  />-->
  <!--<Scene exposure={presetSpring.current.exposure} />-->
  
  
  
</Canvas>