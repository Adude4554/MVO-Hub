//! Launch-argument sanitisation.
//!
//! Custom launch arguments are user-editable text that ends up in a process
//! spawn, so they are treated as untrusted input. The rules here are the
//! contract the UI validates against (`src/lib/launchArgs.ts` mirrors them):
//!
//! * A leading `<` / `>` is a *redirect* and is rejected — the shell would
//!   write to an arbitrary file.
//! * NUL and other control characters are rejected (argument smuggling).
//! * Shell metacharacters (`& | ; $ ` ( ) { } [ ] ! ^ % ~`) are rejected so a
//!   future `cmd /c` path cannot be injected through.
//! * Empty and whitespace-only input yields no arguments at all.
//!
//! Arguments that merely *contain* a dash, `=`, `:`, `/` or `\` are fine — those
//! are ordinary path/flag characters.

use serde::{Deserialize, Serialize};

/// Upper bound on total argument text, so a pasted blob cannot blow up a
/// command line or the settings store.
pub const MAX_ARGS_LEN: usize = 1024;

/// Characters that enable shell injection on Windows.
const FORBIDDEN_CHARS: &[char] = &[
    '&', '|', ';', '$', '`', '(', ')', '{', '}', '[', ']', '!', '^', '~', '\n', '\r',
];

/// A single parsed token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchArg {
    /// The argument as it will be passed to the process.
    pub value: String,
    /// True when the user wrapped it in double quotes.
    pub quoted: bool,
}

/// Outcome of parsing a launch-argument string.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedArgs {
    pub args: Vec<String>,
    pub errors: Vec<String>,
}

impl ParsedArgs {
    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }
}

/// Parse and validate a launch-argument string.
///
/// Quoted segments are kept as single arguments (so `-name "My Player"` yields
/// two args), which matters for games that take player names or paths with
/// spaces. Errors are collected rather than short-circuiting so the UI can
/// highlight everything wrong at once.
pub fn parse_launch_args(input: &str) -> ParsedArgs {
    let mut result = ParsedArgs::default();
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return result;
    }

    if trimmed.chars().count() > MAX_ARGS_LEN {
        result.errors.push(format!(
            "Launch arguments are too long (max {} characters)",
            MAX_ARGS_LEN
        ));
        return result;
    }

    if trimmed.starts_with('<') || trimmed.starts_with('>') {
        result.errors
            .push("Redirection (< or >) is not allowed in launch arguments".into());
        return result;
    }

    for ch in trimmed.chars() {
        if ch == '\0' || (ch.is_control() && ch != '\t') {
            result
                .errors
                .push("Control characters are not allowed in launch arguments".into());
            return result;
        }
        if FORBIDDEN_CHARS.contains(&ch) {
            result.errors.push(format!(
                "Character '{}' is not allowed in launch arguments",
                ch
            ));
            return result;
        }
        if ch == '%' {
            // `%VAR%` would be expanded by cmd.exe.
            result.errors
                .push("Character '%' is not allowed in launch arguments".into());
            return result;
        }
    }

    // Tokenise, honouring double quotes.
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;

    for ch in trimmed.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    args.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }

    if in_quotes {
        result.errors.push("Unbalanced quotes in launch arguments".into());
        return result;
    }
    if has_token {
        args.push(current);
    }

    result.args = args;
    result
}

/// Convenience: validate and return args, or the first human-readable error.
pub fn sanitize_launch_args(input: &str) -> Result<Vec<String>, String> {
    let parsed = parse_launch_args(input);
    if parsed.is_valid() {
        Ok(parsed.args)
    } else {
        Err(parsed.errors.join("; "))
    }
}

