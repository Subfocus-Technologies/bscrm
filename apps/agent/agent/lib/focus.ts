import { bumpCounter, COUNTERS } from "@crm/telemetry";
import { defineState } from "eve/context";

export const focus = defineState("crm.focus", () => ({
	contactId: null as string | null,
	companyId: null as string | null,
	sessionId: null as string | null,
	taskKind: null as string | null,
	fundraiseId: null as string | null,
	investorId: null as string | null,
	emailThreadId: null as string | null,
	calendarEventId: null as string | null,
	mailboxUserId: null as string | null,
	replyRequested: false,
	spent: 0,
	budget: 4,
	exhausted: false,
}));

export type CurrentFocus = {
	contactId: string | null;
	sessionId: string | null;
	taskKind: string | null;
};

export function currentFocus(): CurrentFocus {
	try {
		const state = focus.get();
		return {
			contactId: state.contactId,
			sessionId: state.sessionId,
			taskKind: state.taskKind,
		};
	} catch {
		return { contactId: null, sessionId: null, taskKind: null };
	}
}

export function focusOn(input: {
	contactId?: string | null;
	companyId?: string | null;
	sessionId?: string | null;
	taskKind?: string | null;
	fundraiseId?: string | null;
	investorId?: string | null;
	emailThreadId?: string | null;
	calendarEventId?: string | null;
	mailboxUserId?: string | null;
	replyRequested?: boolean;
}): void {
	focus.update((current) => ({
		...current,
		contactId: input.contactId ?? current.contactId,
		companyId: input.companyId ?? current.companyId,
		sessionId: input.sessionId ?? current.sessionId,
		taskKind: input.taskKind ?? current.taskKind,
		fundraiseId: input.fundraiseId ?? current.fundraiseId,
		investorId: input.investorId ?? current.investorId,
		emailThreadId: input.emailThreadId ?? current.emailThreadId,
		calendarEventId: input.calendarEventId ?? current.calendarEventId,
		mailboxUserId: input.mailboxUserId ?? current.mailboxUserId,
		replyRequested: input.replyRequested ?? current.replyRequested,
	}));
}

export type TodoFocus = {
	emailThreadId: string | null;
	calendarEventId: string | null;
	mailboxUserId: string | null;
	replyRequested: boolean;
};

export function todoFocus(): TodoFocus {
	try {
		const state = focus.get();
		return {
			emailThreadId: state.emailThreadId,
			calendarEventId: state.calendarEventId,
			mailboxUserId: state.mailboxUserId,
			replyRequested: state.replyRequested,
		};
	} catch {
		return {
			emailThreadId: null,
			calendarEventId: null,
			mailboxUserId: null,
			replyRequested: false,
		};
	}
}

export type InvestorFocus = {
	fundraiseId: string | null;
	investorId: string | null;
};

export function investorFocus(): InvestorFocus {
	try {
		const state = focus.get();
		return { fundraiseId: state.fundraiseId, investorId: state.investorId };
	} catch {
		return { fundraiseId: null, investorId: null };
	}
}

export function spend(units = 1): { ok: true } | { ok: false; reason: string } {
	const { spent, budget, exhausted } = focus.get();

	if (spent + units > budget) {
		if (!exhausted) {
			focus.update((current) => ({ ...current, exhausted: true }));
			void bumpCounter(COUNTERS.budgetExhausted);
		}

		return {
			ok: false,
			reason:
				`Research budget for this contact is spent (${spent}/${budget}). ` +
				"Write up what you already have, or schedule a recheck with a reason. Do not keep looking.",
		};
	}

	focus.update((current) => ({ ...current, spent: current.spent + units }));
	return { ok: true };
}

export function setBudget(budget: number): void {
	focus.update((current) => ({ ...current, budget, exhausted: false }));
}
