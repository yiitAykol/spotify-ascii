<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ——— Tipler ———
  type PlaylistItem = { name: string; uri: string };
  type Track = {
    name: string;
    artists?: { name: string }[];
    album?: { images?: { url: string }[] };
  };

  // ——— Durum ———
  let deviceId: string | null = null;
  let playerReady = false;
  let player: any = null;

  let currentTrack: Track | null = null;

  let playlists: PlaylistItem[] = [];
  let selectedPlaylist = '';

  // Konum/süre (ms)
  let position = 0;
  let duration = 0;
  let paused = true;

  // İlerleme & ses yönetimi
  let progressInterval: number | null = null;
  let volume = 0.8; // 0..1
  let volumeTimer: number | null = null;

  // ——— Yardımcılar ———
  /*
  async function getAccessToken(): Promise<string> {
    const r = await fetch('/api/spotify/token');
    if (!r.ok) throw new Error('Failed to get token');
    const j = await r.json();
    return j.access_token;
  }*/
 // YENİ (401'de bir kez refresh dene + net hata mesajı):
  async function getAccessToken(): Promise<string> {
    let r = await fetch('/api/spotify/token');
    if (r.status === 401) {
      // session var ama access yoksa zorla yenile
      r = await fetch('/api/spotify/token?refresh=1');
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`Failed to get token (${r.status}) ${t}`);
    }
    const j = await r.json();
    if (!j?.access_token) throw new Error('token endpoint returned no access_token');
    return j.access_token;
  }

  function clamp(x: number, min = 0, max = 1) {
    return Math.min(max, Math.max(min, x));
  }

  function scheduleSetVolume(v: number) {
    volume = clamp(v);
    if (volumeTimer) window.clearTimeout(volumeTimer);
    volumeTimer = window.setTimeout(async () => {
      try {
        if (player?.setVolume) await player.setVolume(volume);
        localStorage.setItem('volume', String(volume));
      } catch (err) {
        console.error('setVolume failed', err);
      }
    }, 120);
  }

  function ensureSpotifySDK(): Promise<void> {
    return new Promise((resolve) => {
      // Zaten yüklenmişse
      if ((window as any).Spotify) return resolve();

      // Script var mı bak
      let script = document.querySelector<HTMLScriptElement>(
        'script[src="https://sdk.scdn.co/spotify-player.js"]'
      );
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);
      }
      (window as any).onSpotifyWebPlaybackSDKReady = () => resolve();
    });
  }

  // ——— Yaşam Döngüsü ———
  onMount(async () => {
    // Kaydedilmiş sesi yükle
    const savedVol = Number(localStorage.getItem('volume'));
    if (!Number.isNaN(savedVol) && savedVol >= 0 && savedVol <= 1) {
      volume = savedVol;
    }

    try {
      await ensureSpotifySDK();
      const PlayerClass = (window as any).Spotify?.Player;
      if (!PlayerClass) {
        console.error('Spotify.Player not found');
        return;
      }

      player = new PlayerClass({
        name: 'SvelteKit Player',
        getOAuthToken: (cb: (t: string) => void) =>
          getAccessToken().then(cb).catch(err => { console.error(err); cb(''); }),
        volume
      });

      // Hata dinleyicileri
      player.addListener('initialization_error', ({ message }: any) => console.error('init_error', message));
      player.addListener('authentication_error', ({ message }: any) => console.error('auth_error', message));
      player.addListener('account_error', ({ message }: any) => console.error('account_error', message));
      player.addListener('playback_error', ({ message }: any) => console.error('playback_error', message));

      // Durum dinleyicisi
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        currentTrack = state.track_window?.current_track ?? null;
        position = state.position ?? 0;
        duration = state.duration ?? 0;
        paused = !!state.paused;
      });

      // Cihaz hazır
      player.addListener('ready', async ({ device_id }: { device_id: string }) => {
        deviceId = device_id;
        playerReady = true;

        try {
          await fetch('/api/spotify/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id })
          });
        } catch (err) {
          console.error('transfer failed', err);
        }

        // Başlangıç sesini uygula (garanti)
        try {
          await player.setVolume(volume);
        } catch (err) {
          console.error('apply initial volume failed', err);
        }
      });

      player.addListener('not_ready', ({ device_id }: any) => {
        if (deviceId === device_id) playerReady = false;
      });

      const connected: boolean = await player.connect();
      if (!connected) console.warn('Player failed to connect');

      // İlerleme: 250ms tik, drift azaltma
      let last = Date.now();
      progressInterval = window.setInterval(() => {
        if (!paused && duration > 0) {
          const now = Date.now();
          position = Math.min(position + (now - last), duration);
          last = now;
        } else {
          last = Date.now();
        }
      }, 250);
      //yeni eklenen 
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href);
        if (u.searchParams.has('spotify_auth')) {
          u.searchParams.delete('spotify_auth');
          history.replaceState({}, '', u.toString());
        }
      }//yeni eklenen bitti 

      // Çalma listelerini getir
      fetchUserPlaylists().catch(err => console.error('Failed to fetch playlists:', err));
    } catch (err) {
      console.error(err);
    }
  });

  onDestroy(() => {
    if (progressInterval) window.clearInterval(progressInterval);
    player?.disconnect?.();
    
  });

  // ——— Eylemler ———
  async function playTrack(uri: string) {
    if (!player || !deviceId) return;
    try {
      const token = await getAccessToken();
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [uri] })
      });
    } catch (err) { console.error(err); }
  }

  async function togglePlay() {
    if (!player) return;
    try { paused ? await player.resume() : await player.pause(); }
    catch (err) { console.error(err); }
  }

  async function next() { if (player) await player.nextTrack(); }
  async function previous() { if (player) await player.previousTrack(); }

  async function fetchCurrent() {
    if (!player) return;
    const st = await player.getCurrentState();
    currentTrack = st?.track_window?.current_track ?? null;
  }

  async function playPlaylist(playlistUri: string) {
    if (!player || !deviceId || !playlistUri) return;
    try {
      const token = await getAccessToken();
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_uri: playlistUri, offset: { position: 0 } })
      });
      fetchCurrent();
    } catch (err) { console.error(err); }
  }
  /*
  async function fetchUserPlaylists() {
    try {
      const token = await getAccessToken();
      const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch playlists');
      const data = await res.json();
      playlists = (data.items ?? []).map((p: any) => ({ name: p.name, uri: p.uri }));
    } catch (err) { console.error(err); }
  }*/
  // ESKİ:
// async function fetchUserPlaylists() { ... }

// YENİ:
async function fetchUserPlaylists() {
  try {
    const items: any[] = [];
    let next: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (next) {
      const token = await getAccessToken();
      const res: Response = await fetch(next, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('Playlists fetch error:', res.status, body);
        // Spotify "insufficient_scope" veya "The access token expired" gibi net mesaj verir.
        throw new Error(`Failed to fetch playlists (${res.status})`);
      }

      const data = await res.json();
      items.push(...(data.items ?? []));
      next = data.next; // sayfalama
    }

    playlists = items.map((p: any) => ({ name: p.name, uri: p.uri }));
  } catch (err) {
    console.error('fetchUserPlaylists failed:', err);
  }
}


  async function seek(ms: number | string) {
    if (!player) return;
    try {
      const n = Number(ms) || 0;
      position = n;          // UI anında
      await player.seek(n);  // Player hizala
    } catch (err) { console.error(err); }
  }

  // --- [ADD] Volume UI state & handlers ---
let volUi = Math.round(volume * 100); // 0..100, sadece UI
let isAdjusting = false;              // kullanıcı slider'ı sürüklüyor mu
let isPopoverOpen = false;            // hover/focus ile aç/kapa
let lastNonZero = Math.max(30, volUi || 0); // unmute dönüş sesi

// Kullanıcı sürüklemiyorken SDK'den gelen volume ile UI'ı senkronla
$: if (!isAdjusting) {
  const v = Number.isFinite(volume) ? volume : 0;
  volUi = Math.round(clamp(v, 0, 1) * 100);
  if (volUi > 0) lastNonZero = volUi;
}

function onVolInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value) || 0;
  const p = Math.max(0, Math.min(100, raw));
  isAdjusting = true;
  volUi = p;
  if (p > 0) lastNonZero = p;
  // 0/100 yakınındaki jitter'ı azaltmak için doğrudan yüzdeyi gönder
  scheduleSetVolume(p / 100);
}

function onVolChange() {
  isAdjusting = false;
}

function toggleMute() {
  if (!playerReady) return;
  const next = volUi === 0 ? (lastNonZero || 30) : 0;
  volUi = next;
  scheduleSetVolume(next / 100);
}

let infoOpen = false;
function closeInfo() { infoOpen = false; }

