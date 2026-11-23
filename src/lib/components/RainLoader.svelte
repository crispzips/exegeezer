<script>
	/**
	 * A loading indicator: Boxicons' "cloud-rain-wind-alt" (basic, regular), with its rain falling along the slant of the streaks.
	 * The shapes are the icon's own; the rain is drawn twice, one copy a stride higher, and both slide one stride down and
	 * to the left on a loop, so it never seems to restart. A clip keeps the rain below the cloud and inside the icon.
	 * Honours "reduce motion": the icon then holds still.
	 * @type {{ size?: number }}
	 */
	let { size = 64 } = $props();

	const RAIN = [
		'M9.28 16 5.85 22 8.15 22 11.58 16 9.28 16z',
		'M14.99 22 17.29 22 20.72 16 18.42 16 14.99 22z',
		'M4.71 16 2.99 19 5.29 19 7.01 16 4.71 16z',
		'M1.28 22 3.58 22 4.72 20 2.42 20 1.28 22z',
		'M13.85 16 12.13 19 14.44 19 16.15 16 13.85 16z',
		'M10.42 22 12.72 22 13.87 20 11.56 20 10.42 22z'
	];
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
	<defs>
		<clipPath id="rain-loader-clip"><rect x="0" y="16" width="24" height="6" /></clipPath>
	</defs>
	<path
		d="m19.38,7.25c-.59-3-3.26-5.25-6.38-5.25-2.04,0-3.92.94-5.15,2.54-.21-.03-.4-.04-.6-.04-2.9,0-5.25,2.36-5.25,5.25s2.35,5.25,5.25,5.25h10.75c2.21,0,4-1.79,4-4,0-1.71-1.07-3.18-2.62-3.75Zm-1.38,5.75H7.25c-1.79,0-3.25-1.46-3.25-3.25s1.46-3.25,3.25-3.25c.24,0,.5.04.81.12l.72.18.39-.63c.83-1.36,2.26-2.17,3.84-2.17,2.32,0,4.29,1.81,4.48,4.13l.06.78.77.12c.97.16,1.68.98,1.68,1.96,0,1.1-.9,2-2,2Z"
	/>
	<g clip-path="url(#rain-loader-clip)">
		<g class="rain">
			{#each RAIN as d (d)}<path {d} />{/each}
			<g transform="translate(3.43 -6)">
				{#each RAIN as d (d)}<path {d} />{/each}
			</g>
		</g>
	</g>
</svg>

<style>
	.rain {
		animation: fall 0.9s linear infinite;
	}
	@keyframes fall {
		to {
			transform: translate(-3.43px, 6px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rain {
			animation: none;
		}
	}
</style>
