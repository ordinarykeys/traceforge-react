use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThreadMetadata {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub last_active: i64,
    pub working_dir: Option<String>,
    #[serde(default)]
    pub diagnostics: Option<ThreadDiagnostics>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadRetryDiagnostics {
  pub fallback_used: i64,
  pub fallback_suppressed: i64,
  pub retry_event_count: i64,
    pub suppression_ratio_pct: i64,
    #[serde(default)]
    pub last_suppressed_reason: Option<String>,
    #[serde(default)]
    pub last_retry_strategy: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadPermissionRiskDiagnostics {
    pub critical: i64,
    pub high_risk: i64,
    pub interactive: i64,
    pub path_outside: i64,
    pub policy: i64,
    pub scope_notices: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadPermissionRiskProfileDiagnostics {
    pub reversible: i64,
    pub mixed: i64,
    pub hard_to_reverse: i64,
    pub local: i64,
    pub workspace: i64,
    pub shared: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadPermissionDiagnostics {
    #[serde(default)]
    pub risk: ThreadPermissionRiskDiagnostics,
    #[serde(default)]
    pub profile: ThreadPermissionRiskProfileDiagnostics,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadDiagnosisActivity {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub at: i64,
    #[serde(default)]
    pub command_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ThreadDiagnostics {
    #[serde(default)]
    pub retry: ThreadRetryDiagnostics,
    #[serde(default)]
    pub permission: Option<ThreadPermissionDiagnostics>,
    #[serde(default)]
    pub diagnosis_activity: Option<ThreadDiagnosisActivity>,
    #[serde(default)]
    pub diagnosis_history: Vec<ThreadDiagnosisActivity>,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThreadData {
    pub metadata: ThreadMetadata,
    pub messages: serde_json::Value, // Full AgentMessage array
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub snapshot_messages: Option<serde_json::Value>,
    #[serde(default)]
    pub events: Vec<ThreadEvent>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThreadEvent {
    pub event_type: String,
    pub message_id: Option<String>,
    pub payload: serde_json::Value,
    pub at: i64,
}

const THREADS_INDEX_FILE: &str = "thread-index.json";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct ThreadIndexEntry {
    id: String,
    storage_path: String,
    working_dir: Option<String>,
    name: String,
    created_at: i64,
    last_active: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct ThreadIndexFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    entries: Vec<ThreadIndexEntry>,
}

fn get_global_threads_dir() -> Result<PathBuf, String> {
    let data_root = get_user_data_root()?;
    let threads_dir = data_root.join("traceforge-react").join("threads");

    if !threads_dir.exists() {
        fs::create_dir_all(&threads_dir)
            .map_err(|e| format!("Failed to create threads directory: {}", e))?;
    }

    migrate_legacy_threads_if_needed(&threads_dir);

    Ok(threads_dir)
}

fn get_thread_index_path() -> Result<PathBuf, String> {
    Ok(get_global_threads_dir()?.join(THREADS_INDEX_FILE))
}

fn load_thread_index() -> Result<HashMap<String, ThreadIndexEntry>, String> {
    let index_path = get_thread_index_path()?;
    if !index_path.exists() {
        return Ok(HashMap::new());
    }
    let content = fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read thread index {:?}: {}", index_path, e))?;
    let parsed = serde_json::from_str::<ThreadIndexFile>(&content)
        .map_err(|e| format!("Failed to parse thread index {:?}: {}", index_path, e))?;
    let mut map = HashMap::new();
    for entry in parsed.entries {
        map.insert(entry.id.clone(), entry);
    }
    Ok(map)
}

fn save_thread_index(index: &HashMap<String, ThreadIndexEntry>) -> Result<(), String> {
    let index_path = get_thread_index_path()?;
    let mut entries: Vec<ThreadIndexEntry> = index.values().cloned().collect();
    entries.sort_by(|a, b| b.last_active.cmp(&a.last_active));
    let payload = ThreadIndexFile {
        version: 1,
        entries,
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("Failed to serialize thread index: {}", e))?;
    write_atomic(&index_path, &json)
}

fn get_workspace_threads_dir(working_dir: &str) -> PathBuf {
    Path::new(working_dir)
        .join(".traceforge")
        .join("threads")
}

fn resolve_target_thread_file_path(id: &str, working_dir: Option<&str>) -> Result<PathBuf, String> {
    if let Some(dir) = working_dir {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            let target_dir = get_workspace_threads_dir(trimmed);
            if !target_dir.exists() {
                fs::create_dir_all(&target_dir).map_err(|e| {
                    format!(
                        "Failed to create workspace thread directory {:?}: {}",
                        target_dir, e
                    )
                })?;
            }
            return Ok(target_dir.join(format!("{}.json", id)));
        }
    }
    Ok(get_global_threads_dir()?.join(format!("{}.json", id)))
}

fn get_user_data_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(path) = std::env::var_os("APPDATA") {
            return Ok(PathBuf::from(path));
        }
        if let Some(path) = std::env::var_os("LOCALAPPDATA") {
            return Ok(PathBuf::from(path));
        }
        return Err("Failed to resolve %APPDATA%/%LOCALAPPDATA%".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return Ok(PathBuf::from(home)
                .join("Library")
                .join("Application Support"));
        }
        return Err("Failed to resolve $HOME for macOS data path".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(xdg_data_home) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg_data_home));
        }
        if let Some(home) = std::env::var_os("HOME") {
            return Ok(PathBuf::from(home).join(".local").join("share"));
        }
        return Err("Failed to resolve $XDG_DATA_HOME/$HOME for Linux data path".to_string());
    }
}

fn get_legacy_threads_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let install_dir = exe.parent()?;
    let legacy = install_dir.join("data").join("threads");
    if legacy.exists() {
        Some(legacy)
    } else {
        None
    }
}

fn migrate_legacy_threads_if_needed(new_threads_dir: &PathBuf) {
    let Some(legacy_dir) = get_legacy_threads_dir() else {
        return;
    };

    if legacy_dir == *new_threads_dir {
        return;
    }

    let read_dir = match fs::read_dir(&legacy_dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let source = entry.path();
        if source.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Some(file_name) = source.file_name() else {
            continue;
        };
        let target = new_threads_dir.join(file_name);
        if target.exists() {
            continue;
        }
        if let Err(err) = fs::copy(&source, &target) {
            eprintln!(
                "[thread_manager] failed to migrate thread file {:?} -> {:?}: {}",
                source, target, err
            );
        }
    }
}

fn get_thread_file_path(id: &str) -> Result<PathBuf, String> {
    let index = load_thread_index().unwrap_or_default();
    if let Some(entry) = index.get(id) {
        let indexed_path = PathBuf::from(&entry.storage_path);
        if indexed_path.exists() {
            return Ok(indexed_path);
        }
    }
    let primary = get_global_threads_dir()?.join(format!("{}.json", id));
    if primary.exists() {
        return Ok(primary);
    }
    if let Some(legacy_dir) = get_legacy_threads_dir() {
        let legacy = legacy_dir.join(format!("{}.json", id));
        if legacy.exists() {
            return Ok(legacy);
        }
    }
    Ok(primary)
}

fn write_atomic(path: &PathBuf, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid thread file path: {:?}", path))?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create thread parent dir {:?}: {}", parent, e))?;
    }

    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let tmp_path = parent.join(format!(
        ".{}.tmp-{}-{}",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("thread"),
        std::process::id(),
        now_nanos
    ));

    {
        let mut tmp_file = fs::File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temp thread file {:?}: {}", tmp_path, e))?;
        tmp_file
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write temp thread file {:?}: {}", tmp_path, e))?;
        tmp_file
            .sync_all()
            .map_err(|e| format!("Failed to flush temp thread file {:?}: {}", tmp_path, e))?;
    }

    if let Err(rename_err) = fs::rename(&tmp_path, path) {
        // Windows can't rename over an existing file. Move the old file aside first,
        // then promote the temp file, and roll back on failure.
        if path.exists() {
            let backup_path = parent.join(format!(
                ".{}.bak-{}-{}",
                path.file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("thread"),
                std::process::id(),
                now_nanos
            ));

            fs::rename(path, &backup_path).map_err(|e| {
                let _ = fs::remove_file(&tmp_path);
                format!(
                    "Failed to move existing thread file {:?} to backup {:?}: {}",
                    path, backup_path, e
                )
            })?;

            if let Err(e) = fs::rename(&tmp_path, path) {
                let _ = fs::rename(&backup_path, path);
                let _ = fs::remove_file(&tmp_path);
                return Err(format!(
                    "Failed to promote temp thread file {:?} to {:?} after backup: {}",
                    tmp_path, path, e
                ));
            }

            let _ = fs::remove_file(&backup_path);
        } else {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!(
                "Failed to atomically replace thread file {:?} via {:?}: {}",
                path, tmp_path, rename_err
            ));
        }
    }
    Ok(())
}

