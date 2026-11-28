<!-- the text's title bar: floats above every view, never part of the text; with the byline, the whole-text menu and what is picked to comment on -->
<script>
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { Scroll, FileCog, CopyPlus, Trash, ToiletRoll, X, InfoCircle } from '@boxicons/svelte';
    import RepressMenu from './RepressMenu.svelte';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, settings, commenting, whole } = $derived(monocle);

    /** @param {number} n */
    const countLabel = (n) => (n === 1 ? '1 paragraph' : `${n} paragraphs`);
</script>

<header class="flex shrink-0 items-center gap-2 border-b border-taupe2 bg-taupe1 px-6 py-2 text-dark">
    <Scroll class="shrink-0" />
    <h1 class="truncate text-lg font-semibold {doc.title ? '' : 'text-grey3'}" title={doc.title}>{doc.title || 'Untitled text'}</h1>
    {#if monocle.authed && doc.id && doc.authors.length}
        <!-- the byline: names in the sans font, the connecting words in the script font -->
        <p class="min-w-0 truncate py-1 text-lg font-semibold">
            <span class="font-script text-xs leading-none font-normal">by</span><span class="ml-2">{#each doc.authors as name, i (i)}{#if i > 0}{#if i === doc.authors.length - 1}{#if doc.authors.length > 2}<span class="font-script text-xs leading-none font-normal">,</span>{/if}<span class="font-script mx-2 text-xs leading-none font-normal">and</span>{:else}<span class="font-script mr-2 text-xs leading-none font-normal">,</span>{/if}{/if}{name}{/each}</span>
        </p>
    {/if}
    {#if monocle.authed && doc.id}
        {@const { access, repressible } = doc.standing}
        <!-- the whole-text menu: what it offers depends on what the user is to the text, and where the text stands -->
        <span aria-hidden="true" class="shrink-0 cursor-default text-xl leading-none font-bold whitespace-pre text-taupe5 select-none">· · ·</span>
        <div role="menu" aria-label="Whole text" class="flex shrink-0 items-center gap-1">
            <button role="menuitem" onclick={whole.openHead} aria-label="About this text" use:tip={'About this text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><InfoCircle /></button>
            {#if access !== 'reader'}
                <button role="menuitem" onclick={whole.openSettings} aria-label="Text settings" use:tip={access === 'editor' ? 'Text settings (propose changes)' : 'Text settings'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><FileCog /></button>
            {/if}
            {#if access === 'author' && doc.standing.productionStatus !== 'burned'}
                <button role="menuitem" onclick={whole.duplicate} aria-label="Duplicate text" use:tip={'Duplicate text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><CopyPlus /></button>
            {/if}
            {#if access !== 'reader' && !whole.permanent}
                <button role="menuitem" onclick={() => whole.request('delete')} aria-label={access === 'editor' ? 'Propose burning' : 'Burn text'} use:tip={access === 'editor' ? 'Propose burning' : 'Burn text'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 hover:bg-taupe2"><Trash /></button>
            {/if}
            {#if access === 'author' && !doc.publicized && !doc.standing.lockedIds.length}
                <button role="menuitem" onclick={() => !settings.commenting && whole.request('wipe')} aria-label="Wipe clean" aria-disabled={settings.commenting} use:tip={settings.commenting ? "Wipe clean (the text can't be changed while commenting)" : 'Wipe clean'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md p-1 {settings.commenting ? 'cursor-not-allowed opacity-60' : 'hover:bg-taupe2'}"><ToiletRoll /></button>
            {/if}
            {#if repressible}
                {#key doc.id}<RepressMenu {monocle} />{/key}
            {/if}
        </div>
        {#if doc.standing.productionStatus === 'recanted' || doc.standing.productionStatus === 'burned'}
            <span class="shrink-0 rounded-full border border-taupe3 px-2 text-xs text-grey3">{doc.standing.productionStatus}</span>
        {/if}
    {/if}
    {#if settings.commenting && settings.view !== 'rally' && commenting.picked.size && !commenting.editor.open}
        <!-- what has been picked to comment on: in the title bar, so it covers none of the text -->
        <div role="toolbar" aria-label="Picked paragraphs" class="raised ml-auto flex shrink-0 items-center gap-2 rounded-full py-0.5 pr-1 pl-4 text-sm whitespace-nowrap shadow-md">
            <span role="status">{countLabel(commenting.picked.size)} picked</span>
            <button onclick={commenting.commentPicked} class="rounded-full bg-accent px-3 py-0.5 font-medium text-on-accent hover:bg-accent/90">Comment</button>
            <button onclick={commenting.clearPicked} aria-label="Clear the picked paragraphs" use:tip={'Clear (Esc)'} data-tip-place="below" class="inline-flex items-center justify-center rounded-full p-1 hover:bg-taupe2"><X width={16} height={16} /></button>
        </div>
    {/if}
    {#if !monocle.authed}
        <span class="ml-auto flex shrink-0 items-center gap-3 text-sm text-grey3">
            <span class="hidden sm:inline">You're viewing an example text.</span>
        </span>
    {/if}
</header>
