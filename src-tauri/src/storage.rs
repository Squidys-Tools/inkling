use std::{
    collections::HashMap,
    fmt, fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use image::{GenericImageView, ImageFormat, ImageReader};
use pulldown_cmark::{Event, Parser, Tag};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};
use url::Url;
use uuid::Uuid;

// 8 is regular Spaces. 7 was claimed by both that change and note bodies on
// main; every column below is added by an idempotent presence check, so the
// collision was survivable but the number lied about what had migrated.
const SCHEMA_VERSION: i64 = 8;
const BODY_FORMAT_MARKDOWN: &str = "md";
const MAX_FILE_BYTES: usize = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 20_000;
const MAX_IMAGE_ALLOC_BYTES: u64 = 256 * 1024 * 1024;
const THUMBNAIL_EDGE: u32 = 512;

const ITEMS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    title TEXT,
    description TEXT,
    body TEXT NOT NULL DEFAULT '',
    body_format TEXT NOT NULL DEFAULT 'md',
    source_url TEXT,
    source_label TEXT,
    local_asset_path TEXT,
    thumbnail_path TEXT,
    ocr_text TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_items_active_updated
    ON items (archived, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_kind
    ON items (kind);

"#;

const EMBEDDINGS_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS item_embeddings (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
    model TEXT NOT NULL,
    dimension INTEGER NOT NULL CHECK (dimension > 0),
    vector BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_item_embeddings_kind
    ON item_embeddings (kind, model);
"#;

const SPACES_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    query TEXT NOT NULL DEFAULT '{}',
    kind TEXT NOT NULL DEFAULT 'smart',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spaces_position
    ON spaces (position, created_at);

-- Manual membership. Only Regular Spaces use it; a Smart Space derives its
-- contents from its query instead. Rows survive archiving so a restored item
-- rejoins the Space it was filed under.
CREATE TABLE IF NOT EXISTS space_items (
    space_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (space_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_space_items_item
    ON space_items (item_id);
"#;

#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Image(image::ImageError),
    Sql(rusqlite::Error),
    Json(serde_json::Error),
    NotInitialized,
    NotFound(String),
    InvalidInput(String),
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "storage filesystem error: {error}"),
            Self::Image(error) => write!(formatter, "image processing error: {error}"),
            Self::Sql(error) => write!(formatter, "storage database error: {error}"),
            Self::Json(error) => write!(formatter, "storage metadata error: {error}"),
            Self::NotInitialized => write!(formatter, "storage has not been initialized"),
            Self::NotFound(id) => write!(formatter, "item not found: {id}"),
            Self::InvalidInput(message) => write!(formatter, "invalid storage input: {message}"),
        }
    }
}

impl std::error::Error for StorageError {}

impl From<std::io::Error> for StorageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<image::ImageError> for StorageError {
    fn from(error: image::ImageError) -> Self {
        Self::Image(error)
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<StorageError> for String {
    fn from(error: StorageError) -> Self {
        error.to_string()
    }
}

#[derive(Default)]
pub struct StorageState {
    database: Mutex<Option<LibraryStorage>>,
}

pub struct LibraryStorage {
    pub(crate) connection: Connection,
    pub(crate) database_path: PathBuf,
    pub(crate) fts5_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub database_path: String,
    pub fts5_enabled: bool,
    pub schema_version: i64,
}

/// One export is a folder the user keeps: a consistent database snapshot, the
/// asset files that snapshot references, and a manifest describing both.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub directory: String,
    pub items: i64,
    pub archived_items: i64,
    pub spaces: i64,
    pub asset_files: u64,
    pub skipped_assets: u64,
    pub database_bytes: u64,
    pub assets_bytes: u64,
}

/// What the database phase of an export hands to the file phase: paths and
/// counts only, so the asset copy needs no database access.
struct ExportPlan {
    directory: PathBuf,
    exported_at: i64,
    assets_directory: PathBuf,
    item_ids: Vec<String>,
    archived_items: i64,
    spaces: i64,
    database_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkippedAsset {
    path: String,
    error: String,
}

#[derive(Debug, Default)]
struct AssetCopySummary {
    files: u64,
    bytes: u64,
    skipped: Vec<SkippedAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDto {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_format: Option<String>,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub local_asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub ocr_text: String,
    pub metadata: Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: bool,
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemContentDto {
    pub id: String,
    pub body: String,
    pub body_format: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    pub title: Option<String>,
    pub body: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUrlInput {
    pub source_url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub body: String,
    pub metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuoteInput {
    pub body: String,
    pub attribution: Option<String>,
    pub source_url: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileInput {
    #[serde(default, alias = "itemId")]
    pub id: Option<String>,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub kind: Option<String>,
    pub bytes: Vec<u8>,
}

/// What a video capture originally stored, recorded so background oEmbed
/// enrichment can tell an untouched field from one the user has since edited.
/// Enrichment only ever fills a field that still equals this value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoOembedBaseline {
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItemInput {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub body: Option<String>,
    pub body_format: Option<String>,
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub local_asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub metadata: Option<Value>,
    pub add_tag: Option<String>,
    pub favorite: Option<bool>,
}

/// A saved search that defines a Smart Space. Every field is optional; an
/// empty query matches everything. Evaluation is lazy: the query is stored
/// and re-run whenever the space is opened.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SmartSpaceQuery {
    pub text: Option<String>,
    pub kind: Option<String>,
    pub tag: Option<String>,
    pub favorite: Option<bool>,
}

/// How a Space decides what is in it. A Smart Space re-runs its saved query;
/// a Regular Space holds the items the user filed into it by hand. The kind is
/// fixed at creation because converting either way would silently discard
/// either the query or the membership.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SpaceKind {
    #[default]
    Smart,
    Regular,
}

impl SpaceKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Smart => "smart",
            Self::Regular => "regular",
        }
    }

    /// Reads the stored column. An unrecognized value falls back to Smart,
    /// which is what every Space was before manual collections existed.
    fn from_column(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "regular" => Self::Regular,
            _ => Self::Smart,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub query: SmartSpaceQuery,
    pub kind: SpaceKind,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceInput {
    pub name: String,
    pub color: Option<String>,
    #[serde(default)]
    pub query: SmartSpaceQuery,
    #[serde(default)]
    pub kind: SpaceKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceInput {
    pub id: String,
    pub name: Option<String>,
    pub color: Option<String>,
    pub query: Option<SmartSpaceQuery>,
    pub position: Option<i64>,
}

impl StorageState {
    pub(crate) fn lock(&self) -> Result<MutexGuard<'_, Option<LibraryStorage>>, StorageError> {
        self.database
            .lock()
            .map_err(|_| StorageError::InvalidInput("storage lock was poisoned".into()))
    }

    fn require_storage(&self) -> Result<MutexGuard<'_, Option<LibraryStorage>>, StorageError> {
        let guard = self.lock()?;
        if guard.is_none() {
            return Err(StorageError::NotInitialized);
        }
        Ok(guard)
    }
}

impl LibraryStorage {
    pub(crate) fn open(database_path: PathBuf) -> Result<Self, StorageError> {
        let connection = Connection::open(&database_path)?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;

        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap_or(0);

        if version < 1 {
            connection.execute_batch(ITEMS_SCHEMA)?;
        } else if version == 1 {
            connection
                .execute(
                    "ALTER TABLE items ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''",
                    [],
                )
                .ok();
            connection
                .execute_batch(
                    "DROP TRIGGER IF EXISTS items_fts_after_insert;
                 DROP TRIGGER IF EXISTS items_fts_after_update;
                 DROP TRIGGER IF EXISTS items_fts_after_delete;
                 DROP TABLE IF EXISTS items_fts;",
                )
                .ok();
        } else if version == 2 {
            connection.execute("ALTER TABLE jobs ADD COLUMN worker_id TEXT", [])?;
            connection.execute("ALTER TABLE jobs ADD COLUMN lease_until INTEGER", [])?;
        }

        connection.execute_batch(crate::jobs::JOBS_SCHEMA)?;
        ensure_job_columns(&connection)?;
        ensure_item_columns(&connection, version < SCHEMA_VERSION)?;
        connection.execute_batch(EMBEDDINGS_SCHEMA)?;
        connection.execute_batch(SPACES_SCHEMA)?;
        ensure_space_columns(&connection)?;
        let fts5_enabled = setup_fts5(&connection);
        connection.pragma_update(None, "user_version", SCHEMA_VERSION)?;

        Ok(Self {
            connection,
            database_path,
            fts5_enabled,
        })
    }

    fn status(&self) -> StorageStatus {
        StorageStatus {
            database_path: self.database_path.to_string_lossy().into_owned(),
            fts5_enabled: self.fts5_enabled,
            schema_version: SCHEMA_VERSION,
        }
    }

    fn list_active_items(&self) -> Result<Vec<ItemDto>, StorageError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, title, description, source_url, source_label,
                    local_asset_path, thumbnail_path, ocr_text, metadata, created_at,
                    updated_at, archived, favorite, NULL AS body, 'md' AS body_format
             FROM items
             WHERE archived = 0
             ORDER BY updated_at DESC, created_at DESC",
        )?;

        let items = statement
            .query_map([], item_from_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    }

    fn list_archived_items(&self) -> Result<Vec<ItemDto>, StorageError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, title, description, source_url, source_label,
                    local_asset_path, thumbnail_path, ocr_text, metadata, created_at,
                    updated_at, archived, favorite, NULL AS body, 'md' AS body_format
             FROM items
             WHERE archived = 1
             ORDER BY updated_at DESC, created_at DESC",
        )?;

        let items = statement
            .query_map([], item_from_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    }

    fn create_note(&self, input: CreateNoteInput) -> Result<ItemDto, StorageError> {
        let body = input.body.trim().to_owned();
        if body.is_empty() {
            return Err(StorageError::InvalidInput(
                "note body cannot be empty".into(),
            ));
        }

        let id = Uuid::new_v4().to_string();
        let timestamp = now_millis()?;
        let title = input.title.and_then(non_empty_string);
        let description = markdown_to_plain_text(&body);
        let metadata = input.metadata.unwrap_or_else(|| Value::Object(Map::new()));
        let metadata_json = serde_json::to_string(&metadata)?;

        self.connection.execute(
            "INSERT INTO items (
                id, kind, title, description, body, body_format, metadata, ocr_text,
                created_at, updated_at
             ) VALUES (?1, 'note', ?2, ?3, ?4, ?5, ?6, '', ?7, ?7)",
            params![
                id,
                title,
                description,
                body,
                BODY_FORMAT_MARKDOWN,
                metadata_json,
                timestamp
            ],
        )?;

        self.get_item(&id)?.ok_or(StorageError::NotFound(id))
    }

    pub(crate) fn create_quote(&self, input: CreateQuoteInput) -> Result<ItemDto, StorageError> {
        let body = input.body.trim().to_owned();
        if body.is_empty() {
            return Err(StorageError::InvalidInput(
                "quote text cannot be empty".into(),
            ));
        }
        // Counted in characters, like the attribution below and the receiver's
        // `capped_string`. `len()` is bytes, so a 2000-character CJK or emoji
        // quote was rejected for exceeding 2000 "characters".
        if body.chars().count() > 2000 {
            return Err(StorageError::InvalidInput(
                "quote text must be at most 2000 characters".into(),
            ));
        }
        let attribution = input.attribution.and_then(non_empty_string);
        // Counted in characters, to match the message and the receiver's
        // `capped_string`. A byte count refused a 240-character CJK or emoji
        // attribution that the capture server had already accepted, so the
        // capture failed end to end for exactly the text the byte fix was meant
        // to admit.
        if attribution
            .as_deref()
            .is_some_and(|value| value.chars().count() > 240)
        {
            return Err(StorageError::InvalidInput(
                "quote attribution must be at most 240 characters".into(),
            ));
        }
        let source_url = match input.source_url.and_then(non_empty_string) {
            Some(url) => Some(normalize_http_url(&url)?),
            None => None,
        };
        let source_label = source_url
            .as_deref()
            .and_then(|url| Url::parse(url).ok())
            .and_then(|url| url.host_str().map(str::to_owned))
            .or_else(|| {
                attribution
                    .as_deref()
                    .map(|value| value.split(',').next().unwrap_or(value).trim().to_owned())
                    .filter(|value| !value.is_empty())
            });

        let id = Uuid::new_v4().to_string();
        let timestamp = now_millis()?;
        let mut metadata = match input.metadata.unwrap_or_else(|| Value::Object(Map::new())) {
            Value::Object(map) => map,
            _ => {
                return Err(StorageError::InvalidInput(
                    "metadata must be a JSON object".into(),
                ))
            }
        };
        metadata.insert("quoteText".into(), Value::String(body.clone()));
        if let Some(attribution) = attribution.clone() {
            metadata.insert("attribution".into(), Value::String(attribution));
        }
        if let Some(source_url) = source_url.clone() {
            metadata.insert("sourceUrl".into(), Value::String(source_url.clone()));
        }
        // Keep a searchable text field for embeddings and FTS fallback.
        let searchable = match attribution.clone() {
            Some(attribution) => format!("{body}\n\n{attribution}"),
            None => body.clone(),
        };
        metadata.insert("text".into(), Value::String(searchable));
        let metadata_json = serde_json::to_string(&Value::Object(metadata))?;
        // For quotes, title holds the quote text, description holds attribution.
        let title = Some(body.clone());
        let description = attribution.clone();

        // The body column belongs to notes. A quote already keeps its text in
        // title, quoteText, and the searchable metadata text, so writing it a
        // fourth time here would only duplicate it in the search index.
        self.connection.execute(
            "INSERT INTO items (
                id, kind, title, description, body, body_format, source_url, source_label,
                metadata, ocr_text, created_at, updated_at
             ) VALUES (?1, 'quote', ?2, ?3, '', '', ?4, ?5, ?6, '', ?7, ?7)",
            params![
                id,
                title,
                description,
                source_url,
                source_label,
                metadata_json,
                timestamp
            ],
        )?;

