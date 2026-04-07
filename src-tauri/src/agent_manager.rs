use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

#[derive(Deserialize)]
pub struct AgentCommandRequest {
    pub cmd: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
    pub command_id: Option<String>,
}

#[derive(Serialize)]
pub struct AgentCommandResponse {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub interrupted: bool,
}

#[derive(Deserialize)]
pub struct AgentGitSnapshotRequest {
    pub working_dir: String,
    pub max_commits: Option<usize>,
}

#[derive(Serialize)]
pub struct AgentGitSnapshotResponse {
    pub success: bool,
    pub working_dir: String,
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub default_branch: Option<String>,
    pub status_short: Vec<String>,
    pub recent_commits: Vec<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FileCheckpointEntry {
    seq: u64,
    turn_id: String,
    path: String,
    existed_before: bool,
    content_base64: Option<String>,
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FileCheckpointStore {
    version: u32,
    next_seq: u64,
    entries: Vec<FileCheckpointEntry>,
}

impl Default for FileCheckpointStore {
    fn default() -> Self {
        Self {
            version: 1,
            next_seq: 1,
            entries: vec![],
        }
    }
}

#[derive(Deserialize)]
pub struct AgentRewindRequest {
    pub working_dir: String,
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Serialize)]
pub struct AgentRewindResponse {
    pub success: bool,
    pub restored_count: usize,
    pub removed_count: usize,
    pub affected_paths: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
pub struct AgentRewindPreviewResponse {
    pub success: bool,
    pub first_seq: Option<u64>,
    pub restore_count: usize,
    pub remove_count: usize,
    pub affected_paths: Vec<String>,
    pub warnings: Vec<String>,
}

fn current_timestamp_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?;
    Ok(duration.as_millis() as i64)
}

fn sanitize_thread_id(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "default".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_path_for_compare(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn normalize_path_for_store(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn canonical_or_self(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn resolve_target_path(working_dir: &Path, candidate: &str) -> PathBuf {
    let input_path = PathBuf::from(candidate);
    if input_path.is_absolute() {
        input_path
    } else {
        working_dir.join(input_path)
    }
}

fn path_within_workspace(target: &Path, workspace: &Path) -> bool {
    let workspace_canonical = canonical_or_self(workspace);
    let workspace_norm = normalize_path_for_compare(&workspace_canonical);

    if let Ok(target_canonical) = fs::canonicalize(target) {
        let target_norm = normalize_path_for_compare(&target_canonical);
        return target_norm == workspace_norm || target_norm.starts_with(&(workspace_norm.clone() + "/"));
    }

    if let Some(parent) = target.parent() {
        if let Ok(parent_canonical) = fs::canonicalize(parent) {
            let parent_norm = normalize_path_for_compare(&parent_canonical);
            return parent_norm == workspace_norm || parent_norm.starts_with(&(workspace_norm.clone() + "/"));
        }
    }

    let target_norm = normalize_path_for_compare(target);
    target_norm == workspace_norm || target_norm.starts_with(&(workspace_norm + "/"))
}

fn ensure_checkpoint_store_path(working_dir: &Path, thread_id: &str) -> Result<PathBuf, String> {
    let safe_thread = sanitize_thread_id(thread_id);
    let dir = working_dir
        .join(".traceforge")
        .join("file-history")
        .join(safe_thread);

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create checkpoint directory {:?}: {}", dir, e))?;
    }

    Ok(dir.join("history.json"))
}

fn load_checkpoint_store(path: &Path) -> Result<FileCheckpointStore, String> {
    if !path.exists() {
        return Ok(FileCheckpointStore::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read checkpoint store {:?}: {}", path, e))?;

    serde_json::from_str::<FileCheckpointStore>(&raw)
        .map_err(|e| format!("Failed to parse checkpoint store {:?}: {}", path, e))
}

fn save_checkpoint_store(path: &Path, store: &FileCheckpointStore) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize checkpoint store: {}", e))?;

    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid checkpoint store path: {:?}", path))?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create checkpoint store parent {:?}: {}", parent, e))?;
    }

    let tmp_path = parent.join(format!(
        ".{}.tmp-{}-{}",
        path.file_name().and_then(|s| s.to_str()).unwrap_or("history"),
        std::process::id(),
        current_timestamp_millis().unwrap_or(0)
    ));

    fs::write(&tmp_path, serialized)
        .map_err(|e| format!("Failed to write temp checkpoint store {:?}: {}", tmp_path, e))?;

    if let Err(rename_err) = fs::rename(&tmp_path, path) {
        if path.exists() {
            fs::remove_file(path)
                .map_err(|e| format!("Failed to replace old checkpoint store {:?}: {}", path, e))?;
            fs::rename(&tmp_path, path).map_err(|e| {
                format!(
                    "Failed to promote temp checkpoint store {:?} to {:?}: {} (original rename error: {})",
                    tmp_path, path, e, rename_err
                )
            })?;
        } else {
            return Err(format!(
                "Failed to finalize checkpoint store {:?} via {:?}: {}",
                path, tmp_path, rename_err
            ));
        }
    }

    Ok(())
}

fn run_git_output(working_dir: &str, args: &[&str]) -> Result<(bool, String, String), String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|e| format!("Failed to execute git {}: {}", args.join(" "), e))?;

    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

fn parse_default_branch(symbolic_ref: &str) -> Option<String> {
    let trimmed = symbolic_ref.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.split('/').next_back().map(|s| s.to_string())
}

fn capture_file_checkpoint_if_needed(
    path: &str,
    working_dir: Option<&str>,
    thread_id: Option<&str>,
    turn_id: Option<&str>,
) -> Result<(), String> {
    let Some(working_dir_raw) = working_dir else {
        return Ok(());
    };
    let Some(thread_id_raw) = thread_id else {
        return Ok(());
    };
    let Some(turn_id_raw) = turn_id else {
        return Ok(());
    };

    let working_dir_trimmed = working_dir_raw.trim();
    let thread_id_trimmed = thread_id_raw.trim();
    let turn_id_trimmed = turn_id_raw.trim();

    if working_dir_trimmed.is_empty() || thread_id_trimmed.is_empty() || turn_id_trimmed.is_empty() {
        return Ok(());
    }

    let workspace = PathBuf::from(working_dir_trimmed);
    if !workspace.exists() {
        return Ok(());
    }

    let target = resolve_target_path(&workspace, path);
    if !path_within_workspace(&target, &workspace) {
        return Ok(());
    }

    let store_path = ensure_checkpoint_store_path(&workspace, thread_id_trimmed)?;
    let mut store = load_checkpoint_store(&store_path)?;
    let target_normalized = normalize_path_for_store(&target);

    if store
        .entries
        .iter()
        .any(|entry| entry.turn_id == turn_id_trimmed && entry.path == target_normalized)
    {
        return Ok(());
    }

    let existed_before = target.exists();
    let content_base64 = if existed_before {
        let bytes = fs::read(&target)
            .map_err(|e| format!("Failed to read file for checkpoint {:?}: {}", target, e))?;
        Some(BASE64_STANDARD.encode(bytes))
    } else {
        None
    };

    let entry = FileCheckpointEntry {
        seq: store.next_seq,
        turn_id: turn_id_trimmed.to_string(),
        path: target_normalized,
        existed_before,
        content_base64,
        created_at: current_timestamp_millis()?,
    };

    store.next_seq = store.next_seq.saturating_add(1);
    store.entries.push(entry);

    if store.entries.len() > 5000 {
        let overflow = store.entries.len() - 5000;
        store.entries.drain(0..overflow);
    }

    save_checkpoint_store(&store_path, &store)
}

#[tauri::command]
pub async fn invoke_agent_git_snapshot(
    request: AgentGitSnapshotRequest,
) -> Result<AgentGitSnapshotResponse, String> {
    let working_dir = request.working_dir.trim().to_string();
    if working_dir.is_empty() {
        return Ok(AgentGitSnapshotResponse {
            success: false,
            working_dir,
            is_git_repo: false,
            branch: None,
            default_branch: None,
            status_short: vec![],
            recent_commits: vec![],
            error: Some("working_dir is empty".to_string()),
        });
    }

    let probe = run_git_output(&working_dir, &["rev-parse", "--is-inside-work-tree"])?;
    if !probe.0 || probe.1.trim() != "true" {
        return Ok(AgentGitSnapshotResponse {
            success: true,
            working_dir,
            is_git_repo: false,
            branch: None,
            default_branch: None,
            status_short: vec![],
            recent_commits: vec![],
            error: None,
        });
    }

    let branch = run_git_output(&working_dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .and_then(|result| if result.0 { Some(result.1) } else { None });
    let default_branch = run_git_output(&working_dir, &["symbolic-ref", "refs/remotes/origin/HEAD"])
        .ok()
        .and_then(|result| if result.0 { parse_default_branch(&result.1) } else { None });

    let status_output = run_git_output(&working_dir, &["status", "--short", "--branch"]);
    let status_short = status_output
        .as_ref()
        .ok()
        .map(|result| {
            result
                .1
                .lines()
                .map(|line| line.trim().to_string())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let commit_limit = request.max_commits.unwrap_or(5).clamp(1, 30);
    let recent_commits = run_git_output(&working_dir, &["log", "--oneline", "-n", &commit_limit.to_string()])
        .ok()
        .map(|result| {
            result
                .1
                .lines()
                .map(|line| line.trim().to_string())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let error = status_output
        .err()
        .map(|e| format!("git status failed: {e}"));

    Ok(AgentGitSnapshotResponse {
        success: true,
        working_dir,
        is_git_repo: true,
        branch,
        default_branch,
        status_short,
        recent_commits,
        error,
    })
}

#[tauri::command]
pub async fn invoke_agent_rewind_to_turn(
    request: AgentRewindRequest,
) -> Result<AgentRewindResponse, String> {
    let workspace = PathBuf::from(request.working_dir.trim());
    if !workspace.exists() {
        return Err(format!(
            "Working directory does not exist: {}",
            request.working_dir
        ));
    }

    if request.thread_id.trim().is_empty() {
        return Err("thread_id is empty".to_string());
    }
    if request.turn_id.trim().is_empty() {
        return Err("turn_id is empty".to_string());
    }

    let store_path = ensure_checkpoint_store_path(&workspace, request.thread_id.trim())?;
    let mut store = load_checkpoint_store(&store_path)?;

    if store.entries.is_empty() {
        return Ok(AgentRewindResponse {
            success: true,
            restored_count: 0,
            removed_count: 0,
            affected_paths: vec![],
            errors: vec![],
        });
    }

    let Some(first_seq_for_turn) = store
        .entries
        .iter()
        .find(|entry| entry.turn_id == request.turn_id)
        .map(|entry| entry.seq)
    else {
        return Err(format!(
            "No checkpoint entries found for turn_id {}",
            request.turn_id
        ));
    };

    let mut to_restore = store
        .entries
        .iter()
        .filter(|entry| entry.seq >= first_seq_for_turn)
        .cloned()
        .collect::<Vec<_>>();
    to_restore.sort_by(|left, right| right.seq.cmp(&left.seq));

    let mut restored_count = 0usize;
    let mut removed_count = 0usize;
    let mut affected = Vec::new();
    let mut affected_set = HashSet::new();
    let mut errors = Vec::new();

    for entry in &to_restore {
        let target = PathBuf::from(&entry.path);
        if !path_within_workspace(&target, &workspace) {
            errors.push(format!(
                "Skipped path outside workspace boundary: {}",
                entry.path
            ));
            continue;
        }

        if entry.existed_before {
            let decoded = entry
                .content_base64
                .as_deref()
                .ok_or_else(|| format!("Missing checkpoint content for {}", entry.path))
                .and_then(|encoded| {
                    BASE64_STANDARD
                        .decode(encoded)
                        .map_err(|e| format!("Failed to decode checkpoint content for {}: {}", entry.path, e))
                });

            match decoded {
                Ok(bytes) => {
                    if let Some(parent) = target.parent() {
                        if let Err(e) = fs::create_dir_all(parent) {
                            errors.push(format!("Failed to create parent directory {:?}: {}", parent, e));
                            continue;
                        }
                    }
                    if let Err(e) = fs::write(&target, bytes) {
                        errors.push(format!("Failed to restore file {:?}: {}", target, e));
                        continue;
                    }
                    restored_count += 1;
                }
                Err(error) => {
                    errors.push(error);
                    continue;
                }
            }
        } else if target.exists() {
            if let Err(e) = fs::remove_file(&target) {
                errors.push(format!("Failed to remove file {:?}: {}", target, e));
                continue;
            }
            removed_count += 1;
        }

        if affected_set.insert(entry.path.clone()) {
            affected.push(entry.path.clone());
        }
    }

    store.entries.retain(|entry| entry.seq < first_seq_for_turn);
    store.next_seq = store
        .entries
        .iter()
        .map(|entry| entry.seq)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    save_checkpoint_store(&store_path, &store)?;

    Ok(AgentRewindResponse {
        success: errors.is_empty(),
        restored_count,
        removed_count,
        affected_paths: affected,
        errors,
    })
}

#[tauri::command]
pub async fn invoke_agent_rewind_preview(
    request: AgentRewindRequest,
) -> Result<AgentRewindPreviewResponse, String> {
    let workspace = PathBuf::from(request.working_dir.trim());
    if !workspace.exists() {
        return Err(format!(
            "Working directory does not exist: {}",
            request.working_dir
        ));
    }

    if request.thread_id.trim().is_empty() {
        return Err("thread_id is empty".to_string());
    }
    if request.turn_id.trim().is_empty() {
        return Err("turn_id is empty".to_string());
    }

    let store_path = ensure_checkpoint_store_path(&workspace, request.thread_id.trim())?;
    let store = load_checkpoint_store(&store_path)?;

    if store.entries.is_empty() {
        return Ok(AgentRewindPreviewResponse {
            success: true,
            first_seq: None,
            restore_count: 0,
            remove_count: 0,
            affected_paths: vec![],
            warnings: vec![],
        });
    }

    let Some(first_seq_for_turn) = store
        .entries
        .iter()
        .find(|entry| entry.turn_id == request.turn_id)
        .map(|entry| entry.seq)
    else {
        return Err(format!(
            "No checkpoint entries found for turn_id {}",
            request.turn_id
        ));
    };

    let mut to_restore = store
        .entries
        .iter()
        .filter(|entry| entry.seq >= first_seq_for_turn)
        .cloned()
        .collect::<Vec<_>>();
    to_restore.sort_by(|left, right| right.seq.cmp(&left.seq));

    let mut restore_count = 0usize;
    let mut remove_count = 0usize;
    let mut affected = Vec::new();
    let mut affected_set = HashSet::new();
    let mut warnings = Vec::new();

    for entry in &to_restore {
        let target = PathBuf::from(&entry.path);
        if !path_within_workspace(&target, &workspace) {
            warnings.push(format!(
                "Skipped path outside workspace boundary: {}",
                entry.path
            ));
            continue;
        }

        if entry.existed_before {
            if entry.content_base64.is_none() {
                warnings.push(format!(
                    "Missing checkpoint content for {}, restore may fail",
                    entry.path
                ));
            }
            restore_count += 1;
        } else if target.exists() {
            remove_count += 1;
        }

        if affected_set.insert(entry.path.clone()) {
            affected.push(entry.path.clone());
        }
    }

    Ok(AgentRewindPreviewResponse {
        success: warnings.is_empty(),
        first_seq: Some(first_seq_for_turn),
        restore_count,
        remove_count,
        affected_paths: affected,
        warnings,
    })
}


#[tauri::command]
pub async fn invoke_agent_task_execution(
    window: tauri::Window,
    request: AgentCommandRequest,
) -> Result<AgentCommandResponse, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let mut command = Command::new(&request.cmd);
    command.args(&request.args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let command_id = request.command_id.clone();

    // --- Automatic Tool Path Discovery ---
    // Inject common user-level tool paths (Python scripts, platform tools, local tool dirs)
    let current_path = std::env::var("PATH").unwrap_or_default();
    
    // Get user profile path for AppData
    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    
    let mut extra_paths = vec![
        format!("{}\\AppData\\Roaming\\Python\\Python312\\Scripts", user_profile),
        format!("{}\\AppData\\Local\\Programs\\Python\\Python312\\Scripts", user_profile),
        format!("{}\\Desktop\\tools", user_profile),
        "C:\\Program Files\\Python312\\Scripts".to_string(),
        "C:\\platform-tools".to_string(),
        "C:\\tools".to_string(),
    ];

    // Deduplicate and filter existing paths
    extra_paths.retain(|p| std::path::Path::new(p).exists());
    
    let new_path = if !extra_paths.is_empty() {
        format!("{};{}", extra_paths.join(";"), current_path)
    } else {
        current_path
    };
    command.env("PATH", new_path);
    // --------------------------------------

    if let Some(cwd) = request.cwd {
        command.current_dir(cwd);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn process {}: {}", request.cmd, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Failed to capture stdout for command {}", request.cmd))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Failed to capture stderr for command {}", request.cmd))?;

    let window_clone = window.clone();
    let command_id_stdout = command_id.clone();
    let mut stdout_lines = Vec::new();
    let mut stderr_lines = Vec::new();

    // Stream STDOUT in a separate task, also collect lines (capped at 5000 lines for memory safety)
    let stdout_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut lines = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_clone.emit(
                "agent-log",
                serde_json::json!({
                    "source": "stdout",
                    "line": line,
                    "command_id": command_id_stdout
                }),
            );
            if lines.len() < 5000 {
                lines.push(line);
            } else if lines.len() == 5000 {
                lines.push("... [Standard output truncated for memory safety] ...".to_string());
            }
            // Small throttle to prevent UI flooding
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        lines
    });

    let window_clone = window.clone();
    let command_id_stderr = command_id.clone();
    // Stream STDERR in a separate task (capped at 2000 lines)
    let stderr_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut lines = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_clone.emit(
                "agent-log",
                serde_json::json!({
                    "source": "stderr",
                    "line": line,
                    "command_id": command_id_stderr
                }),
            );
            if lines.len() < 2000 {
                lines.push(line);
            } else if lines.len() == 2000 {
                lines.push("... [Error output truncated for memory safety] ...".to_string());
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
        lines
    });

    // Wait for the exit status with timeout
    let timeout_ms = request.timeout_ms.unwrap_or(30000); // 30s default
    let mut interrupted = false;
    let mut exit_code = None;
    let mut success = false;

    match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), child.wait()).await {
        Ok(Ok(status)) => {
            success = status.success();
            exit_code = status.code();
        }
        Ok(Err(e)) => {
            let _ = window.emit("agent-log", serde_json::json!({
                "source": "error",
                "line": format!("Process error: {}", e),
                "command_id": command_id
            }));
        }
        Err(_) => {
            // Timeout occurred
            let _ = child.kill().await;
            interrupted = true;
            let _ = window.emit("agent-log", serde_json::json!({
                "source": "stderr",
                "line": format!("\n[Timeout] Process killed after {}ms", timeout_ms),
                "command_id": command_id
            }));
        }
    }

