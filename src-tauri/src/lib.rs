mod trace;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// Holds the current session state i.e. the loaded trace file and its parsed data.
pub struct SessionState(Mutex<Option<trace::TraceLoader>>);

impl SessionState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
fn load_trace(
    path: String,
    session: State<'_, SessionState>,
) -> Result<trace::header::Header, String> {
    let loader = trace::TraceLoader::new(PathBuf::from(path)).map_err(|e| e.to_string())?;

    let header = *loader.header();

    let mut guard = session.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(loader);

    Ok(header)
}

#[tauri::command]
fn load_dictionary(
    session: State<'_, SessionState>,
) -> Result<trace::dictionary::Dictionary, String> {
    let guard = session.0.lock().map_err(|e| e.to_string())?;

    let loader = guard
        .as_ref()
        .ok_or_else(|| "No trace loaded. Call load_trace first.".to_string())?;

    loader.load_dictionary().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_session(session: State<'_, SessionState>) -> Result<(), String> {
    let mut guard = session.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn get_session_info(
    session: State<'_, SessionState>,
) -> Result<Option<trace::header::Header>, String> {
    let guard = session.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|loader| *loader.header()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionState::new())
        .invoke_handler(tauri::generate_handler![
            load_trace,
            load_dictionary,
            close_session,
            get_session_info
        ])
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
