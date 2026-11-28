<!--
    The Monocle: the main exegeezer page. What it holds and does lives in `#lib/monocle/` (one file per concern, joined by `Monocle`);
    its parts are drawn by `#lib/components/monocle/`.
-->
<script>
    import { Monocle } from '#lib/monocle/monocle.svelte.js';
    import TabStrip from '#lib/components/monocle/TabStrip.svelte';
    import TitleBar from '#lib/components/monocle/TitleBar.svelte';
    import BeginTree from '#lib/components/monocle/BeginTree.svelte';
    import MainViewer from '#lib/components/monocle/MainViewer.svelte';
    import ViewerMenu from '#lib/components/monocle/ViewerMenu.svelte';
    import LoadTextModal from '#lib/components/monocle/LoadTextModal.svelte';
    import RallySetup from '#lib/components/RallySetup.svelte';
    import BusyOverlay from '#lib/components/BusyOverlay.svelte';
    import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
    import NewTextDialog from '#lib/components/NewTextDialog.svelte';
    import TextSettingsModal from '#lib/components/TextSettingsModal.svelte';
    import TextHeadModal from '#lib/components/TextHeadModal.svelte';
    import NewItemChooser from '#lib/components/NewItemChooser.svelte';
    import EditModal from '#lib/components/EditModal.svelte';
    import MapModal from '#lib/components/MapModal.svelte';
    import OwnTextsDialog from '#lib/components/OwnTextsDialog.svelte';
    import OpenSourcesDialog from '#lib/components/OpenSourcesDialog.svelte';

    /** the layout's data: `user` is the signed-in user, or null (then the app shows the example text and nothing else works) */
    let { data } = $props();

    const monocle = new Monocle(() => data);
    const { doc, tabs, edits, load, settings, commenting, rally, whole } = monocle;
    const editing = $derived(settings.editing);
</script>

<!-- Main pane -->
<div class="flex h-screen bg-taupe1">
    <div class="flex min-w-0 flex-1 flex-col" bind:this={edits.mainPane}>
        {#if monocle.authed && tabs.list.length}
            <TabStrip {monocle} />
        {/if}
        <!-- there is no title until a text has been seeded -->
        {#if !doc.noText}
            <TitleBar {monocle} />
        {/if}
        <div class="relative min-h-0 flex-1">
            {#if doc.noText && monocle.authed && !doc.publicized && !(settings.view === 'rally' && rally.started)}
                <BeginTree {monocle} />
            {/if}
            <MainViewer {monocle} />
        </div>
    </div>

    <!-- Vertical menu column -->
    <ViewerMenu {monocle} />
</div>

<BusyOverlay label={load.busyLabel} />
{#if edits.chooser}
    <!-- the const keeps the props steady while the choice is closing (chooser is already null by then) -->
    {@const c = edits.chooser}
    <NewItemChooser
        rect={c.rect}
        first={edits.lastKind}
        levels={c.levels}
        level={c.level}
        oncancel={() => (edits.chooser = null)}
        onpick={(kind, level) => {
            const pick = edits.chooser?.pick;
            edits.chooser = null;
            pick?.(kind, level);
        }}
    />
{/if}
<RallySetup bind:open={rally.setupOpen} writing={editing} bind:size={settings.rallySize} bind:speed={settings.rallySpeed} onstart={rally.start} />
<ConfirmDialog bind:request={doc.deleteRequest} />
<NewTextDialog bind:request={doc.newTextRequest} />
<TextSettingsModal bind:request={whole.settingsRequest} onsaved={whole.refresh} />
<TextHeadModal bind:request={whole.headRequest} />
<MapModal bind:open={edits.mapOpen} writing={editing} onmove={editing ? edits.moveFromMap : undefined} onmatter={editing ? edits.setMatter : undefined} onundo={editing ? doc.undo : undefined} onredo={editing ? doc.redo : undefined} canundo={doc.history.canUndo} canredo={doc.history.canRedo} title={doc.title} paragraphs={editing ? doc.items : doc.shown} onnavigate={edits.goToSection} />
<OwnTextsDialog bind:open={load.ownTextsOpen} onchoose={load.onOwnTextChosen} />
<OpenSourcesDialog bind:open={load.openSourcesOpen} onchoose={load.onWebTextChosen} />
<EditModal bind:request={edits.editRequest} list={doc.items} onsave={edits.saveEdit} />

<LoadTextModal {monocle} />

<svelte:window
    onpointerdowncapture={(e) => commenting.pointerDown(e.target)}
    onclickcapture={commenting.clickAway}
    onclick={load.onWindowClick}
    onkeydown={(e) => {
        edits.onKeydown(e);
        commenting.onKeydown(e);
    }}
/>