        self.get_item(&id)?.ok_or(StorageError::NotFound(id))
    }

    pub(crate) fn create_url(&self, input: CreateUrlInput) -> Result<ItemDto, StorageError> {
        let source_url = normalize_http_url(&input.source_url)?;
        let source_label = Url::parse(&source_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_owned));
        let title = input
            .title
            .and_then(non_empty_string)
            .or_else(|| source_label.clone());
        let description = input.description.and_then(non_empty_string);
        let body = input.body.trim().to_owned();
        let metadata = article_metadata(input.metadata, &source_url, &body)?;
        let metadata_json = serde_json::to_string(&metadata)?;
        let id = Uuid::new_v4().to_string();
        let timestamp = now_millis()?;

        // body stays empty for a url: the frontend sends the extracted article
        // text under this name as transport for the metadata below, and only
        // notes carry a body the app reads back.
        self.connection.execute(
            "INSERT INTO items (
                id, kind, title, description, body, body_format, source_url, source_label,
                metadata, ocr_text, created_at, updated_at
             ) VALUES (?1, 'url', ?2, ?3, '', '', ?4, ?5, ?6, '', ?7, ?7)",
            params![
                id,
                title,
                description,
                source_url,
                source_label,
                metadata_json,
                timestamp
            ],
        )?;

        self.get_item(&id)?.ok_or(StorageError::NotFound(id))
    }

    pub(crate) fn store_favicon(
        &self,
        item_id: &str,
        bytes: &[u8],
        extension: &str,
    ) -> Result<String, StorageError> {
        let item_id = validate_item_id(item_id.to_owned())?;
        let extension = extension.trim().to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "ico" | "png" | "svg" | "jpg" | "webp" | "gif"
        ) {
            return Err(StorageError::InvalidInput(
                "favicon extension is not supported".into(),
            ));
        }
        if bytes.is_empty() {
            return Err(StorageError::InvalidInput(
                "favicon bytes cannot be empty".into(),
            ));
        }

        // Confirm the item still exists before writing anything. The favicon
        // download runs in the background, so the user can delete the item
        // mid-flight; writing first would recreate the deleted item's asset
        // directory and leave an orphaned file the delete path never cleans up.
        let current_metadata: String = self
            .connection
            .query_row(
                "SELECT metadata FROM items WHERE id = ?1",
                params![item_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => StorageError::NotFound(item_id.clone()),
                other => StorageError::Sql(other),
            })?;

        let item_directory = self.assets_directory().join(&item_id);
        fs::create_dir_all(&item_directory)?;
        let favicon_path = item_directory.join(format!("favicon.{extension}"));
        fs::write(&favicon_path, bytes)?;
        let relative_path = relative_asset_path(&favicon_path, &self.assets_root())?;

        let mut metadata: Map<String, Value> =
            serde_json::from_str(&current_metadata).unwrap_or_default();
        metadata.insert("faviconPath".into(), Value::String(relative_path.clone()));
        let metadata_json = serde_json::to_string(&Value::Object(metadata))?;
        let updated = self.connection.execute(
            "UPDATE items SET metadata = ?1 WHERE id = ?2",
            params![metadata_json, item_id],
        )?;

        // The row can disappear between the check above and this write. An
        // UPDATE that matched nothing means it did, and the bytes just written
        // would be an orphan nothing ever cleans up.
        if updated == 0 {
            let _ = fs::remove_file(&favicon_path);
            return Err(StorageError::NotFound(item_id));
        }

        Ok(relative_path)
    }

    /// Record why a capture could not be completed.
    ///
    /// Capture answers before the slow work, so an image whose download failed
    /// still has a row — and the response that would have carried the reason is
    /// long gone. The item is the only durable place left for it, which is why
    /// this is metadata on the row rather than an in-memory notice.
    pub(crate) fn record_capture_error(
        &self,
        item_id: &str,
        reason: &str,
    ) -> Result<(), StorageError> {
        let item_id = validate_item_id(item_id.to_owned())?;
        let reason = reason.trim();
        if reason.is_empty() {
            return Err(StorageError::InvalidInput(
                "capture error reason cannot be empty".into(),
            ));
        }
        let item = self
            .get_item(&item_id)?
            .ok_or(StorageError::NotFound(item_id.clone()))?;
        let mut metadata: Map<String, Value> = match item.metadata {
            Value::Object(map) => map,
            _ => Map::new(),
        };
        metadata.insert("captureError".into(), Value::String(reason.to_owned()));
        let metadata_json = serde_json::to_string(&Value::Object(metadata))?;
        self.connection.execute(
            "UPDATE items SET metadata = ?1 WHERE id = ?2",
            params![metadata_json, item_id],
        )?;
        Ok(())
    }

    /// Apply provider title/description to a saved video page, but only to the
    /// fields the user has not touched since the capture. Background
    /// enrichment rather than a user edit, so `updated_at` is left alone and
    /// the card does not jump to the top of the library when it lands.
    ///
    /// The enrichment runs in the background after the response is sent, so a
    /// user can rename the item first. A blind `COALESCE` write would discard
    /// that edit. The capture records what it originally stored in
    /// `oEmbedBaseline`; a field is enriched only while it still equals that
    /// baseline, so an edit always wins. The baseline must therefore name the
    /// value the row really holds, including a derived default such as the
    /// hostname fallback in `create_url`.
    pub(crate) fn apply_video_oembed(
        &self,
        item_id: &str,
        title: Option<&str>,
        description: Option<&str>,
    ) -> Result<(), StorageError> {
        let item_id = validate_item_id(item_id.to_owned())?;
        let title = title.map(str::trim).filter(|value| !value.is_empty());
        let description = description.map(str::trim).filter(|value| !value.is_empty());
        if title.is_none() && description.is_none() {
            return Ok(());
        }
        let item = self
            .get_item(&item_id)?
            .ok_or_else(|| StorageError::NotFound(item_id.clone()))?;

        let mut metadata: Map<String, Value> = match &item.metadata {
            Value::Object(map) => map.clone(),
            _ => Map::new(),
        };
        let baseline: Option<VideoOembedBaseline> = metadata
            .remove("oEmbedBaseline")
            .and_then(|value| serde_json::from_value(value).ok());

        // No baseline means the item predates this field or came from another
        // capture path; leave it entirely alone rather than guess.
        let Some(baseline) = baseline else {
            return Ok(());
        };

        let current_title = item.title.as_deref().map(str::trim);
        let current_description = item.description.as_deref().map(str::trim);
        // Only `None` means "the capture never set this". An empty current value is a
        // user who deliberately cleared the field, and treating that as
        // untouched let enrichment write the provider's text straight back over
        // the deletion. Compare against the baseline verbatim.
        let untouched = |baseline: &Option<String>, current: Option<&str>| match baseline {
            Some(original) => current == Some(original.as_str()),
            None => current.is_none(),
        };
        let next_title = title.filter(|_| untouched(&baseline.title, current_title));
        let next_description =
            description.filter(|_| untouched(&baseline.description, current_description));

        // The baseline is always dropped, so a retry of the same enrichment
        // cannot re-apply after the user has edited the item.
        let metadata_json = serde_json::to_string(&Value::Object(metadata))?;
        self.connection.execute(
            "UPDATE items
             SET title = COALESCE(?2, title),
                 description = COALESCE(?3, description),
                 metadata = ?4
             WHERE id = ?1",
            params![item_id, next_title, next_description, metadata_json],
        )?;
        Ok(())
    }

    pub(crate) fn save_file(&self, input: SaveFileInput) -> Result<ItemDto, StorageError> {
        if input.bytes.len() > MAX_FILE_BYTES {
            return Err(StorageError::InvalidInput(format!(
                "file exceeds the {} MB input limit",
                MAX_FILE_BYTES / (1024 * 1024)
            )));
        }
        if input.bytes.is_empty() {
            return Err(StorageError::InvalidInput(
                "file bytes cannot be empty".into(),
            ));
        }

        let file_name = sanitize_file_name(&input.file_name)?;
        // A caller-supplied id means "attach to this item". If the row is gone,
        // the user deleted it while the work was in flight: writing anyway
        // resurrects the item and leaves an asset directory nothing will ever
        // clean up. Checked before any write, the way `store_favicon` does,
        // because the background image and OCR jobs both get here after a
        // capture has already been acknowledged.
        let attaching = input.id.is_some();
        let id = match input.id.as_deref() {
            Some(id) => {
                let validated = validate_item_id(id.to_owned())?;
                self.get_item(&validated)?
                    .ok_or_else(|| StorageError::NotFound(validated.clone()))?;
                validated
            }
            None => Uuid::new_v4().to_string(),
        };
        let mime_type = input
            .mime_type
            .as_deref()
            .map(normalize_mime_type)
            .filter(|value| !value.is_empty());
        let kind = normalize_file_kind(input.kind.as_deref(), mime_type.as_deref(), &file_name)?;
        let thumbnail = if kind == "image" {
            Some(make_image_thumbnail(&input.bytes)?)
        } else {
            None
        };

        let item_directory = self.assets_directory().join(&id);
        fs::create_dir_all(&item_directory)?;
        let original_path = item_directory.join(&file_name);
        fs::write(&original_path, &input.bytes)?;

        let thumbnail_file = if let Some(thumbnail_data) = thumbnail.as_ref() {
            let path = item_directory.join("thumbnail.webp");
            fs::write(&path, &thumbnail_data.bytes)?;
            Some(path)
        } else {
            None
        };

        let local_asset_path = relative_asset_path(&original_path, &self.assets_root())?;
        let thumbnail_path = thumbnail_file
            .as_ref()
            .map(|path| relative_asset_path(path, &self.assets_root()))
            .transpose()?;
        let image_dimensions = thumbnail
            .as_ref()
            .map(|thumbnail_data| (thumbnail_data.width, thumbnail_data.height));
        let pdf_title = (kind == "pdf")
            .then(|| crate::pdf::title(&input.bytes))
            .flatten();
        let pdf_page_count = (kind == "pdf")
            .then(|| crate::pdf::page_count(&input.bytes))
            .flatten();
        let metadata = file_metadata(
            &file_name,
            mime_type.as_deref(),
            input.bytes.len(),
            image_dimensions,
            pdf_page_count,
        );
        let metadata_json = serde_json::to_string(&metadata)?;
        let timestamp = now_millis()?;
        let title = Some(pdf_title.unwrap_or_else(|| file_name.clone()));
        let source_label = mime_type.clone();

        // `attaching` was decided by finding the row above, so this only writes
        // over an item that still exists. `archived` is deliberately left alone:
        // a user who archived the card while a download ran did not ask for it
        // to come back.
        if attaching {
            let updated = self.connection.execute(
                "UPDATE items
                 SET kind = ?2, title = ?3, description = NULL, body = '', body_format = ?9,
                     source_label = ?4, local_asset_path = ?5, thumbnail_path = ?6,
                     ocr_text = '', metadata = ?7, updated_at = ?8
                 WHERE id = ?1",
                params![
                    id,
                    kind,
                    title,
                    source_label,
                    local_asset_path,
                    thumbnail_path,
                    metadata_json,
                    timestamp,
                    BODY_FORMAT_MARKDOWN,
                ],
            )?;
            // The row can vanish between the check above and this write, and the
            // bytes are already on disk by then. An UPDATE that matched nothing
            // means the user deleted the item mid-flight, and without this the
            // original and its thumbnail are orphans the delete path never
            // cleans up. Same guard as `store_favicon`, widened to both files.
            if updated == 0 {
                discard_written_assets(&item_directory, &original_path, thumbnail_file.as_deref());
                return Err(StorageError::NotFound(id));
            }
        } else {
            self.connection.execute(
                "INSERT INTO items (
                    id, kind, title, body, body_format, source_label, local_asset_path,
                    thumbnail_path, metadata, ocr_text, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, ?7, ?8, '', ?9, ?9)",
                params![
                    id,
                    kind,
                    title,
                    BODY_FORMAT_MARKDOWN,
                    source_label,
                    local_asset_path,
                    thumbnail_path,
                    metadata_json,
                    timestamp,
                ],
            )?;
        }

        self.get_item(&id)?.ok_or(StorageError::NotFound(id))
    }

    fn assets_root(&self) -> PathBuf {
        self.database_path
            .parent()
            .map(PathBuf::from)
            .unwrap_or_default()
            .join("assets")
    }

    fn assets_directory(&self) -> PathBuf {
        self.assets_root().join("items")
    }

    pub(crate) fn resolve_asset_path(&self, relative_path: &str) -> Result<String, StorageError> {
        let normalized = relative_path.replace('\\', "/");
        let relative = normalized.strip_prefix("assets/").ok_or_else(|| {
            StorageError::InvalidInput(
                "asset path must be relative to the managed assets directory".into(),
            )
        })?;
        let relative_path = Path::new(relative);
        if relative_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            return Err(StorageError::InvalidInput(
                "asset path contains an unsafe segment".into(),
            ));
        }

        let assets_root = fs::canonicalize(self.assets_root())?;
        let candidate = fs::canonicalize(assets_root.join(relative_path))?;
        if !candidate.starts_with(&assets_root) {
            return Err(StorageError::InvalidInput(
                "asset path escaped the managed assets directory".into(),
            ));
        }
        Ok(candidate.to_string_lossy().into_owned())
    }

    fn update_item(&self, input: UpdateItemInput) -> Result<ItemDto, StorageError> {
        let mut metadata = input.metadata;
        if let Some(tag) = input.add_tag {
            let tag = tag.trim().trim_start_matches('#').trim().to_lowercase();
            if tag.is_empty() {
                return Err(StorageError::InvalidInput("tag cannot be empty".into()));
            }
            let mut current = match metadata {
                Some(metadata) => metadata,
                None => {
                    self.get_item(&input.id)?
                        .ok_or_else(|| StorageError::NotFound(input.id.clone()))?
                        .metadata
                }
            };
            if current.is_null() {
                current = serde_json::json!({});
            }
            let object = current.as_object_mut().ok_or_else(|| {
                StorageError::InvalidInput("metadata must be an object to add a tag".into())
            })?;
            let tags = object
                .entry("tags")
                .or_insert_with(|| Value::Array(Vec::new()));
            if tags.is_null() {
                *tags = Value::Array(Vec::new());
            }
            let tags = tags.as_array_mut().ok_or_else(|| {
                StorageError::InvalidInput("metadata tags must be an array to add a tag".into())
            })?;
            if !tags
                .iter()
                .filter_map(Value::as_str)
                .any(|existing| existing.to_lowercase() == tag)
            {
                tags.push(Value::String(tag));
            }
            metadata = Some(current);
        }
        let metadata_json = metadata
            .map(|metadata| serde_json::to_string(&metadata))
            .transpose()?;
        let title = input.title.as_deref().map(str::trim);
        let body = match input.body {
            Some(value) => {
                let value = value.trim();
                if value.is_empty() {
                    return Err(StorageError::InvalidInput("body cannot be empty".into()));
                }
                Some(value.to_owned())
            }
            None => None,
        };
        let body_format = match input.body_format.as_deref().map(str::trim) {
            Some(value) if value.is_empty() || value.eq_ignore_ascii_case(BODY_FORMAT_MARKDOWN) => {
                Some(BODY_FORMAT_MARKDOWN.to_owned())
            }
            Some(_) => return Err(StorageError::InvalidInput("bodyFormat must be 'md'".into())),
            None => body.as_ref().map(|_| BODY_FORMAT_MARKDOWN.to_owned()),
        };
        // An explicit description is what the caller asked for and wins; the
        // projection over the body is only a fallback for callers that omit it,
        // which is how a note save re-derives it from the new body.
        let description = input
            .description
            .as_deref()
            .map(str::trim)
            .map(str::to_owned)
            .or_else(|| body.as_deref().map(markdown_to_plain_text));
        let now = now_millis()?;

        let updated = self.connection.execute(
            "UPDATE items
             SET title = COALESCE(?2, title),
                 description = COALESCE(?3, description),
                 body = COALESCE(?4, body),
                 body_format = COALESCE(?5, body_format),
                 source_url = COALESCE(?6, source_url),
                 source_label = COALESCE(?7, source_label),
                 local_asset_path = COALESCE(?8, local_asset_path),
                 thumbnail_path = COALESCE(?9, thumbnail_path),
                 metadata = COALESCE(?10, metadata),
                 favorite = COALESCE(?11, favorite),
                 updated_at = ?12
             WHERE id = ?1",
            params![
                input.id,
                title,
                description,
                body,
                body_format,
                input.source_url,
                input.source_label,
                input.local_asset_path,
                input.thumbnail_path,
                metadata_json,
                input.favorite.map(bool_to_int),
                now,
            ],
        )?;

        if updated == 0 {
            return Err(StorageError::NotFound(input.id));
        }

        self.get_item(&input.id)?
            .ok_or(StorageError::NotFound(input.id))
    }

    fn archive_item(&self, id: &str, archived: bool) -> Result<ItemDto, StorageError> {
        let updated = self.connection.execute(
            "UPDATE items SET archived = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, bool_to_int(archived), now_millis()?],
        )?;

        if updated == 0 {
            return Err(StorageError::NotFound(id.to_owned()));
        }

        self.get_item(id)?
            .ok_or_else(|| StorageError::NotFound(id.to_owned()))
    }

    fn delete_item(&self, id: &str) -> Result<(), StorageError> {
        // Guard first: the row must exist and be archived before anything is
        // removed from disk, otherwise a stale delete of a restored item
        // would destroy its files while its row survives.
        let deletable: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM items WHERE id = ?1 AND archived = 1",
            params![id],
            |row| row.get(0),
        )?;
        if deletable == 0 {
            return Err(StorageError::NotFound(id.to_owned()));
        }

        // Item files live under assets/items/<id>. Remove them first so a
        // failed delete leaves the row and its files together. Ids are
        // restricted to ascii alphanumeric plus - and _, so the join below
        // cannot escape the assets directory.
        if validate_item_id(id.to_owned()).is_ok() {
            let directory = self.assets_directory().join(id);
            if directory.is_dir() {
                fs::remove_dir_all(&directory)?;
            }
        }

        let deleted = self.connection.execute(
            "DELETE FROM items WHERE id = ?1 AND archived = 1",
            params![id],
        )?;

        if deleted == 0 {
            return Err(StorageError::NotFound(id.to_owned()));
        }

        // The item is gone for good, so drop it from every Regular Space it
        // was filed in. Archiving keeps the rows, which is what lets a restore
        // put the item back where it was.
        self.connection
            .execute("DELETE FROM space_items WHERE item_id = ?1", params![id])?;

        Ok(())
    }

    /// First phase of an export: everything that needs the database. It returns
    /// paths and counts only, so the slow asset copy in [`finish_export`] can
    /// run with the storage lock released and captures stay responsive.
    ///
    /// `timezone_offset_minutes` is the webview's `Date.getTimezoneOffset()`, so
    /// the folder is named in the user's wall clock.
    fn begin_export(
        &self,
        destination: &Path,
        timezone_offset_minutes: i32,
    ) -> Result<ExportPlan, StorageError> {
        if !destination.is_dir() {
            return Err(StorageError::InvalidInput(
                "choose an existing folder to export into".into(),
            ));
        }
        // An export written inside the asset store would be walked by its own
        // copy, so that destination is refused before anything is created.
        if path_is_inside(destination, &self.assets_root()) {
            return Err(StorageError::InvalidInput(
                "choose a folder outside inkling's own asset store".into(),
            ));
        }

        let exported_at = now_millis()?;
        let local_millis = exported_at - i64::from(timezone_offset_minutes) * 60_000;
        let directory = unique_export_directory(destination, &export_date_stamp(local_millis));
        match self.write_snapshot(&directory, exported_at) {
            Ok(plan) => Ok(plan),
            Err(error) => {
                let _ = fs::remove_dir_all(&directory);
                Err(error)
            }
        }
    }

    /// Snapshot phase. The export lands in a fresh dated subfolder so an earlier
    /// one is never overwritten, and a failure here removes the folder instead
    /// of leaving it half done.
    fn write_snapshot(
        &self,
        directory: &Path,
        exported_at: i64,
    ) -> Result<ExportPlan, StorageError> {
        fs::create_dir_all(directory)?;

        // VACUUM INTO takes a consistent snapshot while the app keeps writing.
        // A raw file copy of a live SQLite database can be corrupt.
        let database_path = directory.join("library.sqlite3");
        let database_target = database_path.to_string_lossy().into_owned();
        self.connection
            .execute("VACUUM INTO ?1", params![database_target])?;

        let item_ids = {
            let mut statement = self.connection.prepare("SELECT id FROM items")?;
            let ids = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            ids
        };
        let archived_items: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM items WHERE archived = 1",
            [],
            |row| row.get(0),
        )?;
        let spaces: i64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM spaces", [], |row| row.get(0))?;

        let database_bytes = fs::metadata(&database_path)?.len();

        Ok(ExportPlan {
            directory: directory.to_path_buf(),
            exported_at,
            assets_directory: self.assets_directory(),
            item_ids,
            archived_items,
            spaces,
            database_bytes,
        })
    }

    pub(crate) fn update_item_ocr_text(
        &self,
        id: &str,
        ocr_text: &str,
        engine: &str,
    ) -> Result<(), StorageError> {
        let now = now_millis()?;

        let current_metadata: String = self.connection.query_row(
            "SELECT metadata FROM items WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )?;

        let mut metadata: serde_json::Map<String, Value> =
            serde_json::from_str(&current_metadata).unwrap_or_else(|_| serde_json::Map::new());

        metadata.remove("ocrText");
        metadata.insert("ocrEngine".into(), Value::String(engine.to_owned()));
        metadata.insert(
            "ocrCompletedAt".into(),
            Value::Number(serde_json::Number::from(now)),
        );

        let metadata_json = serde_json::to_string(&Value::Object(metadata))?;

        self.connection.execute(
            "UPDATE items SET ocr_text = ?1, metadata = ?2, updated_at = ?3 WHERE id = ?4",
            params![ocr_text, metadata_json, now, id],
        )?;

        Ok(())
    }

    pub(crate) fn store_embedding(
        &self,
        item_id: &str,
        kind: &str,
        model: &str,
        vector: &[u8],
        dimension: usize,
    ) -> Result<(), StorageError> {
        if !matches!(kind, "text" | "image") {
            return Err(StorageError::InvalidInput(
                "embedding kind must be text or image".into(),
            ));
        }
        if model.trim().is_empty() {
            return Err(StorageError::InvalidInput(
                "embedding model cannot be empty".into(),
            ));
        }
        let dimension = i64::try_from(dimension)
            .map_err(|_| StorageError::InvalidInput("embedding dimension is too large".into()))?;
        if dimension == 0 || vector.is_empty() {
            return Err(StorageError::InvalidInput(
                "embedding vector cannot be empty".into(),
            ));
        }
        let expected_bytes = usize::try_from(dimension)
            .ok()
            .and_then(|value| value.checked_mul(std::mem::size_of::<f32>()));
        if expected_bytes != Some(vector.len()) {
            return Err(StorageError::InvalidInput(
                "embedding vector byte length does not match its dimension".into(),
            ));
        }

        self.connection.execute(
            "INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(item_id, kind) DO UPDATE SET
                model = excluded.model,
                dimension = excluded.dimension,
                vector = excluded.vector,
                created_at = excluded.created_at",
            params![item_id, kind, model, dimension, vector, now_millis()?],
        )?;
        Ok(())
    }

    fn search_items(&self, query: &str, limit: u32) -> Result<Vec<ItemDto>, StorageError> {
        let limit = i64::from(limit.clamp(1, 200));
        let query = query.trim();

        if query.is_empty() {
            return self.list_active_items_limited(limit);
        }

        let mut lexical_items = Vec::new();
        if self.fts5_enabled {
            let fts_query = escape_fts_query(query);
            if !fts_query.is_empty() {
                let mut statement = self.connection.prepare(
                    "SELECT i.id, i.kind, i.title, i.description, i.source_url,
                            i.source_label, i.local_asset_path, i.thumbnail_path,
                             i.ocr_text, i.metadata, i.created_at, i.updated_at, i.archived,
                             i.favorite, NULL AS body, 'md' AS body_format

                     FROM items_fts f
                     JOIN items i ON i.id = f.item_id
                     WHERE i.archived = 0 AND items_fts MATCH ?1
                     ORDER BY i.updated_at DESC, i.created_at DESC
                     LIMIT ?2",
                )?;
                lexical_items = statement
                    .query_map(params![fts_query, limit], item_from_row)?
                    .collect::<Result<Vec<_>, _>>()?;
            }
        } else {
            let pattern = format!("%{query}%");
            let mut statement = self.connection.prepare(
                "SELECT id, kind, title, description, source_url, source_label,
                        local_asset_path, thumbnail_path, ocr_text, metadata, created_at,
                        updated_at, archived, favorite, NULL AS body, 'md' AS body_format
                 FROM items
                 WHERE archived = 0
                   AND (title LIKE ?1 COLLATE NOCASE
                         OR description LIKE ?1 COLLATE NOCASE
                         OR body LIKE ?1 COLLATE NOCASE
                         OR source_label LIKE ?1 COLLATE NOCASE
                        OR ocr_text LIKE ?1 COLLATE NOCASE
                        OR metadata LIKE ?1 COLLATE NOCASE)
                 ORDER BY updated_at DESC, created_at DESC
                 LIMIT ?2",
            )?;
            lexical_items = statement
                .query_map(params![pattern, limit], item_from_row)?
                .collect::<Result<Vec<_>, _>>()?;
        }

        let model_cache = self
            .database_path
            .parent()
            .map(|path| path.join("models"))
            .unwrap_or_else(|| PathBuf::from("models"));
        let query_vector = crate::embeddings::text_query_embedding(&model_cache, query).ok();
        let mut ranked = HashMap::<String, (ItemDto, f32)>::new();
        for item in lexical_items {
            ranked.insert(item.id.clone(), (item, 2.0));
        }

        if let Some(query_vector) = query_vector {
            let mut statement = self.connection.prepare(
                "SELECT i.id, i.kind, i.title, i.description, i.source_url,
                        i.source_label, i.local_asset_path, i.thumbnail_path,
                         i.ocr_text, i.metadata, i.created_at, i.updated_at, i.archived,
                         i.favorite, NULL AS body, 'md' AS body_format, e.dimension, e.vector

                 FROM item_embeddings e
                 JOIN items i ON i.id = e.item_id
                 WHERE i.archived = 0
                   AND ((e.kind = 'text' AND e.model = ?1)
                        OR (e.kind = 'image' AND e.model = ?2))",
            )?;
            let mut rows = statement.query(params![
                crate::embeddings::TEXT_MODEL,
                crate::embeddings::IMAGE_MODEL,
            ])?;
            while let Some(row) = rows.next()? {
                let item = item_from_row(row)?;
                let dimension = row.get::<_, i64>(16)?;
                let bytes = row.get::<_, Vec<u8>>(17)?;
                let vector = match crate::embeddings::decode_f32(&bytes) {
                    Ok(vector) if vector.len() == usize::try_from(dimension).unwrap_or(0) => vector,
                    _ => continue,
                };
                let similarity = dot_product(&query_vector, &vector);
                if similarity <= 0.0 && !ranked.contains_key(&item.id) {
                    continue;
                }
                let score = if ranked.contains_key(&item.id) {
                    2.0 + similarity.max(0.0)
                } else {
                    similarity
                };
                ranked
                    .entry(item.id.clone())
                    .and_modify(|(_, current)| *current = current.max(score))
                    .or_insert((item, score));
            }
        }

        let mut ranked = ranked.into_values().collect::<Vec<_>>();
        ranked.sort_by(|(left_item, left_score), (right_item, right_score)| {
            right_score
                .total_cmp(left_score)
                .then_with(|| right_item.updated_at.cmp(&left_item.updated_at))
        });
        Ok(ranked
            .into_iter()
            .take(usize::try_from(limit).unwrap_or(200))
            .map(|(item, _)| item)
            .collect())
    }

    fn search_similar_images(
        &self,
        item_id: &str,
        limit: u32,
    ) -> Result<Vec<ItemDto>, StorageError> {
        self.search_similar(item_id, limit, "image", crate::embeddings::IMAGE_MODEL)
    }

    fn search_similar_text(&self, item_id: &str, limit: u32) -> Result<Vec<ItemDto>, StorageError> {
        self.search_similar(item_id, limit, "text", crate::embeddings::TEXT_MODEL)
    }

    fn search_similar(
        &self,
        item_id: &str,
        limit: u32,
        kind: &str,
        model: &str,
    ) -> Result<Vec<ItemDto>, StorageError> {
        let source = self
            .connection
            .query_row(
                "SELECT dimension, vector FROM item_embeddings
                 WHERE item_id = ?1 AND kind = ?2 AND model = ?3",
                params![item_id, kind, model],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?)),
            )
            .optional()?;
        let Some((dimension, bytes)) = source else {
            return Ok(Vec::new());
        };
        let source_vector =
            crate::embeddings::decode_f32(&bytes).map_err(StorageError::InvalidInput)?;
        if source_vector.len() != usize::try_from(dimension).unwrap_or(0) {
            return Err(StorageError::InvalidInput(format!(
                "stored {kind} embedding dimension does not match its vector"
            )));
        }

        let mut statement = self.connection.prepare(
            "SELECT i.id, i.kind, i.title, i.description, i.source_url,
                    i.source_label, i.local_asset_path, i.thumbnail_path,
                     i.ocr_text, i.metadata, i.created_at, i.updated_at, i.archived,
                     i.favorite, NULL AS body, 'md' AS body_format, e.dimension, e.vector

             FROM item_embeddings e
             JOIN items i ON i.id = e.item_id
             WHERE i.archived = 0 AND i.id != ?1
               AND ((?2 = 'image' AND i.kind = 'image')
                    OR (?2 = 'text' AND i.kind IN ('article', 'url', 'note', 'quote')))
               AND e.kind = ?2 AND e.model = ?3",
        )?;
        let mut rows = statement.query(params![item_id, kind, model])?;
        let mut ranked = Vec::new();
        while let Some(row) = rows.next()? {
            let item = item_from_row(row)?;
            let dimension = row.get::<_, i64>(16)?;
            let bytes = row.get::<_, Vec<u8>>(17)?;
            let vector = match crate::embeddings::decode_f32(&bytes) {
                Ok(vector) if vector.len() == usize::try_from(dimension).unwrap_or(0) => vector,
                _ => continue,
            };
            if vector.len() != source_vector.len() {
                continue;
            }
            ranked.push((item, dot_product(&source_vector, &vector)));
        }
        ranked.sort_by(|(_, left), (_, right)| right.total_cmp(left));
        Ok(ranked
            .into_iter()
            .take(usize::try_from(limit.clamp(1, 50)).unwrap_or(50))
            .map(|(item, _)| item)
            .collect())
    }

    fn list_active_items_limited(&self, limit: i64) -> Result<Vec<ItemDto>, StorageError> {
        let mut statement = self.connection.prepare(
            "SELECT id, kind, title, description, source_url, source_label,
                    local_asset_path, thumbnail_path, ocr_text, metadata, created_at,
                    updated_at, archived, favorite, NULL AS body, 'md' AS body_format
             FROM items
             WHERE archived = 0
             ORDER BY updated_at DESC, created_at DESC
             LIMIT ?1",
        )?;

        let items = statement
            .query_map(params![limit], item_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub(crate) fn get_item(&self, id: &str) -> Result<Option<ItemDto>, StorageError> {
        self.connection
            .query_row(
                "SELECT id, kind, title, description, source_url, source_label,
                        local_asset_path, thumbnail_path, ocr_text, metadata, created_at,
                        updated_at, archived, favorite, body, body_format
                 FROM items WHERE id = ?1",
                params![id],
                item_from_row,
            )
            .optional()
            .map_err(StorageError::from)
    }

    pub(crate) fn get_item_content(&self, id: &str) -> Result<ItemContentDto, StorageError> {
        self.connection
            .query_row(
                "SELECT id, body, body_format FROM items WHERE id = ?1",
                params![id],
                |row| {
                    Ok(ItemContentDto {
                        id: row.get(0)?,
                        body: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        body_format: row
                            .get::<_, Option<String>>(2)?
                            .unwrap_or_else(|| BODY_FORMAT_MARKDOWN.to_owned()),
                    })
                },
            )
            .optional()?
            .ok_or_else(|| StorageError::NotFound(id.to_owned()))
    }

    fn space_from_row(row: &Row<'_>) -> rusqlite::Result<SpaceDto> {
        let query_json: String = row.get(3)?;
        let query = serde_json::from_str(&query_json).unwrap_or_default();
        let kind: String = row.get(4)?;

        Ok(SpaceDto {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            query,
            kind: SpaceKind::from_column(&kind),
            position: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }

    /// Column list shared by every Space read, so `space_from_row`'s ordinals
    /// stay in one place.
    const SPACE_COLUMNS: &'static str =
        "id, name, color, query, kind, position, created_at, updated_at";

    fn list_spaces(&self) -> Result<Vec<SpaceDto>, StorageError> {
        let mut statement = self.connection.prepare(&format!(
            "SELECT {0} FROM spaces ORDER BY position, created_at",
            Self::SPACE_COLUMNS
        ))?;

        let spaces = statement
            .query_map([], Self::space_from_row)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(spaces)
    }

    fn get_space(&self, id: &str) -> Result<Option<SpaceDto>, StorageError> {
        self.connection
            .query_row(
                &format!("SELECT {} FROM spaces WHERE id = ?1", Self::SPACE_COLUMNS),
                params![id],
                Self::space_from_row,
            )
            .optional()
            .map_err(StorageError::from)
    }

    fn create_space(&self, input: CreateSpaceInput) -> Result<SpaceDto, StorageError> {
        let name = normalize_space_name(&input.name)?;
        let color = normalize_space_color(input.color.as_deref());
        // A Regular Space is defined by what the user puts in it, so a query
        // captured from the search bar is not part of it.
        let query = match input.kind {
            SpaceKind::Smart => validate_smart_space_query(input.query)?,
            SpaceKind::Regular => SmartSpaceQuery::default(),
        };
        let query_json = serde_json::to_string(&query)?;
        let id = Uuid::new_v4().to_string();
        let timestamp = now_millis()?;
        let position: i64 = self.connection.query_row(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM spaces",
            [],
            |row| row.get(0),
        )?;

        self.connection.execute(
            "INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                id,
                name,
                color,
                query_json,
                input.kind.as_str(),
                position,
                timestamp
            ],
        )?;

        self.get_space(&id)?.ok_or(StorageError::NotFound(id))
    }

    fn update_space(&self, input: UpdateSpaceInput) -> Result<SpaceDto, StorageError> {
        let name = match input.name {
            Some(name) => Some(normalize_space_name(&name)?),
            None => None,
        };
        let color = input
            .color
            .as_deref()
            .map(|value| normalize_space_color(Some(value)));
        if input.query.is_some() {
            // A Regular Space has no query to edit; rejecting beats silently
            // dropping a query the caller believed it saved.
            let existing = self
                .get_space(&input.id)?
                .ok_or_else(|| StorageError::NotFound(input.id.clone()))?;
            if existing.kind == SpaceKind::Regular {
                return Err(StorageError::InvalidInput(
                    "a Regular Space has no search query to change".into(),
                ));
            }
        }
        let query_json = input
            .query
            .map(validate_smart_space_query)
            .transpose()?
            .map(|query| serde_json::to_string(&query))
            .transpose()?;

        let updated = self.connection.execute(
            "UPDATE spaces
             SET name = COALESCE(?2, name),
                 color = COALESCE(?3, color),
                 query = COALESCE(?4, query),
                 position = COALESCE(?6, position),
                 updated_at = ?5
             WHERE id = ?1",
            params![
                input.id,
                name,
                color,
                query_json,
                now_millis()?,
                input.position
            ],
        )?;

        if updated == 0 {
            return Err(StorageError::NotFound(input.id));
        }

        self.get_space(&input.id)?
            .ok_or(StorageError::NotFound(input.id))
    }

    fn delete_space(&self, id: &str) -> Result<(), StorageError> {
        // Deleting a Space never touches its items; only the saved search and
        // the manual membership go away. Foreign keys are not enforced on this
        // connection, so membership rows are cleared explicitly.
        self.connection
            .execute("DELETE FROM space_items WHERE space_id = ?1", params![id])?;
        let deleted = self
            .connection
            .execute("DELETE FROM spaces WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(StorageError::NotFound(id.to_owned()));
        }
        Ok(())
    }

    /// Swap two Spaces' positions in a single statement so a reorder can never
    /// half-apply. Returns the freshly ordered list for the caller to render.
    fn swap_space_positions(
        &self,
        first_id: &str,
        second_id: &str,
    ) -> Result<Vec<SpaceDto>, StorageError> {
        if first_id == second_id {
            self.get_space(first_id)?
                .ok_or(StorageError::NotFound(first_id.to_owned()))?;
            return self.list_spaces();
        }
        let mut statement = self
            .connection
            .prepare("SELECT id, position FROM spaces WHERE id IN (?1, ?2)")?;
        let positions = statement
            .query_map(params![first_id, second_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        if positions.len() != 2 {
            let missing = if positions.iter().any(|(id, _)| id == first_id) {
                second_id
            } else {
                first_id
            };
            return Err(StorageError::NotFound(missing.to_owned()));
        }
        let first_position = positions
            .iter()
            .find(|(id, _)| id == first_id)
            .map(|(_, position)| *position)
            .expect("existence checked above");
        let second_position = positions
            .iter()
            .find(|(id, _)| id == second_id)
            .map(|(_, position)| *position)
            .expect("existence checked above");
        let updated = self.connection.execute(
            "UPDATE spaces
             SET position = CASE id WHEN ?1 THEN ?3 WHEN ?2 THEN ?4 ELSE position END,
                 updated_at = ?5
             WHERE id IN (?1, ?2)",
            params![
                first_id,
                second_id,
                second_position,
                first_position,
                now_millis()?
            ],
        )?;
        if updated != 2 {
            return Err(StorageError::NotFound(format!("{first_id} / {second_id}")));
        }
        self.list_spaces()
    }

    /// Lazy evaluation of a Smart Space: re-run the stored query on demand.
    /// A Regular Space instead reads back exactly the items filed into it.
    fn list_space_items(&self, id: &str, limit: u32) -> Result<Vec<ItemDto>, StorageError> {
        let limit = usize::try_from(limit.clamp(1, 200)).unwrap_or(100);
        let space = self
            .get_space(id)?
            .ok_or_else(|| StorageError::NotFound(id.to_owned()))?;

        if space.kind == SpaceKind::Regular {
            return self.list_space_member_items(id, limit);
        }

        let text = space.query.text.as_deref().unwrap_or("").trim();
        let candidates = if text.is_empty() {
            self.list_active_items_limited(i64::try_from(limit).unwrap_or(100))?
        } else {
            // Reuse the hybrid lexical + semantic ranking used by normal search.
            self.search_items(text, u32::try_from(limit).unwrap_or(u32::MAX))?
        };

        let items = candidates
            .into_iter()
            .filter(|item| item_matches_smart_query(item, &space.query))
            .take(limit)
            .collect::<Vec<_>>();

        Ok(items)
    }

    /// The contents of a Regular Space: manual membership, most recently added
    /// first. Archived items drop out of the listing but keep their membership
    /// row, so restoring one returns it to the Space.
    fn list_space_member_items(
        &self,
        id: &str,
        limit: usize,
    ) -> Result<Vec<ItemDto>, StorageError> {
        let mut statement = self.connection.prepare(
            "SELECT i.id, i.kind, i.title, i.description, i.source_url, i.source_label,
                    i.local_asset_path, i.thumbnail_path, i.ocr_text, i.metadata, i.created_at,
                    i.updated_at, i.archived, i.favorite, NULL AS body, 'md' AS body_format
             FROM space_items s
             JOIN items i ON i.id = s.item_id
             WHERE s.space_id = ?1 AND i.archived = 0
             ORDER BY s.added_at DESC, i.id
             LIMIT ?2",
        )?;

        let items = statement
            .query_map(
                params![id, i64::try_from(limit).unwrap_or(100)],
                item_from_row,
            )?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(items)
    }

    /// File an item into a Regular Space. Adding the same pair twice is a
    /// no-op rather than an error, so a retried click cannot fail.
    fn add_space_item(&self, space_id: &str, item_id: &str) -> Result<(), StorageError> {
        let space = self
            .get_space(space_id)?
            .ok_or_else(|| StorageError::NotFound(space_id.to_owned()))?;
        if space.kind != SpaceKind::Regular {
            return Err(StorageError::InvalidInput(
                "items can only be added to a Regular Space".into(),
            ));
        }
        // space_items carries no foreign key, so nothing below would stop an
        // unknown item id from becoming an orphan membership row.
        if self.get_item(item_id)?.is_none() {
            return Err(StorageError::NotFound(item_id.to_owned()));
        }

        self.connection.execute(
            "INSERT OR IGNORE INTO space_items (space_id, item_id, added_at) VALUES (?1, ?2, ?3)",
            params![space_id, item_id, now_millis()?],
        )?;

        Ok(())
    }

    /// Take an item back out of a Regular Space. Missing membership is a no-op.
    fn remove_space_item(&self, space_id: &str, item_id: &str) -> Result<(), StorageError> {
        if self.get_space(space_id)?.is_none() {
            return Err(StorageError::NotFound(space_id.to_owned()));
        }

        self.connection.execute(
            "DELETE FROM space_items WHERE space_id = ?1 AND item_id = ?2",
            params![space_id, item_id],
        )?;

        Ok(())
    }

    /// Which Regular Spaces hold this item, in sidebar order. Smart Spaces are
    /// left out: their contents come from the query and change on their own.
    fn list_item_space_ids(&self, item_id: &str) -> Result<Vec<String>, StorageError> {
        let mut statement = self.connection.prepare(
            "SELECT s.id
             FROM space_items m
             JOIN spaces s ON s.id = m.space_id
             WHERE m.item_id = ?1
             ORDER BY s.position, s.created_at",
        )?;

        let ids = statement
            .query_map(params![item_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(ids)
    }
}

fn item_matches_smart_query(item: &ItemDto, query: &SmartSpaceQuery) -> bool {
    if let Some(favorite) = query.favorite {
        if item.favorite != favorite {
            return false;
        }
    }

    if let Some(kind) = query
        .kind
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
    {
        if !item_matches_kind(&item.kind, kind) {
            return false;
        }
    }

    if let Some(tag) = query
        .tag
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        let matches_tag = item
            .metadata
            .get("tags")
            .and_then(Value::as_array)
            .is_some_and(|tags| {
                tags.iter()
                    .filter_map(Value::as_str)
                    .any(|candidate| candidate.eq_ignore_ascii_case(tag))
            });
        if !matches_tag {
            return false;
        }
    }

    true
}

fn item_matches_kind(item_kind: &str, filter: &str) -> bool {
    let item_kind = item_kind.trim().to_ascii_lowercase();
    let filter = filter.trim().to_ascii_lowercase();
    match filter.as_str() {
        "" => true,
        "article" => item_kind == "url" || item_kind == "article",
        other => item_kind == other,
    }
}

fn validate_smart_space_query(mut query: SmartSpaceQuery) -> Result<SmartSpaceQuery, StorageError> {
    fn clean(
        value: Option<String>,
        field: &str,
        max: usize,
    ) -> Result<Option<String>, StorageError> {
        match value.map(|value| value.trim().to_owned()) {
            Some(value) if value.len() > max => Err(StorageError::InvalidInput(format!(
                "{field} must be at most {max} characters"
            ))),
            Some(value) if !value.is_empty() => Ok(Some(value)),
            _ => Ok(None),
        }
    }

    query.text = clean(query.text, "text", 512)?;
    query.kind = clean(query.kind, "kind", 32)?;
    query.tag = clean(query.tag, "tag", 64)?;

    Ok(query)
}

fn normalize_space_name(name: &str) -> Result<String, StorageError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(StorageError::InvalidInput(
            "space name cannot be empty".into(),
        ));
    }
    if name.len() > 80 {
        return Err(StorageError::InvalidInput(
            "space name must be at most 80 characters".into(),
        ));
    }
    Ok(name.to_owned())
}

fn normalize_space_color(color: Option<&str>) -> String {
    let palette = ["blue", "orange", "green", "pink", "purple"];
    match color.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => {
            let lowered = value.to_ascii_lowercase();
            palette
                .into_iter()
                .find(|candidate| *candidate == lowered)
                .unwrap_or("blue")
                .to_owned()
        }
        None => "blue".to_owned(),
    }
}

fn ensure_item_columns(
    connection: &Connection,
    migration_needed: bool,
) -> Result<(), rusqlite::Error> {
    let mut added_column = false;
    for (name, alter) in [
        (
            "body",
            "ALTER TABLE items ADD COLUMN body TEXT NOT NULL DEFAULT ''",
        ),
        (
            "body_format",
            "ALTER TABLE items ADD COLUMN body_format TEXT NOT NULL DEFAULT 'md'",
        ),
    ] {
        let present: i64 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name = ?1",
            params![name],
            |row| row.get(0),
        )?;
        if present == 0 {
            connection.execute(alter, [])?;
            added_column = true;
        }
    }

    let needs_backfill = if migration_needed || added_column {
        true
    } else {
        connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE body IS NULL OR body_format IS NULL)",
            [],
            |row| row.get::<_, i64>(0),
        )? != 0
    };
    if !needs_backfill {
        return Ok(());
    }

    let query = if migration_needed || added_column {
        "SELECT id, kind, description, body, body_format FROM items"
    } else {
        "SELECT id, kind, description, body, body_format
         FROM items
         WHERE body IS NULL OR body_format IS NULL"
    };
    let transaction = connection.unchecked_transaction()?;
    let rows = {
        let mut statement = transaction.prepare(query)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    for (id, kind, description, body, body_format) in rows {
        // The body column belongs to notes. A legacy note kept its text in
        // description, so that stays the only fallback; quotes and urls already
        // hold theirs in title and searchable metadata.
        let body = body
            .filter(|value| !value.trim().is_empty())
            .or_else(|| match kind.as_str() {
                "note" => description.clone(),
                _ => None,
            })
            .unwrap_or_default();
        let body_format = body_format
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| BODY_FORMAT_MARKDOWN.to_owned());
        transaction.execute(
            "UPDATE items SET body = ?1, body_format = ?2 WHERE id = ?3",
            params![body, body_format, id],
        )?;
    }
    transaction.commit()?;

    Ok(())
}

