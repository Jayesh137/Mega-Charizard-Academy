<!-- src/components/TimeoutOverlay.svelte -->
<!-- Full-screen timeout overlay: sleeping Charizard + countdown timer -->
<!-- Activated by T hotkey, dismissed by T again or timer expiry. -->
<script lang="ts">
  let visible = $state(false);
  let countdown = $state('3:00');
  let wakeUp = $state(false);
  let pendingTimer: number | null = null;

  export function show(): void {
    if (pendingTimer !== null) { clearTimeout(pendingTimer); pendingTimer = null; }
    visible = true;
    wakeUp = false;
    countdown = '3:00';
  }

  export function hide(): void {
    // Trigger wake-up animation before hiding
    wakeUp = true;
    if (pendingTimer !== null) clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      visible = false;
      wakeUp = false;
      pendingTimer = null;
    }, 1200);
  }

  export function tick(formatted: string): void {
    countdown = formatted;
  }
</script>

{#if visible}
<div class="timeout-overlay" class:wake-up={wakeUp}>
  <div class="timeout-content">
    <!-- Sleeping indicator -->
    <div class="zzz-container">
      <span class="zzz z1">Z</span>
      <span class="zzz z2">z</span>
      <span class="zzz z3">Z</span>
    </div>

    <!-- Sleeping Charizard visual (CSS-based since it's an overlay) -->
    <div class="sleeping-sprite">
      <div class="flame" class:dim={!wakeUp} class:bright={wakeUp}></div>
      <div class="body"></div>
      <div class="eye left"></div>
      <div class="eye right"></div>
    </div>

    <p class="rest-message">Charizard needs a rest</p>

    <!-- Countdown timer -->
    <div class="timer">{countdown}</div>

    <p class="sub-message">Be good, trainers...</p>
  </div>
</div>
{/if}

<style>
  .timeout-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(5, 3, 15, 0.92);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.5s ease-out;
    pointer-events: all;
  }

  .timeout-overlay.wake-up {
    animation: fadeOut 1.2s ease-in forwards;
  }

  .timeout-content {
    text-align: center;
    position: relative;
  }

  .sleeping-sprite {
    position: relative;
    width: 200px;
    height: 180px;
    margin: 0 auto 30px;
  }

  .body {
    width: 160px;
    height: 120px;
    background: radial-gradient(ellipse at 50% 40%, #2a2045, #1B1B2F);
    border-radius: 50% 50% 40% 40%;
    margin: 40px auto 0;
    border: 3px solid #37B1E2;
    box-shadow: 0 0 20px rgba(55, 177, 226, 0.2);
    animation: breathe 4s ease-in-out infinite;
  }

  .eye {
    position: absolute;
    width: 20px;
    height: 4px;
    background: #37B1E2;
    border-radius: 2px;
    top: 70px;
  }

  .eye.left { left: 55px; }
  .eye.right { right: 55px; }

  .flame {
    position: absolute;
    width: 16px;
    height: 24px;
    background: radial-gradient(ellipse at center bottom, #37B1E2, #1A5C8A);
    border-radius: 50% 50% 30% 30%;
    right: 10px;
    top: 70px;
    animation: flicker 2s ease-in-out infinite;
  }

  .flame.dim {
    opacity: 0.3;
    transform: scale(0.6);
  }

  .flame.bright {
    opacity: 1;
    transform: scale(1.2);
    background: radial-gradient(ellipse at center bottom, #5ED4FC, #37B1E2);
    transition: all 0.8s ease-out;
  }

  .rest-message {
    color: #91CCEC;
    font-size: 36px;
    font-weight: 700;
    font-family: Fredoka, Nunito, sans-serif;
    margin: 0 0 20px;
  }

  .timer {
    color: #ffffff;
    font-size: 120px;
    font-weight: 700;
    font-family: Fredoka, Nunito, sans-serif;
    text-shadow: 0 0 40px rgba(55, 177, 226, 0.5);
    line-height: 1;
    margin-bottom: 20px;
  }

  .sub-message {
    color: #666688;
    font-size: 24px;
    font-family: Fredoka, Nunito, sans-serif;
    margin: 0;
  }

  /* Zzz floating animation */
  .zzz-container {
    position: absolute;
    top: -20px;
    right: 30px;
  }

  .zzz {
    position: absolute;
    color: #91CCEC;
    font-size: 28px;
    font-weight: bold;
    font-family: Fredoka, Nunito, sans-serif;
    opacity: 0;
    animation: float-zzz 3s ease-in-out infinite;
  }

  .z1 { right: 0; animation-delay: 0s; }
  .z2 { right: 20px; font-size: 22px; animation-delay: 1s; }
  .z3 { right: 40px; animation-delay: 2s; }

  @keyframes breathe {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(1.05); }
  }

  @keyframes flicker {
    0%, 100% { transform: scaleY(1) scaleX(1); }
    25% { transform: scaleY(1.1) scaleX(0.9); }
    50% { transform: scaleY(0.9) scaleX(1.1); }
    75% { transform: scaleY(1.05) scaleX(0.95); }
  }

  @keyframes float-zzz {
    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
    20% { opacity: 0.8; }
    80% { opacity: 0.8; }
    100% { opacity: 0; transform: translate(-30px, -60px) scale(1.2); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
</style>
