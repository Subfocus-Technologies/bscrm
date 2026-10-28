"use client";

import Email from "@carbon/icons-react/es/Email";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardPanel,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { AllowGmailSending } from "@/components/allow-gmail-sending";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Outreach = RouterOutputs["investors"]["outreachQueue"];
type OutreachEmail = Outreach["drafts"][number];

const DRAFTING_POLL_MS = 15_000;

function stepLabel(step: number): string {
	return step === 0 ? "First email" : `Follow-up ${step}`;
}

function DraftCard({
	email,
	canSend,
}: {
	email: OutreachEmail;
	canSend: boolean;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const subjectId = useId();
	const bodyId = useId();
	const addressId = useId();
	const [subject, setSubject] = useState(email.subject);
	const [body, setBody] = useState(email.body);
	const [address, setAddress] = useState("");

	const done = (message: string) => async () => {
		await cache.investors();
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);

	const send = useMutation(
		trpc.investors.sendEmail.mutationOptions({
			onSuccess: done(`Sent to ${email.investorName}.`),
			onError: fail,
		}),
	);
	const skip = useMutation(
		trpc.investors.skipEmail.mutationOptions({
			onSuccess: done("Set aside. Nothing was sent."),
			onError: fail,
		}),
	);
	const redraft = useMutation(
		trpc.investors.redraftEmail.mutationOptions({
			onSuccess: done("The agent is writing it again."),
			onError: fail,
		}),
	);
	const saveAddress = useMutation(
		trpc.investors.setAddress.mutationOptions({
			onSuccess: done("Email address saved."),
			onError: fail,
		}),
	);
	const busy =
		send.isPending ||
		skip.isPending ||
		redraft.isPending ||
		saveAddress.isPending;

	return (
		<li className="flex flex-col gap-3 px-4 py-4 md:px-5">
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="font-medium">{email.investorName}</span>
				{email.firm ? (
					<span className="text-muted-foreground">{email.firm}</span>
				) : null}
				<Badge variant="outline">{stepLabel(email.step)}</Badge>
				<span className="text-muted-foreground text-xs">
					{email.toEmail ? `To ${email.toEmail}` : "No email address yet"}
				</span>
			</div>

			{email.toEmail ? null : (
				<div className="flex flex-wrap items-end gap-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={addressId}>Their email address</Label>
						<Input
							id={addressId}
							type="email"
							value={address}
							onChange={(event) => setAddress(event.target.value)}
							placeholder="name@fund.com"
							className="w-full sm:w-72"
						/>
					</div>
					<Button
						size="sm"
						variant="outline"
						disabled={!address.trim() || busy}
						onClick={() =>
							saveAddress.mutate({
								investorId: email.investorId,
								email: address.trim(),
							})
						}
					>
						Save address
					</Button>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<Label htmlFor={subjectId}>Subject</Label>
				<Input
					id={subjectId}
					value={subject}
					onChange={(event) => setSubject(event.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={bodyId}>Email</Label>
				<Textarea
					id={bodyId}
					value={body}
					rows={8}
					onChange={(event) => setBody(event.target.value)}
				/>
				<span className="text-muted-foreground text-xs">
					Your name is added at the end when it is sent.
				</span>
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					disabled={
						!canSend ||
						!email.toEmail ||
						!subject.trim() ||
						!body.trim() ||
						busy
					}
					onClick={() => send.mutate({ id: email.id, subject, body })}
				>
					{send.isPending ? <Spinner /> : null}
					Send from my Gmail
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() => redraft.mutate({ id: email.id })}
				>
					Write it again
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={busy}
					onClick={() => skip.mutate({ id: email.id })}
				>
					Don't send
				</Button>
			</div>
		</li>
	);
}

function SentList({ sent }: { sent: OutreachEmail[] }) {
	if (sent.length === 0) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sent</CardTitle>
				<CardDescription>
					A reply moves the investor to Replied and stops their follow-ups.
					Follow-ups are drafted for your approval when nobody answers.
				</CardDescription>
			</CardHeader>
			<CardPanel size="content">
				<ul className="flex flex-col divide-y text-xs">
					{sent.map((email) => (
						<li
							key={email.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:px-5"
						>
							<span className="font-medium">{email.investorName}</span>
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								{email.subject}
							</span>
							<Badge variant="outline">{stepLabel(email.step)}</Badge>
							{email.repliedAt ? <Badge>Replied</Badge> : null}
							{email.sentAt ? (
								<span className="text-muted-foreground">
									<LocalRelativeTime date={email.sentAt} />
								</span>
							) : null}
						</li>
					))}
				</ul>
			</CardPanel>
		</Card>
	);
}

export function InvestorOutreach() {
	const trpc = useTRPC();
	const outreach = useQuery({
		...trpc.investors.outreachQueue.queryOptions(),
		refetchInterval: DRAFTING_POLL_MS,
	});

	if (outreach.isPending) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		);
	}

	if (outreach.isError) {
		return (
			<p className="text-muted-foreground text-sm">
				The outreach queue did not load. {outreach.error.message}
			</p>
		);
	}

	const data = outreach.data;

	return (
		<div className="flex flex-col gap-4 pb-8">
			{data.canSend ? null : (
				<AllowGmailSending description="Approved emails go from your own Gmail, so replies land in your inbox and the CRM sees them. Google asks you once to allow sending. The CRM only sends an email when you press Send." />
			)}

			<Card>
				<CardHeader>
					<CardTitle>Waiting for your approval</CardTitle>
					<CardDescription>
						The agent drafts a personal email for every approved investor with
						an email address. Edit anything, then send. Sent today:{" "}
						{data.sentToday} of {data.dailyLimit}.
					</CardDescription>
				</CardHeader>
				<CardPanel size="content">
					{data.drafts.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Icon icon={Email} />
								</EmptyMedia>
								<EmptyTitle>No drafts waiting</EmptyTitle>
								<EmptyDescription>
									Approve investors on the Pipeline tab. The agent writes a
									first email for each one that has an email address.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<ul className="flex flex-col divide-y">
							{data.drafts.map((email) => (
								<DraftCard
									key={email.id}
									email={email}
									canSend={data.canSend}
								/>
							))}
						</ul>
					)}
				</CardPanel>
			</Card>

			<SentList sent={data.sent} />
		</div>
	);
}