fn ensure_job_columns(connection: &Connection) -> Result<(), rusqlite::Error> {
    for (name, definition) in [
        ("worker_id", "TEXT"),
        ("lease_until", "INTEGER"),
        ("progress_current", "INTEGER NOT NULL DEFAULT 0"),
        ("progress_total", "INTEGER"),
        ("progress_message", "TEXT"),
    ] {
        let present: i64 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('jobs') WHERE name = ?1",
            params![name],
            |row| row.get(0),
        )?;
        if present == 0 {
            connection.execute(
                &format!("ALTER TABLE jobs ADD COLUMN {name} {definition}"),
                [],
            )?;
        }
    }
    Ok(())
}

/// Single source of truth for where the library (and its sibling files, such
/// as the pairing token) live. Portable-preview builds use `data/` beside the
/// executable; every other build uses the Tauri app-data dir. Never gates on
/// whether `library.sqlite3` already exists — that would flip the directory
/// after a move/delete and strand the pairing token in the wrong home.
pub(crate) fn library_directory(app: &AppHandle) -> Result<PathBuf, StorageError> {
    std::env::current_exe()
        .ok()
        .and_then(|executable| portable_data_directory(&executable))
        .or_else(|| app.path().app_data_dir().ok())
        .ok_or_else(|| StorageError::InvalidInput("cannot determine the library directory".into()))
}

