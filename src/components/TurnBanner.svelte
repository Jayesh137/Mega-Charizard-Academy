<!-- src/components/TurnBanner.svelte -->
<script lang="ts">
  import type { TurnType } from '../state/types';

  let visible = $state(false);
  let currentTurn = $state<TurnType>('owen');
  let animating = $state(false);
  let pendingTimer: number | null = null;

  const turnConfig: Record<TurnType, { name: string; color: string; bgColor: string; icon: string; role: string }> = {
    owen: { name: 'Owen', color: '#F08030', bgColor: 'rgba(240, 128, 48, 0.95)', icon: '\u{1F525}', role: "Owen's Turn!" },
    kian: { name: 'Kian', color: '#37B1E2', bgColor: 'rgba(55, 177, 226, 0.95)', icon: '\u{1F409}', role: "Kian's Turn!" },
    team: { name: 'Team', color: '#FFD700', bgColor: 'rgba(255, 215, 0, 0.95)', icon: '\u2B50', role: 'Team Turn!' },
  };

  export function show(turn: TurnType) {
    if (pendingTimer !== null) { clearTimeout(pendingTimer); pendingTimer = null; }
    currentTurn = turn;
    visible = true;
    animating = true;
  }

  export function hide() {
    animating = false;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => { visible = false; pendingTimer = null; }, 300);
  }
</script>

{#if visible}
  {@const config = turnConfig[currentTurn]}
  <div
    class="turn-banner"
    class:slide-in={animating}
    class:slide-out={!animating}
    style="background: {config.bgColor};"
  >
    <span class="banner-icon">{config.icon}</span>
    <div class="banner-text">
      <span class="banner-name" style="color: white;">{config.name}</span>
      <span class="banner-role">{config.role}</span>
    </div>
  </div>
{/if}

<style>
  .turn-banner {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 20px 60px;
    border-radius: 0 0 24px 24px;
    z-index: 100;
    pointer-events: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .slide-in {
    animation: slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .slide-out {
    animation: slideOut 0.3s ease-in forwards;
  }

  @keyframes slideIn {
    from { transform: translateX(-50%) translateY(-100%); }
    to { transform: translateX(-50%) translateY(0); }
  }

  @keyframes slideOut {
    from { transform: translateX(-50%) translateY(0); }
    to { transform: translateX(-50%) translateY(-100%); }
  }

  .banner-icon {
    font-size: 72px;
    line-height: 1;
  }

  .banner-text {
    display: flex;
    flex-direction: column;
  }

  .banner-name {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 72px;
    font-weight: 700;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
  }

  .banner-role {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 36px;
    font-weight: 600;
    color: rgba(255,255,255,0.85);
  }
</style>
