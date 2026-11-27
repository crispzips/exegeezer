<!-- The open text in whichever view is chosen, each wired to what the mode allows -->
<script>
    import { tip } from '#lib/utilities/menuTip.svelte.js';
    import { FlagChequered } from '@boxicons/svelte';
    import ParagraphViewer from '#lib/components/ParagraphViewer.svelte';
    import CascadingViewer from '#lib/components/CascadingViewer.svelte';
    import HierarchyViewer from '#lib/components/HierarchyViewer.svelte';
    import RallyViewer from '#lib/components/RallyViewer.svelte';
    import RallyWriter from '#lib/components/RallyWriter.svelte';
    import { ZOOMS } from '#lib/monocle/settings.svelte.js';

    /** @type {{ monocle: import('#lib/monocle/monocle.svelte.js').Monocle }} */
    let { monocle } = $props();
    const { doc, tabs, settings, appearance, edits, commenting, rally } = $derived(monocle);
    const authed = $derived(monocle.authed);
    const editing = $derived(settings.editing);
    /** a double-click writes, while reading */
    const onwrite = $derived(authed && !editing && !settings.commenting ? edits.writeAt : undefined);
    const oncomment = $derived(authed && settings.commenting ? commenting.commentAt : undefined);
    const onfocusitem = (/** @type {string} */ id) => (doc.focusId = id);
    const onstartedit = () => (doc.startEditId = null);
</script>

<!-- Text appearance (every view): the settings reach the views as CSS variables, which app.css turns into sizes and spacing -->
{#key tabs.activeKey}
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclickcapture={commenting.pickCapture} ondblclickcapture={commenting.pickCapture} onmousedowncapture={commenting.pickCapture} class="h-full {appearance.on ? 'appearance' : ''} {appearance.on && appearance.lineChanged ? 'ta-line' : ''} {appearance.on && appearance.paraChanged ? 'ta-para' : ''}" style={appearance.on ? appearance.style : undefined}>
{#if settings.view === 'linear'}
    <ParagraphViewer onleave={edits.leftBubble} {onwrite} comments={commenting.anchored} {oncomment} picked={commenting.shownMarks} onnewitem={editing ? edits.askNew : undefined} paragraphs={doc.shown} startEditId={doc.startEditId} {onstartedit} focusId={doc.focusId} {onfocusitem} matter={doc.matter} markdown={doc.markdown} commentsLeft={settings.commentsLeft} onflipcomments={() => (settings.commentsLeft = !settings.commentsLeft)} zoom={ZOOMS[settings.zoomStep]} empty="" synopsis ondelete={editing ? edits.requestDelete : undefined} onexpand={editing ? (r) => (edits.editRequest = r) : undefined} onmove={editing ? edits.moveByDrag : undefined} oninject={editing ? edits.injectRequest : undefined} onedit={editing ? edits.editParagraph : undefined} />
{:else if settings.view === 'rally' && settings.mode === 'commenting'}
    <!-- commenting isn't available in rally view yet: the view stays inactive and says so -->
    <div class="flex h-full items-center justify-center px-8 text-center text-grey3" role="status">
        <p class="max-w-sm">Commenting isn't available in Rally view yet. Switch to another view to comment.</p>
    </div>
{:else if settings.view === 'rally'}
    <!-- with no text there is nothing to pace, or to write into: only the Seed a text button shows -->
    {#if rally.started}
        {#if editing}
            <RallyWriter paragraphs={doc.shown} size={settings.rallySize} bind:speed={settings.rallySpeed} bind:playing={rally.playing} oninject={rally.injectLine} ondelete={edits.requestDelete} focusId={doc.focusId} {onfocusitem} />
        {:else}
            <RallyViewer paragraphs={doc.shown} size={settings.rallySize} bind:speed={settings.rallySpeed} bind:playing={rally.playing} focusId={doc.focusId} {onfocusitem} empty="" />
        {/if}
    {:else if !doc.noText}
        <!-- the rally has not started: an empty pane with the violet flag, which opens the setup -->
        <div class="flex h-full items-center justify-center">
            <button onclick={() => (rally.setupOpen = true)} aria-label="Rally on!" use:tip={'Rally on!'} data-tip-place="below" class="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-taupe1 hover:bg-accent/90"><FlagChequered class="text-taupe1!" width={28} height={28} /></button>
        </div>
    {/if}
{:else if settings.view === 'cascading'}
    <CascadingViewer ondelete={editing ? edits.requestDelete : undefined} onleave={edits.leftBubble} {onwrite} comments={commenting.anchored} {oncomment} picked={commenting.shownMarks} bind:this={edits.hierarchy} onrename={editing ? edits.renameSectionTitle : undefined} focusId={doc.focusId} {onfocusitem} exploded={settings.exploded} paragraphs={doc.shown} empty="" onmove={editing ? edits.moveByDrag : undefined} onadd={editing ? edits.addAtGap : undefined} onnewitem={editing ? edits.askNew : undefined} onedit={editing ? edits.editParagraph : undefined} />
{:else}
    <HierarchyViewer onleave={edits.leftBubble} {onwrite} comments={commenting.anchored} {oncomment} picked={commenting.shownMarks} onrename={editing ? edits.renameSectionTitle : undefined} onnewitem={editing ? edits.askNew : undefined} bind:this={edits.hierarchy} startEditId={doc.startEditId} {onstartedit} focusId={doc.focusId} {onfocusitem} paragraphs={doc.shown} matter={doc.matter} empty="" ondelete={editing ? edits.requestDelete : undefined} onexpand={editing ? (r) => (edits.editRequest = r) : undefined} onmove={editing ? edits.moveByDrag : undefined} oninject={editing ? edits.injectRequest : undefined} onedit={editing ? edits.editParagraph : undefined} />
{/if}
</div>
{/key}