fn value_to_message_map(messages: &serde_json::Value) -> Vec<serde_json::Value> {
    messages
        .as_array()
        .cloned()
        .unwrap_or_default()
}

fn apply_event(messages: &mut Vec<serde_json::Value>, event: &ThreadEvent) {
    match event.event_type.as_str() {
        "append_message" => {
            messages.push(event.payload.clone());
        }
        "upsert_message" => {
            let id = event
                .message_id
                .clone()
                .or_else(|| event.payload.get("id").and_then(|v| v.as_str()).map(|v| v.to_string()));
            if let Some(target_id) = id {
                if let Some(existing) = messages.iter_mut().find(|m| m.get("id").and_then(|v| v.as_str()) == Some(target_id.as_str())) {
                    *existing = event.payload.clone();
                } else {
                    messages.push(event.payload.clone());
                }
            }
        }
        "delete_message" => {
            if let Some(target_id) = event.message_id.as_deref() {
                messages.retain(|m| m.get("id").and_then(|v| v.as_str()) != Some(target_id));
            }
        }
        _ => {}
    }
}

fn reconstruct_messages(data: &ThreadData) -> serde_json::Value {
    let base = data
        .snapshot_messages
        .as_ref()
        .unwrap_or(&data.messages);
    let mut reconstructed = value_to_message_map(base);
    for event in &data.events {
        apply_event(&mut reconstructed, event);
    }
    serde_json::Value::Array(reconstructed)
}

