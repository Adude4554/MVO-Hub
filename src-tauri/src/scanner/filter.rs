use std::path::Path;

const PROTECTED_DIRS: &[&str] = &[
    "C:\\Windows",
    "C:\\Windows\\System32",
    "C:\\Windows\\SysWOW64",
    "C:\\ProgramData\\Microsoft",
    "C:\\ProgramData\\Package Cache",
];

const SYSTEM_EXECUTABLES: &[&str] = &[
    "uninstall.exe", "uninstaller.exe", "setup.exe", "install.exe",
    "installershell.exe", "installer.exe", "updater.exe", "update.exe",
    "patch.exe", "crashreporter.exe", "crashhandler.exe", "repair.exe",
    "cleanup.exe", "unins000.exe", "unins001.exe", "unins002.exe",
    "is uninstall.exe", "junk.exe", "temp.exe", "launcher.exe",
    "helper.exe", "service.exe", "agent.exe", "config.exe",
    "settings.exe", "preferences.exe", "loader.exe", "bootstrapper.exe",
    "prereq.exe", "redist.exe", "oalinst.exe", "dxsetup.exe",
    "vcrun.exe", "dotnetfx.exe", "ndp.exe",
];

const NON_GAME_EXECUTABLES: &[&str] = &[
    "conhost.exe", "csrss.exe", "dwm.exe", "explorer.exe", "svchost.exe",
    "lsass.exe", "services.exe", "smss.exe", "wininit.exe", "winlogon.exe",
    "taskhostw.exe", "runtimebroker.exe", "shellexperiencehost.exe",
    "searchui.exe", "searchapp.exe", "startmenuexperiencehost.exe",
    "textinputhost.exe", "sihost.exe", "ctfmon.exe", "dllhost.exe",
    "regsvr32.exe", "rundll32.exe", "msiexec.exe", "cmd.exe", "powershell.exe",
    "pwsh.exe", "wsl.exe", "wslhost.exe",
    "chrome.exe", "firefox.exe", "msedge.exe", "iexplore.exe", "opera.exe",
    "brave.exe", "vivaldi.exe", "waterfox.exe", "palemoon.exe",
    "code.exe", "devenv.exe", "notepad++.exe", "sublime_text.exe",
    "atom.exe", "slack.exe", "discord.exe", "teams.exe", "zoom.exe",
    "spotify.exe", "steamwebhelper.exe", "eadesktop.exe",
    "obsidian.exe", "notion.exe", "figma.exe",
    "blender.exe", "maya.exe", "3dsmax.exe", "cinema4d.exe",
    "photoshop.exe", "illustrator.exe", "premiere.exe", "afterfx.exe",
    "word.exe", "excel.exe", "powerpnt.exe", "outlook.exe",
    "winrar.exe", "7z.exe", "7zfm.exe", "peazip.exe", "bandizip.exe",
    "nvidia-smi.exe", "nvcontainer.exe", "nvspcaps64.exe",
    "amddriverrsx.exe", "amdrsrinx.exe", "amddriverinstall.exe",
    "intelgraphics.exe", "intelgraphicscommandcenter.exe",
    "amdfendr.exe", "radeonsoftware.exe",
    "cinebench.exe", "furmark.exe", "unigine.exe",
    "aida64.exe", "cpuz.exe", "gpuz.exe", "hwinfo.exe", "hwmonitor.exe",
    "msiafterburner.exe", "rtss.exe", "evgaPrecision.exe",
    "filezilla.exe", "putty.exe", "winSCP.exe", "git.exe", "git-bash.exe",
    "virtualbox.exe", "vmware.exe", "vmplayer.exe",
    "utorrent.exe", "qbittorrent.exe", "transmission.exe", "deluge.exe",
    "qbittorrent_l.exe",
    "nmap.exe", "wireshark.exe", "fiddler.exe", "charles.exe",
    "python.exe", "python3.exe", "ruby.exe", "node.exe", "java.exe", "javaw.exe",
    "perl.exe", "php.exe", "go.exe", "rustc.exe", "cargo.exe",
];