    // Collect all output (even if interrupted, the handles should close after child is killed)
    if let Ok(lines) = stdout_handle.await {
        stdout_lines = lines;
    }
    if let Ok(lines) = stderr_handle.await {
        stderr_lines = lines;
    }

    Ok(AgentCommandResponse {
        success,
        stdout: stdout_lines.join("\n"),
        stderr: stderr_lines.join("\n"),
        exit_code,
        interrupted,
    })
}


// ============================================================
// File Read Command — Agent can read local files (decompiled sources, configs)
// ============================================================

#[derive(Deserialize)]
pub struct AgentReadFileRequest {
    pub path: String,
    pub start_line: Option<usize>,
    pub end_line: Option<usize>,
}

#[derive(Serialize)]
pub struct AgentReadFileResponse {
    pub success: bool,
    pub content: String,
    pub total_lines: usize,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_read_file(
    request: AgentReadFileRequest,
) -> Result<AgentReadFileResponse, String> {
    use std::fs;

    let content = fs::read_to_string(&request.path).map_err(|e| {
        format!("Failed to read file {}: {}", request.path, e)
    })?;

    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    let start = request.start_line.unwrap_or(1).saturating_sub(1);
    let end = request.end_line.unwrap_or(total_lines).min(total_lines);

    if start >= total_lines {
        return Ok(AgentReadFileResponse {
            success: true,
            content: String::new(),
            total_lines,
            error: None,
        });
    }

    let selected: Vec<String> = lines[start..end]
        .iter()
        .enumerate()
        .map(|(i, line)| format!("{}: {}", start + i + 1, line))
        .collect();

    Ok(AgentReadFileResponse {
        success: true,
        content: selected.join("\n"),
        total_lines,
        error: None,
    })
}

// ============================================================
// Memory Persistence — Agent can save/load analysis discoveries
// ============================================================

#[derive(Deserialize)]
pub struct AgentSaveMemoryRequest {
    pub id: String,
    pub category: String,
    pub content: String,
    pub metadata: Option<String>,
    pub thread_id: Option<String>,
}

#[derive(Deserialize)]
pub struct AgentLoadMemoriesRequest {
    pub thread_id: Option<String>,
    pub category: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Serialize, Clone)]
