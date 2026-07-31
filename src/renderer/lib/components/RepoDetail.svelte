<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import type { RepoMeta, CatalogKind } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { renderMarkdown } from "../util/markdown.js";
  import PluginIcon, { LOGO_SIZE } from "./PluginIcon.svelte";
  import Button from "./Button.svelte";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  let {
    repo,
    onClose,
    extra,
    actions,
  }: {
    repo: { name: string; url: string; kind?: CatalogKind; description?: string; topics?: string[]; displayName: string; icon?: string };
    onClose: () => void;
    extra?: Snippet;
    actions?: Snippet;
  } = $props();

  let meta = $state<RepoMeta | null>(null);
  let metaLoaded = $state(false);

  const description = $derived(meta?.description?.trim() ? meta.description : (repo.description ?? ""));
  const topics = $derived((meta && meta.topics.length > 0 ? meta.topics : repo.topics) ?? []);
  const stars = $derived(meta?.stars ?? null);
  const htmlUrl = $derived(meta?.htmlUrl ?? repo.url);
  const slug = $derived(meta ? `${meta.owner}/${meta.repo}` : repo.name);
  const readmeHtml = $derived(meta?.readme ? renderMarkdown(meta.readme) : "");

  function openGithub(): void {
    window.open(htmlUrl, "_blank");
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }

  onMount(() => {
    cairn.repoMeta(repo.url).then((result) => {
      if (result.ok) meta = result.data;
      metaLoaded = true;
    });
  });
</script>

<svelte:window onkeydown={onKeydown} />
<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()} transition:fadeMotion>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label={`${repo.displayName} details`}
    transition:flyMotion={{ y: 12 }}
  >
    <button class="close" title="Close" aria-label="Close" onclick={onClose}>×</button>

    <header class="hero">
      <PluginIcon icon={repo.icon} name={repo.displayName} kind={repo.kind} size={LOGO_SIZE.detail} />
      <div class="titles">
        <h2>{repo.displayName}</h2>
        <div class="sub">
          <span class="slug">{slug}</span>
          {#if repo.kind}<span class="kind">{repo.kind}</span>{/if}
          {#if stars !== null}<span class="stars" title="GitHub stars">★ {stars}</span>{/if}
        </div>
      </div>
    </header>

    {#if description}
      <p class="desc">{description}</p>
    {/if}

    {#if topics.length > 0}
      <div class="topics">
        {#each topics as topic (topic)}<span class="topic">{topic}</span>{/each}
      </div>
    {/if}

    {#if extra}
      <div class="extra">{@render extra()}</div>
    {/if}

    {#if readmeHtml}
      <section class="readme">
        <p class="label">Readme</p>
        <div class="md">{@html readmeHtml}</div>
      </section>
    {:else if !metaLoaded}
      <p class="muted">Loading readme…</p>
    {/if}

    <footer class="foot">
      <Button onclick={openGithub}>View on GitHub</Button>
      {#if actions}{@render actions()}{/if}
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 41;
    background: rgba(0, 0, 0, .5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .modal {
    position: relative;
    width: min(92vw, 680px);
    max-height: 86vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }
  .extra,
  .readme,
  .foot {
    border-top: 1px solid var(--border);
    padding-top: 14px;
  }
  .extra {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    color: var(--faint);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .close:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-right: 24px;
  }
  .titles h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -.02em;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .slug {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
  }
  .kind {
    font-size: 10px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 20px;
    padding: 2px 8px;
  }
  .stars {
    font-size: 11.5px;
    color: var(--muted);
    font-weight: 600;
  }
  .desc {
    margin: 0;
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
  }
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .topic {
    font-size: 10.5px;
    color: var(--faint);
    background: var(--surface-2);
    border-radius: 6px;
    padding: 2px 7px;
  }
  .label {
    margin: 0 0 8px;
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .muted {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
  .readme .md {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    background: var(--surface-2);
    overflow-x: auto;
  }
  .md :global(h1),
  .md :global(h2),
  .md :global(h3) {
    font-size: 15px;
    margin: 12px 0 6px;
    letter-spacing: -.01em;
  }
  .md :global(h1:first-child) {
    margin-top: 0;
  }
  .md :global(p) {
    margin: 6px 0;
  }
  .md :global(a) {
    color: var(--accent);
  }
  .md :global(code) {
    font-family: var(--mono);
    font-size: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .md :global(pre) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    overflow-x: auto;
  }
  .md :global(pre code) {
    border: none;
    padding: 0;
    background: none;
  }
  .md :global(img) {
    max-width: 100%;
  }
  .md :global(ul),
  .md :global(ol) {
    margin: 6px 0;
    padding-left: 20px;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
  }
</style>
