package queue

import (
	"context"
	"fmt"
	"sync"
)

// ============================================================================
// QUEUE MESSAGE TYPES
// ============================================================================

// CampaignMessage represents a campaign-level event for processing
type CampaignMessage struct {
	CampaignID string                 `json:"campaign_id"`
	EventType  string                 `json:"event_type"` // "launch", "pause", "resume"
	Payload    map[string]interface{} `json:"payload"`
}

// ValidateMessage represents a lead requiring validation
type ValidateMessage struct {
	LeadID      string                 `json:"lead_id"`
	Email       string                 `json:"email,omitempty"`
	PhoneE164   string                 `json:"phone_e164,omitempty"`
	Payload     map[string]interface{} `json:"payload"`
}

// WebsitePivotMessage represents a lead requiring website/enrichment data fetch
type WebsitePivotMessage struct {
	LeadID      string                 `json:"lead_id"`
	ProfileID   string                 `json:"profile_id"`
	CompanyName string                 `json:"company_name,omitempty"`
	LinkedInURL string                 `json:"linkedin_url,omitempty"`
	Payload     map[string]interface{} `json:"payload"`
}

// StorageMessage represents a lead ready for persistence
type StorageMessage struct {
	LeadID            string                 `json:"lead_id"`
	ValidationStatus  string                 `json:"validation_status"`
	EnrichmentStatus  string                 `json:"enrichment_status"`
	QualityScore      float32                `json:"quality_score"`
	EngagementSignals map[string]interface{} `json:"engagement_signals,omitempty"`
	Payload           map[string]interface{} `json:"payload"`
}

// ============================================================================
// QUEUE MANAGER INTERFACE
// ============================================================================
// This interface abstracts the queue implementation, allowing clean swapping
// between in-memory Go channels and external Redis/message brokers.

// QueueManager defines the contract for push/pop operations on all queues
type QueueManager interface {
	// Campaign queue operations
	PushCampaign(ctx context.Context, msg *CampaignMessage) error
	PopCampaign(ctx context.Context) (*CampaignMessage, error)
	PeekCampaign(ctx context.Context) (*CampaignMessage, error)

	// Validate queue operations
	PushValidate(ctx context.Context, msg *ValidateMessage) error
	PopValidate(ctx context.Context) (*ValidateMessage, error)
	PeekValidate(ctx context.Context) (*ValidateMessage, error)

	// Website pivot queue operations
	PushWebsitePivot(ctx context.Context, msg *WebsitePivotMessage) error
	PopWebsitePivot(ctx context.Context) (*WebsitePivotMessage, error)
	PeekWebsitePivot(ctx context.Context) (*WebsitePivotMessage, error)

	// Storage queue operations
	PushStorage(ctx context.Context, msg *StorageMessage) error
	PopStorage(ctx context.Context) (*StorageMessage, error)
	PeekStorage(ctx context.Context) (*StorageMessage, error)

	// Health and lifecycle
	Health(ctx context.Context) error
	Close(ctx context.Context) error

	// Queue statistics (for monitoring)
	Stats(ctx context.Context) QueueStats
}

// QueueStats provides snapshot metrics for all queues
type QueueStats struct {
	CampaignQueueLen   int
	ValidateQueueLen   int
	WebsitePivotLen    int
	StorageQueueLen    int
	TotalMessagesCount uint64
}

// ============================================================================
// IN-MEMORY QUEUE IMPLEMENTATION (Go Channels)
// ============================================================================
// TODO: [REDIS_MIGRATION]
// When migrating to Redis, create a new RedisQueueManager struct that:
// 1. Wraps redis.Client connection
// 2. Implements the QueueManager interface with Redis PUSH/POP/PEEK operations
// 3. Uses Redis Streams or sorted sets for queue semantics
// 4. Plugs into the same consumer business logic without modification

type InMemoryQueueManager struct {
	// Buffered channels for each processing pipeline
	campaignQueue   chan *CampaignMessage
	validateQueue   chan *ValidateMessage
	websitePivotQueue chan *WebsitePivotMessage
	storageQueue    chan *StorageMessage

	// Metrics tracking
	mu         sync.RWMutex
	msgCounter uint64

	// Graceful shutdown
	ctx    context.Context
	cancel context.CancelFunc
}