const NON_GAME_DIRS: &[&str] = &[
    "windows", "system32", "syswow64", "program files", "program files (x86)",
    "programdata", "appdata", "microsoft visual studio", "microsoft sdk",
    "windows kits", "windows defender", "windows nt", "windows mail",
    "windows photo viewer", "windows media player",
    "common files", "microsoft office", "microsoft sql server",
    "microsoft.net", "windows powershell", "windows.old",
    "dotnet", "nuget", "npm", "node_modules", ".git", ".svn", ".hg",
    "__pycache__", "venv", ".venv", "env",
    "android sdk", "android", "ios", "xcode",
    "sdk", "bin", "lib", "include", "share", "man",
    "temp", "tmp", "cache", "logs", "log",
    "downloads", "desktop", "documents", "pictures", "music", "videos",
    "favorites", "links", "contacts", "searches", "saved games",
    "onedrive", "dropbox", "google drive", "icloud",
    "recycle", "$recycle", "system volume information",
    "recovery", "perflogs", "msocache",
];

const UTILITY_NAME_PATTERNS: &[&str] = &[
    "build_script", "agent", "helper", "helper_",
    "updater", "installer", "setup", "uninstall",
    "crashreporter", "crash_handler", "repair",
    "commonredist", "oalinst", "dxsetup", "vcrun",
    "dotnetfx", "ndp", "redist",
    "benchmark", "test", "debug", "profiling",
    "unattended", "silent", "batch",
];

pub fn is_protected_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    PROTECTED_DIRS.iter().any(|p| path_str.starts_with(&p.to_lowercase()))
}

pub fn is_system_directory(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    NON_GAME_DIRS.iter().any(|d| name == *d)
}

pub fn is_protected_executable(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    SYSTEM_EXECUTABLES.iter().any(|s| lower == *s) || NON_GAME_EXECUTABLES.iter().any(|s| lower == *s)
}

pub fn is_likely_utility(exe_name: &str) -> bool {
    let lower = exe_name.to_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    UTILITY_NAME_PATTERNS.iter().any(|p| stem.contains(p))
}

pub fn should_skip_directory(dir_name: &str) -> bool {
    let lower = dir_name.to_lowercase();
    lower.starts_with('.')
        || lower.starts_with("__")
        || lower == "node_modules"
        || lower == "target"
        || lower == "debug"
        || lower == "release"
        || lower == ".git"
        || lower == ".svn"
        || lower == ".hg"
}

pub fn is_game_directory_candidate(dir_name: &str) -> bool {
    let lower = dir_name.to_lowercase();
    if lower.len() <= 2 { return false; }
    if should_skip_directory(dir_name) { return false; }
    if lower.contains("redist") || lower.contains("redistributable") { return false; }
    if lower.contains("support") || lower.contains("docs") || lower.contains("manual") { return false; }
    if lower.contains("sdk") || lower.contains("tools") || lower.contains("uninstall") { return false; }
    if lower.contains("target") || lower.contains("node_modules") || lower.contains("steamcmd") { return false; }
    if lower == "games" || lower == "common" || lower == "program files" { return false; }
    true
}

pub fn filter_candidate_path(path: &Path) -> PathFilter {
    if is_protected_path(path) {
        return PathFilter::Reject("Protected system path".to_string());
    }
    for component in path.components() {
        if let std::path::Component::Normal(name) = component {
            if let Some(s) = name.to_str() {
                if is_system_directory(&Path::new(s)) {
                    return PathFilter::Reject(format!("System directory: {}", s));
                }
            }
        }
    }
    PathFilter::Allow
}

pub enum PathFilter {
    Allow,
    Reject(String),
}

