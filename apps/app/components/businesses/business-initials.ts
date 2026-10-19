export function businessInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const [first, second] = words;

	if (!first) return "?";
	if (!second) return first.slice(0, 2).toUpperCase();

	return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}