// NewInMemoryQueueManager initializes the in-memory queue spine with buffered channels
func NewInMemoryQueueManager(
	campaignBufferSize int,
	validateBufferSize int,
	websitePivotBufferSize int,
	storageBufferSize int,
) *InMemoryQueueManager {
	ctx, cancel := context.WithCancel(context.Background())

	return &InMemoryQueueManager{
		campaignQueue:     make(chan *CampaignMessage, campaignBufferSize),
		validateQueue:     make(chan *ValidateMessage, validateBufferSize),
		websitePivotQueue: make(chan *WebsitePivotMessage, websitePivotBufferSize),
		storageQueue:      make(chan *StorageMessage, storageBufferSize),
		ctx:               ctx,
		cancel:            cancel,
	}
}

// ============================================================================
// CAMPAIGN QUEUE OPERATIONS
// ============================================================================

// PushCampaign enqueues a campaign message into the campaign queue
func (m *InMemoryQueueManager) PushCampaign(ctx context.Context, msg *CampaignMessage) error {
	if msg == nil {
		return fmt.Errorf("campaign message cannot be nil")
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.ctx.Done():
		return fmt.Errorf("queue manager is shutting down")
	case m.campaignQueue <- msg:
		m.incrementCounter()
		return nil
	default:
		return fmt.Errorf("campaign queue is full (non-blocking push failed)")
	}
}

// PopCampaign dequeues the next campaign message (blocking)
func (m *InMemoryQueueManager) PopCampaign(ctx context.Context) (*CampaignMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-m.ctx.Done():
		return nil, fmt.Errorf("queue manager is shutting down")
	case msg := <-m.campaignQueue:
		return msg, nil
	}
}

// PeekCampaign returns the next message without consuming it (best-effort, non-blocking)
func (m *InMemoryQueueManager) PeekCampaign(ctx context.Context) (*CampaignMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case msg := <-m.campaignQueue:
		// Re-enqueue immediately (not thread-safe for true peeking, approximation only)
		select {
		case m.campaignQueue <- msg:
			return msg, nil
		default:
			return nil, fmt.Errorf("failed to re-enqueue peeked message")
		}
	default:
		return nil, fmt.Errorf("campaign queue is empty")
	}
}

// ============================================================================
// VALIDATE QUEUE OPERATIONS
// ============================================================================

// PushValidate enqueues a lead requiring validation
func (m *InMemoryQueueManager) PushValidate(ctx context.Context, msg *ValidateMessage) error {
	if msg == nil {
		return fmt.Errorf("validate message cannot be nil")
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.ctx.Done():
		return fmt.Errorf("queue manager is shutting down")
	case m.validateQueue <- msg:
		m.incrementCounter()
		return nil
	default:
		return fmt.Errorf("validate queue is full")
	}
}

// PopValidate dequeues the next validation message (blocking)
func (m *InMemoryQueueManager) PopValidate(ctx context.Context) (*ValidateMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-m.ctx.Done():
		return nil, fmt.Errorf("queue manager is shutting down")
	case msg := <-m.validateQueue:
		return msg, nil
	}
}

// PeekValidate returns the next validation message without consuming it
func (m *InMemoryQueueManager) PeekValidate(ctx context.Context) (*ValidateMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case msg := <-m.validateQueue:
		select {
		case m.validateQueue <- msg:
			return msg, nil
		default:
			return nil, fmt.Errorf("failed to re-enqueue peeked message")
		}
	default:
		return nil, fmt.Errorf("validate queue is empty")
	}
}

// ============================================================================
// WEBSITE PIVOT QUEUE OPERATIONS
// ============================================================================

// PushWebsitePivot enqueues a lead requiring website/enrichment data
func (m *InMemoryQueueManager) PushWebsitePivot(ctx context.Context, msg *WebsitePivotMessage) error {
	if msg == nil {
		return fmt.Errorf("website pivot message cannot be nil")
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.ctx.Done():
		return fmt.Errorf("queue manager is shutting down")
	case m.websitePivotQueue <- msg:
		m.incrementCounter()
		return nil
	default:
		return fmt.Errorf("website pivot queue is full")
	}
}

// PopWebsitePivot dequeues the next website pivot message (blocking)
func (m *InMemoryQueueManager) PopWebsitePivot(ctx context.Context) (*WebsitePivotMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-m.ctx.Done():
		return nil, fmt.Errorf("queue manager is shutting down")
	case msg := <-m.websitePivotQueue:
		return msg, nil
	}
}

