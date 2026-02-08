mod trace;
mod session;

use std::path::PathBuf;
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use crate::session::{SessionState, CommandConfig, MemoryLayout};

#[tauri::command]
fn load_trace(
    app: AppHandle,
    path: String,
    session: State<'_, SessionState>,
) -> Result<trace::header::Header, String> {
    let loader = trace::TraceLoader::new(PathBuf::from(path)).map_err(|e| e.to_string())?;

    let header = *loader.header();
    {
        let mut guard = session.loader.lock().map_err(|e| e.to_string())?;
        *guard = Some(loader);
    }

    let config = session::load_command_config(&app)?;
    {
        let mut guard = session.config.lock().map_err(|e| e.to_string())?;
        *guard = config;
    }

    Ok(header)
}

#[tauri::command]
fn get_command_config(
    app: AppHandle,
    session: State<'_, SessionState>,
) -> Result<Option<CommandConfig>, String> {
    let guard = session.config.lock().map_err(|e| e.to_string())?;
    
    if let Some(config) = guard.as_ref() {
        return Ok(Some(config.clone()));
    }

    drop(guard);

    session::load_command_config(&app)
}

#[tauri::command]
fn set_command_config(
    app: AppHandle,
    session: State<'_, SessionState>,
    config: CommandConfig,
) -> Result<(), String> {
    session::set_command_config(&app, &session, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_memory_layout(
    app: AppHandle,
    session: State<'_, SessionState>,
) -> Result<Option<MemoryLayout>, String> {
    let guard = session.memory.lock().map_err(|e| e.to_string())?;
    if let Some(layout) = guard.as_ref() {
        return Ok(Some(layout.clone()));
    }
    drop(guard);
    session::load_memory_layout(&app)
}

#[tauri::command]
fn set_memory_layout(
    app: AppHandle,
    session: State<'_, SessionState>,
    layout: MemoryLayout,
) -> Result<(), String> {
    session::set_memory_layout(&app, &session, layout).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_dictionary(
    session: State<'_, SessionState>,
) -> Result<trace::dictionary::Dictionary, String> {
    let guard = session.loader.lock().map_err(|e| e.to_string())?;

    let loader = guard
        .as_ref()
        .ok_or_else(|| "No trace loaded. Call load_trace first.".to_string())?;

    loader.load_dictionary().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_entry_index_by_time(time: i64, session: State<'_, SessionState>) -> Result<u64, String> {
    let loader_guard = session.loader.lock().map_err(|e| e.to_string())?;
    let loader = loader_guard
        .as_ref()
        .ok_or_else(|| "No trace loaded".to_string())?;
    loader.find_index_for_time(time).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_trace_view(
    start: u64,
    count: u64,
    session: State<'_, SessionState>,
) -> Result<Response, String> {
    let loader_guard = session.loader.lock().map_err(|e| e.to_string())?;
    let loader = loader_guard
        .as_ref()
        .ok_or_else(|| "No trace loaded".to_string())?;

    let entries = loader
        .load_entry_slice(start, count as usize)
        .map_err(|e| e.to_string())?;
    let bytes = trace::entry::get_entry_range_bytes(entries);

    Ok(Response::new(bytes))
}

#[tauri::command]
fn close_session(session: State<'_, SessionState>) -> Result<(), String> {
    {
        let mut guard = session.loader.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    {
        let mut guard = session.config.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
fn get_session_info(
    session: State<'_, SessionState>,
) -> Result<Option<trace::header::Header>, String> {
    let guard = session.loader.lock().map_err(|e| e.to_string())?;
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
            get_session_info,
            get_trace_view,
            get_entry_index_by_time,
            get_command_config,
            set_command_config,
            get_memory_layout,
            set_memory_layout,
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
