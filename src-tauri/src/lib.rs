mod commands;
mod ict;
mod news;
mod service;
mod types;
mod yahoo;

use news::NewsService;
use service::DataService;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let data_service = DataService::new();
      app.manage(data_service.clone());
      // Start the news + economic-events service (periodic Yahoo news +
      // Finnhub calendar fetches, emitting `news` / `econ_events` events).
      let news_service = NewsService::new(data_service.rest.clone());
      app.manage(news_service.clone());
      news_service.start(app.handle().clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::get_history,
      commands::get_quote,
      commands::start_stream,
      commands::get_ict_state,
      commands::get_news,
      commands::get_econ_events,
      commands::get_econ_provider_label,
      commands::set_notifications_enabled,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