</script>
<div class="ui">
  <!-- Üst bar -->
  <div class="toolbar">
    <button on:click={() => (window.location.href = '/api/spotify/login')}>
      Login with Spotify
    </button>

    <select bind:value={selectedPlaylist} class="select">
      <option value="" disabled>Choose a playlist</option>
      {#each playlists as p}
        <option value={p.uri}>{p.name}</option>
      {/each}
    </select>

    <button
      on:click={() => playPlaylist(selectedPlaylist)}
      disabled={!selectedPlaylist || !playerReady}
    >
      ▶ Play Selected
    </button>
  </div>

  <!-- Parça kartı -->
  {#if currentTrack}
    <div class="track-card">
      {#if currentTrack.album?.images?.[0]?.url}
        <img class="cover" src={currentTrack.album.images[0].url} alt="cover" width="96" />
      {/if}
      <div class="meta">
        <p class="title">{currentTrack.name}</p>
        <p class="artist">{currentTrack.artists?.[0]?.name}</p>
      </div>
    </div>
  {:else}
    <p class="muted">No track playing</p>
  {/if}

  <!-- İlerleme -->
  <div class="progress-row">
    <span class="time">{Math.floor(position/1000)}s</span>
    <input
      class="progress"
      type="range"
      min="0"
      max={duration}
      value={position}
      on:input={(e) => seek((e.target as HTMLInputElement).value)}
      disabled={!playerReady || !duration}
    />
    <span class="time">{Math.floor((duration || 1)/1000)}s</span>
  </div>

  <!-- Transport -->
  <div class="controls">
    <button on:click={previous} disabled={!playerReady}>⏮ Previous</button>
    <button on:click={togglePlay} disabled={!playerReady}>
      {#if paused}▶ Play{:else}⏸ Pause{/if}
    </button>
    <button on:click={next} disabled={!playerReady}>⏭ Next</button>

    <!-- Ses (ikon + popover) -->
    <div
      class="vol-wrap"
      role="group"
      aria-label="Volume control"
      on:mouseenter={() => (isPopoverOpen = true)}
      on:mouseleave={() => (isPopoverOpen = false)}
      on:focusin={() => (isPopoverOpen = true)}
      on:focusout={() => (isPopoverOpen = false)}
    >
      <button
        class="vol-btn"
        disabled={!playerReady}
        aria-label="Volume"
        on:click={toggleMute}
      >
        {volUi === 0 ? '🔇' : volUi < 34 ? '🔈' : volUi < 67 ? '🔉' : '🔊'}
      </button>

      <div class="vol-popover" class:open={isPopoverOpen} role="dialog" aria-label="Volume slider">
        <label for="vol" class="vol-label">Volume: {volUi}%</label>
        <input
          id="vol"
          class="vol-range"
          type="range"
          min="0"
          max="100"
          step="1"
          bind:value={volUi}
          disabled={!playerReady}
          on:input={onVolInput}
          on:change={onVolChange}
        />
      </div>
    </div>
  </div>

  <!-- Sağ-alt bilgi düğmesi (i) -->
  <div
    class="fab-wrap"
    role="group"
    aria-label="About this app"
    on:mouseenter={() => (infoOpen = true)}
    on:mouseleave={() => (infoOpen = false)}
    on:focusin={() => (infoOpen = true)}
    on:focusout={() => (infoOpen = false)}
  >
    <button class="fab" aria-label="About" on:click={closeInfo}>
      i
    </button>

    <div class="info-card" class:open={infoOpen} role="dialog" aria-label="Info card">
      <div class="info-head">
        <strong class="app-title">Information about app</strong>
        <button class="close" aria-label="Close" on:click={closeInfo}>×</button>
      </div>
      <div class="info-body">
        <!-- İçeriği düzenle -->
        <p class="name"><strong>Made by:</strong> <span>Mahmut Yiğit Aykol</span></p>
        <p class="desc">
          Made with Svelte Kit + Spotify Web Playback SDK + Threlte/Three.js,

          Model used in this app:
          This work is based on "Stylized planet" by cmzw 
          (https://sketchfab.com/3d-models/stylized-planet-789725db86f547fc9163b00f302c3e70) 
          by cmzw (https://sketchfab.com/cmzw) licensed under CC-BY-4.0 
 
        </p>
        <p class="hint">Directives: You can play your desired playlist,
          first select your playlist from the dropdown, then click ▶ Play Selected, or you can 
          play your qued tracks by just clicking play</p>
        
      </div>
    </div>
  </div>

</div>

<style>
  /* ---- Tema ---- */
  .ui {
    --text: #d5ddec;
    --muted: #93a0b3;
    --panel: rgba(255,255,255,0.06);
    --panel-strong: rgba(255,255,255,0.12);
    --border: rgba(255,255,255,0.18);
    --shadow: 0 10px 30px rgba(0,0,0,0.35);
    
    color: var(--text);
    padding: 16px;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  }
  
  .ui .select option {
    background: #1f2937; /* dropdown arka planı (dark gray) */
    color: #e5e7eb;      /* daha yumuşak gri beyaz yazı */
  }

/* Hover olunca seçilen item */
  .ui .select option:hover {
    background: #374151;
    color: #ffffff;
  }
  /* Üst bar */
  .toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .ui .select { min-width: 220px; }

  /* Genel buton ve select (pill) */
  .ui button,
  .ui select {
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    border-radius: 9999px;
    padding: 8px 14px;
    font-weight: 600;
    backdrop-filter: saturate(160%) blur(4px);
    box-shadow: var(--shadow);
  }
  .ui button:hover,
  .ui select:hover { background: var(--panel-strong); }
  .ui button:active { transform: translateY(1px); }
  .ui button:disabled,
  .ui select:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Parça kartı */
  .track-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
    margin-top: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 14px;
    box-shadow: var(--shadow);
    max-width: 360px;
  }
  .track-card .cover {
    border-radius: 12px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.45);
  }
  .track-card .meta { min-width: 0; }
  .track-card .title {
    margin: 0 0 2px 0; font-weight: 700; letter-spacing: .2px;
    color: #ababc5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .track-card .artist {
    margin: 0; color: var(--muted); font-size: 0.95rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .muted { color: var(--muted); }

  /* İlerleme satırı */
  .progress-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 6px;
  }
  .time { font-size: 12px; color: var(--muted); }

  /* Transport butonları + volume grubu */
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Range’leri sınıfa bağla: boyutlar */
  .progress {
    -webkit-appearance: none; appearance: none;
    width: clamp(220px, 45vw, 420px);
    height: 6px; background: transparent;
  }
  .vol-range {
    -webkit-appearance: none; appearance: none;
    width: 140px;
    height: 6px; background: transparent;
  }

  /* Track */
  .progress::-webkit-slider-runnable-track,
  .vol-range::-webkit-slider-runnable-track {
    height: 6px; border-radius: 9999px;
    background: linear-gradient(90deg, #60a5fa, #a78bfa);
  }
  .progress::-moz-range-track,
  .vol-range::-moz-range-track {
    height: 6px; border-radius: 9999px;
    background: linear-gradient(90deg, #60a5fa, #a78bfa);
  }

  /* Thumb */
  .progress::-webkit-slider-thumb,
  .vol-range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; margin-top: -5px;
    border-radius: 50%; background: #fff; border: 2px solid #111827;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
  }
  .progress::-moz-range-thumb,
  .vol-range::-moz-range-thumb {
    width: 16px; height: 16px; border: 2px solid #111827;
    border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.4);
  }

  /* Volume butonu + popover */
  .vol-wrap { position: relative; display: inline-block; }
  .vol-btn {
    border-radius: 9999px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    padding: 8px 12px;
    box-shadow: var(--shadow);
  }
  .vol-btn:hover { background: var(--panel-strong); }

  .vol-popover {
    position: absolute;
    left: 52px; top: 50%;
    transform: translateY(-50%) translateY(-4px);
    opacity: 0; pointer-events: none;
    background: rgba(17,24,39,0.92);
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--text);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 8px 10px;
    z-index: 9999;
    transition: opacity 120ms ease, transform 120ms ease;
    width: 190px;
  }
  .vol-popover.open {
    opacity: 1; pointer-events: auto;
    transform: translateY(-50%) translateY(0);
  }
  .vol-label { color: var(--muted); font-size: 12px; margin-bottom: 6px; display:block; }

  /* Sağ-alt floating action button (FAB) + kart */
.fab-wrap {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10000;
}
.fab {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-weight: 800;
  font-family: inherit;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.fab:hover { background: var(--panel-strong); transform: translateY(-1px); }

.info-card {
  position: absolute;
  right: 56px;  /* butonun solunda aç */
  bottom: 0;
  width: 260px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(15,23,42,0.92); /* slate-900/ish */
  border: 1px solid rgba(255,255,255,0.10);
  color: var(--text);
  box-shadow: var(--shadow);

  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.98);
  transition: opacity 140ms ease, transform 140ms ease;
}
.info-card.open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.app-title { font-weight: 700; }
.close {
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  border-radius: 9999px;
  width: 28px; height: 28px;
  line-height: 1;
  cursor: pointer;
}
.close:hover { background: var(--panel-strong); }

.info-body { font-size: 0.925rem; }
.info-body .name { margin: 0 0 6px 0; }
.info-body .desc { margin: 0 0 6px 0; color: var(--muted); }
.info-body .hint { margin: 0; font-size: 0.85rem; color: var(--muted); }

</style>