fn normalize_thread_data(mut data: ThreadData) -> ThreadData {
    let reconstructed = reconstruct_messages(&data);
    data.messages = reconstructed.clone();
    if data.schema_version == 0 {
        data.schema_version = 1;
    }
    if data.snapshot_messages.is_none() {
        data.snapshot_messages = Some(reconstructed);
    }
    data
}

#[tauri::command]
pub fn list_threads() -> Result<Vec<ThreadMetadata>, String> {
    let mut index = load_thread_index().unwrap_or_default();
    let mut threads = Vec::new();
    let mut stale_ids = Vec::new();

    // Primary source: index (supports workspace-local storage paths)
    for (id, entry) in &index {
        let path = PathBuf::from(&entry.storage_path);
        if !path.exists() {
            stale_ids.push(id.clone());
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(err) => {
                eprintln!("[thread_manager] skip unreadable thread file {:?}: {}", path, err);
                stale_ids.push(id.clone());
                continue;
            }
        };

        match serde_json::from_str::<ThreadData>(&content) {
            Ok(data) => {
                let data = normalize_thread_data(data);
                threads.push(data.metadata);
            }
            Err(err) => {
                eprintln!("[thread_manager] skip invalid thread json {:?}: {}", path, err);
                stale_ids.push(id.clone());
            }
        }
    }

    // Legacy fallback: global threads directory files that are not indexed yet.
    let global_dir = get_global_threads_dir()?;
    let mut index_dirty = false;
    for entry in fs::read_dir(&global_dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(v) => v,
            Err(err) => {
                eprintln!("[thread_manager] skip invalid dir entry: {}", err);
                continue;
            }
        };
        let path = entry.path();
        if path.file_name().and_then(|s| s.to_str()) == Some(THREADS_INDEX_FILE) {
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if index.contains_key(stem) {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(err) => {
                eprintln!("[thread_manager] skip unreadable legacy thread {:?}: {}", path, err);
                continue;
            }
        };

        match serde_json::from_str::<ThreadData>(&content) {
            Ok(data) => {
                let data = normalize_thread_data(data);
                index.insert(
                    data.metadata.id.clone(),
                    ThreadIndexEntry {
                        id: data.metadata.id.clone(),
                        storage_path: path.to_string_lossy().to_string(),
                        working_dir: data.metadata.working_dir.clone(),
                        name: data.metadata.name.clone(),
                        created_at: data.metadata.created_at,
                        last_active: data.metadata.last_active,
                    },
                );
                index_dirty = true;
                threads.push(data.metadata);
            }
            Err(err) => {
                eprintln!("[thread_manager] skip invalid legacy thread json {:?}: {}", path, err);
            }
        }
    }

    if !stale_ids.is_empty() {
        for id in stale_ids {
            if index.remove(&id).is_some() {
                index_dirty = true;
            }
        }
    }
    if index_dirty {
        let _ = save_thread_index(&index);
    }

    threads.sort_by(|a, b| b.last_active.cmp(&a.last_active));
    Ok(threads)
}