fn ensure_space_columns(connection: &Connection) -> Result<(), rusqlite::Error> {
    // `CREATE TABLE IF NOT EXISTS` in SPACES_SCHEMA is a no-op for a library
    // that already has a `spaces` table, so every column added to that schema
    // after the table shipped needs a branch here too. Two are missing that way
    // a real library opened fine until the next Space was created and the
    // insert named a column the old table did not have:
    //
    // - `kind`, for manual collections. Every existing Space was a saved
    //   search, so the default has to be Smart.
    // - `color`, which arrived with Space colors before this function existed.
    //   Blue is the same default the schema declares.
    for (column, definition) in [
        ("kind", "TEXT NOT NULL DEFAULT 'smart'"),
        ("color", "TEXT NOT NULL DEFAULT 'blue'"),
    ] {
        let present: i64 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('spaces') WHERE name = ?1",
            [column],
            |row| row.get(0),
        )?;
        if present == 0 {
            connection.execute(
                &format!("ALTER TABLE spaces ADD COLUMN {column} {definition}"),
                [],
            )?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn initialize_storage(
    app: AppHandle,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<StorageStatus, String> {
    let database_directory = library_directory(&app).map_err(String::from)?;
    fs::create_dir_all(&database_directory).map_err(StorageError::from)?;

    let database_path = database_directory.join("library.sqlite3");
    let mut database = state.lock().map_err(String::from)?;

    if let Some(existing) = database.as_ref() {
        if existing.database_path == database_path {
            return Ok(existing.status());
        }
    }

    let storage = LibraryStorage::open(database_path.clone()).map_err(String::from)?;
    let status = storage.status();
    *database = Some(storage);
    drop(database);

    processing.set_database_path(database_path);
    Ok(status)
}

#[tauri::command]
pub fn list_active_items(state: State<'_, StorageState>) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .list_active_items()
        .map_err(String::from)
}

#[tauri::command]
pub fn list_archived_items(state: State<'_, StorageState>) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .list_archived_items()
        .map_err(String::from)
}

#[tauri::command]
pub fn get_item_content(
    id: String,
    state: State<'_, StorageState>,
) -> Result<ItemContentDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .get_item_content(&id)
        .map_err(String::from)
}

#[tauri::command]
pub fn create_note(
    input: CreateNoteInput,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<ItemDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    let item = database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .create_note(input)
        .map_err(String::from)?;
    crate::jobs::enqueue_embedding_for_item(
        &database
            .as_ref()
            .expect("require_storage guarantees initialization")
            .connection,
        &item.id,
    )
    .map_err(|error| error.to_string())?;
    drop(database);
    processing.enqueue_and_wake(&item.id, crate::jobs::JobKind::GenerateEmbedding);
    Ok(item)
}

#[tauri::command]
pub fn create_quote(
    input: CreateQuoteInput,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<ItemDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    let item = database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .create_quote(input)
        .map_err(String::from)?;
    crate::jobs::enqueue_embedding_for_item(
        &database
            .as_ref()
            .expect("require_storage guarantees initialization")
            .connection,
        &item.id,
    )
    .map_err(|error| error.to_string())?;
    drop(database);
    processing.enqueue_and_wake(&item.id, crate::jobs::JobKind::GenerateEmbedding);
    Ok(item)
}

#[tauri::command]
pub fn create_url(
    input: CreateUrlInput,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<ItemDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    let item = database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .create_url(input)
        .map_err(String::from)?;
    crate::jobs::enqueue_embedding_for_item(
        &database
            .as_ref()
            .expect("require_storage guarantees initialization")
            .connection,
        &item.id,
    )
    .map_err(|error| error.to_string())?;
    drop(database);
    processing.enqueue_and_wake(&item.id, crate::jobs::JobKind::GenerateEmbedding);
    Ok(item)
}

#[tauri::command]
pub fn save_file(
    input: SaveFileInput,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<ItemDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    let item = database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .save_file(input)
        .map_err(String::from)?;
    let ocr_job_id = crate::jobs::enqueue_ocr_for_item(
        &database
            .as_ref()
            .expect("require_storage guarantees initialization")
            .connection,
        &item.id,
        &item.kind,
    )
    .map_err(|error| error.to_string())?;
    crate::jobs::enqueue_embedding_for_item(
        &database
            .as_ref()
            .expect("require_storage guarantees initialization")
            .connection,
        &item.id,
    )
    .map_err(|error| error.to_string())?;
    drop(database);
    if ocr_job_id.is_some() {
        let kind = if item.kind == "pdf" {
            crate::jobs::JobKind::OcrPdfPage
        } else {
            crate::jobs::JobKind::OcrImage
        };
        processing.enqueue_and_wake(&item.id, kind);
    }
    processing.enqueue_and_wake(&item.id, crate::jobs::JobKind::GenerateEmbedding);
    Ok(item)
}

#[tauri::command]
pub fn resolve_asset_path(path: String, state: State<'_, StorageState>) -> Result<String, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .resolve_asset_path(&path)
        .map_err(String::from)
}

/// Async because `cache_favicon_in_background` blocks on the favicon download.
/// A sync command would run it on the main thread and freeze the window for the
/// request, which is why the receiver's own favicon path uses a dedicated
/// worker instead of this command.
#[tauri::command(async)]
pub fn cache_favicon(item_id: String, url: String, app: AppHandle) -> Result<String, String> {
    cache_favicon_in_background(&app, &item_id, &url)
}

pub(crate) fn cache_favicon_in_background(
    app: &AppHandle,
    item_id: &str,
    url: &str,
) -> Result<String, String> {
    let (bytes, extension) = crate::http_fetch::download_favicon(url)?;
    let state = app.state::<StorageState>();
    let guard = state.lock().map_err(String::from)?;
    let storage = guard
        .as_ref()
        .ok_or_else(|| StorageError::NotInitialized.to_string())?;
    storage
        .store_favicon(item_id, &bytes, &extension)
        .map_err(String::from)
}

#[tauri::command]
pub fn update_item(
    input: UpdateItemInput,
    state: State<'_, StorageState>,
    processing: State<'_, crate::jobs::ProcessingState>,
) -> Result<ItemDto, String> {
    let should_reembed = input.title.is_some()
        || input.description.is_some()
        || input.body.is_some()
        || input.body_format.is_some()
        || input.metadata.is_some()
        || input.add_tag.is_some()
        || input.local_asset_path.is_some();
    let database = state.require_storage().map_err(String::from)?;
    let item = database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .update_item(input)
        .map_err(String::from)?;
    if should_reembed {
        crate::jobs::enqueue_embedding_for_item(
            &database
                .as_ref()
                .expect("require_storage guarantees initialization")
                .connection,
            &item.id,
        )
        .map_err(|error| error.to_string())?;
    }
    drop(database);
    if should_reembed {
        processing.enqueue_and_wake(&item.id, crate::jobs::JobKind::GenerateEmbedding);
    }
    Ok(item)
}

#[tauri::command]
pub fn archive_item(
    id: String,
    archived: Option<bool>,
    state: State<'_, StorageState>,
) -> Result<ItemDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .archive_item(&id, archived.unwrap_or(true))
        .map_err(String::from)
}

#[tauri::command]
pub fn delete_item(id: String, state: State<'_, StorageState>) -> Result<(), String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .delete_item(&id)
        .map_err(String::from)
}

/// Copies the library into the folder the user picked in the native picker.
/// Async on purpose: the snapshot and the asset copy take as long as they take,
/// and a synchronous command would run on the main thread and freeze the window
/// for the whole export.
#[tauri::command(async)]
pub fn export_library(
    destination: String,
    timezone_offset_minutes: Option<i32>,
    state: State<'_, StorageState>,
) -> Result<ExportReport, String> {
    let destination = Path::new(&destination);
    let timezone_offset_minutes = timezone_offset_minutes.unwrap_or(0);
    let storage = state.require_storage().map_err(String::from)?;
    let plan = storage
        .as_ref()
        .expect("require_storage guarantees initialization")
        .begin_export(destination, timezone_offset_minutes)
        .map_err(String::from)?;
    // The lock is released here on purpose: a capture during a multi-gigabyte
    // copy would otherwise wait for the whole export to finish.
    drop(storage);

    match finish_export(&plan) {
        Ok(report) => Ok(report),
        Err(error) => {
            let _ = fs::remove_dir_all(&plan.directory);
            Err(String::from(error))
        }
    }
}

#[tauri::command]
pub fn search_items(
    query: String,
    limit: Option<u32>,
    state: State<'_, StorageState>,
) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .search_items(&query, limit.unwrap_or(50))
        .map_err(String::from)
}

#[tauri::command]
pub fn search_similar_images(
    item_id: String,
    limit: Option<u32>,
    state: State<'_, StorageState>,
) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .search_similar_images(&item_id, limit.unwrap_or(12))
        .map_err(String::from)
}

#[tauri::command]
pub fn search_similar_text(
    item_id: String,
    limit: Option<u32>,
    state: State<'_, StorageState>,
) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .search_similar_text(&item_id, limit.unwrap_or(12))
        .map_err(String::from)
}

#[tauri::command]
pub fn list_spaces(state: State<'_, StorageState>) -> Result<Vec<SpaceDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .list_spaces()
        .map_err(String::from)
}

#[tauri::command]
pub fn create_space(
    input: CreateSpaceInput,
    state: State<'_, StorageState>,
) -> Result<SpaceDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .create_space(input)
        .map_err(String::from)
}

#[tauri::command]
pub fn update_space(
    input: UpdateSpaceInput,
    state: State<'_, StorageState>,
) -> Result<SpaceDto, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .update_space(input)
        .map_err(String::from)
}

#[tauri::command]
pub fn delete_space(id: String, state: State<'_, StorageState>) -> Result<(), String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .delete_space(&id)
        .map_err(String::from)
}

#[tauri::command]
pub fn swap_space_positions(
    first_id: String,
    second_id: String,
    state: State<'_, StorageState>,
) -> Result<Vec<SpaceDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .swap_space_positions(&first_id, &second_id)
        .map_err(String::from)
}

/// Smart Spaces re-run their saved query at read time; Regular Spaces read
/// back the items filed into them. Either way new captures need no bookkeeping.
#[tauri::command]
pub fn list_space_items(
    id: String,
    limit: Option<u32>,
    state: State<'_, StorageState>,
) -> Result<Vec<ItemDto>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .list_space_items(&id, limit.unwrap_or(100))
        .map_err(String::from)
}

#[tauri::command]
pub fn add_space_item(
    space_id: String,
    item_id: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .add_space_item(&space_id, &item_id)
        .map_err(String::from)
}

#[tauri::command]
pub fn remove_space_item(
    space_id: String,
    item_id: String,
    state: State<'_, StorageState>,
) -> Result<(), String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .remove_space_item(&space_id, &item_id)
        .map_err(String::from)
}

#[tauri::command]
pub fn list_item_spaces(
    item_id: String,
    state: State<'_, StorageState>,
) -> Result<Vec<String>, String> {
    let database = state.require_storage().map_err(String::from)?;
    database
        .as_ref()
        .expect("require_storage guarantees initialization")
        .list_item_space_ids(&item_id)
        .map_err(String::from)
}

fn setup_fts5(connection: &Connection) -> bool {
    let result = (|| -> rusqlite::Result<()> {
        let transaction = rusqlite::Transaction::new_unchecked(
            connection,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'items_fts')",
            [],
            |row| row.get(0),
        )?;
        let body_column_count: i64 = if exists {
            transaction.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('items_fts') WHERE name = 'body'",
                [],
                |row| row.get(0),
            )?
        } else {
            0
        };
        if exists && body_column_count == 0 {
            transaction.execute_batch(
                "DROP TRIGGER IF EXISTS items_fts_after_insert;
                 DROP TRIGGER IF EXISTS items_fts_after_update;
                 DROP TRIGGER IF EXISTS items_fts_after_delete;
                 DROP TABLE IF EXISTS items_fts;",
            )?;
        }
        transaction.execute_batch(
        r#"
        CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
            item_id UNINDEXED,
            title,
            description,
            source_label,
            ocr_text,
            metadata,
            body
        );

        DROP TRIGGER IF EXISTS items_fts_after_insert;
        CREATE TRIGGER items_fts_after_insert
        AFTER INSERT ON items BEGIN
            INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
            VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata, new.body);
        END;

        DROP TRIGGER IF EXISTS items_fts_after_delete;
        CREATE TRIGGER items_fts_after_delete
        AFTER DELETE ON items BEGIN
            DELETE FROM items_fts WHERE item_id = old.id;
        END;

        DROP TRIGGER IF EXISTS items_fts_after_update;
        CREATE TRIGGER items_fts_after_update
        AFTER UPDATE ON items BEGIN
            DELETE FROM items_fts WHERE item_id = old.id;
            INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
            VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata, new.body);
        END;

        "#,
        )?;
        let item_count: i64 =
            transaction.query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))?;
        let indexed_count: i64 =
            transaction.query_row("SELECT COUNT(*) FROM items_fts", [], |row| row.get(0))?;
        if !exists || body_column_count == 0 || item_count != indexed_count {
            transaction.execute_batch(
                "DELETE FROM items_fts;
                 INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
                 SELECT id, title, description, source_label, ocr_text, metadata, body FROM items;",
            )?;
        }
        transaction.commit()
    })();

    if let Err(error) = result {
        eprintln!("FTS5 unavailable; using LIKE search fallback: {error}");
        false
    } else {
        true
    }
}

fn item_from_row(row: &Row<'_>) -> rusqlite::Result<ItemDto> {
    let metadata_json: String = row.get(9)?;
    let metadata =
        serde_json::from_str(&metadata_json).unwrap_or_else(|_| Value::Object(Map::new()));

    Ok(ItemDto {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        source_url: row.get(4)?,
        source_label: row.get(5)?,
        local_asset_path: row.get(6)?,
        thumbnail_path: row.get(7)?,
        ocr_text: row.get(8)?,
        metadata,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        archived: row.get::<_, i64>(12)? != 0,
        favorite: row.get::<_, i64>(13)? != 0,
        body: row.get(14)?,
        body_format: row.get(15)?,
    })
}

