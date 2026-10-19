"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { useBusinessFocus } from "@/lib/business-focus";
import { useTRPC } from "@/lib/trpc/client";

export type Section = "/" | "/companies" | "/contacts" | "/deals" | "/settings";

export function usePrefetchSection(): (section: string) => void {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const business = useBusinessFocus();

	return useCallback(
		(section: string) => {
			switch (section) {
				case "/":
					void queryClient.prefetchQuery(
						trpc.dashboard.summary.queryOptions({ scope: "me", business }),
					);
					return;
				case "/companies":
					void queryClient.prefetchQuery(
						trpc.companies.list.queryOptions({
							...companiesSearchParams.defaultInput(),
							business,
						}),
					);
					return;
				case "/contacts":
					void queryClient.prefetchQuery(
						trpc.contacts.list.queryOptions({
							...contactsSearchParams.defaultInput(),
							business,
						}),
					);
					return;
				case "/deals":
					void queryClient.prefetchQuery(
						trpc.deals.list.queryOptions({
							...dealsSearchParams.defaultInput(),
							business,
						}),
					);
					return;
				default:
					return;
			}
		},
		[trpc, queryClient, business],
	);
}
