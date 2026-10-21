export type OutgoingEmail = {
	from: { name: string; email: string };
	to: string;
	subject: string;
	body: string;
	inReplyTo: string | null;
	references: string[];
};

function encodedWord(text: string): string {
	return /^[\x20-\x7e]*$/.test(text)
		? text
		: `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function angle(messageId: string): string {
	const bare = messageId.replace(/^<|>$/g, "");
	return `<${bare}>`;
}

function wrapBase64(text: string): string {
	return (
		Buffer.from(text, "utf8")
			.toString("base64")
			.match(/.{1,76}/g)
			?.join("\r\n") ?? ""
	);
}

export function composeRawEmail(email: OutgoingEmail): string {
	const headers = [
		`From: ${encodedWord(email.from.name)} <${email.from.email}>`,
		`To: ${email.to}`,
		`Subject: ${encodedWord(email.subject)}`,
		"MIME-Version: 1.0",
		'Content-Type: text/plain; charset="UTF-8"',
		"Content-Transfer-Encoding: base64",
		email.inReplyTo ? `In-Reply-To: ${angle(email.inReplyTo)}` : null,
		email.references.length > 0
			? `References: ${email.references.map(angle).join(" ")}`
			: null,
	].filter((line) => line !== null);

	const message = `${headers.join("\r\n")}\r\n\r\n${wrapBase64(email.body)}`;
	return Buffer.from(message, "utf8").toString("base64url");
}
