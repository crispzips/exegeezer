<script>
	import { Computer } from '@boxicons/svelte';
	import SourceButton from '#lib/components/SourceButton.svelte';
	import { docxToText } from '#lib/utilities/docxToText.js';

	/** @type {HTMLInputElement | undefined} */
	let fileInput;

	/** @type {{ uploadedfiles?: { name: string, text: string }[], onloaded?: () => void }} */
	let { uploadedfiles = $bindable([]), onloaded } = $props();

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	async function onFilesChosen(e) {
		const input = e.currentTarget; // currentTarget is null after an await
		const chosen = Array.from(input.files ?? []);
		const loaded = await Promise.all(
			chosen.map(async (file) => ({
				name: file.name,
				// Word files are converted to text (headings become "#" lines)
				text: file.name.toLowerCase().endsWith('.docx')
					? await docxToText(file)
					: await file.text()
			}))
		);
		uploadedfiles = [...uploadedfiles, ...loaded];
		input.value = ''; // lets you pick the same file again later
		onloaded?.();
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".txt,.md,.xml,.docx,text/*"
	onchange={onFilesChosen}
	class="hidden"
/>

<SourceButton name="Browse Computer" onclick={() => fileInput?.click()}>
	<Computer width={40} height={40} />
</SourceButton>
