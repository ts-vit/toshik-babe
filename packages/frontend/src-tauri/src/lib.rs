use std::fs::{self, OpenOptions};
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{plugin::Builder as PluginBuilder, AppHandle, Manager, RunEvent, Runtime, State};

/// Holds the backend child process so we can kill it on app exit.
struct BackendProcess(Mutex<Option<Child>>);

/// Plugin that kills the backend process on app exit (Tauri 2 has no Builder::on_event, only in plugins).
fn backend_cleanup_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    PluginBuilder::new("backend-cleanup").on_event(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app.try_state::<BackendProcess>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(ref mut child) = *guard {
                        let pid = child.id();
                        log::info!("Killing backend process (pid={})", pid);
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    *guard = None;
                }
            }
        }
    }).build()
}

/// Scan ports 3001–3010 and return the first available one.
fn find_available_port() -> Option<u16> {
    for port in 3001..=3010 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Some(port);
        }
    }
    None
}

/// Tauri command: find a free port, spawn `bun run packages/backend/src/index.ts --port <PORT>`,
/// redirect stdout/stderr to `backend.log`, and return the chosen port.
#[tauri::command]
fn start_backend(app: AppHandle, state: State<'_, BackendProcess>) -> Result<u16, String> {
    // If backend is already running, don't spawn another one.
    {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(ref child) = *guard {
            // Check if still alive by trying to get its id (non-zero means alive).
            let _pid = child.id();
            // Already running — we can't easily check exit status without `try_wait`
            // but we'll handle it below after dropping the guard.
        }
    }
    // Re-check with try_wait to see if it actually exited.
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = *guard {
            match child.try_wait() {
                Ok(Some(_exited)) => {
                    // Process exited, we can spawn a new one.
                    *guard = None;
                }
                Ok(None) => {
                    // Still running — return error.
                    return Err("Backend is already running".into());
                }
                Err(e) => {
                    log::warn!("Failed to check backend process status: {e}");
                    *guard = None;
                }
            }
        }
    }

    let port = find_available_port().ok_or("No available port in range 3001-3010")?;

    // Resolve log file path inside Tauri's app data directory.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;

    let log_path = app_data_dir.join("backend.log");
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open backend.log: {e}"))?;

    let log_file_err = log_file
        .try_clone()
        .map_err(|e| format!("Failed to clone log file handle: {e}"))?;

    // Resolve the backend entry point relative to the resource directory.
    // In dev mode, the workspace root is two levels up from src-tauri.
    // We'll look for "bun" in PATH and pass the script path.
    let backend_script = {
        // Try to resolve relative to the current executable's grandparent (workspace root).
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        // In development, Cargo builds into src-tauri/target/debug, so workspace root is ../../../../
        // We'll try multiple candidate paths.
        let candidates: Vec<std::path::PathBuf> = if let Some(ref dir) = exe_dir {
            vec![
                // dev build: target/debug/toshik-babe-engine -> ../../packages/backend/src/index.ts
                dir.join("../../../packages/backend/src/index.ts"),
                dir.join("../../../../packages/backend/src/index.ts"),
                dir.join("../../../../../packages/backend/src/index.ts"),
            ]
        } else {
            vec![]
        };

        let mut found: Option<std::path::PathBuf> = None;
        for candidate in &candidates {
            if let Ok(canonical) = candidate.canonicalize() {
                found = Some(canonical);
                break;
            }
        }

        // Fallback: try relative to CWD
        if found.is_none() {
            let cwd_candidate = std::path::PathBuf::from("packages/backend/src/index.ts");
            if cwd_candidate.exists() {
                found = Some(cwd_candidate.canonicalize().unwrap_or(cwd_candidate));
            }
        }

        found.ok_or_else(|| "Cannot locate packages/backend/src/index.ts".to_string())?
    };

    log::info!(
        "Starting backend on port {port}, script: {}, log: {}",
        backend_script.display(),
        log_path.display()
    );

    // Resolve .env path from workspace root (backend_script = <workspace>/packages/backend/src/index.ts)
    let env_file = backend_script
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|root| root.join(".env"));

    let mut cmd = Command::new("bun");
    cmd.arg("run");

    if let Some(ref env_path) = env_file {
        if env_path.exists() {
            cmd.arg(format!("--env-file={}", env_path.display()));
        }
    }

    let child = cmd
        .arg(&backend_script)
        .arg("--port")
        .arg(port.to_string())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_file_err))
        .spawn()
        .map_err(|e| format!("Failed to spawn bun backend: {e}"))?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);

    Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(backend_cleanup_plugin())
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_backend])
        .setup(|app| {
            // Stronghold needs a salt file for argon2 key derivation.
            let salt_path = app
                .path()
                .app_local_data_dir()
                .expect("could not resolve app local data path")
                .join("stronghold-salt.txt");
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