pub fn game_dir_signature_score(dir: &Path) -> (i32, Vec<String>) {
    let mut points = 0;
    let mut signals = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir) {
        let entries: Vec<_> = entries.flatten().collect();
        let has_exe = entries.iter().any(|e| {
            e.path().extension().and_then(|ext| ext.to_str()) == Some("exe")
        });
        let has_dll = entries.iter().any(|e| {
            e.path().extension().and_then(|ext| ext.to_str()) == Some("dll")
        });
        let large_files: Vec<_> = entries.iter().filter(|e| {
            e.path().is_file() && std::fs::metadata(e.path()).map(|m| m.len() > 10_000_000).unwrap_or(false)
        }).collect();

        if has_exe { points += 5; signals.push("Executable found".to_string()); }
        if has_dll { points += 2; signals.push("DLL files present".to_string()); }
        if !large_files.is_empty() {
            points += 3;
            signals.push(format!("{} large asset files", large_files.len()));
        }

        let subdirs: Vec<_> = entries.iter().filter(|e| e.path().is_dir()).collect();
        let game_subdirs = ["content", "data", "assets", "textures", "models",
            "sounds", "audio", "music", "levels", "maps", "scripts",
            "shaders", "meshes", "animations", "localization", "config",
            "plugins", "mods", "dlc", "expansion", "packs"];
        for sd in &subdirs {
            if let Some(name) = sd.path().file_name().and_then(|n| n.to_str()) {
                let name_lower = name.to_lowercase();
                if game_subdirs.iter().any(|g| name_lower.contains(g)) {
                    points += 2;
                    signals.push(format!("Game-like subdirectory: {}", name));
                    break;
                }
            }
        }

        let has_steam_appid = entries.iter().any(|e| {
            e.path().file_name().and_then(|n| n.to_str()) == Some("steam_appid.txt")
        });
        if has_steam_appid { points += 15; signals.push("steam_appid.txt found".to_string()); }

        let has_gog_info = entries.iter().any(|e| {
            e.path().file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("goggame-") && n.ends_with(".info")).unwrap_or(false)
        });
        if has_gog_info { points += 15; signals.push("GOG info file found".to_string()); }
    }

    (points, signals)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protected_paths() {
        assert!(is_protected_path(Path::new("C:\\Windows\\System32")));
        assert!(is_protected_path(Path::new("C:\\Windows\\System32\\notepad.exe")));
        assert!(!is_protected_path(Path::new("C:\\Games\\SomeGame")));
        assert!(!is_protected_path(Path::new("D:\\SteamLibrary")));
    }

    #[test]
    fn test_system_executables() {
        assert!(is_protected_executable("uninstall.exe"));
        assert!(is_protected_executable("setup.exe"));
        assert!(is_protected_executable("chrome.exe"));
        assert!(!is_protected_executable("Cyberpunk2077.exe"));
        assert!(!is_protected_executable("game.exe"));
    }

    #[test]
    fn test_utility_detection() {
        assert!(is_likely_utility("helper.exe"));
        assert!(is_likely_utility("updater.exe"));
        assert!(is_likely_utility("crashreporter.exe"));
        assert!(!is_likely_utility("eldenring.exe"));
    }

    #[test]
    fn test_skip_directory() {
        assert!(should_skip_directory(".git"));
        assert!(should_skip_directory("node_modules"));
        assert!(should_skip_directory("target"));
        assert!(!should_skip_directory("SomeGame"));
        assert!(!should_skip_directory("Cyberpunk 2077"));
    }

    #[test]
    fn test_game_dir_candidate() {
        assert!(is_game_directory_candidate("Cyberpunk 2077"));
        assert!(is_game_directory_candidate("The Witcher 3"));
        assert!(!is_game_directory_candidate("redist"));
        assert!(!is_game_directory_candidate("Common"));
        assert!(!is_game_directory_candidate(""));
    }

    #[test]
    fn test_system_directory() {
        assert!(is_system_directory(Path::new("windows")));
        assert!(is_system_directory(Path::new("System32")));
        assert!(!is_system_directory(Path::new("SomeGame")));
    }
}