#[tauri::command]
pub fn load_thread(id: String) -> Result<ThreadData, String> {
    let file_path = get_thread_file_path(&id)?;

    if !file_path.exists() {
        return Err(format!("Thread {} not found", id));
    }

    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let data: ThreadData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(normalize_thread_data(data))
}

#[tauri::command]
pub fn save_thread(
    id: String,
    name: String,
    messages: serde_json::Value,
    working_dir: Option<String>,
    diagnostics: Option<ThreadDiagnostics>,
) -> Result<(), String> {
    let target_path = resolve_target_thread_file_path(&id, working_dir.as_deref())?;
    let existing_path = get_thread_file_path(&id)?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let mut created_at = now;
    let mut existing_diagnostics: Option<ThreadDiagnostics> = None;
    if existing_path.exists() {
        let old_content = fs::read_to_string(&existing_path).unwrap_or_default();
        if let Ok(old_data) = serde_json::from_str::<ThreadData>(&old_content) {
            created_at = old_data.metadata.created_at;
            existing_diagnostics = old_data.metadata.diagnostics;
        }
    }

    let metadata = ThreadMetadata {
        id: id.clone(),
        name,
        created_at,
        last_active: now,
        working_dir,
        diagnostics: diagnostics.or(existing_diagnostics),
    };

    let data = ThreadData {
        metadata,
        messages: messages.clone(),
        schema_version: 2,
        snapshot_messages: Some(messages),
        events: vec![],
    };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    write_atomic(&target_path, &json)?;

    if existing_path.exists() && existing_path != target_path {
        let _ = fs::remove_file(&existing_path);
    }

    let mut index = load_thread_index().unwrap_or_default();
    index.insert(
        id.clone(),
        ThreadIndexEntry {
            id: id.clone(),
            storage_path: target_path.to_string_lossy().to_string(),
            working_dir: data.metadata.working_dir.clone(),
            name: data.metadata.name.clone(),
            created_at: data.metadata.created_at,
            last_active: data.metadata.last_active,
        },
    );
    save_thread_index(&index)?;

    Ok(())
}

