"use client";

import { authClient } from "@crm/auth/client";
import { SEND_SCOPES } from "@crm/auth/scopes";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

export function AllowGmailSending({ description }: { description: string }) {
	const [pending, setPending] = useState(false);

	const allow = async () => {
		setPending(true);
		const back = window.location.href;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...SEND_SCOPES],
			callbackURL: back,
			errorCallbackURL: back,
		});
		if (error) {
			setPending(false);
			toast.error(error.message ?? "Could not reach Google.");
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Allow sending from your Gmail</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					<Button size="sm" disabled={pending} onClick={() => void allow()}>
						{pending ? <Spinner /> : null}
						Allow sending
					</Button>
				</CardAction>
			</CardHeader>
		</Card>
	);
}
