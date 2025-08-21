<!-- +layout.svelte -->
<script lang="ts">
  import App from './App.svelte'
</script>

<div class="app-bg" aria-hidden="true">
  <App/>
</div>

<main class="content">
  <!-- UI’nın etkileşimli kısımlarını .ui ile işaretle -->
  
  <section class="ui scroll"> <slot /> </section>
</main>

<style>
  :global(html, body){ height:100%; margin:0 }
  :global(#svelte){ min-height:100% }

  .app-bg{
    position:fixed; inset:0; z-index:0;
    /* ÖNEMLİ: arka plan etkileşime açık kalsın */
    pointer-events:auto;
  }

  .content{
    position:relative; z-index:1; min-height:100vh;
    /* Varsayılan: olayları geçir (arka plana gitsin) */
    pointer-events:none;
  }

  /* Sadece UI elemanlarında olayları aç */
  .ui, .ui * { pointer-events:auto; }

  /* Gerekirse kaydırma için */
  .scroll{ max-height:100vh; overflow:auto; }
</style>
