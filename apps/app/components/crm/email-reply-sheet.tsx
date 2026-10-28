"use client";

import { Button } from "@crm/ui/components/button";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AllowGmailSending } from "@/components/allow-gmail-sending";
import { EmailThreadMessages } from "@/components/crm/email-thread-messages";
import {
	DetailSheet,
	DetailSheetBody,
	DetailSheetHeader,
	DetailSheetSection,
} from "@/components/detail-sheet";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type ThreadReply = RouterOutputs["todos"]["reply"];

const DRAFTING_POLL_MS = 5_000;

function DraftRequest({
	emailThreadId,
	hasDraft,
	drafting,
}: {
	emailThreadId: string;
	hasDraft: boolean;
	drafting: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const instructionsId = useId();
	const [instructions, setInstructions] = useState("");

	const request = useMutation(
		trpc.todos.requestReply.mutationOptions({
			onSuccess: async () => {
				setInstructions("");
				await cache.todos();
				toast.success(
					"The agent is writing the reply. It shows here in a minute.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (drafting) {
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-xs">
				<Spinner />
				The agent is writing a reply. It shows here when it is ready.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={instructionsId}>
				{hasDraft ? "Ask for a different reply" : "Ask the agent for a reply"}
			</Label>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					id={instructionsId}
					value={instructions}
					onChange={(event) => setInstructions(event.target.value)}
					placeholder="Optional: what to say, for example yes to Tuesday at 10"
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={request.isPending}
					onClick={() =>
						request.mutate({
							emailThreadId,
							instructions: instructions.trim() || undefined,
						})
					}
				>
					{request.isPending ? <Spinner /> : null}
					{hasDraft ? "Write it again" : "Draft a reply"}
				</Button>
			</div>
		</div>
	);
}

function ReplyEditor({
	reply,
	onSent,
}: {
	reply: ThreadReply;
	onSent: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const subjectId = useId();
	const bodyId = useId();
	const [subject, setSubject] = useState(reply.subject);
	const [body, setBody] = useState(reply.draft?.body ?? "");

	const send = useMutation(
		trpc.todos.sendReply.mutationOptions({
			onSuccess: async (sent) => {
				await cache.todos();
				toast.success(`Sent to ${sent.toEmail} from your Gmail.`);
				onSent();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const discard = useMutation(
		trpc.todos.discardReply.mutationOptions({
			onSuccess: async () => {
				setBody("");
				await cache.todos();
				toast.success("Draft discarded. Nothing was sent.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const busy = send.isPending || discard.isPending;

	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-xs">To {reply.toEmail}</p>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={subjectId}>Subject</Label>
				<Input
					id={subjectId}
					value={subject}
					onChange={(event) => setSubject(event.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={bodyId}>Reply</Label>
				<Textarea
					id={bodyId}
					value={body}
					rows={10}
					placeholder="Write your reply, or ask the agent for one below."
					onChange={(event) => setBody(event.target.value)}
				/>
				<span className="text-muted-foreground text-xs">
					Nothing is sent until you press Send. Your name is added at the end.
				</span>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					disabled={!reply.canSend || !subject.trim() || !body.trim() || busy}
					onClick={() =>
						send.mutate({
							emailThreadId: reply.emailThreadId,
							subject,
							body,
						})
					}
				>
					{send.isPending ? <Spinner /> : null}
					Send from my Gmail
				</Button>
				{reply.draft ? (
					<Button
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() =>
							discard.mutate({ emailThreadId: reply.emailThreadId })
						}
					>
						Discard draft
					</Button>
				) : null}
			</div>
		</div>
	);
}

function ReplyPanel({
	emailThreadId,
	onSent,
}: {
	emailThreadId: string;
	onSent: () => void;
}) {
	const trpc = useTRPC();
	const reply = useQuery({
		...trpc.todos.reply.queryOptions({ emailThreadId }),
		refetchInterval: (query) =>
			query.state.data?.drafting ? DRAFTING_POLL_MS : false,
	});

	if (reply.isPending) {
		return (
			<div className="flex justify-center py-6">
				<Spinner />
			</div>
		);
	}

	if (reply.isError) {
		return (
			<p className="text-muted-foreground text-xs">
				The reply did not load. {reply.error.message}
			</p>
		);
	}

	const data = reply.data;

	if (!data.toEmail) {
		return (
			<p className="text-muted-foreground text-xs">
				There is no message from them in this conversation to answer.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{data.canSend ? null : (
				<AllowGmailSending description="Replies go from your own Gmail, in the same conversation, so the client sees them as normal email. Google asks you once to allow sending. The CRM only sends when you press Send." />
			)}
			<ReplyEditor
				key={data.draft?.updatedAt ?? "no-draft"}
				reply={data}
				onSent={onSent}
			/>
			<DraftRequest
				emailThreadId={emailThreadId}
				hasDraft={data.draft !== null}
				drafting={data.drafting}
			/>
		</div>
	);
}

export function EmailReplySheet({
	emailThreadId,
	title,
	open,
	onOpenChange,
}: {
	emailThreadId: string;
	title: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<DetailSheet open={open} onOpenChange={onOpenChange} size="xl">
			<DetailSheetHeader
				title={title}
				description="The whole conversation, with your reply below it."
				onClose={() => onOpenChange(false)}
			/>
			<DetailSheetBody>
				<DetailSheetSection title="Conversation">
					{open ? <EmailThreadMessages threadId={emailThreadId} /> : null}
				</DetailSheetSection>
				<DetailSheetSection title="Your reply">
					{open ? (
						<ReplyPanel
							emailThreadId={emailThreadId}
							onSent={() => onOpenChange(false)}
						/>
					) : null}
				</DetailSheetSection>
			</DetailSheetBody>
		</DetailSheet>
	);
}
