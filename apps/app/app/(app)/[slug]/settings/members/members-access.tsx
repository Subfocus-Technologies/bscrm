"use client";

import Add from "@carbon/icons-react/es/Add";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type InviteRole = RouterOutputs["workspace"]["invites"][number]["role"];

const INVITE_ROLE_LABEL = {
	member: "Member",
	admin: "Admin",
} satisfies Record<InviteRole, string>;

export type RemovableMember = { id: string; name: string; email: string };

function AddMemberForm({ onDone }: { onDone: () => void }) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const emailId = useId();
	const roleId = useId();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<InviteRole>("member");

	const add = useMutation(
		trpc.workspace.addMember.mutationOptions({
			onSuccess: async (invite) => {
				await cache.workspace();
				toast.success(
					`${invite.email} can now sign in with Google and join the CRM.`,
				);
				onDone();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!email.trim() || add.isPending) return;
		add.mutate({ email: email.trim(), role });
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Add a member</DialogTitle>
				<DialogDescription>
					They sign in with their Google account and join straight away. No
					email is sent; tell them the CRM address yourself.
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={emailId}>Email</Label>
				<Input
					id={emailId}
					type="email"
					autoFocus
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="name@subfocustech.co.uk"
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={roleId}>Role</Label>
				<Select
					value={role}
					onValueChange={(next) => setRole(next as InviteRole)}
				>
					<SelectTrigger id={roleId}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.keys(INVITE_ROLE_LABEL) as InviteRole[]).map((option) => (
							<SelectItem key={option} value={option}>
								{INVITE_ROLE_LABEL[option]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button type="submit" disabled={!email.trim() || add.isPending}>
					{add.isPending ? <Spinner /> : null}
					Add member
				</Button>
			</DialogFooter>
		</form>
	);
}

function PendingInvites() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const invites = useQuery(trpc.workspace.invites.queryOptions());
	const cancel = useMutation(
		trpc.workspace.cancelInvite.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success("Invite cancelled.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const rows = invites.data ?? [];

	if (invites.isError) {
		return (
			<p className="text-muted-foreground text-xs">The invites did not load.</p>
		);
	}
	if (rows.length === 0) return null;

	return (
		<div className="flex flex-col gap-1 rounded-lg border p-3 text-xs">
			<span className="font-medium">Invited, not signed in yet</span>
			<ul className="flex flex-col divide-y">
				{rows.map((invite) => (
					<li key={invite.email} className="flex items-center gap-3 py-1.5">
						<span className="min-w-0 flex-1 truncate">{invite.email}</span>
						<span className="text-muted-foreground">
							{INVITE_ROLE_LABEL[invite.role]}
						</span>
						<span className="hidden text-muted-foreground sm:inline">
							<LocalRelativeTime date={invite.invitedAt} />
						</span>
						<Button
							size="xs"
							variant="ghost"
							disabled={cancel.isPending}
							onClick={() => cancel.mutate({ email: invite.email })}
						>
							Cancel invite
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}

export function MembersAccess() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const [adding, setAdding] = useState(false);

	if (!workspace.data?.canChangeRoles) return null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-end">
				<Button onClick={() => setAdding(true)}>
					<Icon icon={Add} data-icon="inline-start" />
					Add member
				</Button>
			</div>
			<PendingInvites />
			<Dialog open={adding} onOpenChange={setAdding}>
				<DialogContent>
					{adding ? <AddMemberForm onDone={() => setAdding(false)} /> : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

export function RemoveMemberDialog({
	member,
	onClose,
}: {
	member: RemovableMember | null;
	onClose: () => void;
}) {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const remove = useMutation(
		trpc.workspace.removeMember.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success(`${member?.name ?? "They"} no longer has access.`);
				onClose();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<AlertDialog
			open={member !== null}
			onOpenChange={(open) => !open && onClose()}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove {member?.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						{member?.email} is signed out at once and cannot sign back in. Their
						API keys stop working and their mailbox and calendar stop syncing.
						Their contacts, companies and deals stay in the CRM. You can add
						them again later.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={remove.isPending}
						onClick={(event) => {
							event.preventDefault();
							if (member) remove.mutate({ memberId: member.id });
						}}
					>
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
