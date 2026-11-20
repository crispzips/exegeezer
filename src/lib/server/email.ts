import { GMAIL_USER, GMAIL_APP_PASSWORD } from '$app/env/private';
import nodemailer from 'nodemailer';

const configured = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

const transport = configured
	? nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } })
	: null;

/** Send an email; with no Gmail credentials set, print it to the dev server console instead. */
export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
	if (!transport) {
		console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
		return;
	}
	try {
		await transport.sendMail({ from: `Exegeezer <${GMAIL_USER}>`, to, subject, text, html });
	} catch (e) {
		// don't lose the message (and its link) when sending fails
		console.log(`\n[email send failed: ${(e as Error).message}] To: ${to}\nSubject: ${subject}\n${text}\n`);
		throw e;
	}
}
