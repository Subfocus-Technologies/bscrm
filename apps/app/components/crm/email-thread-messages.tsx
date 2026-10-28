"use client";

import { Skeleton } from "@crm/ui/components/skeleton";
import { ThreadMessage } from "@crm/ui/components/thread-message";
import { useQuery } from "@tanstack/react-query";
import { LocalDateTime } from "@/components/local-date-time";
import { useTRPC } from "@/lib/trpc/client";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export function EmailThreadMessages({ threadId }: { threadId: string }) {
	const trpc = useTRPC();
	const thread = useQuery(trpc.google.thread.queryOptions({ threadId }));

	if (thread.isPending) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		);
	}

	if (thread.isError) {
		return (
			<p className="text-muted-foreground text-xs">{thread.error.message}</p>
		);
	}

	return (
		<div className="flex flex-col">
			{thread.data.messages.map((message) => (
				<ThreadMessage
					key={message.id}
					from={message.fromName ?? message.fromEmail}
					fromEmail={message.fromEmail}
					fromImageUrl={message.fromImageUrl}
					sentAt={
						<LocalDateTime date={message.sentAt} options={DATE_OPTIONS} />
					}
					direction={message.direction}
					body={message.body}
					action={
						message.mailboxUrl ? (
							<a
								href={message.mailboxUrl}
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground underline underline-offset-3 hover:text-foreground"
							>
								Open in {message.mailboxName}
							</a>
						) : null
					}
				/>
			))}
		</div>
	);
}
