/** The whole-text menu in the title bar: settings, duplicate, delete, wipe clean. */
export class WholeText {
    /** @type {{ id: string } | null} */
    settingsRequest = $state(null);

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;
    }

    openSettings = () => {
        this.settingsRequest = { id: /** @type {string} */ (this.monocle.doc.id) };
    };

    /** @param {{ title: string, authors: string[], publicized: boolean }} saved */
    onSettingsSaved = ({ title, authors, publicized }) => {
        const { doc } = this.monocle;
        doc.title = title;
        doc.authors = authors;
        doc.publicized = publicized;
    };

    /** Make an identical copy (COPYOF--<name>) and show it in place of the original. */
    duplicate = async () => {
        const { doc } = this.monocle;
        const id = doc.id;
        if (!id) return;
        try {
            await doc.queue; // let any save in flight finish first
            const res = await fetch(`/api/texts/${id}/duplicate`, { method: 'POST' });
            if (!res.ok) throw new Error(`${res.status}`);
            await doc.showSaved((await res.json()).id);
        } catch (err) {
            console.warn('Could not duplicate the text', err);
            alert('Could not duplicate the text.');
        }
    };

    /** The text in the active tab is gone (deleted): its tab closes. */
    unload = () => {
        const { tabs } = this.monocle;
        if (tabs.activeKey) tabs.remove(tabs.activeKey);
    };

    /** After a wipe: the same text stays loaded (title, authors, settings), with no content. */
    blank = () => {
        const { doc, seeding } = this.monocle;
        doc.items = [];
        doc.lastSaved = JSON.stringify([]); // so autosave sees nothing to save
        seeding.step = 'idle';
        doc.history.clear();
        doc.focusId = null;
        doc.startEditId = null;
    };

    /** @param {string} url @param {'DELETE' | 'POST'} method */
    call = async (url, method) => {
        await this.monocle.doc.queue; // let any save in flight finish first
        const res = await fetch(url, { method });
        if (!res.ok) throw new Error(res.status === 409 ? ((await res.json().catch(() => null))?.message ?? `${res.status}`) : `${res.status}`);
    };

    /** @param {'delete' | 'wipe'} kind */
    request = (kind) => {
        const { doc } = this.monocle;
        const id = doc.id;
        if (!id) return;
        const name = doc.title.trim() ? `"${doc.title}"` : 'this text';
        doc.deleteRequest =
            kind === 'delete'
                ? {
                      title: 'Delete this whole text?',
                      message: `This permanently deletes ${name}, its content and its settings. This cannot be undone.`,
                      confirm: 'Delete text',
                      run: () => this.run(`/api/texts/${id}`, 'DELETE', 'delete the text', this.unload)
                  }
                : {
                      title: 'Wipe this text clean?',
                      message: `This permanently erases all of the content of ${name}. The text itself and its settings stay, as a blank slate. This cannot be undone.`,
                      confirm: 'Wipe clean',
                      run: () => this.run(`/api/texts/${id}/wipe`, 'POST', 'wipe the text', this.blank)
                  };
    };

    /** @param {string} url @param {'DELETE' | 'POST'} method @param {string} what @param {() => void} after what the page shows once it has worked */
    run = async (url, method, what, after) => {
        try {
            await this.call(url, method);
        } catch (err) {
            console.warn(`Could not ${what}`, err);
            alert(err instanceof Error && /\s/.test(err.message) ? err.message : `Could not ${what}.`);
            return;
        }
        after();
    };
}
