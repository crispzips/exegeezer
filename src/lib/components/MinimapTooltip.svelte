<script>
	import { TurnRight } from '@boxicons/svelte';

	/**
	 * The lines of a minimap tooltip: a section's name preceded by its ancestors'
	 * names, one per line, outermost first. Each level below the first is tabbed in
	 * one step further and led by a turn-right icon; the last line (the section
	 * itself) is bold. A long name wraps within its own indent instead of clipping.
	 *
	 * @type {{ lines: string[] }}
	 */
	let { lines } = $props();
</script>

{#each lines as line, k}
	<div class="flex items-start gap-1" style="padding-left: {Math.max(k - 1, 0) * 14}px">
		{#if k > 0}<TurnRight width={14} height={14} class="mt-px shrink-0" />{/if}
		<span class="min-w-0 break-words {k === lines.length - 1 ? 'font-semibold' : ''}">{line}</span>
	</div>
{/each}