fn escape_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"", token.replace('"', "")))
        .filter(|token| token != "\"\"")
        .collect::<Vec<_>>()
        .join(" ")
}

fn dot_product(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() {
        return f32::NEG_INFINITY;
    }
    left.iter()
        .zip(right)
        .map(|(left, right)| left * right)
        .sum()
}

pub(crate) fn markdown_to_plain_text(markdown: &str) -> String {
    let mut plain = String::new();
    // Tasklist support is what drops `- [x]` markers: the parser reports each one
    // as its own event instead of text, so nothing is matched against the joined
    // string afterwards.
    let options = pulldown_cmark::Options::ENABLE_TASKLISTS;
    for event in Parser::new_ext(markdown, options) {
        match event {
            // Adjacent inline runs belong to the same word or phrase, so they are
            // appended as they came. A parser that splits `[x]` into three events
            // must not become `[ x ]`.
            Event::Text(value) | Event::Code(value) => plain.push_str(&value),
            Event::SoftBreak | Event::HardBreak => plain.push(' '),
            Event::Start(tag) if starts_block(&tag) => plain.push(' '),
            Event::InlineHtml(raw) if is_void_tag(&raw) => plain.push(' '),
            _ => continue,
        }
    }
    plain
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace(" .", ".")
        .replace(" ,", ",")
        .replace(" ;", ";")
        .replace(" :", ":")
        .replace(" !", "!")
        .replace(" ?", "?")
}

fn starts_block(tag: &Tag) -> bool {
    matches!(
        tag,
        Tag::Paragraph
            | Tag::Heading { .. }
            | Tag::BlockQuote(_)
            | Tag::CodeBlock(_)
            | Tag::Item
            | Tag::Table(_)
            | Tag::TableRow
            | Tag::TableCell
    )
}

// A void inline element ends a line, so `foo<br>bar` must not come back as
// `foobar`. An inline wrapper such as `<em>` only marks up a run and must not
// split it; a word-internal hint like `<wbr>` is a break opportunity, not a
// boundary, and treating either as one splits a word in half.
fn is_void_tag(raw: &str) -> bool {
    let name: String = raw
        .trim()
        .trim_start_matches('<')
        .trim_start_matches('/')
        .chars()
        .take_while(char::is_ascii_alphanumeric)
        .collect();
    matches!(
        name.to_ascii_lowercase().as_str(),
        "br" | "hr" | "img" | "input"
    )
}

fn non_empty_string(value: String) -> Option<String> {
    let value = value.trim().to_owned();
    (!value.is_empty()).then_some(value)
}

fn normalize_http_url(value: &str) -> Result<String, StorageError> {
    let mut url = Url::parse(value.trim()).map_err(|_| {
        StorageError::InvalidInput("sourceUrl must be a valid HTTP or HTTPS URL".into())
    })?;

    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(StorageError::InvalidInput(
            "sourceUrl must use HTTP or HTTPS and include a host".into(),
        ));
    }

    url.set_fragment(None);
    Ok(url.to_string())
}

fn article_metadata(
    input: Option<Value>,
    source_url: &str,
    body: &str,
) -> Result<Value, StorageError> {
    let mut metadata = match input.unwrap_or_else(|| Value::Object(Map::new())) {
        Value::Object(metadata) => metadata,
        _ => {
            return Err(StorageError::InvalidInput(
                "metadata must be a JSON object".into(),
            ))
        }
    };

    metadata
        .entry("sourceUrl")
        .or_insert_with(|| Value::String(source_url.to_owned()));
    metadata
        .entry("text")
        .or_insert_with(|| Value::String(body.to_owned()));
    ensure_array_metadata(&mut metadata, "imageUrls")?;
    ensure_array_metadata(&mut metadata, "imageDimensions")?;
    ensure_array_metadata(&mut metadata, "safeEmbeds")?;
    metadata
        .entry("html")
        .or_insert_with(|| Value::String(String::new()));
    // Card seal favicon: keep only an absolute http(s) URL; drop anything else
    // rather than failing the capture (same forgiving rule as image URLs).
    if let Some(Value::String(favicon)) = metadata.get("favicon").cloned() {
        let cleaned = url::Url::parse(favicon.trim())
            .ok()
            .filter(|url| matches!(url.scheme(), "http" | "https"))
            .map(|url| Value::String(url.to_string()));
        match cleaned {
            Some(value) => {
                metadata.insert("favicon".into(), value);
            }
            None => {
                metadata.remove("favicon");
            }
        }
    } else {
        metadata.remove("favicon");
    }
    if let Some(Value::String(path)) = metadata.get("faviconPath").cloned() {
        let normalized = path.replace('\\', "/");
        if normalized.starts_with("assets/") && !normalized.contains("..") {
            metadata.insert("faviconPath".into(), Value::String(normalized));
        } else {
            metadata.remove("faviconPath");
        }
    } else {
        metadata.remove("faviconPath");
    }

    Ok(Value::Object(metadata))
}

fn ensure_array_metadata(metadata: &mut Map<String, Value>, key: &str) -> Result<(), StorageError> {
    match metadata.entry(key.to_owned()) {
        serde_json::map::Entry::Vacant(entry) => {
            entry.insert(Value::Array(Vec::new()));
        }
        serde_json::map::Entry::Occupied(entry) if !entry.get().is_array() => {
            return Err(StorageError::InvalidInput(format!(
                "metadata.{key} must be a JSON array"
            )));
        }
        serde_json::map::Entry::Occupied(_) => {}
    }
    Ok(())
}

const EXPORT_FORMAT_VERSION: i64 = 1;

/// Names the export folder after the moment it was written, in the wall clock
/// the caller handed over: the core itself has no timezone database.
fn export_date_stamp(millis: i64) -> String {
    let (year, month, day) = civil_from_days(millis.div_euclid(86_400_000));
    let seconds = millis.rem_euclid(86_400_000) / 1_000;
    format!(
        "{year:04}-{month:02}-{day:02}-{:02}{:02}{:02}",
        seconds / 3_600,
        (seconds % 3_600) / 60,
        seconds % 60
    )
}

/// Days since the Unix epoch to a calendar date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// A second export in the same second lands beside the first, never on top.
fn unique_export_directory(destination: &Path, stamp: &str) -> PathBuf {
    let base = destination.join(format!("inkling-export-{stamp}"));
    if !base.exists() {
        return base;
    }
    for index in 2..1_000 {
        let candidate = destination.join(format!("inkling-export-{stamp}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    base
}

/// Second phase of an export: the asset copy and the manifest. It touches no
/// database state, which is what lets the command drop the storage lock first.
fn finish_export(plan: &ExportPlan) -> Result<ExportReport, StorageError> {
    finish_export_with(plan, |source, destination| fs::copy(source, destination))
}

fn finish_export_with<F>(plan: &ExportPlan, mut copy_file: F) -> Result<ExportReport, StorageError>
where
    F: FnMut(&Path, &Path) -> std::io::Result<u64>,
{
    let exported_assets = plan.directory.join("assets").join("items");
    let mut asset_files = 0_u64;
    let mut assets_bytes = 0_u64;
    let mut skipped_assets = Vec::new();
    for id in &plan.item_ids {
        if validate_item_id(id.clone()).is_err() {
            continue;
        }
        let source = plan.assets_directory.join(id);
        match fs::metadata(&source) {
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => {
                skipped_assets.push(SkippedAsset {
                    path: export_relative_path(&Path::new("assets/items").join(id)),
                    error: "asset path is not a directory".into(),
                });
                continue;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                skipped_assets.push(SkippedAsset {
                    path: export_relative_path(&Path::new("assets/items").join(id)),
                    error: error.to_string(),
                });
                continue;
            }
        }
        let summary = copy_directory_with(
            &source,
            &exported_assets.join(id),
            &Path::new("assets/items").join(id),
            &mut copy_file,
        );
        asset_files += summary.files;
        assets_bytes += summary.bytes;
        skipped_assets.extend(summary.skipped);
    }
    let skipped_asset_count = skipped_assets.len() as u64;

    let manifest = serde_json::json!({
        "format": "inkling-export",
        "formatVersion": EXPORT_FORMAT_VERSION,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "schemaVersion": SCHEMA_VERSION,
        "exportedAt": plan.exported_at,
        "counts": {
            "items": plan.item_ids.len(),
            "archivedItems": plan.archived_items,
            "spaces": plan.spaces,
            "assetFiles": asset_files,
            "skippedAssets": skipped_asset_count,
        },
        "bytes": {
            "database": plan.database_bytes,
            "assets": assets_bytes,
        },
        "skippedAssets": &skipped_assets,
        "regenerable": {
            "tables": ["item_embeddings", "items_fts"],
            "columns": ["items.ocr_text"],
        },
    });
    fs::write(
        plan.directory.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;

    Ok(ExportReport {
        directory: plan.directory.to_string_lossy().into_owned(),
        items: plan.item_ids.len() as i64,
        archived_items: plan.archived_items,
        spaces: plan.spaces,
        asset_files,
        skipped_assets: skipped_asset_count,
        database_bytes: plan.database_bytes,
        assets_bytes,
    })
}

/// True when `candidate` is `root` or lives under it, compared on canonical
/// paths so a symlinked or `..`-laden choice cannot slip past. Unresolvable
/// paths answer false: only the library's own asset store is unsafe to copy
/// into, and a store that is not there has nothing to protect.
fn path_is_inside(candidate: &Path, root: &Path) -> bool {
    match (fs::canonicalize(candidate), fs::canonicalize(root)) {
        (Ok(candidate), Ok(root)) => candidate.starts_with(root),
        _ => false,
    }
}

/// Copies one asset directory tree and reports how much moved.
fn copy_directory_with<F>(
    source: &Path,
    destination: &Path,
    relative_path: &Path,
    copy_file: &mut F,
) -> AssetCopySummary
where
    F: FnMut(&Path, &Path) -> std::io::Result<u64>,
{
    let mut summary = AssetCopySummary::default();
    if let Err(error) = fs::create_dir_all(destination) {
        summary.skipped.push(SkippedAsset {
            path: export_relative_path(relative_path),
            error: error.to_string(),
        });
        return summary;
    }

    let entries = match fs::read_dir(source) {
        Ok(entries) => entries,
        Err(error) => {
            summary.skipped.push(SkippedAsset {
                path: export_relative_path(relative_path),
                error: error.to_string(),
            });
            return summary;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                summary.skipped.push(SkippedAsset {
                    path: export_relative_path(relative_path),
                    error: error.to_string(),
                });
                continue;
            }
        };
        let entry_relative_path = relative_path.join(entry.file_name());
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                summary.skipped.push(SkippedAsset {
                    path: export_relative_path(&entry_relative_path),
                    error: error.to_string(),
                });
                continue;
            }
        };
        let target = destination.join(entry.file_name());
        if metadata.is_dir() {
            let nested =
                copy_directory_with(&entry.path(), &target, &entry_relative_path, copy_file);
            summary.files += nested.files;
            summary.bytes += nested.bytes;
            summary.skipped.extend(nested.skipped);
        } else if metadata.is_file() {
            match copy_file_atomically(&entry.path(), &target, copy_file) {
                Ok(_) => {
                    summary.files += 1;
                    summary.bytes += metadata.len();
                }
                Err(error) => {
                    summary.skipped.push(SkippedAsset {
                        path: export_relative_path(&entry_relative_path),
                        error: error.to_string(),
                    });
                }
            }
        }
    }
    summary
}

fn copy_file_atomically<F>(
    source: &Path,
    destination: &Path,
    copy_file: &mut F,
) -> std::io::Result<u64>
where
    F: FnMut(&Path, &Path) -> std::io::Result<u64>,
{
    let mut partial_name = destination.as_os_str().to_os_string();
    partial_name.push(".inkling-export-part");
    let partial = PathBuf::from(partial_name);
    let result = copy_file(source, &partial).and_then(|bytes| {
        fs::rename(&partial, destination)?;
        Ok(bytes)
    });
    match result {
        Ok(bytes) => Ok(bytes),
        Err(error) => match fs::remove_file(&partial) {
            Ok(()) => Err(error),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                Err(error)
            }
            Err(cleanup_error) => Err(std::io::Error::new(
                error.kind(),
                format!(
                    "{error}; partial file {} could not be removed: {cleanup_error}",
                    partial.display()
                ),
            )),
        },
    }
}

fn export_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn validate_item_id(id: String) -> Result<String, StorageError> {
    let id = id.trim().to_owned();
    if id.is_empty() || id.len() > 128 {
        return Err(StorageError::InvalidInput(
            "item id must contain 1 to 128 characters".into(),
        ));
    }
    if !id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(StorageError::InvalidInput(
            "item id contains unsupported characters".into(),
        ));
    }
    Ok(id)
}

fn sanitize_file_name(value: &str) -> Result<String, StorageError> {
    let mut name = value
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect::<String>();

    while name.ends_with('.') || name.ends_with(' ') {
        name.pop();
    }
    if name.is_empty() || name == "." || name == ".." {
        return Err(StorageError::InvalidInput(
            "fileName must contain a usable file name".into(),
        ));
    }

    let mut name = name.chars().take(128).collect::<String>();
    if name.starts_with('.') {
        name.insert(0, '_');
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        name.insert(0, '_');
    }
    Ok(name)
}

fn normalize_mime_type(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn normalize_file_kind(
    kind: Option<&str>,
    mime_type: Option<&str>,
    file_name: &str,
) -> Result<String, StorageError> {
    if let Some(kind) = kind.map(str::trim).filter(|kind| !kind.is_empty()) {
        return match kind.to_ascii_lowercase().as_str() {
            "image" => Ok("image".into()),
            "pdf" => Ok("pdf".into()),
            "video" => Ok("video".into()),
            "file" | "other" => Ok("file".into()),
            _ => Err(StorageError::InvalidInput(
                "kind must be image, pdf, video, or file".into(),
            )),
        };
    }

    let extension = file_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase());
    if mime_type.is_some_and(|mime| mime.starts_with("image/"))
        || extension.as_deref().is_some_and(is_image_extension)
    {
        return Ok("image".into());
    }
    if mime_type == Some("application/pdf") || extension.as_deref() == Some("pdf") {
        return Ok("pdf".into());
    }
    if mime_type.is_some_and(|mime| mime.starts_with("video/"))
        || extension.as_deref().is_some_and(is_video_extension)
    {
        return Ok("video".into());
    }
    Ok("file".into())
}

fn is_image_extension(extension: &str) -> bool {
    matches!(
        extension,
        "avif" | "bmp" | "gif" | "ico" | "jpeg" | "jpg" | "png" | "tif" | "tiff" | "webp"
    )
}

fn is_video_extension(extension: &str) -> bool {
    matches!(
        extension,
        "avi" | "m4v" | "mkv" | "mov" | "mp4" | "mpeg" | "webm" | "wmv"
    )
}

struct ImageThumbnail {
    bytes: Vec<u8>,
    width: u32,
    height: u32,
}

fn make_image_thumbnail(bytes: &[u8]) -> Result<ImageThumbnail, StorageError> {
    let mut reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_IMAGE_ALLOC_BYTES);
    reader.limits(limits);
    let image = reader.decode()?;
    let (width, height) = image.dimensions();
    let thumbnail = image.thumbnail(THUMBNAIL_EDGE, THUMBNAIL_EDGE);
    let mut output = Cursor::new(Vec::new());
    thumbnail.write_to(&mut output, ImageFormat::WebP)?;
    Ok(ImageThumbnail {
        bytes: output.into_inner(),
        width,
        height,
    })
}

fn file_metadata(
    file_name: &str,
    mime_type: Option<&str>,
    byte_length: usize,
    image_dimensions: Option<(u32, u32)>,
    pdf_page_count: Option<usize>,
) -> Value {
    let mut metadata = Map::new();
    metadata.insert("fileName".into(), Value::String(file_name.to_owned()));
    metadata.insert(
        "mimeType".into(),
        mime_type
            .map(|mime| Value::String(mime.to_owned()))
            .unwrap_or(Value::Null),
    );
    metadata.insert(
        "byteLength".into(),
        Value::Number(serde_json::Number::from(byte_length as u64)),
    );
    if let Some((width, height)) = image_dimensions {
        metadata.insert(
            "mediaWidth".into(),
            Value::Number(serde_json::Number::from(width)),
        );
        metadata.insert(
            "mediaHeight".into(),
            Value::Number(serde_json::Number::from(height)),
        );
    }
    if let Some(page_count) = pdf_page_count {
        metadata.insert(
            "pdfPageCount".into(),
            Value::Number(serde_json::Number::from(page_count as u64)),
        );
    }
    Value::Object(metadata)
}

/// Undo the on-disk writes of an attach whose row disappeared underneath it.
///
/// The item directory is removed non-recursively, and that is the whole point:
/// when attaching, the directory may already hold assets written by an earlier
/// save, and a recursive remove would take those with it. A non-recursive
/// `remove_dir` simply fails when anything else is still there.
fn discard_written_assets(
    item_directory: &Path,
    original_path: &Path,
    thumbnail_file: Option<&Path>,
) {
    let _ = fs::remove_file(original_path);
    if let Some(path) = thumbnail_file {
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_dir(item_directory);
}

fn relative_asset_path(
    path: &std::path::Path,
    assets_root: &std::path::Path,
) -> Result<String, StorageError> {
    let relative = path.strip_prefix(assets_root).map_err(|_| {
        StorageError::InvalidInput("managed asset path escaped the assets directory".into())
    })?;
    Ok(PathBuf::from("assets")
        .join(relative)
        .to_string_lossy()
        .replace('\\', "/"))
}

fn bool_to_int(value: bool) -> i64 {
    i64::from(value)
}

fn now_millis() -> Result<i64, StorageError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            StorageError::InvalidInput(format!("system clock before Unix epoch: {error}"))
        })?;
    i64::try_from(duration.as_millis()).map_err(|_| {
        StorageError::InvalidInput("system timestamp exceeds SQLite integer range".into())
    })
}

