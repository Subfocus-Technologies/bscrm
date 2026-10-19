import { afterAll, describe, expect, it } from "bun:test";
import { auth } from "@crm/auth";
import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { db } from "@crm/db";
import type { Request } from "express";
import { createBaseTrpcContext } from "../src/trpc/trpc.context";

const suffix = process.env.TEST_RUN_ID ?? "session-revocation-spec";
const userId = `revoked-${suffix}`;
const token = `revoked-session-${suffix}`;

async function signed(value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(process.env.BETTER_AUTH_SECRET ?? ""),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
	return encodeURIComponent(`${value}.${base64}`);
}

function cookiesFrom(setCookie: string | null): string[] {
	return (setCookie ?? "")
		.split(/,(?=\s*[\w.-]+=)/)
		.map((part) => part.split(";")[0]?.trim() ?? "")
		.filter(Boolean);
}

function requestWith(cookie: string): Request {
	return { headers: { cookie } } as unknown as Request;
}

afterAll(async () => {
	await db.session.deleteMany({ where: { userId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("a removed session", () => {
	it("stops working at once, even with the cached session cookie", async () => {
		await db.user.create({
			data: {
				id: userId,
				name: "Removed",
				email: `${userId}@example.test`,
				emailVerified: true,
			},
		});
		await db.session.create({
			data: {
				id: token,
				token,
				userId,
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			},
		});

		const tokenCookie = `${AUTH_COOKIE_PREFIX}.session_token=${await signed(token)}`;
		const first = await auth.api.getSession({
			headers: new Headers({ cookie: tokenCookie }),
			returnHeaders: true,
		});
		const cached = cookiesFrom(first.headers.get("set-cookie")).find((cookie) =>
			cookie.startsWith(`${AUTH_COOKIE_PREFIX}.session_data=`),
		);
		expect(cached).toBeDefined();
		const browser = [tokenCookie, cached].join("; ");

		const before = await createBaseTrpcContext(requestWith(browser));
		expect(before.session?.user.id).toBe(userId);

		await db.session.deleteMany({ where: { userId } });

		const after = await createBaseTrpcContext(requestWith(browser));
		expect(after.session).toBeNull();
	});
});
