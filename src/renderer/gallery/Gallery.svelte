<script lang="ts">
  import { SECTIONS } from "./sections.js";

  let { section = "", theme }: { section?: string; theme: string } = $props();

  const visible = $derived(SECTIONS.filter((entry) => section === "" || entry.id === section));
</script>

<div class="gallery">
  <nav>
    {#each SECTIONS as entry (entry.id)}
      <a class:on={entry.id === section} href={`#${entry.id}/${theme}`}>{entry.label}</a>
    {/each}
    <a class:on={section === ""} href={`#/${theme}`}>All</a>
    <span class="spacer"></span>
    <a href={`#${section}/${theme === "dark" ? "light" : "dark"}`}>{theme === "dark" ? "Light" : "Dark"}</a>
  </nav>

  {#each visible as entry (entry.id)}
    {@const Section = entry.component}
    <section>
      <h2>{entry.label}</h2>
      <Section {...entry.props ?? {}} />
    </section>
  {/each}
</div>

<style>
  .gallery {
    padding: var(--space-2xl) var(--space-3xl) var(--space-4xl);
    background: var(--bg);
    min-height: 100%;
  }
  nav {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    margin-bottom: var(--space-2xl);
  }
  nav a {
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    padding: var(--space-xs) var(--space-md);
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-sm);
  }
  nav a.on {
    color: var(--accent);
    background: var(--accent-weak);
    border-color: var(--accent-border);
  }
  nav .spacer {
    flex: 1;
  }
  section + section {
    margin-top: var(--space-4xl);
  }
  h2 {
    margin: 0 0 var(--space-md);
    font-size: var(--fs-lg);
    font-weight: 650;
    letter-spacing: -.01em;
  }
</style>