fn portable_data_directory(executable: &Path) -> Option<PathBuf> {
    #[cfg(feature = "portable-preview")]
    {
        return executable.parent().map(|directory| directory.join("data"));
    }

    #[cfg(not(feature = "portable-preview"))]
    {
        let _ = executable;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "portable-preview"))]
    #[test]
    fn normal_build_never_trusts_a_portable_marker() {
        let directory =
            std::env::temp_dir().join(format!("inkling-portable-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let executable = directory.join("inkling.exe");

        assert_eq!(portable_data_directory(&executable), None);
        fs::write(directory.join("portable.flag"), "preview").unwrap();
        assert_eq!(portable_data_directory(&executable), None);

        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(feature = "portable-preview")]
    #[test]
    fn portable_preview_uses_data_beside_executable() {
        let directory =
            std::env::temp_dir().join(format!("inkling-portable-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let executable = directory.join("inkling.exe");

        assert_eq!(
            portable_data_directory(&executable),
            Some(directory.join("data"))
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn existing_fts_index_is_not_rebuilt() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(ITEMS_SCHEMA).unwrap();
        connection.execute_batch("BEGIN").unwrap();
        for index in 0..1000 {
            connection.execute(
                "INSERT INTO items (id, kind, title, description, metadata, ocr_text, created_at, updated_at)
                 VALUES (?1, 'note', 'orchard', 'A saved reference', '{}', '', 1, 1)",
                params![format!("item-{index}")],
            ).unwrap();
        }
        connection.execute_batch("COMMIT").unwrap();
        assert!(setup_fts5(&connection));
        let before: i64 = connection
            .query_row("SELECT total_changes()", [], |row| row.get(0))
            .unwrap();
        assert!(setup_fts5(&connection));
        let after: i64 = connection
            .query_row("SELECT total_changes()", [], |row| row.get(0))
            .unwrap();
        let matches: i64 = connection
            .query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'orchard'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(matches, 1000);
        assert_eq!(
            after - before,
            0,
            "reopening an existing FTS index must not write rows"
        );
    }

    #[test]
    fn fts_backfill_and_triggers_preserve_search_after_reopen() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(ITEMS_SCHEMA).unwrap();
        connection
            .execute_batch(
                "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
             VALUES ('old', 'note', 'orchard', '{}', '', 1, 1);",
            )
            .unwrap();
        for _ in 0..2 {
            assert!(setup_fts5(&connection));
        }
        connection
            .execute_batch(
                "UPDATE items SET title = 'meadow' WHERE id = 'old';
             INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
             VALUES ('new', 'note', 'orchard', '{}', '', 2, 2);",
            )
            .unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT item_id FROM items_fts WHERE items_fts MATCH 'orchard'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "new"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT item_id FROM items_fts WHERE items_fts MATCH 'meadow'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "old"
        );
        connection
            .execute("DELETE FROM items WHERE id = 'new'", [])
            .unwrap();
        assert!(setup_fts5(&connection));
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'orchard'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }

    #[test]
    fn partial_fts_index_is_rebuilt_on_reopen() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(ITEMS_SCHEMA).unwrap();
        connection.execute_batch("BEGIN").unwrap();
        for index in 0..10 {
            connection
                .execute(
                    "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
                     VALUES (?1, 'note', 'orchard', '{}', '', 1, 1)",
                    params![format!("item-{index}")],
                )
                .unwrap();
        }
        connection.execute_batch("COMMIT").unwrap();
        assert!(setup_fts5(&connection));
        // Simulate a crash between the table create and the backfill: half
        // the rows never made it into the index.
        connection
            .execute(
                "DELETE FROM items_fts WHERE rowid IN
                 (SELECT rowid FROM items_fts LIMIT 5)",
                [],
            )
            .unwrap();
        let indexed: i64 = connection
            .query_row("SELECT COUNT(*) FROM items_fts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(indexed, 5);

        assert!(setup_fts5(&connection));
        let matches: i64 = connection
            .query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'orchard'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(matches, 10);
        // A healthy reopen after the repair writes nothing again.
        let before: i64 = connection
            .query_row("SELECT total_changes()", [], |row| row.get(0))
            .unwrap();
        assert!(setup_fts5(&connection));
        let after: i64 = connection
            .query_row("SELECT total_changes()", [], |row| row.get(0))
            .unwrap();
        assert_eq!(after - before, 0);
    }

    #[test]
    fn missing_fts_triggers_are_recreated_without_reindex() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(ITEMS_SCHEMA).unwrap();
        connection
            .execute_batch(
                "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
                 VALUES ('old', 'note', 'orchard', '{}', '', 1, 1);",
            )
            .unwrap();
        assert!(setup_fts5(&connection));
        connection
            .execute_batch(
                "DROP TRIGGER items_fts_after_insert;
                 DROP TRIGGER items_fts_after_update;
                 DROP TRIGGER items_fts_after_delete;",
            )
            .unwrap();

        assert!(setup_fts5(&connection));
        let triggers: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_schema
                 WHERE type = 'trigger' AND name IN
                 ('items_fts_after_insert', 'items_fts_after_update', 'items_fts_after_delete')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(triggers, 3);
        // Counts still match, so the repair must not have rewritten the index.
        let matches: i64 = connection
            .query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'orchard'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(matches, 1);
        // And future writes stay covered by the recreated triggers.
        connection
            .execute_batch(
                "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
                 VALUES ('new', 'note', 'meadow', '{}', '', 2, 2);",
            )
            .unwrap();
        let meadow: i64 = connection
            .query_row(
                "SELECT count(*) FROM items_fts WHERE items_fts MATCH 'meadow'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(meadow, 1);
    }

    #[test]
    #[ignore]
    fn benchmark_library_refresh() {
        let directory = std::env::temp_dir().join(format!("inkling-perf-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(path.clone()).unwrap();
        let html = format!(
            "<p>{}</p>",
            "A saved article about gardens and architecture. ".repeat(400)
        );
        let metadata = serde_json::json!({"html": html, "tags": ["reference"]}).to_string();
        storage.connection.execute_batch("BEGIN").unwrap();
        for index in 0..1000 {
            let id = format!("perf-{index}");
            storage.connection.execute(
                "INSERT INTO items (id, kind, title, description, metadata, ocr_text, created_at, updated_at)
                 VALUES (?1, 'article', ?1, 'A saved reference', ?2, '', 1, 1)",
                params![id, metadata],
            ).unwrap();
            crate::jobs::JobQueue::enqueue_job(
                &storage.connection,
                &id,
                crate::jobs::JobKind::GenerateEmbedding,
            )
            .unwrap();
        }
        storage.connection.execute_batch("COMMIT").unwrap();
        drop(storage);
        let mut samples = Vec::new();
        for _ in 0..7 {
            let start = std::time::Instant::now();
            let storage = LibraryStorage::open(path.clone()).unwrap();
            let open_ms = start.elapsed().as_secs_f64() * 1000.0;
            // Measure the path the UI actually takes: one list query plus one
            // batched job query (two round trips), not one query per item.
            let start = std::time::Instant::now();
            let items = storage.list_active_items().unwrap();
            let list_ms = start.elapsed().as_secs_f64() * 1000.0;
            let ids = items.iter().map(|item| item.id.clone()).collect::<Vec<_>>();
            let start = std::time::Instant::now();
            let jobs =
                crate::jobs::JobQueue::get_jobs_for_items(&storage.connection, &ids).unwrap();
            let batch_jobs_ms = start.elapsed().as_secs_f64() * 1000.0;
            let bytes = serde_json::to_vec(&items).unwrap().len();
            samples.push(serde_json::json!({
                "open_ms": open_ms,
                "list_ms": list_ms,
                "batch_jobs_ms": batch_jobs_ms,
                "list_and_jobs_ms": list_ms + batch_jobs_ms,
                "list_bytes": bytes,
                "items": items.len(),
                "jobs": jobs.len(),
            }));
        }
        println!("INKLING_PERF={}", serde_json::to_string(&samples).unwrap());
        fs::remove_dir_all(directory).unwrap();
    }

    fn test_storage() -> (std::path::PathBuf, LibraryStorage) {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        (directory, storage)
    }

    /// Returns the scratch directory alongside the storage so each caller can
    /// remove it. Dropping the storage alone leaves the directory behind, so
    /// every run of every enrichment test was accumulating one.
    fn saved_video(baseline_title: Option<&str>) -> (PathBuf, LibraryStorage, String) {
        let (directory, storage) = test_storage();
        let item = storage
            .create_url(CreateUrlInput {
                source_url: "https://www.youtube.com/watch?v=abc12345678".into(),
                title: baseline_title.map(str::to_owned),
                description: None,
                body: String::new(),
                metadata: Some(serde_json::json!({
                    "origin": "browser-extension",
                    "sourceKind": "video",
                    "oEmbedBaseline": { "title": baseline_title, "description": null },
                })),
            })
            .unwrap();
        (directory, storage, item.id)
    }

    #[test]
    fn video_enrichment_fills_an_untouched_title() {
        let (directory, storage, id) = saved_video(Some("Watch later"));
        storage
            .apply_video_oembed(&id, Some("A Real Video Title"), Some("A Channel"))
            .unwrap();
        let item = storage.get_item(&id).unwrap().unwrap();
        assert_eq!(item.title.as_deref(), Some("A Real Video Title"));
        assert_eq!(item.description.as_deref(), Some("A Channel"));
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn video_enrichment_never_overwrites_a_user_edit() {
        // Regression: oEmbed runs in the background, so a user can rename the
        // item first. The provider's values used to win and the edit was lost.
        let (directory, storage, id) = saved_video(Some("Watch later"));
        storage
            .update_item(UpdateItemInput {
                id: id.clone(),
                title: Some("My own name for this".into()),
                ..Default::default()
            })
            .unwrap();

        storage
            .apply_video_oembed(&id, Some("A Real Video Title"), Some("A Channel"))
            .unwrap();
        let item = storage.get_item(&id).unwrap().unwrap();
        assert_eq!(
            item.title.as_deref(),
            Some("My own name for this"),
            "the user's title must survive background enrichment"
        );
        // The description was never set by anyone, so it still gets enriched.
        assert_eq!(item.description.as_deref(), Some("A Channel"));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn video_enrichment_does_not_resurrect_a_cleared_description() {
        // Clearing a field is an edit too. The baseline is None for a description
        // the capture never set, and treating any empty current value as "still
        // untouched" meant a user who deliberately cleared it got the provider's
        // text written straight back over the deletion.
        let (directory, storage, id) = saved_video(Some("Watch later"));
        storage
            .update_item(UpdateItemInput {
                id: id.clone(),
                description: Some(String::new()),
                ..Default::default()
            })
            .unwrap();

        storage
            .apply_video_oembed(&id, Some("A Real Video Title"), Some("A Channel"))
            .unwrap();

        let item = storage.get_item(&id).unwrap().unwrap();
        assert_eq!(
            item.description.as_deref(),
            Some(""),
            "a description the user cleared must stay cleared"
        );
        // The title was never touched, so it still enriches.
        assert_eq!(item.title.as_deref(), Some("A Real Video Title"));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn video_enrichment_is_dropped_once_applied() {
        // The baseline is consumed, so a retry cannot re-apply provider values
        // over a later edit.
        let (directory, storage, id) = saved_video(Some("Watch later"));
        storage
            .apply_video_oembed(&id, Some("A Real Video Title"), None)
            .unwrap();
        storage
            .apply_video_oembed(&id, Some("Retried Title"), None)
            .unwrap();
        let item = storage.get_item(&id).unwrap().unwrap();
        assert_eq!(item.title.as_deref(), Some("A Real Video Title"));
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn video_enrichment_leaves_items_without_a_baseline_alone() {
        let (directory, storage) = test_storage();
        let item = storage
            .create_url(CreateUrlInput {
                source_url: "https://www.youtube.com/watch?v=abc12345678".into(),
                title: Some("Something".into()),
                description: None,
                body: String::new(),
                metadata: None,
            })
            .unwrap();
        storage
            .apply_video_oembed(&item.id, Some("Provider Title"), None)
            .unwrap();
        let item = storage.get_item(&item.id).unwrap().unwrap();
        assert_eq!(item.title.as_deref(), Some("Something"));
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn discarding_written_assets_keeps_assets_written_earlier() {
        // The attach path writes into a directory that may already hold an
        // earlier save's assets. When the row vanishes mid-attach, only this
        // call's two files may go; a recursive remove would delete the older
        // ones too, turning a recoverable race into data loss.
        let directory =
            std::env::temp_dir().join(format!("inkling-discard-test-{}", Uuid::new_v4()));
        let item_directory = directory.join("item");
        fs::create_dir_all(&item_directory).unwrap();

        let original = item_directory.join("new.bin");
        let thumbnail = item_directory.join("thumbnail.webp");
        let earlier = item_directory.join("earlier.bin");
        fs::write(&original, b"new").unwrap();
        fs::write(&thumbnail, b"thumb").unwrap();
        fs::write(&earlier, b"earlier").unwrap();

        discard_written_assets(&item_directory, &original, Some(&thumbnail));

        assert!(!original.exists(), "this attach's original was left behind");
        assert!(
            !thumbnail.exists(),
            "this attach's thumbnail was left behind"
        );
        assert!(
            earlier.exists(),
            "an asset written before this attach was deleted"
        );

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn discarding_written_assets_removes_an_otherwise_empty_directory() {
        // The common case: nothing else was ever written for this item, so the
        // directory itself should not survive as an orphan.
        let directory =
            std::env::temp_dir().join(format!("inkling-discard-empty-test-{}", Uuid::new_v4()));
        let item_directory = directory.join("item");
        fs::create_dir_all(&item_directory).unwrap();
        let original = item_directory.join("new.bin");
        fs::write(&original, b"new").unwrap();

        discard_written_assets(&item_directory, &original, None);

        assert!(
            !item_directory.exists(),
            "an empty asset directory was orphaned"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn storing_a_favicon_for_a_deleted_item_writes_nothing() {
        // Regression: the favicon download runs in the background, so the item
        // can be deleted mid-flight. Writing the file first recreated the
        // deleted item's asset directory and left an orphan behind.
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let assets = storage.assets_directory();

        let result = storage.store_favicon("deleted-item-id", b"\x00\x01", "png");
        assert!(
            matches!(result, Err(StorageError::NotFound(_))),
            "expected NotFound, got {result:?}"
        );
        assert!(
            !assets.join("deleted-item-id").exists(),
            "no asset directory may be created for an item that no longer exists"
        );
        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn note_body_round_trips_and_updates_search_index() {
        let directory =
            std::env::temp_dir().join(format!("inkling-note-body-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Reading list".into()),
                body: "# Reading list\n\n**Ship** the editor and [read the docs](https://example.com).".into(),
                metadata: None,
            })
            .unwrap();

        assert_eq!(
            item.body.as_deref(),
            Some("# Reading list\n\n**Ship** the editor and [read the docs](https://example.com).")
        );
        assert_eq!(item.body_format.as_deref(), Some(BODY_FORMAT_MARKDOWN));
        assert_eq!(
            item.description.as_deref(),
            Some("Reading list Ship the editor and read the docs.")
        );
        assert!(storage
            .search_items("Ship", 10)
            .unwrap()
            .iter()
            .any(|result| result.id == item.id));
        assert!(storage
            .list_active_items()
            .unwrap()
            .iter()
            .all(|result| result.body.is_none()));

        let updated = storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                body: Some("## Next\n\n- [x] Verify the preview".into()),
                body_format: Some(BODY_FORMAT_MARKDOWN.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            updated.description.as_deref(),
            Some("Next Verify the preview")
        );
        assert!(storage
            .search_items("Ship", 10)
            .unwrap()
            .iter()
            .all(|result| result.id != item.id));
        assert!(storage
            .search_items("preview", 10)
            .unwrap()
            .iter()
            .any(|result| result.id == item.id));
        assert_eq!(
            storage.get_item_content(&item.id).unwrap().body,
            "## Next\n\n- [x] Verify the preview"
        );

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_explicit_description_outranks_the_body_projection() {
        let directory =
            std::env::temp_dir().join(format!("inkling-description-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Field notes".into()),
                body: "first draft".into(),
                metadata: None,
            })
            .unwrap();

        // A caller that sends no description gets the projection, which is how
        // the note editor re-derives it from the body it just saved.
        let derived = storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                body: Some("## Second\n\nA sharper line.".into()),
                body_format: Some(BODY_FORMAT_MARKDOWN.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            derived.description.as_deref(),
            Some("Second A sharper line.")
        );

        // A caller that sends both gets the description it asked for, and the
        // body still lands.
        let explicit = storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                description: Some("A hand written summary".into()),
                body: Some("## Third\n\nDifferent text again.".into()),
                body_format: Some(BODY_FORMAT_MARKDOWN.into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            explicit.description.as_deref(),
            Some("A hand written summary")
        );
        assert_eq!(
            storage.get_item_content(&item.id).unwrap().body,
            "## Third\n\nDifferent text again."
        );

        // A description on its own is still a plain description write.
        let described = storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                description: Some("  Trimmed summary  ".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(described.description.as_deref(), Some("Trimmed summary"));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn quote_attribution_counts_characters_not_bytes() {
        let directory =
            std::env::temp_dir().join(format!("inkling-quote-attribution-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        // The capture server's `capped_string` counts characters, so a
        // 240-character CJK title passes the receiver and reaches here. A byte
        // count refused it as "too many characters" and failed the capture for
        // exactly the multi-byte text the byte fix was meant to admit.
        let cjk = "文".repeat(240);
        assert_eq!(cjk.chars().count(), 240);
        assert_eq!(cjk.len(), 720, "the fixture must actually be multi-byte");

        let quote = storage
            .create_quote(CreateQuoteInput {
                body: "a passage".into(),
                attribution: Some(cjk.clone()),
                source_url: None,
                metadata: None,
            })
            .expect("a 240-character attribution must be accepted, not refused as over 240 bytes");
        assert_eq!(quote.description.as_deref(), Some(cjk.as_str()));

        // Genuinely over the limit is still refused, in both directions.
        let over = "文".repeat(241);
        let error = storage
            .create_quote(CreateQuoteInput {
                body: "a passage".into(),
                attribution: Some(over),
                source_url: None,
                metadata: None,
            })
            .unwrap_err();
        assert!(
            error.to_string().contains("240 characters"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn only_notes_carry_a_body_column() {
        let directory =
            std::env::temp_dir().join(format!("inkling-body-scope-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        // The frontend sends the primary text of every kind under the same
        // `body` name, so the storage layer has to keep the column note-only or
        // a quote ends up storing its text four times.
        let note = storage
            .create_note(CreateNoteInput {
                title: Some("A note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        let quote = storage
            .create_quote(CreateQuoteInput {
                body: "warm light".into(),
                attribution: Some("Ada".into()),
                source_url: None,
                metadata: None,
            })
            .unwrap();
        let article = storage
            .create_url(CreateUrlInput {
                source_url: "https://example.com/warm-light".into(),
                title: Some("An article".into()),
                description: None,
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();

        assert_eq!(note.body.as_deref(), Some("warm light"));
        assert_eq!(note.body_format.as_deref(), Some(BODY_FORMAT_MARKDOWN));
        assert_eq!(quote.body.as_deref(), Some(""));
        assert_eq!(quote.body_format.as_deref(), Some(""));
        assert_eq!(article.body.as_deref(), Some(""));
        assert_eq!(article.body_format.as_deref(), Some(""));

        // The quote keeps its text where the rest of the app reads it.
        assert_eq!(quote.title.as_deref(), Some("warm light"));
        assert_eq!(quote.description.as_deref(), Some("Ada"));
        assert!(storage
            .search_items("warm", 10)
            .unwrap()
            .iter()
            .any(|result| result.id == quote.id));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn plain_text_drops_task_markers_but_keeps_brackets_written_as_prose() {
        assert_eq!(
            markdown_to_plain_text("- [x] Measure the wall\n- [ ] Order the chairs"),
            "Measure the wall Order the chairs"
        );
        assert_eq!(
            markdown_to_plain_text("The prompt prints [X] when the step passes."),
            "The prompt prints [X] when the step passes."
        );
        assert_eq!(
            markdown_to_plain_text("Toggle between [ ] and [x] in the list."),
            "Toggle between [ ] and [x] in the list."
        );
    }

    #[test]
    fn plain_text_keeps_words_apart_across_void_inline_tags() {
        assert_eq!(markdown_to_plain_text("foo<br>bar"), "foo bar");
        assert_eq!(markdown_to_plain_text("one<br/>two"), "one two");
        assert_eq!(markdown_to_plain_text("a<em>bc</em>d"), "abcd");
        // A word-internal break hint must not become a space in search text.
        assert_eq!(markdown_to_plain_text("hy<wbr>phen"), "hyphen");
    }

    #[test]
    fn old_item_schema_is_migrated_and_old_fts_is_rebuilt() {
        let directory =
            std::env::temp_dir().join(format!("inkling-note-migration-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("library.sqlite3");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE items (
                    id TEXT PRIMARY KEY NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT,
                    description TEXT,
                    source_url TEXT,
                    source_label TEXT,
                    local_asset_path TEXT,
                    thumbnail_path TEXT,
                    ocr_text TEXT NOT NULL DEFAULT '',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    favorite INTEGER NOT NULL DEFAULT 0
                );
                CREATE VIRTUAL TABLE items_fts USING fts5(
                    item_id UNINDEXED,
                    title,
                    description,
                    source_label,
                    ocr_text,
                    metadata
                );
                CREATE TRIGGER items_fts_after_insert
                AFTER INSERT ON items BEGIN
                    INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata)
                    VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata);
                END;
                CREATE TRIGGER items_fts_after_update
                AFTER UPDATE ON items BEGIN
                    DELETE FROM items_fts WHERE item_id = old.id;
                    INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata)
                    VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata);
                END;
                CREATE TRIGGER items_fts_after_delete
                AFTER DELETE ON items BEGIN
                    DELETE FROM items_fts WHERE item_id = old.id;
                END;
                INSERT INTO items(id, kind, title, description, metadata, ocr_text, created_at, updated_at)
                VALUES ('legacy-note', 'note', 'Legacy note', 'legacy searchable body', '{}', '', 1, 1);
                INSERT INTO items(id, kind, title, description, source_url, source_label, metadata, ocr_text, created_at, updated_at)
                VALUES (
                    'legacy-quote', 'quote', 'A library is a promise to the future', 'Ada Lovelace',
                    NULL, NULL,
                    '{\"quoteText\":\"A library is a promise to the future\",\"attribution\":\"Ada Lovelace\",\"text\":\"A library is a promise to the future. Ada Lovelace\"}',
                    '', 1, 1
                );
                INSERT INTO items(id, kind, title, description, source_url, source_label, metadata, ocr_text, created_at, updated_at)
                VALUES (
                    'legacy-url', 'url', 'On writing well', NULL,
                    'https://example.com/writing', 'example.com',
                    '{\"sourceUrl\":\"https://example.com/writing\",\"text\":\"Extracted article text that should not be duplicated into the body column.\",\"html\":\"\"}',
                    '', 1, 1
                );
                PRAGMA user_version = 6;",
            )
            .unwrap();
        drop(connection);

        let storage = LibraryStorage::open(path.clone()).unwrap();
        let migrated = storage.get_item("legacy-note").unwrap().unwrap();
        assert_eq!(migrated.body.as_deref(), Some("legacy searchable body"));
        assert_eq!(migrated.body_format.as_deref(), Some(BODY_FORMAT_MARKDOWN));
        assert!(storage
            .search_items("searchable", 10)
            .unwrap()
            .iter()
            .any(|item| item.id == "legacy-note"));

        // A migrated quote and url keep their text where the create paths put it
        // and must not gain a second copy in body.
        let migrated_quote = storage.get_item("legacy-quote").unwrap().unwrap();
        assert_eq!(migrated_quote.body.as_deref(), Some(""));
        assert_eq!(
            migrated_quote.title.as_deref(),
            Some("A library is a promise to the future")
        );
        assert_eq!(
            migrated_quote
                .metadata
                .get("quoteText")
                .and_then(Value::as_str),
            Some("A library is a promise to the future")
        );
        let migrated_url = storage.get_item("legacy-url").unwrap().unwrap();
        assert_eq!(migrated_url.body.as_deref(), Some(""));
        assert_eq!(
            migrated_url.metadata.get("text").and_then(Value::as_str),
            Some("Extracted article text that should not be duplicated into the body column.")
        );
        assert!(storage
            .search_items("Lovelace", 10)
            .unwrap()
            .iter()
            .any(|item| item.id == "legacy-quote"));

        let body_columns: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name IN ('body', 'body_format')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(body_columns, 2);
        drop(storage);

        let reopened = LibraryStorage::open(path).unwrap();
        assert_eq!(
            reopened.get_item_content("legacy-note").unwrap().body,
            "legacy searchable body"
        );
        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_library_without_space_items_gains_the_table_on_open() {
        // `space_items` arrived with manual Spaces on a branch this one did not
        // have, so a developer's existing library predates the table entirely.
        // The schema batch has to add it to a real file, not just to a fresh
        // one: the alternative is a regular Space that fails its first query on
        // the user's own data.
        let directory =
            std::env::temp_dir().join(format!("inkling-space-items-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("library.sqlite3");

        // An older library: items present, spaces without the kind column, and
        // no space_items table at all.
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE items (
                    id TEXT PRIMARY KEY NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT,
                    description TEXT,
                    source_url TEXT,
                    source_label TEXT,
                    local_asset_path TEXT,
                    thumbnail_path TEXT,
                    ocr_text TEXT NOT NULL DEFAULT '',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    favorite INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO items(id, kind, title, description, metadata, created_at, updated_at)
                VALUES ('kept-item', 'note', 'Kept', 'still here', '{}', 1, 1);
                CREATE TABLE spaces (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    query TEXT NOT NULL DEFAULT '{}',
                    position INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                PRAGMA user_version = 6;",
            )
            .unwrap();
        drop(connection);

        let storage = LibraryStorage::open(path.clone()).unwrap();

        let tables: Vec<String> = storage
            .connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(
            tables.iter().any(|name| name == "space_items"),
            "space_items missing after upgrade: {tables:?}"
        );

        let indexes: Vec<String> = storage
            .connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(
            indexes.iter().any(|name| name == "idx_space_items_item"),
            "space_items index missing after upgrade: {indexes:?}"
        );

        // The pre-existing row must survive the migration untouched, and the
        // table has to be usable, not merely present.
        assert_eq!(
            storage
                .get_item("kept-item")
                .unwrap()
                .unwrap()
                .title
                .as_deref(),
            Some("Kept")
        );
        let space = storage
            .create_space(CreateSpaceInput {
                name: "Reading".into(),
                color: None,
                query: SmartSpaceQuery::default(),
                kind: SpaceKind::Regular,
            })
            .unwrap();
        storage.add_space_item(&space.id, "kept-item").unwrap();
        let members = storage.list_space_member_items(&space.id, 10).unwrap();
        assert_eq!(members.len(), 1, "manual membership did not round-trip");
        assert_eq!(members[0].id, "kept-item");

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn migrated_item_bodies_are_not_rewritten_on_every_open() {
        let directory =
            std::env::temp_dir().join(format!("inkling-note-backfill-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("library.sqlite3");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE items (
                    id TEXT PRIMARY KEY NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT,
                    description TEXT,
                    source_url TEXT,
                    source_label TEXT,
                    local_asset_path TEXT,
                    thumbnail_path TEXT,
                    ocr_text TEXT NOT NULL DEFAULT '',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    favorite INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO items(id, kind, title, description, metadata, created_at, updated_at)
                VALUES ('legacy-note', 'note', 'Legacy note', 'legacy searchable body', '{}', 1, 1);
                PRAGMA user_version = 6;",
            )
            .unwrap();
        drop(connection);

        let storage = LibraryStorage::open(path.clone()).unwrap();
        assert_eq!(
            storage.get_item_content("legacy-note").unwrap().body,
            "legacy searchable body"
        );
        storage
            .connection
            .execute_batch(
                "CREATE TABLE body_writes (id INTEGER PRIMARY KEY);
                 CREATE TRIGGER log_body_writes
                 AFTER UPDATE OF body, body_format ON items
                 BEGIN
                     INSERT INTO body_writes (id) VALUES (NULL);
                 END;",
            )
            .unwrap();
        drop(storage);

        let reopened = LibraryStorage::open(path).unwrap();
        let rewrites: i64 = reopened
            .connection
            .query_row("SELECT COUNT(*) FROM body_writes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rewrites, 0);
        assert_eq!(
            reopened.get_item_content("legacy-note").unwrap().body,
            "legacy searchable body"
        );
        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn semantic_search_reads_stored_text_embeddings() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(database_path).unwrap();
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("A quiet reference".into()),
                body: "Kept in the archive.".into(),
                metadata: None,
            })
            .unwrap();
        let vector =
            crate::embeddings::text_embedding(Path::new("models"), "warm light and timber")
                .unwrap();
        storage
            .store_embedding(
                &item.id,
                "text",
                crate::embeddings::TEXT_MODEL,
                &crate::embeddings::encode_f32(&vector),
                vector.len(),
            )
            .unwrap();

        let results = storage.search_items("timber", 10).unwrap();
        assert_eq!(results.first().map(|result| &result.id), Some(&item.id));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn image_similarity_reads_stored_image_embeddings() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(database_path).unwrap();
        for id in ["source", "near", "far"] {
            storage
                .connection
                .execute(
                    "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
                     VALUES (?1, 'image', ?1, '{}', '', 1, 1)",
                    params![id],
                )
                .unwrap();
        }
        for (id, vector) in [
            ("source", vec![1.0, 0.0]),
            ("near", vec![0.9, 0.1]),
            ("far", vec![-1.0, 0.0]),
        ] {
            storage
                .store_embedding(
                    id,
                    "image",
                    crate::embeddings::IMAGE_MODEL,
                    &crate::embeddings::encode_f32(&vector),
                    vector.len(),
                )
                .unwrap();
        }

        let results = storage.search_similar_images("source", 10).unwrap();
        assert_eq!(
            results.first().map(|result| result.id.as_str()),
            Some("near")
        );

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn regular_spaces_hold_only_the_items_filed_into_them() {
        let directory =
            std::env::temp_dir().join(format!("inkling-manual-spaces-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let filed = storage
            .create_note(CreateNoteInput {
                title: Some("Filed".into()),
                body: "goes in the space".into(),
                metadata: None,
            })
            .unwrap();
        let left_out = storage
            .create_note(CreateNoteInput {
                title: Some("Left out".into()),
                body: "stays in the library".into(),
                metadata: None,
            })
            .unwrap();

        // A search query captured in the create form must not become a manual
        // Space's contents; only filed items do.
        let space = storage
            .create_space(CreateSpaceInput {
                name: "Weekend reading".into(),
                color: None,
                kind: SpaceKind::Regular,
                query: SmartSpaceQuery {
                    text: Some("left out".into()),
                    ..Default::default()
                },
            })
            .unwrap();
        assert_eq!(space.kind, SpaceKind::Regular);
        assert!(storage.list_space_items(&space.id, 50).unwrap().is_empty());

        storage.add_space_item(&space.id, &filed.id).unwrap();
        let items = storage.list_space_items(&space.id, 50).unwrap();
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec![filed.id.as_str()]
        );
        assert_eq!(
            storage.list_item_space_ids(&filed.id).unwrap(),
            vec![space.id.clone()]
        );

        // Filing the same item twice is a no-op, so a retried click cannot fail.
        storage.add_space_item(&space.id, &filed.id).unwrap();
        assert_eq!(storage.list_space_items(&space.id, 50).unwrap().len(), 1);

        // Taking an item back out is a no-op when it was never in.
        storage.remove_space_item(&space.id, &left_out.id).unwrap();
        assert_eq!(storage.list_space_items(&space.id, 50).unwrap().len(), 1);
        storage.remove_space_item(&space.id, &filed.id).unwrap();
        assert!(storage.list_space_items(&space.id, 50).unwrap().is_empty());
        assert!(storage.list_item_space_ids(&filed.id).unwrap().is_empty());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn filing_an_item_that_does_not_exist_is_refused() {
        let directory =
            std::env::temp_dir().join(format!("inkling-manual-missing-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let space = storage
            .create_space(CreateSpaceInput {
                name: "Weekend reading".into(),
                color: None,
                kind: SpaceKind::Regular,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();

        // space_items has no foreign key, so nothing but this check stops a bad
        // id from leaving an orphan row nothing will ever read or clean up.
        assert!(matches!(
            storage.add_space_item(&space.id, "no-such-item"),
            Err(StorageError::NotFound(_))
        ));
        assert!(storage.list_space_items(&space.id, 50).unwrap().is_empty());

        // A real item that was deleted for good is refused the same way.
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Gone".into()),
                body: "deleted below".into(),
                metadata: None,
            })
            .unwrap();
        storage.archive_item(&item.id, true).unwrap();
        storage.delete_item(&item.id).unwrap();
        assert!(matches!(
            storage.add_space_item(&space.id, &item.id),
            Err(StorageError::NotFound(_))
        ));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn archiving_hides_a_filed_item_until_it_is_restored() {
        let directory =
            std::env::temp_dir().join(format!("inkling-manual-restore-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Filed".into()),
                body: "belongs in the space".into(),
                metadata: None,
            })
            .unwrap();
        let space = storage
            .create_space(CreateSpaceInput {
                name: "Weekend reading".into(),
                color: None,
                kind: SpaceKind::Regular,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();
        storage.add_space_item(&space.id, &item.id).unwrap();
        assert_eq!(storage.list_space_items(&space.id, 50).unwrap().len(), 1);

        // Archiving is reversible, so membership survives it: the Space just
        // stops listing the item until the user brings it back.
        storage.archive_item(&item.id, true).unwrap();
        assert!(storage.list_space_items(&space.id, 50).unwrap().is_empty());
        storage.archive_item(&item.id, false).unwrap();
        let items = storage.list_space_items(&space.id, 50).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, item.id);

        // A permanent delete drops the membership, since the item is gone.
        storage.archive_item(&item.id, true).unwrap();
        storage.delete_item(&item.id).unwrap();
        assert!(storage.list_item_space_ids(&item.id).unwrap().is_empty());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn smart_spaces_refuse_manual_membership() {
        let directory =
            std::env::temp_dir().join(format!("inkling-smart-membership-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Note".into()),
                body: "text".into(),
                metadata: None,
            })
            .unwrap();
        let smart = storage
            .create_space(CreateSpaceInput {
                name: "Top picks".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();

        // A Smart Space decides its own contents, so filing into it is rejected
        // rather than silently ignored.
        assert!(matches!(
            storage.add_space_item(&smart.id, &item.id),
            Err(StorageError::InvalidInput(_))
        ));
        // Regular Spaces have no query to edit, so a query update is rejected
        // instead of being dropped.
        let regular = storage
            .create_space(CreateSpaceInput {
                name: "Weekend reading".into(),
                color: None,
                kind: SpaceKind::Regular,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();
        assert!(matches!(
            storage.update_space(UpdateSpaceInput {
                id: regular.id.clone(),
                name: None,
                color: None,
                query: Some(SmartSpaceQuery::default()),
                position: None,
            }),
            Err(StorageError::InvalidInput(_))
        ));
        // Membership writes still reach the database after a rejected update.
        assert!(storage.add_space_item(&regular.id, &item.id).is_ok());
        assert!(storage.remove_space_item(&regular.id, &item.id).is_ok());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn smart_spaces_evaluate_queries_lazily() {
        let directory =
            std::env::temp_dir().join(format!("inkling-spaces-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let tagged = storage
            .create_note(CreateNoteInput {
                title: Some("Tagged note".into()),
                body: "carries the reference tag".into(),
                metadata: Some(serde_json::json!({ "tags": ["reference"] })),
            })
            .unwrap();
        let favorite = storage
            .create_note(CreateNoteInput {
                title: Some("Favorite note".into()),
                body: "a starred thought about timber".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .update_item(UpdateItemInput {
                id: favorite.id.clone(),
                favorite: Some(true),
                ..Default::default()
            })
            .unwrap();
        let plain = storage
            .create_note(CreateNoteInput {
                title: Some("Plain note".into()),
                body: "nothing special here".into(),
                metadata: None,
            })
            .unwrap();

        // Tag-filtered space.
        let tag_space = storage
            .create_space(CreateSpaceInput {
                name: "Design references".into(),
                color: Some("orange".into()),
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery {
                    tag: Some("reference".into()),
                    ..Default::default()
                },
            })
            .unwrap();
        let items = storage.list_space_items(&tag_space.id, 50).unwrap();
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec![tagged.id.as_str()]
        );

        // Favorite-filtered space.
        let favorite_space = storage
            .create_space(CreateSpaceInput {
                name: "Top picks".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery {
                    favorite: Some(true),
                    ..Default::default()
                },
            })
            .unwrap();
        let items = storage.list_space_items(&favorite_space.id, 50).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, favorite.id);

        // Text space reuses lexical search; only matching notes come back.
        let text_space = storage
            .create_space(CreateSpaceInput {
                name: "Timber thinking".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery {
                    text: Some("timber".into()),
                    ..Default::default()
                },
            })
            .unwrap();
        let items = storage.list_space_items(&text_space.id, 50).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, favorite.id);

        // Empty query matches everything.
        let everything = storage
            .create_space(CreateSpaceInput {
                name: "Everything space".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();
        let items = storage.list_space_items(&everything.id, 50).unwrap();
        assert_eq!(items.len(), 3);
        assert!(items.iter().any(|item| item.id == plain.id));

        // Update and delete round-trip.
        let updated = storage
            .update_space(UpdateSpaceInput {
                id: tag_space.id.clone(),
                name: Some("Renamed space".into()),
                color: None,
                query: None,
                position: None,
            })
            .unwrap();
        assert_eq!(updated.name, "Renamed space");

        // Reorder round-trip: the atomic swap exchanges list order.
        let listed = storage.list_spaces().unwrap();
        assert_eq!(listed.len(), 4);
        let first_id = listed[0].id.clone();
        let second_id = listed[1].id.clone();
        let reordered = storage.swap_space_positions(&first_id, &second_id).unwrap();
        assert_eq!(reordered[0].id, second_id);
        assert_eq!(reordered[1].id, first_id);
        // Swapping back restores the original order.
        let restored = storage.swap_space_positions(&first_id, &second_id).unwrap();
        assert_eq!(restored[0].id, first_id);
        assert_eq!(restored[1].id, second_id);

        let listed = storage.list_spaces().unwrap();
        assert_eq!(listed.len(), 4);

        storage.delete_space(&tag_space.id).unwrap();
        assert!(storage.get_space(&tag_space.id).unwrap().is_none());
        assert_eq!(storage.list_spaces().unwrap().len(), 3);
        // Deleting a Space must not touch its items.
        assert!(storage.get_item(&tagged.id).unwrap().is_some());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn smart_space_kind_filter_matches_article_urls() {
        let directory =
            std::env::temp_dir().join(format!("inkling-spaces-kind-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        storage
            .create_url(CreateUrlInput {
                source_url: "https://example.com/article".into(),
                title: Some("An article".into()),
                description: None,
                body: "body text".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .create_note(CreateNoteInput {
                title: None,
                body: "just a note".into(),
                metadata: None,
            })
            .unwrap();

        let article_space = storage
            .create_space(CreateSpaceInput {
                name: "Articles".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery {
                    kind: Some("article".into()),
                    ..Default::default()
                },
            })
            .unwrap();
        let items = storage.list_space_items(&article_space.id, 50).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, "url");

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn stores_favicon_asset_without_changing_item_timestamp() {
        let directory =
            std::env::temp_dir().join(format!("inkling-favicon-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .create_url(CreateUrlInput {
                source_url: "https://example.com/article".into(),
                title: Some("Article".into()),
                description: None,
                body: "body".into(),
                metadata: Some(serde_json::json!({ "favicon": "https://example.com/favicon.png" })),
            })
            .unwrap();
        let path = storage
            .store_favicon(&item.id, b"favicon-bytes", "png")
            .unwrap();
        let stored = storage.get_item(&item.id).unwrap().unwrap();

        assert_eq!(path, format!("assets/items/{}/favicon.png", item.id));
        assert_eq!(stored.metadata["faviconPath"], path);
        assert_eq!(stored.updated_at, item.updated_at);
        assert_eq!(fs::read(directory.join(path)).unwrap(), b"favicon-bytes");

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn video_oembed_enrichment_keeps_the_item_timestamp() {
        let directory =
            std::env::temp_dir().join(format!("inkling-oembed-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .create_url(CreateUrlInput {
                source_url: "https://www.youtube.com/watch?v=abc".into(),
                title: Some("Some video - YouTube".into()),
                description: None,
                body: String::new(),
                metadata: Some(serde_json::json!({
                    "sourceKind": "video",
                    "oEmbedBaseline": { "title": "Some video - YouTube", "description": null },
                })),
            })
            .unwrap();

        storage
            .apply_video_oembed(&item.id, Some("Some video"), Some("YouTube · inkling"))
            .unwrap();
        let enriched = storage.get_item(&item.id).unwrap().unwrap();
        assert_eq!(enriched.title.as_deref(), Some("Some video"));
        assert_eq!(enriched.description.as_deref(), Some("YouTube · inkling"));
        assert_eq!(enriched.updated_at, item.updated_at);

        // A retry with nothing to say must not blank what is already stored.
        storage.apply_video_oembed(&item.id, None, None).unwrap();
        let untouched = storage.get_item(&item.id).unwrap().unwrap();
        assert_eq!(untouched.title.as_deref(), Some("Some video"));
        assert_eq!(untouched.updated_at, item.updated_at);

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn tag_update_persists_after_reopen() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(database_path).unwrap();
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Archive pick".into()),
                body: "kept for later".into(),
                metadata: Some(serde_json::json!({ "tags": ["reference"], "origin": "demo" })),
            })
            .unwrap();
        storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                add_tag: Some("keep me".into()),
                ..Default::default()
            })
            .unwrap();

        drop(storage);
        let reopened = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let reopened_item = reopened.get_item(&item.id).unwrap().unwrap();
        assert_eq!(
            reopened_item.metadata["tags"],
            serde_json::json!(["reference", "keep me"])
        );
        assert_eq!(reopened_item.metadata["origin"], "demo");

        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn tag_update_preserves_metadata_without_stale_frontend_copy() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .create_note(CreateNoteInput {
                title: Some("Url pickup".into()),
                body: "carried over".into(),
                metadata: Some(serde_json::json!({ "tags": ["a"], "text": "body", "x": 1 })),
            })
            .unwrap();
        let updated = storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                add_tag: Some("B".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(updated.metadata["tags"], serde_json::json!(["a", "b"]));
        assert_eq!(updated.metadata["text"], "body");
        assert_eq!(updated.metadata["x"], 1);
        for tag in [" ## B ", "C", "c"] {
            storage
                .update_item(UpdateItemInput {
                    id: item.id.clone(),
                    add_tag: Some(tag.into()),
                    ..Default::default()
                })
                .unwrap();
        }
        let stored = storage.get_item(&item.id).unwrap().unwrap();
        assert_eq!(stored.metadata["tags"], serde_json::json!(["a", "b", "c"]));
        assert_eq!(stored.title, item.title);
        assert_eq!(stored.description, item.description);
        assert!(storage
            .update_item(UpdateItemInput {
                id: item.id.clone(),
                add_tag: Some(" ### ".into()),
                ..Default::default()
            })
            .is_err());
        assert!(matches!(
            storage.update_item(UpdateItemInput {
                id: "missing-item".into(),
                add_tag: Some("reference".into()),
                ..Default::default()
            }),
            Err(StorageError::NotFound(_))
        ));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn delete_item_removes_item_files() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(database_path).unwrap();
        let item = storage
            .save_file(SaveFileInput {
                id: None,
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"archived bytes".to_vec(),
            })
            .unwrap();
        let item_directory = directory.join("assets").join("items").join(&item.id);
        assert!(item_directory.is_dir());

        storage.archive_item(&item.id, true).unwrap();
        storage.delete_item(&item.id).unwrap();

        assert!(!item_directory.exists());
        assert!(storage.get_item(&item.id).unwrap().is_none());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn attaching_a_file_never_resurrects_a_deleted_item() {
        // The background image and OCR jobs both attach to an item that was
        // already acknowledged, so the row can be gone by the time the bytes
        // arrive. Writing anyway would put the deleted item back and leave an
        // asset directory nothing cleans up.
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .save_file(SaveFileInput {
                id: None,
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"attached bytes".to_vec(),
            })
            .unwrap();
        let id = item.id.clone();
        // Trash is two steps in this model: archived first, then purged.
        storage.archive_item(&id, true).unwrap();
        storage.delete_item(&id).unwrap();

        let error = storage
            .save_file(SaveFileInput {
                id: Some(id.clone()),
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"attached bytes".to_vec(),
            })
            .unwrap_err();
        assert!(
            matches!(error, StorageError::NotFound(ref missing) if missing == &id),
            "expected NotFound, got {error:?}"
        );

        assert!(storage.get_item(&id).unwrap().is_none(), "item came back");
        assert!(
            !directory.join("assets").join("items").join(&id).exists(),
            "an orphaned asset directory was left behind"
        );

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn attaching_a_file_does_not_unarchive_an_archived_item() {
        // The user archived the card while the download was still running.
        // Completing that download is not a request to bring it back.
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let item = storage
            .save_file(SaveFileInput {
                id: None,
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"attached bytes".to_vec(),
            })
            .unwrap();
        storage.archive_item(&item.id, true).unwrap();

        storage
            .save_file(SaveFileInput {
                id: Some(item.id.clone()),
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"attached bytes".to_vec(),
            })
            .unwrap();

        let stored = storage.get_item(&item.id).unwrap().unwrap();
        assert!(
            stored.metadata.get("archived").is_none(),
            "metadata should not claim a non-archived item"
        );
        let archived: i64 = storage
            .connection
            .query_row(
                "SELECT archived FROM items WHERE id = ?1",
                [&item.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            archived, 1,
            "the archived item was unarchived by a download"
        );

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn delete_item_leaves_files_when_item_not_archived() {
        let directory =
            std::env::temp_dir().join(format!("inkling-storage-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("library.sqlite3");
        let storage = LibraryStorage::open(database_path).unwrap();
        let item = storage
            .save_file(SaveFileInput {
                id: None,
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"archived bytes".to_vec(),
            })
            .unwrap();
        let item_directory = directory.join("assets").join("items").join(&item.id);
        assert!(item_directory.is_dir());

        // Archive, then restore within the undo window: a pending delete must
        // no longer be able to take the row's files with it.
        storage.archive_item(&item.id, true).unwrap();
        storage.archive_item(&item.id, false).unwrap();

        assert!(matches!(
            storage.delete_item(&item.id),
            Err(StorageError::NotFound(_))
        ));
        assert!(item_directory.is_dir());
        assert!(storage.get_item(&item.id).unwrap().is_some());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn text_similarity_ranks_across_kinds_and_excludes_source_and_archived() {
        let directory =
            std::env::temp_dir().join(format!("inkling-similar-text-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let note = storage
            .create_note(CreateNoteInput {
                title: Some("Source note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        let article = storage
            .create_url(CreateUrlInput {
                source_url: "https://example.com/warm-light".into(),
                title: Some("Article on warm light".into()),
                description: None,
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        let quote = storage
            .create_quote(CreateQuoteInput {
                body: "a quote about warm light".into(),
                attribution: None,
                source_url: None,
                metadata: None,
            })
            .unwrap();
        let archived = storage
            .create_note(CreateNoteInput {
                title: Some("Archived note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        storage.archive_item(&archived.id, true).unwrap();
        storage
            .connection
            .execute(
                "INSERT INTO items (id, kind, title, metadata, ocr_text, created_at, updated_at)
                 VALUES ('image-item', 'image', 'image-item', '{}', '', 1, 1)",
                params![],
            )
            .unwrap();

        for (item, vector) in [
            (&note, vec![1.0, 0.0]),
            (&article, vec![0.8, 0.6]),
            (&quote, vec![0.6, 0.8]),
            (&archived, vec![0.99, 0.1]),
        ] {
            storage
                .store_embedding(
                    &item.id,
                    "text",
                    crate::embeddings::TEXT_MODEL,
                    &crate::embeddings::encode_f32(&vector),
                    vector.len(),
                )
                .unwrap();
        }

        let results = storage.search_similar_text(&note.id, 10).unwrap();
        assert_eq!(
            results
                .iter()
                .map(|result| result.id.as_str())
                .collect::<Vec<_>>(),
            vec![article.id.as_str(), quote.id.as_str()]
        );
        assert!(!results.iter().any(|result| result.id == "image-item"));

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn text_similarity_returns_empty_without_source_embedding() {
        let directory =
            std::env::temp_dir().join(format!("inkling-similar-pending-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let note = storage
            .create_note(CreateNoteInput {
                title: Some("Pending note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        let other = storage
            .create_note(CreateNoteInput {
                title: Some("Embedded note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        let vector = vec![1.0_f32, 0.0];
        storage
            .store_embedding(
                &other.id,
                "text",
                crate::embeddings::TEXT_MODEL,
                &crate::embeddings::encode_f32(&vector),
                vector.len(),
            )
            .unwrap();

        assert!(storage
            .search_similar_text(&note.id, 10)
            .unwrap()
            .is_empty());
        assert!(storage
            .search_similar_text("missing-id", 10)
            .unwrap()
            .is_empty());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn text_similarity_ignores_other_models_and_dimensions() {
        let directory =
            std::env::temp_dir().join(format!("inkling-similar-model-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();

        let note = storage
            .create_note(CreateNoteInput {
                title: Some("Source note".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .store_embedding(
                &note.id,
                "text",
                crate::embeddings::TEXT_MODEL,
                &crate::embeddings::encode_f32(&[1.0, 0.0]),
                2,
            )
            .unwrap();
        let other_model = storage
            .create_note(CreateNoteInput {
                title: Some("Other model".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .store_embedding(
                &other_model.id,
                "text",
                "legacy-model",
                &crate::embeddings::encode_f32(&[1.0, 0.0]),
                2,
            )
            .unwrap();
        let image_model = storage
            .create_note(CreateNoteInput {
                title: Some("Image model".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .store_embedding(
                &image_model.id,
                "text",
                crate::embeddings::IMAGE_MODEL,
                &crate::embeddings::encode_f32(&[1.0, 0.0]),
                2,
            )
            .unwrap();
        let other_dimension = storage
            .create_note(CreateNoteInput {
                title: Some("Other dimension".into()),
                body: "warm light".into(),
                metadata: None,
            })
            .unwrap();
        storage
            .store_embedding(
                &other_dimension.id,
                "text",
                crate::embeddings::TEXT_MODEL,
                &crate::embeddings::encode_f32(&[1.0, 0.0, 0.0]),
                3,
            )
            .unwrap();

        let results = storage.search_similar_text(&note.id, 10).unwrap();
        assert!(results.is_empty());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn export_skips_unreadable_assets_and_records_them_in_the_manifest() {
        let directory =
            std::env::temp_dir().join(format!("inkling-export-test-{}", Uuid::new_v4()));
        let source = directory.join("assets").join("items").join("item-1");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("available.txt"), b"copied").unwrap();
        fs::write(source.join("locked.txt"), b"unavailable").unwrap();
        fs::write(source.join("not-created.txt"), b"unavailable").unwrap();

        let export_directory = directory.join("export");
        fs::create_dir_all(&export_directory).unwrap();
        fs::write(export_directory.join("library.sqlite3"), b"snapshot").unwrap();
        let plan = ExportPlan {
            directory: export_directory.clone(),
            exported_at: 0,
            assets_directory: directory.join("assets").join("items"),
            item_ids: vec!["item-1".into()],
            archived_items: 0,
            spaces: 0,
            database_bytes: 8,
        };

        let report = finish_export_with(&plan, |source, destination| {
            if source.ends_with("locked.txt") {
                fs::write(destination, b"partial")?;
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "locked by test",
                ))
            } else if source.ends_with("not-created.txt") {
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "not created by test",
                ))
            } else {
                fs::copy(source, destination)
            }
        })
        .unwrap();

        assert_eq!(report.asset_files, 1);
        assert_eq!(report.skipped_assets, 2);
        assert!(export_directory.join("library.sqlite3").is_file());
        assert!(export_directory
            .join("assets/items/item-1/available.txt")
            .is_file());
        assert!(!export_directory
            .join("assets/items/item-1/locked.txt")
            .exists());
        assert!(!export_directory
            .join("assets/items/item-1/locked.txt.inkling-export-part")
            .exists());
        assert!(!export_directory
            .join("assets/items/item-1/not-created.txt.inkling-export-part")
            .exists());

        let manifest: Value =
            serde_json::from_slice(&fs::read(export_directory.join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["counts"]["assetFiles"], 1);
        assert_eq!(manifest["counts"]["skippedAssets"], 2);
        let skipped = manifest["skippedAssets"].as_array().unwrap();
        assert_eq!(skipped.len(), 2);
        let locked = skipped
            .iter()
            .find(|entry| entry["path"] == "assets/items/item-1/locked.txt")
            .unwrap();
        assert_eq!(locked["error"], "locked by test");
        let not_created = skipped
            .iter()
            .find(|entry| entry["path"] == "assets/items/item-1/not-created.txt")
            .unwrap();
        assert_eq!(not_created["error"], "not created by test");
        assert!(!not_created["error"]
            .as_str()
            .unwrap()
            .contains("partial file"));

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn export_writes_a_readable_snapshot_with_assets_and_a_manifest() {
        let directory =
            std::env::temp_dir().join(format!("inkling-export-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let saved = storage
            .save_file(SaveFileInput {
                id: None,
                file_name: "notes.txt".into(),
                mime_type: Some("text/plain".into()),
                kind: None,
                bytes: b"exported bytes".to_vec(),
            })
            .unwrap();
        let archived = storage
            .create_note(CreateNoteInput {
                title: Some("Forgotten".into()),
                body: "kept in the archive".into(),
                metadata: None,
            })
            .unwrap();
        storage.archive_item(&archived.id, true).unwrap();
        storage
            .create_space(CreateSpaceInput {
                name: "Reading".into(),
                color: None,
                kind: SpaceKind::Smart,
                query: SmartSpaceQuery::default(),
            })
            .unwrap();

        let destination = directory.join("chosen");
        fs::create_dir_all(&destination).unwrap();
        let report = finish_export(&storage.begin_export(&destination, 0).unwrap()).unwrap();

        let export_directory = PathBuf::from(&report.directory);
        assert!(export_directory.starts_with(&destination));
        assert_eq!(report.items, 2);
        assert_eq!(report.archived_items, 1);
        assert_eq!(report.spaces, 1);
        assert_eq!(report.asset_files, 1);
        assert_eq!(report.skipped_assets, 0);
        assert!(report.database_bytes > 0);
        assert!(report.assets_bytes > 0);

        // The snapshot opens on its own and carries archived rows with it.
        let snapshot = LibraryStorage::open(export_directory.join("library.sqlite3")).unwrap();
        assert_eq!(snapshot.list_active_items().unwrap().len(), 1);
        assert_eq!(snapshot.list_archived_items().unwrap().len(), 1);
        assert_eq!(snapshot.list_spaces().unwrap().len(), 1);
        drop(snapshot);

        assert!(export_directory
            .join("assets")
            .join("items")
            .join(&saved.id)
            .is_dir());

        // An export written inside the asset store would copy itself as it runs.
        assert!(storage
            .begin_export(&directory.join("assets").join("items").join(&saved.id), 0)
            .is_err());

        let manifest: Value =
            serde_json::from_slice(&fs::read(export_directory.join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["format"], "inkling-export");
        assert_eq!(manifest["schemaVersion"], SCHEMA_VERSION);
        assert_eq!(manifest["counts"]["items"], 2);
        assert_eq!(manifest["counts"]["assetFiles"], 1);
        assert_eq!(manifest["regenerable"]["tables"][0], "item_embeddings");
        assert_eq!(manifest["regenerable"]["columns"][0], "items.ocr_text");

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn export_keeps_earlier_runs_and_refuses_a_missing_destination() {
        let directory =
            std::env::temp_dir().join(format!("inkling-export-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let storage = LibraryStorage::open(directory.join("library.sqlite3")).unwrap();
        let destination = directory.join("chosen");
        fs::create_dir_all(&destination).unwrap();
        let first = finish_export(&storage.begin_export(&destination, 0).unwrap()).unwrap();
        let second = finish_export(&storage.begin_export(&destination, 0).unwrap()).unwrap();

        assert_ne!(first.directory, second.directory);
        assert!(Path::new(&first.directory).is_dir());
        assert!(Path::new(&second.directory).is_dir());
        assert!(storage
            .begin_export(&destination.join("missing"), 0)
            .is_err());

        drop(storage);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn export_folder_stamp_is_a_sortable_calendar_timestamp() {
        assert_eq!(export_date_stamp(0), "1970-01-01-000000");
        assert_eq!(export_date_stamp(1_709_164_800_000), "2024-02-29-000000");
        assert_eq!(export_date_stamp(1_752_800_000_000), "2025-07-18-005320");
        // The webview's offset moves the name into the user's local wall clock.
        assert_eq!(
            export_date_stamp(1_752_800_000_000 - 240 * 60_000),
            "2025-07-17-205320"
        );
    }
}
