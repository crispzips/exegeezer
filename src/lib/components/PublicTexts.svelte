<script>
	import { Scroll, MessageCircleReply } from '@boxicons/svelte';

	/** The public texts listed on a persona's or user's page, palimpsests included. @type {{ texts: { id: string, title: string, status: string, commentary: boolean }[] }} */
	let { texts } = $props();
</script>

<section aria-label="Public texts">
	<h2 class="mb-2 text-sm font-medium text-dark">Public texts</h2>
	{#if texts.length}
		<ul class="divide-y divide-taupe3 text-sm">
			{#each texts as t (t.id)}
				{@const Icon = t.commentary ? MessageCircleReply : Scroll}
				<li>
					<a href="/exejeeze?text={t.id}" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-taupe2">
						<Icon width={18} height={18} class="shrink-0" />
						<span class="min-w-0 flex-1 truncate text-dark">{t.title}</span>
						<span class="shrink-0 text-xs text-grey3">{t.status}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-grey3">None yet.</p>
	{/if}
</section>
