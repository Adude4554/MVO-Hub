/**
 * Launch-argument parsing — the TypeScript mirror of
 * `src-tauri/src/games/launch_args.rs`.
 *
 * The Rust side is authoritative: it validates again before a process is
 * spawned. This copy exists so the UI can reject bad input instantly and show
 * live token previews, and it must stay behaviourally identical. Any change here
 * needs the matching change in Rust, and vice versa.
 */

export interface ParsedArgs {
  args: string[];
  errors: string[];
}

/** Mirrors `ParsedArgs::is_valid` on the Rust side. */
export function isValidArgs(parsed: ParsedArgs): boolean {
  return parsed.errors.length === 0;
}

export const MAX_ARGS_LEN = 1024;

/** Characters that enable shell injection on Windows. */
const FORBIDDEN_CHARS = ['&', '|', ';', '$', '`', '(', ')', '{', '}', '[', ']', '!', '^', '~', '\n', '\r'];

/** Parse and validate a launch-argument string. */
export function parseLaunchArgs(input: string): ParsedArgs {
  const result: ParsedArgs = { args: [], errors: [] };
  const trimmed = input.trim();

  if (trimmed === '') return result;

  if (trimmed.length > MAX_ARGS_LEN) {
    result.errors.push(`Launch arguments are too long (max ${MAX_ARGS_LEN} characters)`);
    return result;
  }

  if (trimmed.startsWith('<') || trimmed.startsWith('>')) {
    result.errors.push('Redirection (< or >) is not allowed in launch arguments');
    return result;
  }

  for (const ch of trimmed) {
    if (ch === '\0' || (isControl(ch) && ch !== '\t')) {
      result.errors.push('Control characters are not allowed in launch arguments');
      return result;
    }
    if (FORBIDDEN_CHARS.includes(ch)) {
      result.errors.push(`Character '${ch}' is not allowed in launch arguments`);
      return result;
    }
    if (ch === '%') {
      result.errors.push("Character '%' is not allowed in launch arguments");
      return result;
    }
  }

  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasToken = false;

  for (const ch of trimmed) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
    } else if (/\s/.test(ch) && !inQuotes) {
      if (hasToken) {
        args.push(current);
        current = '';
        hasToken = false;
      }
    } else {
      current += ch;
      hasToken = true;
    }
  }

  if (inQuotes) {
    result.errors.push('Unbalanced quotes in launch arguments');
    return result;
  }
  if (hasToken) args.push(current);

  result.args = args;
  return result;
}

/** Convenience: args, or the joined error text. */
export function sanitizeLaunchArgs(input: string): string[] {
  const parsed = parseLaunchArgs(input);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join('; '));
  return parsed.args;
}

/** Render args back to a display string, re-quoting anything with spaces. */
export function formatLaunchArgs(args: string[]): string {
  return args
    .map(a => {
      if (a === '') return '""';
      return /\s/.test(a) ? `"${a}"` : a;
    })
    .join(' ');
}

/** Matches Rust's `char::is_control` closely enough for user-typed input. */
function isControl(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x7f) return true;
  return code <= 0x1f;
}
