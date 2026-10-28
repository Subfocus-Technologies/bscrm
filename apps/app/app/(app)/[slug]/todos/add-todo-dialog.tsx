"use client";

import Add from "@carbon/icons-react/es/Add";
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
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	type PickedRecord,
	RecordPicker,
} from "@/components/crm/record-picker";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const DUE_TIME = "T09:00:00.000Z";

export function AddTodoDialog() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const titleId = useId();
	const dueId = useId();
	const notesId = useId();
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [due, setDue] = useState("");
	const [record, setRecord] = useState<PickedRecord | null>(null);
	const [notes, setNotes] = useState("");

	const reset = () => {
		setTitle("");
		setDue("");
		setRecord(null);
		setNotes("");
	};

	const add = useMutation(
		trpc.todos.add.mutationOptions({
			onSuccess: async () => {
				await cache.todos();
				toast.success("Added to your to-dos.");
				reset();
				setOpen(false);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)}>
				<Icon icon={Add} data-icon="inline-start" />
				Add a to-do
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add a to-do</DialogTitle>
						<DialogDescription>
							It goes on your list. Choose a client to put it on their record
							too.
						</DialogDescription>
					</DialogHeader>

					<form
						id="add-todo"
						onSubmit={(event) => {
							event.preventDefault();
							add.mutate({
								title,
								notes: notes.trim() || undefined,
								dueAt: due ? `${due}${DUE_TIME}` : null,
								contactId: record?.kind === "contact" ? record.id : undefined,
								companyId: record?.kind === "company" ? record.id : undefined,
							});
						}}
					>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={titleId}>What needs doing</FieldLabel>
								<Input
									id={titleId}
									value={title}
									autoFocus
									placeholder="Send Pradeep office options in Marylebone"
									onChange={(event) => setTitle(event.target.value)}
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
							<Field>
								<FieldLabel>Client</FieldLabel>
								<RecordPicker
									value={record}
									onValueChange={setRecord}
									placeholder="Optional: a contact or company"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={notesId}>Notes</FieldLabel>
								<Textarea
									id={notesId}
									value={notes}
									rows={3}
									onChange={(event) => setNotes(event.target.value)}
								/>
							</Field>
						</FieldGroup>
					</form>

					<DialogFooter>
						<Button
							type="submit"
							form="add-todo"
							disabled={!title.trim() || add.isPending}
						>
							{add.isPending ? <Spinner /> : null}
							Add to my to-dos
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
