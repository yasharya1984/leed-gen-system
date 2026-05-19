// ============================================================================
// Lead Generation System - Rust Tokio Concurrency Spine
// ============================================================================
// Purpose: Multi-threaded async runtime environment with mpsc channels
// serving as in-memory processing pipelines for search and profile operations.
// ============================================================================

use tokio::sync::mpsc::{self, UnboundedSender, UnboundedReceiver};
use std::sync::{Arc, Mutex};
use std::fmt;
use std::error::Error;

// ============================================================================
// ERROR TYPES
// ============================================================================

#[derive(Debug, Clone)]
pub struct QueueError {
    message: String,
}

impl QueueError {
    pub fn new(message: impl Into<String>) -> Self {
        QueueError {
            message: message.into(),
        }
    }
}

impl fmt::Display for QueueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "QueueError: {}", self.message)
    }
}

impl Error for QueueError {}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/// Represents a search operation for prospective leads
/// Typically initiated from campaign configuration or external search APIs
#[derive(Debug, Clone)]
pub struct SearchMessage {
    pub search_id: String,
    pub campaign_id: String,
    pub query: String,
    pub filters: std::collections::HashMap<String, String>,
    pub limit: usize,
}

impl SearchMessage {
    pub fn new(
        search_id: impl Into<String>,
        campaign_id: impl Into<String>,
        query: impl Into<String>,
    ) -> Self {
        SearchMessage {
            search_id: search_id.into(),
            campaign_id: campaign_id.into(),
            query: query.into(),
            filters: std::collections::HashMap::new(),
            limit: 100,
        }
    }
}

/// Represents profile enrichment and validation work
/// Triggers data fetching, deduplication checks, and quality scoring
#[derive(Debug, Clone)]
pub struct ProfileMessage {
    pub profile_id: String,
    pub lead_id: String,
    pub email: Option<String>,
    pub phone_e164: Option<String>,
    pub company_name: Option<String>,
    pub job_title: Option<String>,
    pub enrichment_type: String, // "email_validate", "phone_validate", "company_lookup"
}

impl ProfileMessage {
    pub fn new(
        profile_id: impl Into<String>,
        lead_id: impl Into<String>,
        enrichment_type: impl Into<String>,
    ) -> Self {
        ProfileMessage {
            profile_id: profile_id.into(),
            lead_id: lead_id.into(),
            email: None,
            phone_e164: None,
            company_name: None,
            job_title: None,
            enrichment_type: enrichment_type.into(),
        }
    }
}

// ============================================================================
// QUEUE MANAGER TRAIT
// ============================================================================
// This trait defines the contract for all queue operations, allowing
// clean abstraction over the underlying implementation (in-memory mpsc
// or external message brokers).

/// AsyncQueueManager trait defines async queue operations for search and profile pipelines
pub trait AsyncQueueManager: Send + Sync {
    /// Enqueue a search message
    async fn push_search(&self, msg: SearchMessage) -> Result<(), QueueError>;

    /// Dequeue a search message (blocks until available or context cancelled)
    async fn pop_search(&self) -> Result<Option<SearchMessage>, QueueError>;

    /// Enqueue a profile enrichment message
    async fn push_profile(&self, msg: ProfileMessage) -> Result<(), QueueError>;

    /// Dequeue a profile message (blocks until available or context cancelled)
    async fn pop_profile(&self) -> Result<Option<ProfileMessage>, QueueError>;

    /// Check queue health
    async fn health(&self) -> Result<(), QueueError>;

    /// Gracefully shutdown the queue manager
    async fn shutdown(&self) -> Result<(), QueueError>;

    /// Get queue statistics
    async fn stats(&self) -> QueueStats;
}

/// Queue statistics snapshot for monitoring and observability
#[derive(Debug, Clone)]
pub struct QueueStats {
    pub search_queue_len: usize,
    pub profile_queue_len: usize,
    pub total_messages_processed: u64,
}

// ============================================================================
// IN-MEMORY QUEUE MANAGER (Tokio MPSC Implementation)
// ============================================================================
// TODO: [REDIS_MIGRATION]
// When scaling to distributed processing:
// 1. Create a RedisAsyncQueueManager that wraps redis::AsyncConnection
// 2. Implement AsyncQueueManager trait using Redis streams (XADD, XREAD)
// 3. Replace mpsc channels with Redis Pub/Sub or Stream consumption
// 4. External consumer loops (orchestration service) will subscribe to streams
// 5. No changes required to producer/consumer business logic due to trait abstraction

