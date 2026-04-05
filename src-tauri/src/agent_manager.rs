use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Deserialize)]
pub struct AgentCommandRequest {
    pub cmd: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Serialize)]
pub struct AgentCommandResponse {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub interrupted: bool,
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

    // --- Automatic Tool Path Discovery ---
    // Inject common paths for reverse engineering tools (Frida, ADB, Jadx, Python)
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
                    "line": line
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
    // Stream STDERR in a separate task (capped at 2000 lines)
    let stderr_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut lines = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_clone.emit(
                "agent-log",
                serde_json::json!({
                    "source": "stderr",
                    "line": line
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
            let _ = window.emit("agent-log", serde_json::json!({ "source": "error", "line": format!("Process error: {}", e) }));
        }
        Err(_) => {
            // Timeout occurred
            let _ = child.kill().await;
            interrupted = true;
            let _ = window.emit("agent-log", serde_json::json!({
                "source": "stderr",
                "line": format!("\n[Timeout] Process killed after {}ms", timeout_ms)
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
}

#[tauri::command]
pub async fn invoke_agent_write_file(
    request: AgentWriteFileRequest,
) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

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