pub struct MemoryEntry {
    pub id: String,
    pub category: String,
    pub content: String,
    pub metadata: Option<String>,
    pub thread_id: String,
    pub created_at: i64,
}

fn open_memory_database() -> Result<rusqlite::Connection, String> {
    // Reuse the storage_root_dir logic from lib.rs
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve executable path: {}", e))?;
    let install_dir = exe
        .parent()
        .ok_or_else(|| "Failed to resolve installation directory".to_string())?;
    let data_dir = install_dir.join("data");

    // Ensure directory exists
    let _ = std::fs::create_dir_all(&data_dir);
    let db_path = data_dir.join("traceforge.sqlite3");

    let connection = rusqlite::Connection::open(&db_path).map_err(|e| {
        format!("Failed to open SQLite database {}: {}", db_path.display(), e)
    })?;

    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS agent_memories (
               id TEXT PRIMARY KEY,
               category TEXT NOT NULL,
               content TEXT NOT NULL,
               metadata TEXT,
               thread_id TEXT DEFAULT 'default',
               created_at INTEGER NOT NULL
             );",
        )
        .map_err(|e| format!("Failed to initialize memory table: {}", e))?;

    Ok(connection)
}

#[tauri::command]
pub async fn invoke_agent_save_memory(
    request: AgentSaveMemoryRequest,
) -> Result<bool, String> {
    let conn = open_memory_database()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {}", e))?
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO agent_memories (id, category, content, metadata, thread_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE
         SET content = excluded.content,
             metadata = excluded.metadata,
             thread_id = excluded.thread_id,
             created_at = excluded.created_at",
        rusqlite::params![
            request.id,
            request.category,
            request.content,
            request.metadata,
            request.thread_id.as_deref().unwrap_or("default"),
            now
        ],
    )
    .map_err(|e| format!("Failed to save memory: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn invoke_agent_load_memories(
    request: AgentLoadMemoriesRequest,
) -> Result<Vec<MemoryEntry>, String> {
    let conn = open_memory_database()?;
    let limit = request.limit.unwrap_or(50);

    let mut query = String::from("SELECT id, category, content, metadata, thread_id, created_at FROM agent_memories WHERE 1=1");
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut param_idx = 1;

    if let Some(thread_id) = request.thread_id {
        query.push_str(&format!(" AND thread_id = ?{}", param_idx));
        params.push(Box::new(thread_id));
        param_idx += 1;
    }
    if let Some(category) = request.category {
        query.push_str(&format!(" AND category = ?{}", param_idx));
        params.push(Box::new(category));
        param_idx += 1;
    }
    query.push_str(&format!(" ORDER BY created_at DESC LIMIT ?{}", param_idx));
    params.push(Box::new(limit));

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Query prepare failed: {}", e))?;
    
    let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
        Ok(MemoryEntry {
            id: row.get(0)?,
            category: row.get(1)?,
            content: row.get(2)?,
            metadata: row.get(3)?,
            thread_id: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| format!("Query failed: {}", e))?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| format!("Row parse error: {}", e))?);
    }

    Ok(entries)
}