pub struct InMemoryAsyncQueueManager {
    // Unbounded mpsc channels for async message passing
    // These feed data into the processing pipelines
    search_tx: UnboundedSender<SearchMessage>,
    search_rx: Arc<Mutex<UnboundedReceiver<SearchMessage>>>,

    profile_tx: UnboundedSender<ProfileMessage>,
    profile_rx: Arc<Mutex<UnboundedReceiver<ProfileMessage>>>,

    // Metrics tracking (thread-safe counter)
    stats: Arc<Mutex<QueueStats>>,

    // Shutdown signal
    shutdown_flag: Arc<Mutex<bool>>,
}

impl InMemoryAsyncQueueManager {
    /// Creates a new in-memory async queue manager with Tokio MPSC channels
    pub fn new() -> Self {
        let (search_tx, search_rx) = mpsc::unbounded_channel();
        let (profile_tx, profile_rx) = mpsc::unbounded_channel();

        InMemoryAsyncQueueManager {
            search_tx,
            search_rx: Arc::new(Mutex::new(search_rx)),
            profile_tx,
            profile_rx: Arc::new(Mutex::new(profile_rx)),
            stats: Arc::new(Mutex::new(QueueStats {
                search_queue_len: 0,
                profile_queue_len: 0,
                total_messages_processed: 0,
            })),
            shutdown_flag: Arc::new(Mutex::new(false)),
        }
    }

    /// Increment message counter in stats
    fn increment_stats(&self) {
        if let Ok(mut stats) = self.stats.lock() {
            stats.total_messages_processed += 1;
        }
    }

    /// Check if shutdown was signaled
    fn is_shutdown(&self) -> bool {
        self.shutdown_flag
            .lock()
            .map(|flag| *flag)
            .unwrap_or(false)
    }
}

impl Default for InMemoryAsyncQueueManager {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl AsyncQueueManager for InMemoryAsyncQueueManager {
    /// Push a search message into the search queue
    async fn push_search(&self, msg: SearchMessage) -> Result<(), QueueError> {
        if self.is_shutdown() {
            return Err(QueueError::new("Queue manager is shutting down"));
        }

        self.search_tx
            .send(msg)
            .map_err(|e| QueueError::new(format!("Failed to enqueue search: {}", e)))?;

        self.increment_stats();

        // Update queue length
        if let Ok(mut stats) = self.stats.lock() {
            stats.search_queue_len = self.search_rx.lock()
                .as_ref()
                .map(|_| 1)
                .unwrap_or(0);
        }

        Ok(())
    }

    /// Pop a search message from the queue (async, blocks until available)
    async fn pop_search(&self) -> Result<Option<SearchMessage>, QueueError> {
        if self.is_shutdown() {
            return Err(QueueError::new("Queue manager is shutting down"));
        }

        let mut rx = self.search_rx.lock()
            .map_err(|e| QueueError::new(format!("Lock poisoned: {}", e)))?;

        match rx.recv().await {
            Some(msg) => {
                // Update queue length
                if let Ok(mut stats) = self.stats.lock() {
                    stats.search_queue_len = stats.search_queue_len.saturating_sub(1);
                }
                Ok(Some(msg))
            }
            None => {
                // Channel closed, queue is empty and no senders
                Ok(None)
            }
        }
    }

    /// Push a profile message into the profile enrichment queue
    async fn push_profile(&self, msg: ProfileMessage) -> Result<(), QueueError> {
        if self.is_shutdown() {
            return Err(QueueError::new("Queue manager is shutting down"));
        }

        self.profile_tx
            .send(msg)
            .map_err(|e| QueueError::new(format!("Failed to enqueue profile: {}", e)))?;

        self.increment_stats();

        // Update queue length
        if let Ok(mut stats) = self.stats.lock() {
            stats.profile_queue_len = self.profile_rx.lock()
                .as_ref()
                .map(|_| 1)
                .unwrap_or(0);
        }

        Ok(())
    }

    /// Pop a profile message from the queue (async, blocks until available)
    async fn pop_profile(&self) -> Result<Option<ProfileMessage>, QueueError> {
        if self.is_shutdown() {
            return Err(QueueError::new("Queue manager is shutting down"));
        }

        let mut rx = self.profile_rx.lock()
            .map_err(|e| QueueError::new(format!("Lock poisoned: {}", e)))?;

        match rx.recv().await {
            Some(msg) => {
                // Update queue length
                if let Ok(mut stats) = self.stats.lock() {
                    stats.profile_queue_len = stats.profile_queue_len.saturating_sub(1);
                }
                Ok(Some(msg))
            }
            None => {
                // Channel closed, queue is empty
                Ok(None)
            }
        }
    }

