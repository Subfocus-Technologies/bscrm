"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function DeveloperFolder() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const folderId = useId();
	const [draft, setDraft] = useState("");

	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const saved = workspace.data?.developerFolder ?? "";

	useEffect(() => {
		setDraft(saved);
	}, [saved]);

	const save = useMutation(
		trpc.workspace.setDeveloperFolder.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success("Developer folder saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!workspace.data) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Developer</CardTitle>
				<CardDescription>
					Adds a Developer button to the side rail, for you only. It opens
					Claude Code on your computer with the page you are on.
				</CardDescription>

				<CardAction>
					<Button
						type="submit"
						form="developer-folder"
						disabled={save.isPending || draft.trim() === saved}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						Save
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<form
					id="developer-folder"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({ folder: draft });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={folderId}>Code folder</FieldLabel>
							<Input
								id={folderId}
								value={draft}
								placeholder="/Users/you/crm"
								disabled={save.isPending}
								onChange={(event) => setDraft(event.target.value)}
							/>
							<FieldDescription>
								The full path of the CRM's code on your computer. Leave it blank
								to remove the button.
							</FieldDescription>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