#[tauri::command]
pub fn delete_thread(id: String) -> Result<(), String> {
    let file_path = get_thread_file_path(&id)?;

    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }

    let mut index = load_thread_index().unwrap_or_default();
    if index.remove(&id).is_some() {
        let _ = save_thread_index(&index);
    }

    Ok(())
}

#[tauri::command]
pub fn rename_thread(id: String, new_name: String) -> Result<(), String> {
    let file_path = get_thread_file_path(&id)?;

    if !file_path.exists() {
        return Err(format!("Thread {} not found", id));
    }

    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let mut data: ThreadData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    data = normalize_thread_data(data);
    
    data.metadata.name = new_name;
    data.metadata.last_active = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    write_atomic(&file_path, &json)?;

    let mut index = load_thread_index().unwrap_or_default();
    if let Some(entry) = index.get_mut(&id) {
        entry.name = data.metadata.name.clone();
        entry.last_active = data.metadata.last_active;
        entry.working_dir = data.metadata.working_dir.clone();
        entry.storage_path = file_path.to_string_lossy().to_string();
        let _ = save_thread_index(&index);
    }

    Ok(())
}

#[tauri::command]
pub fn append_thread_events(
    id: String,
    name: String,
    events: Vec<ThreadEvent>,
    working_dir: Option<String>,
    diagnostics: Option<ThreadDiagnostics>,
) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }

    let target_path = resolve_target_thread_file_path(&id, working_dir.as_deref())?;
    let existing_path = get_thread_file_path(&id)?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as i64;

    let mut data = if existing_path.exists() {
        let old_content = fs::read_to_string(&existing_path).unwrap_or_default();
        serde_json::from_str::<ThreadData>(&old_content).ok()
    } else {
        None
    }
    .map(normalize_thread_data)
    .unwrap_or_else(|| ThreadData {
        metadata: ThreadMetadata {
            id: id.clone(),
            name: name.clone(),
            created_at: now,
            last_active: now,
            working_dir: working_dir.clone(),
            diagnostics: diagnostics.clone(),
        },
        messages: serde_json::Value::Array(vec![]),
        schema_version: 2,
        snapshot_messages: Some(serde_json::Value::Array(vec![])),
        events: vec![],
    });

    data.metadata.name = name;
    data.metadata.last_active = now;
    if let Some(wd) = working_dir {
        data.metadata.working_dir = Some(wd);
    }
    if let Some(diag) = diagnostics {
        data.metadata.diagnostics = Some(diag);
    }
    data.schema_version = 2;
    data.events.extend(events);

    if data.events.len() > 200 {
        let reconstructed = reconstruct_messages(&data);
        data.snapshot_messages = Some(reconstructed.clone());
        data.messages = reconstructed;
        data.events.clear();
    } else {
        data.messages = reconstruct_messages(&data);
    }

    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    write_atomic(&target_path, &json)?;
    if existing_path.exists() && existing_path != target_path {
        let _ = fs::remove_file(&existing_path);
    }

    let mut index = load_thread_index().unwrap_or_default();
    index.insert(
        id.clone(),
        ThreadIndexEntry {
            id,
            storage_path: target_path.to_string_lossy().to_string(),
            working_dir: data.metadata.working_dir.clone(),
            name: data.metadata.name.clone(),
            created_at: data.metadata.created_at,
            last_active: data.metadata.last_active,
        },
    );
    let _ = save_thread_index(&index);
    Ok(())
}

#[tauri::command]
pub fn reveal_threads_dir(working_dir: Option<String>) -> Result<(), String> {
    let target_dir = if let Some(dir) = working_dir {
        let trimmed = dir.trim().to_string();
        if trimmed.is_empty() {
            get_global_threads_dir()?
        } else {
            let workspace_dir = PathBuf::from(trimmed);
            if !workspace_dir.exists() {
                return Err(format!(
                    "Workspace directory does not exist: {}",
                    workspace_dir.to_string_lossy()
                ));
            }
            workspace_dir
        }
    } else {
        get_global_threads_dir()?
    };
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
