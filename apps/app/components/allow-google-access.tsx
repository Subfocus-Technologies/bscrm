"use client";

import { authClient } from "@crm/auth/client";
import { ACTION_SCOPES } from "@crm/auth/scopes";
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

export function AllowGoogleAccess({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	const [pending, setPending] = useState(false);

	const allow = async () => {
		setPending(true);
		const back = window.location.href;
		const { error } = await authClient.linkSocial({
			provider: "google",
			scopes: [...ACTION_SCOPES],
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
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					<Button size="sm" disabled={pending} onClick={() => void allow()}>
						{pending ? <Spinner /> : null}
						Allow
					</Button>
				</CardAction>
			</CardHeader>
		</Card>
	);
}
