<script lang="ts">
  import { onMount } from "svelte";
  import { theme } from "../theme.js";

  let { data = [] as number[], width = 220, height = 26 }: { data?: number[]; width?: number; height?: number } =
    $props();

  let canvas: HTMLCanvasElement | undefined = $state();

  function hexToRgba(hex: string, alpha: number): string {
    let normalized = hex.replace("#", "");
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const n = data.length;
    ctx.clearRect(0, 0, width, height);
    if (n < 2) return;

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4358c7";
    const pad = 2;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const point = (i: number): [number, number] => [
      pad + (width - 2 * pad) * (i / (n - 1)),
      height - pad - (height - 2 * pad) * ((data[i] - min) / (max - min || 1)),
    ];

    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    for (let i = 0; i < n; i++) {
      const [x, y] = point(i);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width - pad, height - pad);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(accent, 0.14);
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = point(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  onMount(() => {
    draw();
    return theme.subscribe(() => draw());
  });

  $effect(() => {
    data;
    draw();
  });
</script>

<canvas bind:this={canvas} {width} {height} class="spark"></canvas>

<style>
  .spark {
    display: block;
    width: 100%;
    height: 26px;
  }
</style>