    /// Health check: verify queue manager is operational
    async fn health(&self) -> Result<(), QueueError> {
        if self.is_shutdown() {
            return Err(QueueError::new("Queue manager is shutting down"));
        }
        Ok(())
    }

    /// Gracefully shutdown the queue manager
    async fn shutdown(&self) -> Result<(), QueueError> {
        if let Ok(mut flag) = self.shutdown_flag.lock() {
            *flag = true;
        }
        // MPSC channels will be dropped, triggering cleanup
        Ok(())
    }

    /// Get a snapshot of queue statistics
    async fn stats(&self) -> QueueStats {
        self.stats
            .lock()
            .map(|s| s.clone())
            .unwrap_or(QueueStats {
                search_queue_len: 0,
                profile_queue_len: 0,
                total_messages_processed: 0,
            })
    }
}

// ============================================================================
// ASYNC RUNTIME CONFIGURATION
// ============================================================================

/// TokioRuntimeConfig encapsulates runtime tuning parameters
#[derive(Debug, Clone)]
pub struct TokioRuntimeConfig {
    /// Number of worker threads (0 = auto-detect based on CPU cores)
    pub worker_threads: usize,
    /// Maximum number of blocking threads in the thread pool
    pub max_blocking_threads: usize,
    /// Thread name prefix for observability
    pub thread_name_prefix: String,
}

impl Default for TokioRuntimeConfig {
    fn default() -> Self {
        TokioRuntimeConfig {
            worker_threads: 0, // Auto-detect
            max_blocking_threads: 512,
            thread_name_prefix: "lgs-worker".to_string(),
        }
    }
}

/// RuntimeBuilder creates and configures a Tokio multi-threaded runtime
pub struct RuntimeBuilder {
    config: TokioRuntimeConfig,
}

impl RuntimeBuilder {
    /// Create a new runtime builder with default configuration
    pub fn new() -> Self {
        RuntimeBuilder {
            config: TokioRuntimeConfig::default(),
        }
    }

    /// Set the number of worker threads
    pub fn with_worker_threads(mut self, threads: usize) -> Self {
        self.config.worker_threads = threads;
        self
    }

    /// Set the maximum number of blocking threads
    pub fn with_max_blocking_threads(mut self, threads: usize) -> Self {
        self.config.max_blocking_threads = threads;
        self
    }

    /// Set the thread name prefix for debugging
    pub fn with_thread_name_prefix(mut self, prefix: impl Into<String>) -> Self {
        self.config.thread_name_prefix = prefix.into();
        self
    }

