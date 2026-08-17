use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const JOB_LEASE_MILLIS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobKind {
    OcrImage,
    OcrPdfPage,
    GenerateEmbedding,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDto {
    pub id: String,
    pub item_id: String,
    pub kind: JobKind,
    pub status: JobStatus,
    pub retry_count: i64,
    pub max_retries: i64,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

pub const JOBS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY NOT NULL,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    worker_id TEXT,
    lease_until INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
    ON jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_item
    ON jobs (item_id, created_at DESC);
"#;

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn kind_to_str(kind: JobKind) -> &'static str {
    match kind {
        JobKind::OcrImage => "ocr_image",
        JobKind::OcrPdfPage => "ocr_pdf_page",
        JobKind::GenerateEmbedding => "generate_embedding",
    }
}

fn str_to_kind(s: &str) -> JobKind {
    match s {
        "ocr_image" => JobKind::OcrImage,
        "ocr_pdf_page" => JobKind::OcrPdfPage,
        "generate_embedding" => JobKind::GenerateEmbedding,
        _ => JobKind::OcrImage,
    }
}

fn str_to_status(s: &str) -> JobStatus {
    match s {
        "pending" => JobStatus::Pending,
        "processing" => JobStatus::Processing,
        "completed" => JobStatus::Completed,
        "failed" => JobStatus::Failed,
        _ => JobStatus::Pending,
    }
}

fn job_from_row(row: &Row<'_>) -> rusqlite::Result<JobDto> {
    Ok(JobDto {
        id: row.get(0)?,
        item_id: row.get(1)?,
        kind: str_to_kind(&row.get::<_, String>(2)?),
        status: str_to_status(&row.get::<_, String>(3)?),
        retry_count: row.get(4)?,
        max_retries: row.get(5)?,
        error_message: row.get(6)?,
        created_at: row.get(7)?,
        started_at: row.get(8)?,
        completed_at: row.get(9)?,
    })
}

pub struct JobQueue;

impl JobQueue {
    pub fn enqueue_job(
        conn: &Connection,
        item_id: &str,
        kind: JobKind,
    ) -> rusqlite::Result<String> {
        let kind_name = kind_to_str(kind);
        let existing = conn
            .query_row(
                "SELECT id FROM jobs
                 WHERE item_id = ?1 AND kind = ?2 AND status IN ('pending', 'processing')
                 ORDER BY created_at DESC LIMIT 1",
                params![item_id, kind_name],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(id) = existing {
            return Ok(id);
        }

        let id = Uuid::new_v4().to_string();
        let now = now_millis();
        conn.execute(
            "INSERT INTO jobs (id, item_id, kind, status, created_at)
             VALUES (?1, ?2, ?3, 'pending', ?4)",
            params![id, item_id, kind_name, now],
        )?;
        Ok(id)
    }

    pub fn claim_next_job(
        conn: &Connection,
        worker_id: &str,
    ) -> rusqlite::Result<Option<JobDto>> {
        let tx = conn.unchecked_transaction()?;
        let mut job = tx
            .query_row(
                "SELECT id, item_id, kind, status, retry_count, max_retries,
                        error_message, created_at, started_at, completed_at
                 FROM jobs
                 WHERE status = 'pending'
                 ORDER BY created_at ASC
                 LIMIT 1",
                [],
                job_from_row,
            )
            .optional()?;

        if let Some(job) = job.as_mut() {
            let now = now_millis();
            tx.execute(
                "UPDATE jobs
                 SET status = 'processing', started_at = ?1,
                     worker_id = ?2, lease_until = ?3
                 WHERE id = ?4 AND status = 'pending'",
                params![now, worker_id, now.saturating_add(JOB_LEASE_MILLIS), job.id],
            )?;
            job.status = JobStatus::Processing;
            job.started_at = Some(now);
        }
        tx.commit()?;
        Ok(job)
    }

    pub fn renew_job_lease(
        conn: &Connection,
        job_id: &str,
        worker_id: &str,
    ) -> rusqlite::Result<bool> {
        let lease_until = now_millis().saturating_add(JOB_LEASE_MILLIS);
        let updated = conn.execute(
            "UPDATE jobs SET lease_until = ?1
             WHERE id = ?2 AND status = 'processing' AND worker_id = ?3",
            params![lease_until, job_id, worker_id],
        )?;
        Ok(updated > 0)
    }

    pub fn complete_job(
        conn: &Connection,
        job_id: &str,
        worker_id: &str,
    ) -> rusqlite::Result<bool> {
        let now = now_millis();
        let updated = conn.execute(
            "UPDATE jobs
             SET status = 'completed', completed_at = ?1,
                 started_at = COALESCE(started_at, ?1),
                 worker_id = NULL, lease_until = NULL
             WHERE id = ?2 AND status = 'processing' AND worker_id = ?3",
            params![now, job_id, worker_id],
        )?;
        Ok(updated > 0)
    }

    pub fn fail_job(
        conn: &Connection,
        job_id: &str,
        worker_id: &str,
        error: &str,
    ) -> rusqlite::Result<bool> {
        let now = now_millis();
        let tx = conn.unchecked_transaction()?;
        let updated = tx.execute(
            "UPDATE jobs
             SET error_message = ?1, started_at = COALESCE(started_at, ?2)
             WHERE id = ?3 AND status = 'processing'
               AND worker_id = ?4 AND retry_count < max_retries",
            params![error, now, job_id, worker_id],
        )?;

        if updated == 0 {
            let failed = tx.execute(
                "UPDATE jobs
                 SET status = 'failed', completed_at = ?1, error_message = ?2,
                     worker_id = NULL, lease_until = NULL
                 WHERE id = ?3 AND status = 'processing' AND worker_id = ?4",
                params![now, error, job_id, worker_id],
            )?;
            tx.commit()?;
            return Ok(failed > 0);
        }

        tx.execute(
            "UPDATE jobs
             SET status = 'pending', retry_count = retry_count + 1,
                 worker_id = NULL, lease_until = NULL
             WHERE id = ?1 AND status = 'processing' AND worker_id = ?2",
            params![job_id, worker_id],
        )?;
        tx.commit()?;
        Ok(true)
    }

    pub fn get_jobs_for_item(
        conn: &Connection,
        item_id: &str,
    ) -> rusqlite::Result<Vec<JobDto>> {
        let mut stmt = conn.prepare(
            "SELECT id, item_id, kind, status, retry_count, max_retries,
                    error_message, created_at, started_at, completed_at
             FROM jobs WHERE item_id = ?1 ORDER BY created_at DESC",
        )?;
        let jobs = stmt
            .query_map(params![item_id], job_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(jobs)
    }

    /// Requeue jobs left in `processing` after an interrupted worker run.
    ///
    /// Requeue only jobs whose lease has expired. This prevents one live worker
    /// from reclaiming another worker's in-flight job.
    pub fn recover_processing_jobs(conn: &Connection) -> rusqlite::Result<usize> {
        conn.execute(
            "UPDATE jobs
             SET status = 'pending', started_at = NULL, error_message = NULL,
                 worker_id = NULL, lease_until = NULL
             WHERE status = 'processing'
               AND (lease_until IS NULL OR lease_until <= ?1)",
            params![now_millis()],
        )
    }

    pub fn count_active_jobs(conn: &Connection) -> rusqlite::Result<i64> {
        conn.query_row(
            "SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'processing')",
            [],
            |row| row.get(0),
        )
    }
}

pub struct ProcessingState {
    pub wake_tx: std::sync::Mutex<Option<Sender<()>>>,
    pub database_path: std::sync::Mutex<Option<PathBuf>>,
    pub worker_handle: std::sync::Mutex<Option<thread::JoinHandle<()>>>,
    worker_id: String,
}

impl Default for ProcessingState {
    fn default() -> Self {
        Self {
            wake_tx: std::sync::Mutex::new(None),
            database_path: std::sync::Mutex::new(None),
            worker_handle: std::sync::Mutex::new(None),
            worker_id: Uuid::new_v4().to_string(),
        }
    }
}

impl ProcessingState {
    pub fn set_database_path(&self, path: PathBuf) {
        let mut guard = self.database_path.lock().unwrap();
        *guard = Some(path);
        let path = guard.clone().unwrap();
        drop(guard);
        self.start_worker_if_needed(&path);
    }

    fn start_worker_if_needed(&self, db_path: &PathBuf) {
        let mut handle_guard = self.worker_handle.lock().unwrap();
        if handle_guard.is_some() {
            return;
        }

        let (tx, rx) = mpsc::channel::<()>();
        *self.wake_tx.lock().unwrap() = Some(tx);

        let db_path = db_path.to_path_buf();
        let worker_id = self.worker_id.clone();
        let handle = thread::Builder::new()
            .name("job-worker".into())
            .spawn(move || worker_loop(&db_path, &worker_id, rx))
            .expect("failed to spawn job worker thread");
        *handle_guard = Some(handle);
    }

    pub fn enqueue_and_wake(&self, _item_id: &str, _kind: JobKind) {
        if let Some(tx) = self.wake_tx.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
    }
}

fn worker_loop(db_path: &PathBuf, worker_id: &str, rx: Receiver<()>) {
    loop {
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(()) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        process_pending_jobs(db_path, worker_id);
    }
}

fn process_pending_jobs(db_path: &PathBuf, worker_id: &str) {
    let storage = match crate::storage::LibraryStorage::open(db_path.clone()) {
        Ok(s) => s,
        Err(_) => return,
    };

    let conn = &storage.connection;

    if JobQueue::recover_processing_jobs(conn).is_err() {
        return;
    }

    loop {
        let job = match JobQueue::claim_next_job(conn, worker_id) {
            Ok(Some(job)) => job,
            _ => break,
        };

        process_job(&storage, job, worker_id, db_path);
    }
}

fn process_job(
    storage: &crate::storage::LibraryStorage,
    job: JobDto,
    worker_id: &str,
    db_path: &PathBuf,
) {
    let item = match storage.get_item(&job.item_id) {
        Ok(Some(item)) => item,
        _ => {
            let _ = JobQueue::fail_job(&storage.connection, &job.id, worker_id, "item not found");
            return;
        }
    };

    match job.kind {
        JobKind::OcrImage => {
            let bytes = match read_item_asset(storage, &item) {
                Ok(bytes) => bytes,
                Err(error) => {
                    fail_claimed_job(storage, &job, worker_id, &error);
                    return;
                }
            };
            process_image_ocr(storage, &item, &job, worker_id, db_path, &bytes);
        }
        JobKind::OcrPdfPage => {
            let bytes = match read_item_asset(storage, &item) {
                Ok(bytes) => bytes,
                Err(error) => {
                    fail_claimed_job(storage, &job, worker_id, &error);
                    return;
                }
            };
            process_pdf_ocr(storage, &item, &job, worker_id, db_path, &bytes);
        }
        JobKind::GenerateEmbedding => {
            process_embeddings(storage, &item, &job, worker_id, db_path);
        }
    }
}

fn read_item_asset(
    storage: &crate::storage::LibraryStorage,
    item: &crate::storage::ItemDto,
) -> Result<Vec<u8>, String> {
    let asset_path = item
        .local_asset_path
        .as_deref()
        .ok_or_else(|| "item has no local asset path".to_string())?;
    let resolved = storage
        .resolve_asset_path(asset_path)
        .map_err(|error| format!("cannot resolve asset: {error}"))?;
    if !std::path::Path::new(&resolved).exists() {
        return Err("asset file not found".into());
    }
    std::fs::read(&resolved).map_err(|error| format!("cannot read asset: {error}"))
}

fn fail_claimed_job(
    storage: &crate::storage::LibraryStorage,
    job: &JobDto,
    worker_id: &str,
    error: &str,
) {
    let _ = JobQueue::fail_job(&storage.connection, &job.id, worker_id, error);
}

fn process_image_ocr(
    storage: &crate::storage::LibraryStorage,
    item: &crate::storage::ItemDto,
    job: &JobDto,
    worker_id: &str,
    db_path: &PathBuf,
    bytes: &[u8],
) {
    let backend = crate::ocr::create_ocr_backend();
    let (stop_heartbeat, heartbeat_handle) = start_job_lease_heartbeat(db_path, &job.id, worker_id);
    let extraction = backend.extract_text(bytes);
    let _ = stop_heartbeat.send(());
    let _ = heartbeat_handle.join();

    match extraction {
        Ok(Some(text)) => match storage.update_item_ocr_text(&item.id, &text, backend.name()) {
            Ok(()) => {
                let _ = JobQueue::enqueue_job(&storage.connection, &item.id, JobKind::GenerateEmbedding);
                let _ = JobQueue::complete_job(&storage.connection, &job.id, worker_id);
            }
            Err(error) => fail_claimed_job(
                storage,
                job,
                worker_id,
                &format!("cannot store OCR text: {error}"),
            ),
        },
        Ok(None) => {
            let _ = JobQueue::complete_job(&storage.connection, &job.id, worker_id);
        }
        Err(error) => fail_claimed_job(storage, job, worker_id, &error.to_string()),
    }
}

fn process_pdf_ocr(
    storage: &crate::storage::LibraryStorage,
    item: &crate::storage::ItemDto,
    job: &JobDto,
    worker_id: &str,
    db_path: &PathBuf,
    bytes: &[u8],
) {
    let backend = crate::ocr::create_ocr_backend();
    let (stop_heartbeat, heartbeat_handle) = start_job_lease_heartbeat(db_path, &job.id, worker_id);
    let extraction = extract_pdf_text(backend.as_ref(), bytes);
    let _ = stop_heartbeat.send(());
    let _ = heartbeat_handle.join();

    match extraction {
        Ok(Some((text, engine))) => match storage.update_item_ocr_text(&item.id, &text, &engine) {
            Ok(()) => {
                let _ = JobQueue::enqueue_job(&storage.connection, &item.id, JobKind::GenerateEmbedding);
                let _ = JobQueue::complete_job(&storage.connection, &job.id, worker_id);
            }
            Err(error) => fail_claimed_job(
                storage,
                job,
                worker_id,
                &format!("cannot store PDF text: {error}"),
            ),
        },
        Ok(None) => {
            let _ = JobQueue::complete_job(&storage.connection, &job.id, worker_id);
        }
        Err(error) => fail_claimed_job(storage, job, worker_id, &error),
    }
}

fn extract_pdf_text(
    backend: &dyn crate::ocr::OcrBackend,
    bytes: &[u8],
) -> Result<Option<(String, String)>, String> {
    let mut pages = crate::pdf::extract_text_by_pages(bytes)
        .map_err(|error| format!("PDF extraction failed: {error}"))?;
    let needs_ocr = pages.iter().any(|page| page.is_empty());
    let mut ocr_pages = 0;

    if needs_ocr {
        let rendered_pages = crate::pdf::render_pages(bytes)
            .map_err(|error| format!("PDF page rendering failed: {error}"))?;
        if rendered_pages.len() < pages.len() {
            return Err("PDF renderer returned fewer pages than the text extractor".into());
        }
        for (page, rendered) in pages.iter_mut().zip(rendered_pages.iter()) {
            if !page.is_empty() {
                continue;
            }
            if let Some(text) = backend
                .extract_text(rendered)
                .map_err(|error| format!("PDF page OCR failed: {error}"))?
            {
                *page = text;
                ocr_pages += 1;
            }
        }
    }

    let text = pages
        .into_iter()
        .filter(|page| !page.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.is_empty() {
        return Ok(None);
    }
    let engine = if ocr_pages == 0 {
        "pdf-text".to_string()
    } else {
        format!("pdf-text+{}-ocr", backend.name())
    };
    Ok(Some((text, engine)))
}

fn process_embeddings(
    storage: &crate::storage::LibraryStorage,
    item: &crate::storage::ItemDto,
    job: &JobDto,
    worker_id: &str,
    db_path: &PathBuf,
) {
    let model_cache = db_path
        .parent()
        .map(|path| path.join("models"))
        .unwrap_or_else(|| PathBuf::from("models"));
    let (stop_heartbeat, heartbeat_handle) = start_job_lease_heartbeat(db_path, &job.id, worker_id);
    let result = generate_embeddings(storage, item, &model_cache);
    let _ = stop_heartbeat.send(());
    let _ = heartbeat_handle.join();

    match result {
        Ok(()) => {
            let _ = JobQueue::complete_job(&storage.connection, &job.id, worker_id);
        }
        Err(error) => fail_claimed_job(storage, job, worker_id, &error),
    }
}

fn generate_embeddings(
    storage: &crate::storage::LibraryStorage,
    item: &crate::storage::ItemDto,
    model_cache: &std::path::Path,
) -> Result<(), String> {
    let text = embedding_text(item);
    if let Some(text) = text.as_deref() {
        let vector = crate::embeddings::text_embedding(model_cache, text)?;
        let bytes = crate::embeddings::encode_f32(&vector);
        storage
            .store_embedding(
                &item.id,
                "text",
                crate::embeddings::TEXT_MODEL,
                &bytes,
                vector.len(),
            )
            .map_err(|error| format!("cannot store text embedding: {error}"))?;
    }

    if item.kind == "image" {
        let image_bytes = read_item_asset(storage, item)?;
        let vector = crate::embeddings::image_embedding(model_cache, &image_bytes)?;
        let bytes = crate::embeddings::encode_f32(&vector);
        storage
            .store_embedding(
                &item.id,
                "image",
                crate::embeddings::IMAGE_MODEL,
                &bytes,
                vector.len(),
            )
            .map_err(|error| format!("cannot store image embedding: {error}"))?;
    }

    Ok(())
}

fn embedding_text(item: &crate::storage::ItemDto) -> Option<String> {
    let mut parts = Vec::new();
    for value in [item.title.as_deref(), item.description.as_deref(), Some(item.ocr_text.as_str())]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(value.to_owned());
    }
    for key in ["text", "extractedText"] {
        if let Some(value) = item.metadata.get(key).and_then(serde_json::Value::as_str) {
            let value = value.trim();
            if !value.is_empty() {
                parts.push(value.to_owned());
            }
        }
    }
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

fn start_job_lease_heartbeat(
    db_path: &PathBuf,
    job_id: &str,
    worker_id: &str,
) -> (Sender<()>, thread::JoinHandle<()>) {
    let (stop_tx, stop_rx) = mpsc::channel();
    let db_path = db_path.clone();
    let job_id = job_id.to_owned();
    let worker_id = worker_id.to_owned();
    let interval = Duration::from_millis((JOB_LEASE_MILLIS / 3) as u64);
    let handle = thread::Builder::new()
        .name("job-lease-heartbeat".into())
        .spawn(move || loop {
            match stop_rx.recv_timeout(interval) {
                Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    let connection = match Connection::open(&db_path) {
                        Ok(connection) => connection,
                        Err(_) => continue,
                    };
                    let _ = connection.busy_timeout(Duration::from_secs(5));
                    let _ = JobQueue::renew_job_lease(&connection, &job_id, &worker_id);
                }
            }
        })
        .expect("failed to spawn job lease heartbeat thread");
    (stop_tx, handle)
}

pub(crate) fn enqueue_ocr_for_item(
    conn: &Connection,
    item_id: &str,
    item_kind: &str,
) -> rusqlite::Result<Option<String>> {
    let kind = match item_kind {
        "image" => JobKind::OcrImage,
        "pdf" => JobKind::OcrPdfPage,
        _ => return Ok(None),
    };

    JobQueue::enqueue_job(conn, item_id, kind).map(Some)
}

pub(crate) fn enqueue_embedding_for_item(
    conn: &Connection,
    item_id: &str,
) -> rusqlite::Result<String> {
    JobQueue::enqueue_job(conn, item_id, JobKind::GenerateEmbedding)
}

#[tauri::command]
pub fn enqueue_ocr_job(
    item_id: String,
    state: tauri::State<'_, ProcessingState>,
    storage_state: tauri::State<'_, crate::storage::StorageState>,
) -> Result<String, String> {
    let guard = storage_state.lock().map_err(|_| "storage lock poisoned".to_string())?;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "storage not initialized".to_string())?;
    let item = storage
        .get_item(&item_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "item not found".to_string())?;
    let job_id = enqueue_ocr_for_item(&storage.connection, &item_id, &item.kind)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "OCR is only available for image and PDF items".to_string())?;

    let kind = if item.kind == "pdf" {
        JobKind::OcrPdfPage
    } else {
        JobKind::OcrImage
    };
    state.enqueue_and_wake(&item_id, kind);
    Ok(job_id)
}

#[tauri::command]
pub fn get_job_status(
    item_id: String,
    storage_state: tauri::State<'_, crate::storage::StorageState>,
) -> Result<Vec<JobDto>, String> {
    let guard = storage_state.lock().map_err(|_| "storage lock poisoned".to_string())?;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "storage not initialized".to_string())?;
    JobQueue::get_jobs_for_item(&storage.connection, &item_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn count_active_jobs(
    storage_state: tauri::State<'_, crate::storage::StorageState>,
) -> Result<i64, String> {
    let guard = storage_state.lock().map_err(|_| "storage lock poisoned".to_string())?;
    let storage = guard
        .as_ref()
        .ok_or_else(|| "storage not initialized".to_string())?;
    JobQueue::count_active_jobs(&storage.connection).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE items (id TEXT PRIMARY KEY NOT NULL);\n                 CREATE TABLE jobs (\n                     id TEXT PRIMARY KEY NOT NULL,\n                     item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n                     kind TEXT NOT NULL,\n                     status TEXT NOT NULL DEFAULT 'pending',\n                     retry_count INTEGER NOT NULL DEFAULT 0,\n                     max_retries INTEGER NOT NULL DEFAULT 3,\n                     error_message TEXT,\n                     created_at INTEGER NOT NULL,\n                     started_at INTEGER,\n                     completed_at INTEGER,\n                     worker_id TEXT,\n                     lease_until INTEGER\n                 );",
            )
            .unwrap();
        connection
    }

    #[test]
    fn recovers_expired_jobs_but_preserves_live_leases() {
        let connection = test_connection();
        connection
            .execute_batch(
                "INSERT INTO items (id) VALUES ('item-1');
                 INSERT INTO jobs (
                    id, item_id, kind, status, error_message, created_at, started_at
                 ) VALUES ('job-1', 'item-1', 'ocr_image', 'processing', 'old error', 1, 2);
                 INSERT INTO jobs (
                    id, item_id, kind, status, created_at, started_at, worker_id, lease_until
                 ) VALUES ('job-2', 'item-1', 'ocr_image', 'processing', 3, 4, 'worker-a', 9999999999999);",
            )
            .unwrap();

        assert_eq!(JobQueue::recover_processing_jobs(&connection).unwrap(), 1);
        let jobs = JobQueue::get_jobs_for_item(&connection, "item-1").unwrap();
        let expired = jobs.iter().find(|job| job.id == "job-1").unwrap();
        assert_eq!(expired.status, JobStatus::Pending);
        assert_eq!(expired.started_at, None);
        assert_eq!(expired.error_message, None);
        let live = jobs.iter().find(|job| job.id == "job-2").unwrap();
        assert_eq!(live.status, JobStatus::Processing);
        assert_eq!(JobQueue::count_active_jobs(&connection).unwrap(), 2);

        assert_eq!(
            JobQueue::enqueue_job(&connection, "item-1", JobKind::OcrImage).unwrap(),
            "job-1"
        );
        assert_eq!(
            JobQueue::claim_next_job(&connection, "worker-b")
                .unwrap()
                .unwrap()
                .status,
            JobStatus::Processing
        );
    }

    #[test]
    fn only_the_owner_can_finish_a_claimed_job() {
        let connection = test_connection();
        connection
            .execute("INSERT INTO items (id) VALUES ('item-1')", [])
            .unwrap();
        JobQueue::enqueue_job(&connection, "item-1", JobKind::OcrImage).unwrap();
        let job = JobQueue::claim_next_job(&connection, "worker-a")
            .unwrap()
            .unwrap();

        assert!(!JobQueue::complete_job(&connection, &job.id, "worker-b").unwrap());
        assert!(JobQueue::complete_job(&connection, &job.id, "worker-a").unwrap());
        assert_eq!(
            JobQueue::get_jobs_for_item(&connection, "item-1")
                .unwrap()
                .pop()
                .unwrap()
                .status,
            JobStatus::Completed
        );
    }
}
