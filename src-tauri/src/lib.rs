mod trace;

use std::path::PathBuf;

#[tauri::command]
fn load_trace(path: String) -> Result<trace::Header, String> {
    let trace = trace::TraceLoader::new(PathBuf::from(path))
        .map_err(|e| e.to_string())?;
    let header = trace.parse_header().map_err(|e| e.to_string())?;
    Ok(header)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_trace])
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