/// Render args back to a display string, re-quoting anything with spaces.
pub fn format_launch_args(args: &[String]) -> String {
    args.iter()
        .map(|a| {
            if a.is_empty() {
                "\"\"".to_string()
            } else if a.contains(char::is_whitespace) {
                format!("\"{}\"", a)
            } else {
                a.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_yields_no_args() {
        assert_eq!(parse_launch_args(""), ParsedArgs::default());
        assert_eq!(parse_launch_args("   ").args, Vec::<String>::new());
        assert!(parse_launch_args("   ").is_valid());
    }

    #[test]
    fn splits_on_whitespace() {
        let parsed = parse_launch_args("-windowed -novid -high");
        assert!(parsed.is_valid());
        assert_eq!(parsed.args, vec!["-windowed", "-novid", "-high"]);
    }

    #[test]
    fn collapsed_whitespace_is_ignored() {
        let parsed = parse_launch_args("  -a    -b  ");
        assert_eq!(parsed.args, vec!["-a", "-b"]);
    }

    #[test]
    fn preserves_quoted_segments() {
        let parsed = parse_launch_args("-name \"My Player\" -lang en");
        assert!(parsed.is_valid());
        assert_eq!(parsed.args, vec!["-name", "My Player", "-lang", "en"]);
    }

    #[test]
    fn quoted_empty_string_is_preserved() {
        let parsed = parse_launch_args("-tag \"\"");
        assert!(parsed.is_valid());
        assert_eq!(parsed.args, vec!["-tag", ""]);
    }

    #[test]
    fn unbalanced_quotes_are_rejected() {
        let parsed = parse_launch_args("-name \"unterminated");
        assert!(!parsed.is_valid());
        assert!(parsed.errors[0].contains("Unbalanced quotes"));
    }

    #[test]
    fn rejects_output_redirection() {
        for bad in ["> out.txt", ">out.txt", "< input.txt"] {
            let parsed = parse_launch_args(bad);
            assert!(!parsed.is_valid(), "{} should be rejected", bad);
            assert!(parsed.errors[0].contains("Redirection"), "{}", parsed.errors[0]);
        }
    }

    #[test]
    fn rejects_shell_metacharacters() {
        for bad in [
            "-a & calc",
            "-a | whoami",
            "-a; calc",
            "-a $(id)",
            "-a `id`",
            "-a ^& calc",
            "-a %USERNAME%",
            "-a ~",
            "-a {x}",
            "-a [x]",
            "-a (x)",
        ] {
            let parsed = parse_launch_args(bad);
            assert!(!parsed.is_valid(), "{} should be rejected", bad);
        }
    }

    #[test]
    fn rejects_control_characters() {
        let parsed = parse_launch_args("-a\u{0}-b");
        assert!(!parsed.is_valid());
        assert!(parsed.errors[0].contains("Control characters"));

        let parsed = parse_launch_args("-a\u{1b}[31m");
        assert!(!parsed.is_valid());
    }

    #[test]
    fn allows_ordinary_paths_and_flags() {
        // These contain characters that are *not* forbidden. The embedded space
        // splits the token — callers quote paths that contain spaces.
        let parsed = parse_launch_args("-level=C:/Games/My Game/level1 -log:\\tmp\\out");
        assert!(parsed.is_valid(), "{:?}", parsed.errors);
        assert_eq!(
            parsed.args,
            vec!["-level=C:/Games/My", "Game/level1", "-log:\\tmp\\out"]
        );
    }

    #[test]
    fn quoted_paths_with_spaces_stay_single_arguments() {
        let parsed = parse_launch_args("\"-level=C:/Games/My Game/level1\"");
        assert!(parsed.is_valid());
        assert_eq!(parsed.args, vec!["-level=C:/Games/My Game/level1"]);
    }

    #[test]
    fn rejects_overlong_input() {
        let long = "-x ".repeat(MAX_ARGS_LEN);
        let parsed = parse_launch_args(&long);
        assert!(!parsed.is_valid());
        assert!(parsed.errors[0].contains("too long"));
    }

    #[test]
    fn accepts_input_at_the_limit() {
        let exact = "a".repeat(MAX_ARGS_LEN);
        assert!(parse_launch_args(&exact).is_valid());
    }

    #[test]
    fn sanitize_returns_args_or_joined_errors() {
        assert_eq!(sanitize_launch_args("-windowed").unwrap(), vec!["-windowed"]);
        let err = sanitize_launch_args("-a & calc").unwrap_err();
        assert!(err.contains("not allowed"));
    }

    #[test]
    fn formatting_round_trips_quoted_args() {
        let args = vec!["-name".to_string(), "My Player".to_string()];
        let formatted = format_launch_args(&args);
        assert_eq!(formatted, "-name \"My Player\"");
        assert_eq!(parse_launch_args(&formatted).args, args);
    }

    #[test]
    fn formatting_preserves_empty_args() {
        let args = vec!["-tag".to_string(), String::new()];
        let formatted = format_launch_args(&args);
        assert_eq!(formatted, "-tag \"\"");
        assert_eq!(parse_launch_args(&formatted).args, args);
    }

    #[test]
    fn parses_into_structured_args() {
        let parsed = parse_launch_args("-fullscreen -res 1920x1080");
        assert!(parsed.is_valid());
        assert_eq!(parsed.args, vec!["-fullscreen", "-res", "1920x1080"]);
        assert!(parsed.errors.is_empty());
    }
}

