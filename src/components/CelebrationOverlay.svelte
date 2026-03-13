<!-- src/components/CelebrationOverlay.svelte -->
<script lang="ts">
  import type { Intensity } from '../state/types';

  let active = $state(false);
  let intensity = $state<Intensity>('normal');
  let pendingTimer: number | null = null;

  export function trigger(level: Intensity) {
    intensity = level;
    active = true;

    if (pendingTimer !== null) clearTimeout(pendingTimer);
    const duration = level === 'hype' ? 800 : level === 'normal' ? 500 : 300;
    pendingTimer = window.setTimeout(() => { active = false; pendingTimer = null; }, duration);
  }
</script>

{#if active}
  <div class="celebration-overlay {intensity}">
    <div class="flash"></div>
  </div>
{/if}

<style>
  .celebration-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 90;
  }

  .flash {
    position: absolute;
    inset: 0;
  }

  .calm .flash {
    animation: flashCalm 0.3s ease-out forwards;
  }

  .normal .flash {
    animation: flashNormal 0.5s ease-out forwards;
  }

  .hype .flash {
    animation: flashHype 0.8s ease-out forwards;
  }

  /* Screen shake is applied to the game container via class */
  :global(.shake-normal) {
    animation: shakeNormal 0.5s ease-out;
  }

  :global(.shake-hype) {
    animation: shakeHype 0.8s ease-out;
  }

  @keyframes flashCalm {
    0% { background: rgba(255,255,255,0.15); }
    100% { background: transparent; }
  }

  @keyframes flashNormal {
    0% { background: rgba(255,255,255,0.3); }
    100% { background: transparent; }
  }

  @keyframes flashHype {
    0% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.5), rgba(255,255,255,0.4)); opacity: 1; }
    30% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.3), rgba(255,107,53,0.2)); opacity: 0.8; }
    60% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.15), transparent); opacity: 0.5; }
    100% { background: transparent; opacity: 0; }
  }

  @keyframes shakeNormal {
    0%, 100% { transform: translate(0); }
    10% { transform: translate(-3px, 2px); }
    30% { transform: translate(3px, -2px); }
    50% { transform: translate(-2px, 1px); }
    70% { transform: translate(2px, -1px); }
  }

  @keyframes shakeHype {
    0%, 100% { transform: translate(0); }
    5% { transform: translate(-6px, 4px); }
    15% { transform: translate(6px, -4px); }
    25% { transform: translate(-5px, 3px); }
    35% { transform: translate(5px, -3px); }
    45% { transform: translate(-4px, 2px); }
    55% { transform: translate(4px, -2px); }
    65% { transform: translate(-3px, 1px); }
    75% { transform: translate(3px, -1px); }
    85% { transform: translate(-2px, 1px); }
  }
</style>
