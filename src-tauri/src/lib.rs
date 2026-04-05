use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use reqwest::{header::SET_COOKIE, multipart, Method};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

mod agent_manager;
mod thread_manager;

const SCRIPTCONTROL_POWERSHELL_32: &str =
    r"C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe";
const SQLITE_DB_FILE: &str = "traceforge.sqlite3";
const STATE_EXPORT_FILE: &str = "traceforge.config.json";

const SCRIPTCONTROL_RUNTIME_PREAMBLE: &str = r#"var WT_JSLAB_LOGS = [];

function WT_DescribeValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "undefined") {
    return "undefined";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return String(value);
  } catch (error) {
    return "[unprintable]";
  }
}

function WT_PushLog(level, args) {
  var parts = [];
  var index;

  for (index = 0; index < args.length; index += 1) {
    parts.push(WT_DescribeValue(args[index]));
  }

  WT_JSLAB_LOGS.push("[" + level + "] " + parts.join(" "));
}

var console = typeof console !== "undefined" ? console : {};
console.log = function () {
  WT_PushLog("log", arguments);
};
console.warn = function () {
  WT_PushLog("warn", arguments);
};
console.error = function () {
  WT_PushLog("error", arguments);
};

function WT_GetLogs() {
  return WT_JSLAB_LOGS.join("\n");
}

function WT_InvokeSerialized(entryName, argsJson) {
  var target = this[entryName];
  var args;

  if (typeof target !== "function") {
    throw new Error("Function not found: " + entryName);
  }

  if (!argsJson || argsJson === "[]" || argsJson === "") {
    args = [];
  } else if (typeof JSON !== "undefined" && JSON.parse) {
    args = JSON.parse(argsJson);
  } else {
    args = eval("(" + argsJson + ")");
  }

  return target.apply(this, args);
}"#;

const SCRIPTCONTROL_RUNNER: &str = r#"param(
  [string]$RuntimePath,
  [string]$FunctionName,
  [string]$ArgsPath
)

$ErrorActionPreference = 'Stop'

