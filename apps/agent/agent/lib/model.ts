import { alibaba } from "@ai-sdk/alibaba";
import { db } from "@crm/db";
import { readAgentModel } from "@crm/db/settings";

export interface ModelSelection {
	model: string;
	modelContextWindowTokens: number;
}

export interface DirectModelSelection {
	model: ReturnType<typeof alibaba>;
	modelContextWindowTokens: number;
}

// Qwen bills input past 256k tokens at a higher rate, so the window is set
// there to make eve compact before a turn crosses into that tier.
const QWEN_CONTEXT_WINDOW_TOKENS = 256_000;

/**
 * Our install calls Qwen on Alibaba directly instead of through the Vercel AI
 * Gateway that upstream assumes. Setting ALIBABA_API_KEY switches every agent
 * to it, and the model on the settings page is ignored while it is set,
 * because the ids listed there are gateway ids.
 *
 * Agents return this from "step.started": eve rejects a provider object from
 * "session.started", whose selection it stores, and a step selection wins
 * over the session's.
 */
export function directModel(): DirectModelSelection | null {
	if (!process.env.ALIBABA_API_KEY) return null;

	return {
		model: alibaba(process.env.QWEN_MODEL ?? "qwen3.6-plus"),
		modelContextWindowTokens: QWEN_CONTEXT_WINDOW_TOKENS,
	};
}

export async function selectedModel(): Promise<ModelSelection | null> {
	try {
		const setting = await readAgentModel(db);

		if (setting.isDefault) return null;

		return {
			model: setting.id,
			modelContextWindowTokens: setting.contextWindowTokens,
		};
	} catch (error) {
		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return null;
	}
}