// ============================================================
// HIGH-PERFORMANCE NATIVE COMMANDS (Bypassing shell entirely)
// ============================================================

// --- 1. Native Grep Search (ripgrep-grade performance) ---

#[derive(Deserialize)]
pub struct AgentGrepRequest {
    pub pattern: String,
    pub search_path: String,
    pub file_extensions: Option<Vec<String>>,
    pub case_insensitive: Option<bool>,
    pub max_results: Option<usize>,
}

#[derive(Serialize)]
pub struct GrepMatch {
    pub file: String,
    pub line_number: usize,
    pub line_content: String,
}

#[derive(Serialize)]
pub struct AgentGrepResponse {
    pub success: bool,
    pub matches: Vec<GrepMatch>,
    pub total_files_scanned: usize,
    pub truncated: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_grep_search(
    request: AgentGrepRequest,
) -> Result<AgentGrepResponse, String> {
    use regex::RegexBuilder;
    use std::fs;
    use std::io::{BufRead, BufReader};
    use walkdir::WalkDir;

    let re = RegexBuilder::new(&request.pattern)
        .case_insensitive(request.case_insensitive.unwrap_or(false))
        .build()
        .map_err(|e| format!("Invalid regex pattern: {}", e))?;

    let max_results = request.max_results.unwrap_or(200);
    let extensions: Option<Vec<String>> = request.file_extensions.map(|exts| {
        exts.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect()
    });

    let mut matches = Vec::new();
    let mut files_scanned = 0;
    let mut truncated = false;

    for entry in WalkDir::new(&request.search_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();

        // Filter by extension if specified
        if let Some(ref exts) = extensions {
            let file_ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !exts.contains(&file_ext) {
                continue;
            }
        }

        // Skip binary files (quick heuristic: check first 512 bytes)
        if let Ok(data) = fs::read(path) {
            let check_len = data.len().min(512);
            let null_count = data[..check_len].iter().filter(|&&b| b == 0).count();
            if null_count > check_len / 8 {
                continue; // Likely binary
            }
        }

        files_scanned += 1;

        if let Ok(file) = fs::File::open(path) {
            let reader = BufReader::new(file);
            for (line_idx, line_result) in reader.lines().enumerate() {
                if let Ok(line) = line_result {
                    if re.is_match(&line) {
                        matches.push(GrepMatch {
                            file: path.to_string_lossy().to_string(),
                            line_number: line_idx + 1,
                            line_content: if line.len() > 500 {
                                format!("{}...", &line[..500])
                            } else {
                                line
                            },
                        });

                        if matches.len() >= max_results {
                            truncated = true;
                            break;
                        }
                    }
                }
            }
        }

        if truncated {
            break;
        }
    }

    Ok(AgentGrepResponse {
        success: true,
        matches,
        total_files_scanned: files_scanned,
        truncated,
        error: None,
    })
}

// --- 2. Native Hex Dump (direct binary reading, no external tools) ---

#[derive(Deserialize)]
pub struct AgentHexDumpRequest {
    pub path: String,
    pub offset: Option<usize>,
    pub length: Option<usize>,
}

#[derive(Serialize)]
pub struct AgentHexDumpResponse {
    pub success: bool,
    pub hex_dump: String,
    pub file_size: u64,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_hex_dump(
    request: AgentHexDumpRequest,
) -> Result<AgentHexDumpResponse, String> {
    use std::fs;
    use std::io::{Read, Seek, SeekFrom};

    let metadata = fs::metadata(&request.path)
        .map_err(|e| format!("Cannot access file {}: {}", request.path, e))?;
    let file_size = metadata.len();

    let offset = request.offset.unwrap_or(0);
    let length = request.length.unwrap_or(256).min(4096); // Cap at 4KB per request

    let mut file = fs::File::open(&request.path)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    file.seek(SeekFrom::Start(offset as u64))
        .map_err(|e| format!("Seek failed: {}", e))?;

    let mut buffer = vec![0u8; length];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Read failed: {}", e))?;
    buffer.truncate(bytes_read);

    // Format as traditional hex dump (offset | hex bytes | ASCII)
    let mut hex_output = String::new();
    for (chunk_idx, chunk) in buffer.chunks(16).enumerate() {
        let addr = offset + chunk_idx * 16;
        hex_output.push_str(&format!("{:08x}  ", addr));

        // Hex bytes
        for (i, byte) in chunk.iter().enumerate() {
            hex_output.push_str(&format!("{:02x} ", byte));
            if i == 7 {
                hex_output.push(' ');
            }
        }

        // Padding for incomplete lines
        if chunk.len() < 16 {
            for i in chunk.len()..16 {
                hex_output.push_str("   ");
                if i == 7 {
                    hex_output.push(' ');
                }
            }
        }

        // ASCII representation
        hex_output.push_str(" |");
        for byte in chunk {
            if byte.is_ascii_graphic() || *byte == b' ' {
                hex_output.push(*byte as char);
            } else {
                hex_output.push('.');
            }
        }
        hex_output.push_str("|\n");
    }

    Ok(AgentHexDumpResponse {
        success: true,
        hex_dump: hex_output,
        file_size,
        error: None,
    })
}

// --- 3. Native File Hash (memory-mapped for max speed) ---

#[derive(Deserialize)]
pub struct AgentFileHashRequest {
    pub path: String,
}

#[derive(Serialize)]
pub struct AgentFileHashResponse {
    pub success: bool,
    pub md5: String,
    pub sha256: String,
    pub file_size: u64,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_file_hash(
    request: AgentFileHashRequest,
) -> Result<AgentFileHashResponse, String> {
    use md5::Md5;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::Read;

    let metadata = fs::metadata(&request.path)
        .map_err(|e| format!("Cannot access file: {}", e))?;
    let file_size = metadata.len();

    let mut file = fs::File::open(&request.path)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    let mut sha256_hasher = Sha256::new();
    let mut md5_hasher = Md5::new();

    let mut buffer = vec![0u8; 8192];
    loop {
        let n = file.read(&mut buffer).map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        sha256_hasher.update(&buffer[..n]);
        md5_hasher.update(&buffer[..n]);
    }

    let sha256 = format!("{:x}", sha256_hasher.finalize());
    let md5 = format!("{:x}", md5_hasher.finalize());

    Ok(AgentFileHashResponse {
        success: true,
        md5,
        sha256,
        file_size,
        error: None,
    })
}

// --- 4. Native Directory Listing (fast recursive with metadata) ---

#[derive(Deserialize)]
pub struct AgentListDirRequest {
    pub path: String,
    pub recursive: Option<bool>,
    pub max_depth: Option<usize>,
    pub file_extensions: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

#[derive(Serialize)]
pub struct AgentListDirResponse {
    pub success: bool,
    pub entries: Vec<DirEntry>,
    pub total_count: usize,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_list_dir(
    request: AgentListDirRequest,
) -> Result<AgentListDirResponse, String> {
    use walkdir::WalkDir;

    let max_depth = if request.recursive.unwrap_or(false) {
        request.max_depth.unwrap_or(10)
    } else {
        1
    };

    let extensions: Option<Vec<String>> = request.file_extensions.map(|exts| {
        exts.iter().map(|e| e.trim_start_matches('.').to_lowercase()).collect()
    });

    let mut entries = Vec::new();

    for entry in WalkDir::new(&request.path)
        .max_depth(max_depth)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        // Skip the root directory itself
        if path == std::path::Path::new(&request.path) {
            continue;
        }

        let is_dir = entry.file_type().is_dir();
        let ext = path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase());

