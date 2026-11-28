const PERMANENT = ['published', 'recanted', 'burned'];

/** The whole-text menu in the title bar: about, settings, duplicate, burn, wipe clean and repressing. */
export class WholeText {
    /** @type {{ id: string } | null} */
    settingsRequest = $state(null);
    /** the text whose head is showing @type {{ id: string } | null} */
    headRequest = $state(null);

    /** @param {import('./monocle.svelte.js').Monocle} monocle */
    constructor(monocle) {
        this.monocle = monocle;
    }

    openSettings = () => {
        this.settingsRequest = { id: /** @type {string} */ (this.monocle.doc.id) };
    };

    openHead = () => {
        this.headRequest = { id: /** @type {string} */ (this.monocle.doc.id) };
    };

    /** whether the open text is published, recanted or burned, and public: it can't be deleted or wiped */
    get permanent() {
        const { productionStatus, visibility } = this.monocle.doc.standing;
        return visibility === 'public' && PERMANENT.includes(productionStatus);
    }

    /** Read the open text again after something about it has changed; if it may no longer be read, its tab closes. */
    refresh = async () => {
        const { doc, tabs } = this.monocle;
        const id = doc.id;
        if (!id) return;
        doc.save(); // (does nothing for a text that can't be changed)
        await doc.queue;
        // its commentaries follow it: tabs holding them are read again
        for (const t of tabs.list) if (t.textId !== id) tabs.deload(t.textId ?? undefined);
        try {
            await doc.showSaved(id);
        } catch (err) {
            if (/** @type {any} */ (err).status === 404) this.unload();
            else console.warn('Could not reload the text', err);
        }
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

    /** The text in the active tab is gone (burned): its tab closes. */
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

    /**
     * Ask the server for something others may have a say in.
     * @param {string} url @param {'DELETE' | 'POST'} method @param {string} what @param {() => void | Promise<void>} after
     * what the page shows once it has been done @param {unknown} [body]
     */
    run = async (url, method, what, after, body) => {
        const { doc, tabs } = this.monocle;
        let answer;
        try {
            await doc.queue; // let any save in flight finish first
            const res = await fetch(url, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
            answer = await res.json().catch(() => null);
            if (!res.ok) throw new Error(answer?.message ?? `Could not ${what}.`);
        } catch (err) {
            console.warn(`Could not ${what}`, err);
            alert(err instanceof Error ? err.message : `Could not ${what}.`);
            return;
        }
        // it waits for others: nothing on the page changes yet
        if (answer?.done === false) return tabs.notify(answer.message);
        await after();
    };

    /** @param {'delete' | 'wipe'} kind */
    request = (kind) => {
        const { doc } = this.monocle;
        const id = doc.id;
        if (!id) return;
        const name = doc.title.trim() ? `"${doc.title}"` : 'this text';
        const proposing = doc.standing.access === 'editor';
        doc.deleteRequest =
            kind === 'delete'
                ? {
                      title: proposing ? 'Propose burning this text?' : 'Burn this whole text?',
                      message: `Burning ${name} destroys everything of it: its words, its details and every commentary on it. This cannot be undone.${proposing ? ' It happens only if its authors agree.' : ''}`,
                      confirm: proposing ? 'Propose burning' : 'Burn text',
                      run: () => this.run(`/api/texts/${id}`, 'DELETE', 'burn the text', this.unload)
                  }
                : {
                      title: 'Wipe this text clean?',
                      message: `This permanently erases all of the content of ${name}. The text itself and its settings stay, as a blank slate. This cannot be undone.`,
                      confirm: 'Wipe clean',
                      run: () => this.run(`/api/texts/${id}/wipe`, 'POST', 'wipe the text', this.blank)
                  };
    };

    /**
     * Recant, derecant, burn, renounce or undo a renunciation, after confirmation.
     * @param {'recant' | 'derecant' | 'burn' | 'renounce' | 'unrenounce'} action
     * @param {{ title: string, me: { access: string, coAuthored: boolean } }} head
     * @param {{ id: string, name: string }} [persona] whose renunciation it is
     * @param {boolean} [extreme]
     */
    repress = (action, head, persona, extreme = false) => {
        const { doc } = this.monocle;
        const id = doc.id;
        if (!id) return;
        const name = `"${head.title}"`;
        const others = head.me.access === 'editor' ? ' It happens only if every author agrees.' : head.me.coAuthored ? ' It happens once every author agrees.' : '';
        const as = persona?.name ?? '';
        const words = {
            recant: ['Recant this text?', `The words of ${name} will be hidden from the public. Its authors and editors still see them, its details and commentaries stay public, and it can be derecanted.${others}`, 'Recant'],
            derecant: ['Derecant this text?', `${name} will be published again, its words shown to the public.${others}`, 'Derecant'],
            burn: ['Burn this text?', `The words of ${name}, with its headings and paragraph titles and descriptions, will be deleted forever. Its details and commentaries stay public. This cannot be undone.${others}`, 'Burn'],
            renounce: extreme
                ? ['Renounce with extreme prejudice?', `${as} will stop being an author of ${name}, for good: this can never be undone. The renunciation stays on record.`, 'Renounce for good']
                : ['Renounce authorship?', `${as} will stop being an author of ${name}. The renunciation stays on record, and you can undo it.`, 'Renounce'],
            unrenounce: ['Undo this renunciation?', `${as} will be an author of ${name} again.`, 'Undo renunciation']
        };
        const [title, message, confirm] = words[action];
        doc.deleteRequest = {
            title,
            message,
            confirm,
            run: () => this.run(`/api/texts/${id}/repress`, 'POST', 'do that', this.refresh, { action, ...(persona ? { personaId: persona.id } : {}), ...(action === 'renounce' ? { extreme } : {}) })
        };
    };
}
