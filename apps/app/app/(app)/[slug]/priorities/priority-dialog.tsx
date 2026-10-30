"use client";

import { Button } from "@crm/ui/components/button";
import { DatePicker } from "@crm/ui/components/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { OwnerSelect } from "@/components/crm/owner-select";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Priority =
	RouterOutputs["priorities"]["week"]["columns"]["PRIORITY"]["items"][number];

export function PriorityDialog({
	open,
	onOpenChange,
	week,
	priority,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	week: string;
	priority?: Priority;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const titleId = useId();
	const deliverableId = useId();
	const ownerId = useId();
	const dueId = useId();
	const [title, setTitle] = useState(priority?.title ?? "");
	const [deliverable, setDeliverable] = useState(priority?.deliverable ?? "");
	const [owner, setOwner] = useState(priority?.owner?.id ?? null);
	const [due, setDue] = useState(priority?.dueAt?.slice(0, 10) ?? "");

	const saved = async (message: string) => {
		await cache.priorities();
		toast.success(message);
		onOpenChange(false);
		if (!priority) {
			setTitle("");
			setDeliverable("");
			setOwner(null);
			setDue("");
		}
	};
	const fail = (error: { message: string }) => toast.error(error.message);

	const create = useMutation(
		trpc.priorities.create.mutationOptions({
			onSuccess: () => saved("Priority added."),
			onError: fail,
		}),
	);
	const update = useMutation(
		trpc.priorities.update.mutationOptions({
			onSuccess: () => saved("Priority saved."),
			onError: fail,
		}),
	);
	const busy = create.isPending || update.isPending;

	const submit = () => {
		const fields = {
			title,
			deliverable: deliverable.trim() || null,
			ownerId: owner,
			dueDate: due || null,
		};
		if (priority) {
			update.mutate({ id: priority.id, ...fields });
		} else {
			create.mutate({ ...fields, week });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{priority ? "Edit priority" : "Add a priority"}
					</DialogTitle>
					<DialogDescription>
						Name what has to happen, what it produces and who owns it.
					</DialogDescription>
				</DialogHeader>

				<form
					id="priority-form"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={titleId}>Priority</FieldLabel>
							<Input
								id={titleId}
								value={title}
								autoFocus
								onChange={(event) => setTitle(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={deliverableId}>Deliverable</FieldLabel>
							<Textarea
								id={deliverableId}
								value={deliverable}
								rows={3}
								placeholder="What exists when this is finished"
								onChange={(event) => setDeliverable(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={ownerId}>Owner</FieldLabel>
							<OwnerSelect
								id={ownerId}
								value={owner}
								onValueChange={setOwner}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={dueId}>Due</FieldLabel>
							<DatePicker
								id={dueId}
								value={due}
								onChange={setDue}
								placeholder="No due date"
							/>
						</Field>
					</FieldGroup>
				</form>

				<DialogFooter>
					<Button
						type="submit"
						form="priority-form"
						disabled={!title.trim() || busy}
					>
						{busy ? <Spinner /> : null}
						{priority ? "Save" : "Add priority"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