        // Filter by extension (only for files)
        if !is_dir {
            if let Some(ref filter_exts) = extensions {
                if let Some(ref file_ext) = ext {
                    if !filter_exts.contains(file_ext) {
                        continue;
                    }
                } else {
                    continue;
                }
            }
        }

        let size = if is_dir { 0 } else { entry.metadata().map(|m| m.len()).unwrap_or(0) };

        entries.push(DirEntry {
            path: path.to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir,
            size,
            extension: ext,
        });

        // Safety cap
        if entries.len() >= 5000 {
            break;
        }
    }

    let total_count = entries.len();

    Ok(AgentListDirResponse {
        success: true,
        entries,
        total_count,
        error: None,
    })
}

// --- 5. Native Binary Info (parse DEX/ELF/APK magic bytes) ---

#[derive(Deserialize)]
pub struct AgentBinaryInfoRequest {
    pub path: String,
}

#[derive(Serialize)]
pub struct AgentBinaryInfoResponse {
    pub success: bool,
    pub file_type: String,
    pub file_size: u64,
    pub details: std::collections::HashMap<String, String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_binary_info(
    request: AgentBinaryInfoRequest,
) -> Result<AgentBinaryInfoResponse, String> {
    use std::collections::HashMap;
    use std::fs;
    use std::io::Read;

    let metadata = fs::metadata(&request.path)
        .map_err(|e| format!("Cannot access file: {}", e))?;
    let file_size = metadata.len();

    let mut file = fs::File::open(&request.path)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    let mut header = [0u8; 64];
    let bytes_read = file.read(&mut header).map_err(|e| format!("Read failed: {}", e))?;

    let mut details = HashMap::new();
    let file_type;

    if bytes_read >= 4 && &header[0..4] == b"PK\x03\x04" {
        // ZIP/APK/JAR
        let ext = std::path::Path::new(&request.path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        file_type = match ext.to_lowercase().as_str() {
            "apk" => "Android APK (ZIP archive)".to_string(),
            "jar" => "Java JAR (ZIP archive)".to_string(),
            _ => "ZIP archive".to_string(),
        };
        details.insert("format".to_string(), "ZIP/PK".to_string());
        details.insert("magic".to_string(), "50 4B 03 04".to_string());
    } else if bytes_read >= 8 && &header[0..4] == b"dex\n" {
        // DEX file
        let version = String::from_utf8_lossy(&header[4..7]).to_string();
        file_type = format!("Android DEX (Dalvik Executable v{})", version);
        details.insert("dex_version".to_string(), version);
        details.insert("magic".to_string(), "64 65 78 0A".to_string());
        if bytes_read >= 36 {
            let file_size_field = u32::from_le_bytes([header[32], header[33], header[34], header[35]]);
            details.insert("dex_file_size".to_string(), file_size_field.to_string());
        }
    } else if bytes_read >= 4 && &header[0..4] == b"\x7fELF" {
        // ELF (native .so library)
        let bits = if header[4] == 1 { "32-bit" } else { "64-bit" };
        let endian = if header[5] == 1 { "little-endian" } else { "big-endian" };
        let machine = if bytes_read >= 20 {
            match u16::from_le_bytes([header[18], header[19]]) {
                3 => "x86",
                40 => "ARM",
                62 => "x86_64",
                183 => "AArch64",
                _ => "unknown",
            }
        } else {
            "unknown"
        };
        file_type = format!("ELF {} {} ({})", bits, endian, machine);
        details.insert("bits".to_string(), bits.to_string());
        details.insert("endianness".to_string(), endian.to_string());
        details.insert("architecture".to_string(), machine.to_string());
        details.insert("magic".to_string(), "7F 45 4C 46".to_string());
    } else if bytes_read >= 8 && &header[0..8] == b"\x89PNG\r\n\x1a\n" {
        file_type = "PNG Image".to_string();
    } else if bytes_read >= 3 && &header[0..3] == b"\xff\xd8\xff" {
        file_type = "JPEG Image".to_string();
    } else if bytes_read >= 4 && &header[0..4] == b"\x02\x00\x0C\x00" {
        file_type = "Android ARSC (Resources)".to_string();
    } else if bytes_read >= 4 && &header[0..4] == b"\x03\x00\x08\x00" {
        file_type = "Android Binary XML".to_string();
    } else {
        // Try to detect if it's text
        let non_text = header[..bytes_read.min(64)]
            .iter()
            .filter(|&&b| b == 0 || (b < 0x20 && b != b'\n' && b != b'\r' && b != b'\t'))
            .count();
        if non_text == 0 {
            file_type = "Text file".to_string();
        } else {
            file_type = "Unknown binary".to_string();
        }
    }

    details.insert("file_size_bytes".to_string(), file_size.to_string());
    details.insert(
        "file_size_human".to_string(),
        if file_size > 1_048_576 {
            format!("{:.2} MB", file_size as f64 / 1_048_576.0)
        } else if file_size > 1024 {
            format!("{:.1} KB", file_size as f64 / 1024.0)
        } else {
            format!("{} bytes", file_size)
        },
    );

    Ok(AgentBinaryInfoResponse {
        success: true,
        file_type,
        file_size,
        details,
        error: None,
    })
}

// --- 6. Native Strings Extraction (like Unix 'strings' command) ---

#[derive(Deserialize)]
pub struct AgentExtractStringsRequest {
    pub path: String,
    pub min_length: Option<usize>,
    pub max_results: Option<usize>,
}

#[derive(Serialize)]
pub struct AgentExtractStringsResponse {
    pub success: bool,
    pub strings: Vec<String>,
    pub total_found: usize,
    pub truncated: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_extract_strings(
    request: AgentExtractStringsRequest,
) -> Result<AgentExtractStringsResponse, String> {
    use std::fs;
    use std::io::Read;

    let min_length = request.min_length.unwrap_or(4).max(3);
    let max_results = request.max_results.unwrap_or(1000);

    let mut file = fs::File::open(&request.path)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Read failed: {}", e))?;

    let mut extracted = Vec::new();
    let mut current_string = String::new();
    let mut truncated = false;
    let mut total_found: usize = 0;

    for &byte in &buffer {
        if byte.is_ascii_graphic() || byte == b' ' || byte == b'\t' {
            current_string.push(byte as char);
        } else {
            if current_string.len() >= min_length {
                total_found += 1;
                if extracted.len() < max_results {
                    extracted.push(current_string.clone());
                } else {
                    truncated = true;
                }
            }
            current_string.clear();
        }
    }

    // Capture string at EOF
    if current_string.len() >= min_length {
        total_found += 1;
        if extracted.len() < max_results {
            extracted.push(current_string);
        }
    }

    Ok(AgentExtractStringsResponse {
        success: true,
        strings: extracted,
        total_found,
        truncated,
        error: None,
    })
}

// --- 7. Native File Write (safe write with backup) ---

#[derive(Deserialize)]
pub struct AgentWriteFileRequest {
    pub path: String,
    pub content: String,
    pub create_backup: Option<bool>,
    pub working_dir: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
}

#[tauri::command]
pub async fn invoke_agent_write_file(
    request: AgentWriteFileRequest,
) -> Result<String, String> {
    use std::path::Path;

    capture_file_checkpoint_if_needed(
        &request.path,
        request.working_dir.as_deref(),
        request.thread_id.as_deref(),
        request.turn_id.as_deref(),
    )?;

    let path = Path::new(&request.path);

    // Create backup if requested and file exists
    if request.create_backup.unwrap_or(true) && path.exists() {
        let backup_path = format!("{}.bak", request.path);
        fs::copy(path, &backup_path)
            .map_err(|e| format!("Backup failed: {}", e))?;
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create directory: {}", e))?;
    }

    fs::write(path, &request.content)
        .map_err(|e| format!("Write failed: {}", e))?;

    Ok(format!("Written {} bytes to {}", request.content.len(), request.path))
}
