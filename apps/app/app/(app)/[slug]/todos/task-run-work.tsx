"use client";

import { Button } from "@crm/ui/components/button";
import { Markdown } from "@crm/ui/components/markdown";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DetailSheetSection } from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Run = RouterOutputs["taskRuns"]["get"];

const EDITOR_ROWS = 18;

export function TaskRunWork({ run }: { run: Run }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(run.deliverable ?? "");

	const save = useMutation(
		trpc.taskRuns.saveWork.mutationOptions({
			onSuccess: async () => {
				await cache.taskRuns();
				setEditing(false);
				toast.success("Saved.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const email = useMutation(
		trpc.taskRuns.addEmail.mutationOptions({
			onSuccess: async () => {
				await cache.taskRuns();
				toast.success(
					"Email added below. Check it, add who it goes to, then send.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const copy = async () => {
		await navigator.clipboard.writeText(run.deliverable ?? "");
		toast.success("Copied.");
	};
	const canEdit =
		run.status === "AWAITING_APPROVAL" || run.status === "FINISHED";

	return (
		<DetailSheetSection
			title="The work"
			action={
				editing ? null : (
					<div className="flex gap-1">
						<Button size="xs" variant="ghost" onClick={() => void copy()}>
							Copy
						</Button>
						{canEdit ? (
							<>
								<Button
									size="xs"
									variant="ghost"
									onClick={() => setEditing(true)}
								>
									Edit
								</Button>
								<Button
									size="xs"
									variant="ghost"
									disabled={email.isPending}
									onClick={() => email.mutate({ id: run.id })}
								>
									{email.isPending ? <Spinner /> : null}
									Turn into an email
								</Button>
							</>
						) : null}
					</div>
				)
			}
		>
			{editing ? (
				<div className="flex flex-col gap-2">
					<Textarea
						value={text}
						rows={EDITOR_ROWS}
						aria-label="The work"
						onChange={(event) => setText(event.target.value)}
					/>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							disabled={save.isPending || !text.trim()}
							onClick={() => save.mutate({ id: run.id, deliverable: text })}
						>
							{save.isPending ? <Spinner /> : null}
							Save
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={save.isPending}
							onClick={() => {
								setText(run.deliverable ?? "");
								setEditing(false);
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<Markdown>{run.deliverable ?? ""}</Markdown>
			)}
		</DetailSheetSection>
	);
}