    /// Build and return the configured Tokio runtime
    pub fn build(self) -> Result<tokio::runtime::Runtime, std::io::Error> {
        let mut runtime_builder = tokio::runtime::Builder::new_multi_thread();

        // Configure worker threads
        if self.config.worker_threads > 0 {
            runtime_builder.worker_threads(self.config.worker_threads);
        }

        // Configure blocking thread pool
        runtime_builder.max_blocking_threads(self.config.max_blocking_threads);

        // Set thread name prefix
        let prefix = self.config.thread_name_prefix.clone();
        runtime_builder.thread_name_fn(move || {
            static COUNTER: std::sync::atomic::AtomicUsize =
                std::sync::atomic::AtomicUsize::new(0);
            let id = COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            format!("{}-{}", prefix, id)
        });

        // Enable all features
        runtime_builder.enable_all();

        runtime_builder.build()
    }
}

impl Default for RuntimeBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// CONSUMER LOOP SCAFFOLDING
// ============================================================================
// TODO: [REDIS_MIGRATION]
// When integrating external consumers (e.g., orchestration service):
//
// The current in-memory implementation uses Tokio tasks spawned within
// the same process. For distributed processing, replace with:
//
// 1. External Consumer Service (e.g., Go service with gRPC):
//    - Connects to Redis Streams
//    - Runs consumer groups (XGROUP CREATE)
//    - Acknowledges messages (XACK) after processing
//
// 2. Multi-Region Setup:
//    - Region A: Lead source/validation workers
//    - Region B: Enrichment workers
//    - Redis Streams as the distributed backbone
//
// Example stub for external consumer integration:
//
//   pub async fn external_consumer_loop(
//       queue: Arc<dyn AsyncQueueManager>,
//       redis_url: &str,
//       consumer_id: &str,
//   ) -> Result<(), Box<dyn Error>> {
//       // TODO: [REDIS_MIGRATION]
//       // 1. Connect to Redis: let redis_client = redis::Client::open(redis_url)?;
//       // 2. Create consumer group: xgroup_create(stream, group, id)
//       // 3. Loop: xreadgroup(block_ms, count, streams)
//       // 4. Process: invoke business logic
//       // 5. Acknowledge: xack(stream, group, id)
//       // 6. Handle failures: xpending(stream, group) for retry
//       Ok(())
//   }

/// SearchWorker spawns an async task that consumes search messages
/// and invokes business logic (e.g., external search API calls)
pub async fn search_worker(
    queue: Arc<dyn AsyncQueueManager>,
    worker_id: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[SearchWorker-{}] Started", worker_id);

    loop {
        match queue.pop_search().await {
            Ok(Some(msg)) => {
                eprintln!(
                    "[SearchWorker-{}] Processing search: {} (campaign: {})",
                    worker_id, msg.search_id, msg.campaign_id
                );

                // TODO: [REDIS_MIGRATION]
                // Replace this in-process business logic with external call:
                //
                // let client = RedisAsyncQueueManager::new(REDIS_URL)?;
                // client.push_search_result(result).await?;
                //
                // This would trigger downstream enrichment workers
                // that consume from Redis Streams independently.

                // Simulate business logic execution
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                eprintln!("[SearchWorker-{}] Completed search: {}", worker_id, msg.search_id);
            }
            Ok(None) => {
                // Queue closed, worker should exit
                eprintln!("[SearchWorker-{}] Queue closed, exiting", worker_id);
                break;
            }
            Err(e) => {
                eprintln!("[SearchWorker-{}] Error: {}", worker_id, e);
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    }

    Ok(())
}

/// ProfileWorker spawns an async task that consumes profile enrichment messages
/// and invokes data validation/enrichment business logic
pub async fn profile_worker(
    queue: Arc<dyn AsyncQueueManager>,
    worker_id: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("[ProfileWorker-{}] Started", worker_id);

    loop {
        match queue.pop_profile().await {
            Ok(Some(msg)) => {
                eprintln!(
                    "[ProfileWorker-{}] Processing profile: {} (enrichment: {})",
                    worker_id, msg.profile_id, msg.enrichment_type
                );

                // TODO: [REDIS_MIGRATION]
                // Similar pattern: replace in-process logic with Redis consumer
                // that pulls from external enrichment service results.

                // Simulate business logic execution
                tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

                eprintln!(
                    "[ProfileWorker-{}] Completed profile: {}",
                    worker_id, msg.profile_id
                );
            }
            Ok(None) => {
                // Queue closed, worker should exit
                eprintln!("[ProfileWorker-{}] Queue closed, exiting", worker_id);
                break;
            }
            Err(e) => {
                eprintln!("[ProfileWorker-{}] Error: {}", worker_id, e);
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    }

    Ok(())
}

// ============================================================================
// INITIALIZATION & MAIN ENTRY POINT EXAMPLES
// ============================================================================

/// Initialize the Rust Tokio spine with configured runtime and queue manager
pub async fn initialize_tokio_spine(config: Option<TokioRuntimeConfig>) -> Result<
    (Arc<dyn AsyncQueueManager>, tokio::runtime::Runtime),
    Box<dyn std::error::Error>,
> {
    let cfg = config.unwrap_or_default();

    let runtime = RuntimeBuilder::new()
        .with_worker_threads(cfg.worker_threads)
        .with_max_blocking_threads(cfg.max_blocking_threads)
        .with_thread_name_prefix(&cfg.thread_name_prefix)
        .build()?;

    let queue_manager = Arc::new(InMemoryAsyncQueueManager::new());

    eprintln!("[LGS-Tokio] Spine initialized with InMemoryAsyncQueueManager");
    eprintln!("[LGS-Tokio] Ready for search and profile processing pipelines");

    Ok((queue_manager, runtime))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_queue_operations() {
        let queue = InMemoryAsyncQueueManager::new();

        let msg = SearchMessage::new("search-1", "campaign-1", "engineer");
        assert!(queue.push_search(msg.clone()).await.is_ok());

        let retrieved = queue.pop_search().await.unwrap();
        assert_eq!(retrieved.unwrap().search_id, "search-1");
    }

    #[tokio::test]
    async fn test_profile_queue_operations() {
        let queue = InMemoryAsyncQueueManager::new();

        let msg = ProfileMessage::new("profile-1", "lead-1", "email_validate");
        assert!(queue.push_profile(msg.clone()).await.is_ok());

        let retrieved = queue.pop_profile().await.unwrap();
        assert_eq!(retrieved.unwrap().profile_id, "profile-1");
    }

    #[tokio::test]
    async fn test_queue_health() {
        let queue = InMemoryAsyncQueueManager::new();
        assert!(queue.health().await.is_ok());

        queue.shutdown().await.unwrap();
        assert!(queue.health().await.is_err());
    }
}
