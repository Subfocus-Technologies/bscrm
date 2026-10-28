"use client";

import Reply from "@carbon/icons-react/es/Reply";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useState } from "react";
import { EmailReplySheet } from "@/components/crm/email-reply-sheet";
import { EmailThreadMessages } from "@/components/crm/email-thread-messages";

export function EmailThreadEntry({
	threadId,
	subject,
	messageCount,
}: {
	threadId: string;
	subject: string;
	messageCount: number;
}) {
	const [replying, setReplying] = useState(false);

	return (
		<div className="flex flex-col gap-1">
			<Accordion type="single" collapsible>
				<AccordionItem value={threadId}>
					<AccordionTrigger variant="subtle">
						{messageCount === 1 ? "1 message" : `${messageCount} messages`}
					</AccordionTrigger>
					<AccordionContent>
						<EmailThreadMessages threadId={threadId} />
					</AccordionContent>
				</AccordionItem>
			</Accordion>
			<div>
				<Button size="xs" variant="ghost" onClick={() => setReplying(true)}>
					<Icon icon={Reply} data-icon="inline-start" />
					Reply
				</Button>
			</div>
			<EmailReplySheet
				emailThreadId={threadId}
				title={subject}
				open={replying}
				onOpenChange={setReplying}
			/>
		</div>
	);
}