// PeekWebsitePivot returns the next website pivot message without consuming it
func (m *InMemoryQueueManager) PeekWebsitePivot(ctx context.Context) (*WebsitePivotMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case msg := <-m.websitePivotQueue:
		select {
		case m.websitePivotQueue <- msg:
			return msg, nil
		default:
			return nil, fmt.Errorf("failed to re-enqueue peeked message")
		}
	default:
		return nil, fmt.Errorf("website pivot queue is empty")
	}
}

// ============================================================================
// STORAGE QUEUE OPERATIONS
// ============================================================================

// PushStorage enqueues a lead ready for persistence
func (m *InMemoryQueueManager) PushStorage(ctx context.Context, msg *StorageMessage) error {
	if msg == nil {
		return fmt.Errorf("storage message cannot be nil")
	}

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.ctx.Done():
		return fmt.Errorf("queue manager is shutting down")
	case m.storageQueue <- msg:
		m.incrementCounter()
		return nil
	default:
		return fmt.Errorf("storage queue is full")
	}
}

// PopStorage dequeues the next storage message (blocking)
func (m *InMemoryQueueManager) PopStorage(ctx context.Context) (*StorageMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-m.ctx.Done():
		return nil, fmt.Errorf("queue manager is shutting down")
	case msg := <-m.storageQueue:
		return msg, nil
	}
}

// PeekStorage returns the next storage message without consuming it
func (m *InMemoryQueueManager) PeekStorage(ctx context.Context) (*StorageMessage, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case msg := <-m.storageQueue:
		select {
		case m.storageQueue <- msg:
			return msg, nil
		default:
			return nil, fmt.Errorf("failed to re-enqueue peeked message")
		}
	default:
		return nil, fmt.Errorf("storage queue is empty")
	}
}

// ============================================================================
// LIFECYCLE & MONITORING
// ============================================================================

// Health performs a liveness check on the queue manager
func (m *InMemoryQueueManager) Health(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-m.ctx.Done():
		return fmt.Errorf("queue manager is shutting down")
	default:
		return nil
	}
}

// Close gracefully shuts down all queues and flushes pending messages
func (m *InMemoryQueueManager) Close(ctx context.Context) error {
	m.cancel()

	// Close all channels
	close(m.campaignQueue)
	close(m.validateQueue)
	close(m.websitePivotQueue)
	close(m.storageQueue)

	return nil
}

// Stats returns a snapshot of queue metrics
func (m *InMemoryQueueManager) Stats(ctx context.Context) QueueStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return QueueStats{
		CampaignQueueLen:   len(m.campaignQueue),
		ValidateQueueLen:   len(m.validateQueue),
		WebsitePivotLen:    len(m.websitePivotQueue),
		StorageQueueLen:    len(m.storageQueue),
		TotalMessagesCount: m.msgCounter,
	}
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

// incrementCounter atomically increments the message counter
func (m *InMemoryQueueManager) incrementCounter() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.msgCounter++
}

// ============================================================================
// FACTORY FUNCTION FOR DEPENDENCY INJECTION
// ============================================================================

// NewQueueManager is the factory function for creating queue managers.
// Currently returns an in-memory implementation; can be swapped to Redis factory.
//
// TODO: [REDIS_MIGRATION]
// To migrate to Redis:
// 1. Create a RedisQueueManager struct with redis.Client field
// 2. Implement all QueueManager interface methods using Redis commands
// 3. Swap this factory to return &RedisQueueManager{client: redisClient}
// 4. All consumer code will work unchanged due to interface abstraction
//
// Example migration path:
//   func NewQueueManager(redisURL string) (QueueManager, error) {
//       opt, _ := redis.ParseURL(redisURL)
//       client := redis.NewClient(opt)
//       return &RedisQueueManager{client: client}, nil
//   }
func NewQueueManager(
	campaignBufferSize,
	validateBufferSize,
	websitePivotBufferSize,
	storageBufferSize int,
) QueueManager {
	return NewInMemoryQueueManager(
		campaignBufferSize,
		validateBufferSize,
		websitePivotBufferSize,
		storageBufferSize,
	)
}