function Invoke-WtFunction {
  param(
    [System.__ComObject]$ScriptControl,
    [string]$EntryName,
    [string]$ArgsJson
  )

  $safeEntry = $EntryName.Replace('\', '\\').Replace("'", "\'")
  $safeArgs = $ArgsJson.Replace('\', '\\').Replace("'", "\'").Replace("`r", '\r').Replace("`n", '\n')
  $expression = "WT_InvokeSerialized('" + $safeEntry + "', '" + $safeArgs + "')"
  return $ScriptControl.Eval($expression)
}

$argsJson = "[]"
if (Test-Path -LiteralPath $ArgsPath) {
  $json = [string](Get-Content -Raw -LiteralPath $ArgsPath)
  if (-not [string]::IsNullOrWhiteSpace($json)) {
    $argsJson = $json.Trim()
  }
}

$response = [ordered]@{
  success = $false
  result = ''
  logs = @()
  error = ''
  engine = 'scriptcontrol'
  host = 'MSScriptControl.ScriptControl (32-bit)'
}

$runtime = Get-Content -Raw -LiteralPath $RuntimePath
$scriptControl = New-Object -ComObject MSScriptControl.ScriptControl
$scriptControl.Language = 'JScript'

try {
  try {
    $scriptControl.AddCode($runtime)
  } catch {
    $response.error = $_.Exception.Message
  }

  if ([string]::IsNullOrEmpty($response.error)) {
    try {
      $result = Invoke-WtFunction -ScriptControl $scriptControl -EntryName $FunctionName -ArgsJson $argsJson
      if ($null -ne $result) {
        $response.result = [string]$result
      }
      $response.success = $true
    } catch {
      $response.error = $_.Exception.Message
    }
  }

  try {
    $logsRaw = [string]$scriptControl.Eval('WT_GetLogs()')
    if (-not [string]::IsNullOrEmpty($logsRaw)) {
      $response.logs = @($logsRaw -split "`r?`n")
    }
  } catch {}
} finally {
  try {
    $null = $scriptControl.Reset()
  } catch {}
}

$response | ConvertTo-Json -Depth 4 -Compress
"#;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct RuntimeInfo {
    app_name: String,
    app_version: String,
    profile: String,
    os: String,
    arch: String,
    tauri: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct ScriptControlRunRequest {
    #[serde(alias = "sourceCode")]
    source_code: String,
    #[serde(alias = "functionName")]
    function_name: String,
    args: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ScriptControlRunResponse {
    success: bool,
    result: String,
    logs: Vec<String>,
    error: String,
    engine: String,
    host: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct HttpRequestCommand {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    body_kind: Option<String>,
    form_data: Option<Vec<HttpFormDataField>>,
    timeout_ms: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct HttpFormDataField {
    key: String,
    #[serde(alias = "type")]
    field_type: String,
    value: Option<String>,
    file_name: Option<String>,
    mime_type: Option<String>,
    data_base64: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct HttpRequestCommandResponse {
    success: bool,
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    error: Option<String>,
    set_cookies: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveStateEntry {
    key: String,
    value: String,
}

fn current_timestamp_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?;
    Ok(duration.as_millis() as i64)
}

fn ensure_writable_directory(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }

    let probe = dir.join(".traceforge-write-test");
    match fs::write(&probe, b"traceforge") {
        Ok(_) => {
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn fallback_storage_root_dir() -> Result<PathBuf, String> {
    let candidates = [
        env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|path| path.join("TraceForge").join("data")),
        env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|path| path.join("TraceForge").join("data")),
        env::var_os("HOME")
            .map(PathBuf::from)
            .map(|path| path.join(".traceforge").join("data")),
        Some(env::temp_dir().join("traceforge").join("data")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if ensure_writable_directory(&candidate) {
            return Ok(candidate);
        }
    }

    Err("Failed to find a writable storage directory".to_string())
}

fn migrate_state_database_if_needed(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    let source_db = source_dir.join(SQLITE_DB_FILE);
    let target_db = target_dir.join(SQLITE_DB_FILE);

    if !source_db.exists() || target_db.exists() {
        return Ok(());
    }

    fs::copy(&source_db, &target_db).map_err(|error| {
        format!(
            "Failed to migrate SQLite database from {} to {}: {error}",
            source_db.display(),
            target_db.display()
        )
    })?;

    for suffix in ["-wal", "-shm"] {
        let source_sidecar = source_dir.join(format!("{SQLITE_DB_FILE}{suffix}"));
        if source_sidecar.exists() {
            let target_sidecar = target_dir.join(format!("{SQLITE_DB_FILE}{suffix}"));
            fs::copy(&source_sidecar, &target_sidecar).map_err(|error| {
                format!(
                    "Failed to migrate SQLite sidecar from {} to {}: {error}",
                    source_sidecar.display(),
                    target_sidecar.display()
                )
            })?;
        }
    }

    Ok(())
}

fn storage_root_dir() -> Result<PathBuf, String> {
    let executable = env::current_exe()
        .map_err(|error| format!("Failed to resolve executable path: {error}"))?;
    let install_dir = executable
        .parent()
        .ok_or_else(|| "Failed to resolve installation directory".to_string())?;
    let data_dir = install_dir.join("data");

    if ensure_writable_directory(&data_dir) {
        return Ok(data_dir);
    }

    let fallback_dir = fallback_storage_root_dir()?;
    let _ = migrate_state_database_if_needed(&data_dir, &fallback_dir);
    Ok(fallback_dir)
}

fn open_state_database() -> Result<Connection, String> {
    let db_path = storage_root_dir()?.join(SQLITE_DB_FILE);
    let connection = Connection::open(&db_path).map_err(|error| {
        format!(
            "Failed to open SQLite database {}: {error}",
            db_path.display()
        )
    })?;

    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
       CREATE TABLE IF NOT EXISTS state_entries (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       );
       CREATE TABLE IF NOT EXISTS agent_memories (
         id TEXT PRIMARY KEY,
         category TEXT NOT NULL,
         content TEXT NOT NULL,
         metadata TEXT,
         created_at INTEGER NOT NULL
       );",
        )
        .map_err(|error| {
            format!(
                "Failed to initialize SQLite database {}: {error}",
                db_path.display()
            )
        })?;

    Ok(connection)
}

fn export_state_entries_to_config_file(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("SELECT key, value, updated_at FROM state_entries ORDER BY key ASC")
        .map_err(|error| format!("Failed to prepare SQLite export query: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| format!("Failed to query SQLite state entries for export: {error}"))?;

    let mut entries = serde_json::Map::new();
    let mut auth_value = serde_json::Value::Null;
    let mut settings_value = serde_json::Value::Null;

    for row in rows {
        let (key, value, updated_at) =
            row.map_err(|error| format!("Failed to read SQLite state entry for export: {error}"))?;

        if key == "traceforge.auth.api-config" {
            auth_value = serde_json::from_str(&value).unwrap_or_else(|_| json!({ "raw": value }));
        }

        if key == "traceforge.ui.settings" {
            settings_value = serde_json::from_str(&value).unwrap_or_else(|_| json!({ "raw": value }));
        }

        entries.insert(
            key,
            json!({
                "value": value,
                "updated_at": updated_at,
            }),
        );
    }

    let export_path = storage_root_dir()?.join(STATE_EXPORT_FILE);
    let payload = json!({
        "generated_at": current_timestamp_millis()?,
        "storage_root": storage_root_dir()?,
        "database_file": SQLITE_DB_FILE,
        "auth": auth_value,
        "settings": settings_value,
        "entries": entries,
    });

    fs::write(
        &export_path,
        serde_json::to_vec_pretty(&payload)
            .map_err(|error| format!("Failed to serialize config export: {error}"))?,
    )
    .map_err(|error| format!("Failed to write config export {}: {error}", export_path.display()))?;

    Ok(())
}

#[tauri::command]
fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        app_name: env!("CARGO_PKG_NAME").to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        profile: if cfg!(debug_assertions) {
            "debug".to_string()
        } else {
            "release".to_string()
        },
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri: tauri::VERSION.to_string(),
    }
}

#[tauri::command]
fn load_state_entries(keys: Vec<String>) -> Result<HashMap<String, String>, String> {
    let connection = open_state_database()?;
    let mut result = HashMap::new();

    for key in keys {
        match connection.query_row(
            "SELECT value FROM state_entries WHERE key = ?1",
            [&key],
            |row| row.get::<_, String>(0),
        ) {
            Ok(value) => {
                result.insert(key, value);
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(error) => {
                return Err(format!("Failed to load SQLite state entry: {error}"));
            }
        }
    }

    Ok(result)
}

#[tauri::command]
fn save_state_entries(entries: Vec<SaveStateEntry>) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let mut connection = open_state_database()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to open SQLite transaction: {error}"))?;
    let updated_at = current_timestamp_millis()?;

    for entry in entries {
        transaction
            .execute(
                "INSERT INTO state_entries (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE
         SET value = excluded.value,
             updated_at = excluded.updated_at",
                params![entry.key, entry.value, updated_at],
            )
            .map_err(|error| format!("Failed to save SQLite state entry: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit SQLite transaction: {error}"))?;
    export_state_entries_to_config_file(&connection)?;
    Ok(())
}

#[tauri::command]
fn remove_state_entries(keys: Vec<String>) -> Result<(), String> {
    if keys.is_empty() {
        return Ok(());
    }

    let mut connection = open_state_database()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to open SQLite transaction: {error}"))?;

    for key in keys {
        transaction
            .execute("DELETE FROM state_entries WHERE key = ?1", params![key])
            .map_err(|error| format!("Failed to delete SQLite state entry: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit SQLite transaction: {error}"))?;
    export_state_entries_to_config_file(&connection)?;
    Ok(())
}

#[tauri::command]
async fn send_http_request(
    request: HttpRequestCommand,
) -> Result<HttpRequestCommandResponse, String> {
    let method = Method::from_bytes(request.method.as_bytes())
        .map_err(|error| format!("Invalid HTTP method: {error}"))?;

    let timeout = std::time::Duration::from_millis(request.timeout_ms.unwrap_or(30_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| format!("Failed to build HTTP client: {error}"))?;

    let mut builder = client.request(method, &request.url);

    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }

    if matches!(request.body_kind.as_deref(), Some("form-data")) {
        let mut form = multipart::Form::new();

        for field in request.form_data.unwrap_or_default() {
            if field.field_type == "file" {
                let field_key = field.key.clone();
                let file_name = field
                    .file_name
                    .clone()
                    .unwrap_or_else(|| "upload.bin".to_string());
                let data_base64 = field
                    .data_base64
                    .as_deref()
                    .ok_or_else(|| format!("文件字段 \"{field_key}\" 缺少 base64 内容"))?;
                let data = BASE64_STANDARD.decode(data_base64).map_err(|error| {
                    format!("文件字段 \"{field_key}\" base64 解码失败: {error}")
                })?;

                let mut part = multipart::Part::bytes(data).file_name(file_name);
                if let Some(mime_type) = field.mime_type.as_deref() {
                    part = part.mime_str(mime_type).map_err(|error| {
                        format!("文件字段 \"{field_key}\" MIME 类型无效: {error}")
                    })?;
                }
                form = form.part(field.key, part);
            } else {
                form = form.text(field.key, field.value.unwrap_or_default());
            }
        }

        builder = builder.multipart(form);
    } else if matches!(request.body_kind.as_deref(), Some("text")) {
        if let Some(body) = request.body {
            builder = builder.body(body);
        }
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("Request failed: {error}"))?;

    let status = response.status();
    let status_text = status
        .canonical_reason()
        .map(str::to_string)
        .unwrap_or_default();

    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        let header_value = value
            .to_str()
            .map(str::to_string)
            .unwrap_or_else(|_| String::from_utf8_lossy(value.as_bytes()).to_string());

        headers
            .entry(key.as_str().to_string())
            .and_modify(|existing: &mut String| {
                existing.push_str(", ");
                existing.push_str(&header_value);
            })
            .or_insert(header_value);
    }

    let set_cookies = response
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok().map(str::to_string))
        .collect::<Vec<_>>();

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read response body: {error}"))?;

    Ok(HttpRequestCommandResponse {
        success: true,
        status: status.as_u16(),
        status_text,
        headers,
        body: BASE64_STANDARD.encode(bytes),
        error: None,
        set_cookies,
    })
}

#[tauri::command]
fn run_scriptcontrol(request: ScriptControlRunRequest) -> Result<ScriptControlRunResponse, String> {
    let powershell = Path::new(SCRIPTCONTROL_POWERSHELL_32);
    if !powershell.exists() {
        return Err(format!(
            "32-bit PowerShell host was not found at {}",
            powershell.display()
        ));
    }

    let workspace = create_temp_workspace("scriptcontrol-run")?;
    let runtime_path = workspace.join("runtime.js");
    let args_path = workspace.join("args.json");
    let runner_path = workspace.join("run.ps1");

    let runtime = format!(
        "{SCRIPTCONTROL_RUNTIME_PREAMBLE}\n\n{}",
        request.source_code
    );

    let response = (|| -> Result<ScriptControlRunResponse, String> {
        write_text_file(&runtime_path, &runtime)?;
        write_text_file(
            &args_path,
            &serde_json::to_string(&request.args).map_err(|error| error.to_string())?,
        )?;
        write_text_file(&runner_path, SCRIPTCONTROL_RUNNER)?;

        let output = Command::new(powershell)
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                runner_path.to_string_lossy().as_ref(),
                runtime_path.to_string_lossy().as_ref(),
                request.function_name.as_str(),
                args_path.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|error| format!("Failed to launch ScriptControl host: {error}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if stdout.is_empty() {
            if stderr.is_empty() {
                return Err("ScriptControl host returned no output.".to_string());
            }

            return Err(format!("ScriptControl host failed: {stderr}"));
        }

        let mut parsed: ScriptControlRunResponse = serde_json::from_str(&stdout)
            .map_err(|error| format!("Invalid ScriptControl output: {error}"))?;

        if !stderr.is_empty() {
            if parsed.error.is_empty() {
                parsed.error = stderr;
            } else {
                parsed.error = format!("{}\n{}", parsed.error, stderr);
            }
            parsed.success = false;
        }

        Ok(parsed)
    })();

    let _ = fs::remove_dir_all(&workspace);
    response
}

fn create_temp_workspace(prefix: &str) -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock error: {error}"))?;
    let dir = env::temp_dir().join(format!(
        "wt-js-next-{prefix}-{}-{}",
        std::process::id(),
        now.as_millis()
    ));
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create temp workspace {}: {error}", dir.display()))?;
    Ok(dir)
}

fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            load_state_entries,
            remove_state_entries,
            run_scriptcontrol,
            save_state_entries,
            send_http_request,
            agent_manager::invoke_agent_task_execution,
            agent_manager::invoke_agent_read_file,
            agent_manager::invoke_agent_save_memory,
            agent_manager::invoke_agent_load_memories,
            agent_manager::invoke_agent_grep_search,
            agent_manager::invoke_agent_hex_dump,
            agent_manager::invoke_agent_file_hash,
            agent_manager::invoke_agent_list_dir,
            agent_manager::invoke_agent_binary_info,
            agent_manager::invoke_agent_extract_strings,
            agent_manager::invoke_agent_write_file,
            thread_manager::list_threads,
            thread_manager::load_thread,
            thread_manager::save_thread,
            thread_manager::append_thread_events,
            thread_manager::delete_thread,
            thread_manager::rename_thread,
            thread_manager::reveal_threads_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
