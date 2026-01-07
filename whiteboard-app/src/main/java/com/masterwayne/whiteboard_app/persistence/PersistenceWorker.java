package com.masterwayne.whiteboard_app.persistence;

import com.masterwayne.whiteboard_app.exception.PersistenceException;
import com.masterwayne.whiteboard_app.model.Channel;
import com.masterwayne.whiteboard_app.model.ChatMessage;
import com.masterwayne.whiteboard_app.model.DrawPayload;
import com.masterwayne.whiteboard_app.repository.WhiteboardSessionRepository;
import com.masterwayne.whiteboard_app.storage.FallbackStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

/**
 * PersistenceWorker manages asynchronous persistence of drawing and chat events
 * using a background thread.
 * 
 * Design:
 * - Uses a BlockingQueue to decouple WebSocket event handlers from persistence
 * logic
 * - Single-threaded executor ensures serialized DB writes (no race conditions)
 * - On DB write failure, automatically falls back to file-based storage
 * - Graceful shutdown with queue draining on application termination
 * 
 * Thread safety:
 * - BlockingQueue is thread-safe for producer/consumer coordination
 * - All repository operations executed on single background thread (no
 * concurrent DB access from this worker)
 */
@Component
public class PersistenceWorker {
    private static final Logger logger = LoggerFactory.getLogger(PersistenceWorker.class);
    private static final int QUEUE_CAPACITY = 10000;
    private static final int MAX_BATCH_SIZE = 100;
    private static final int SHUTDOWN_TIMEOUT_SECONDS = 10;

    private final BlockingQueue<PersistenceTask> taskQueue;
    private final ExecutorService executorService;
    private final WhiteboardSessionRepository sessionRepository;
    private final FallbackStorage fallbackStorage;
    private final TransactionTemplate transactionTemplate;
    private volatile boolean running = false;

    @Autowired
    public PersistenceWorker(WhiteboardSessionRepository sessionRepository,
            FallbackStorage fallbackStorage,
            @org.springframework.lang.NonNull PlatformTransactionManager transactionManager) {
        this.sessionRepository = sessionRepository;
        this.fallbackStorage = fallbackStorage;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.taskQueue = new LinkedBlockingQueue<>(QUEUE_CAPACITY);
        this.executorService = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "WhiteboardPersistenceWorker");
            t.setDaemon(false);
            return t;
        });
    }

    /**
     * Starts the background worker thread. Called via @PostConstruct.
     */
    public void start() {
        if (running) {
            logger.warn("PersistenceWorker is already running");
            return;
        }

        running = true;
        executorService.submit(this::consumerLoop);
        logger.info("PersistenceWorker started");
    }

    /**
     * Main consumer loop: continuously reads tasks from queue and executes
     * persistence.
     * Runs on the background thread.
     */
    private void consumerLoop() {
        logger.info("PersistenceWorker consumer loop started on thread: {}", Thread.currentThread().getName());

        while (running) {
            try {
                // Take a task from the queue (blocking, waits indefinitely)
                PersistenceTask task = taskQueue.take();
                List<PersistenceTask> batch = new ArrayList<>(MAX_BATCH_SIZE);
                batch.add(task);
                taskQueue.drainTo(batch, MAX_BATCH_SIZE - batch.size());
                executeBatch(batch);
            } catch (InterruptedException e) {
                if (running) {
                    // Unexpected interruption; log and continue
                    logger.warn("PersistenceWorker interrupted unexpectedly", e);
                    Thread.currentThread().interrupt();
                } else {
                    // Shutdown signal; break loop
                    logger.info("PersistenceWorker consumer loop interrupted during shutdown");
                    Thread.currentThread().interrupt();
                    break;
                }
            } catch (Exception e) {
                logger.error("Unexpected error in PersistenceWorker consumer loop", e);
            }
        }

        logger.info("PersistenceWorker consumer loop exiting");
    }

    /**
     * Executes a single persistence task with retry logic and fallback.
     */
    private void executeBatch(List<PersistenceTask> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return;
        }

        try {
            transactionTemplate.execute(status -> {
                try {
                    applyBatch(tasks);
                    return null;
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });

            if (logger.isDebugEnabled()) {
                logger.debug("Persistence batch completed: {} tasks", tasks.size());
            }
        } catch (RuntimeException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            logger.error("Persistence batch failed ({} tasks). Attempting fallback storage.", tasks.size(), cause);
            for (PersistenceTask task : tasks) {
                try {
                    task.writeFallback(fallbackStorage);
                    logger.warn("Event written to fallback storage: {}", task.getDescription());
                } catch (Exception fallbackEx) {
                    logger.error("Fallback storage failed for task: {}", task.getDescription(), fallbackEx);
                }
            }
        } catch (Exception e) {
            logger.error("Unexpected error executing persistence batch", e);
        }
    }

    private void applyBatch(List<PersistenceTask> tasks) throws Exception {
        Map<String, List<PersistenceTask>> tasksBySession = new LinkedHashMap<>();
        for (PersistenceTask task : tasks) {
            tasksBySession.computeIfAbsent(task.getSessionName(), k -> new ArrayList<>())
                    .add(task);
        }

        for (Map.Entry<String, List<PersistenceTask>> entry : tasksBySession.entrySet()) {
            String sessionName = entry.getKey();
            var session = sessionRepository.findBySessionName(sessionName)
                    .orElseThrow(() -> new PersistenceException(
                            "Session '" + sessionName + "' not found for persisting batch"));

            Map<String, Channel> channelCache = buildChannelCache(session);
            Map<String, List<DrawPayload>> drawEventsByChannel = new LinkedHashMap<>();
            Map<String, List<ChatMessage>> chatEventsByChannel = new LinkedHashMap<>();

            for (PersistenceTask task : entry.getValue()) {
                if (task instanceof DrawPersistenceTask drawTask) {
                    drawEventsByChannel
                            .computeIfAbsent(task.getChannelName(), k -> new ArrayList<>())
                            .add(drawTask.payload);
                } else if (task instanceof ChatPersistenceTask chatTask) {
                    chatEventsByChannel
                            .computeIfAbsent(task.getChannelName(), k -> new ArrayList<>())
                            .add(chatTask.message);
                } else {
                    // Fallback for future task types
                    task.apply(session);
                }
            }

            for (Map.Entry<String, List<DrawPayload>> drawEntry : drawEventsByChannel.entrySet()) {
                Channel channel = resolveChannel(drawEntry.getKey(), channelCache, session);
                channel.getShapes().addAll(drawEntry.getValue());
            }

            for (Map.Entry<String, List<ChatMessage>> chatEntry : chatEventsByChannel.entrySet()) {
                Channel channel = resolveChannel(chatEntry.getKey(), channelCache, session);
                channel.getChatMessages().addAll(chatEntry.getValue());
            }

            @SuppressWarnings({ "null", "unused" })
            com.masterwayne.whiteboard_app.model.WhiteboardSession savedSession = sessionRepository.save(session);
        }
    }

    private Map<String, Channel> buildChannelCache(com.masterwayne.whiteboard_app.model.WhiteboardSession session) {
        Map<String, Channel> cache = new LinkedHashMap<>();
        if (session.getChannels() != null) {
            for (Channel channel : session.getChannels()) {
                cache.put(channel.getChannelName(), channel);
            }
        }
        return cache;
    }

    private Channel resolveChannel(String channelName,
            Map<String, Channel> channelCache,
            com.masterwayne.whiteboard_app.model.WhiteboardSession session) throws PersistenceException {
        Channel channel = channelCache.get(channelName);
        if (channel == null) {
            throw new PersistenceException("Channel '" + channelName + "' not found in session");
        }
        return channel;
    }

    /**
     * Submits a draw event for asynchronous persistence.
     * Returns false if queue is full (backpressure).
     */
    public boolean submitDrawEvent(String sessionName, String channelName, DrawPayload payload) {
        if (!running) {
            logger.warn("PersistenceWorker is not running. Event discarded: session={}, channel={}", sessionName,
                    channelName);
            return false;
        }

        PersistenceTask task = PersistenceTask.drawTask(sessionName, channelName, payload);
        boolean submitted = taskQueue.offer(task);

        if (!submitted) {
            logger.error("PersistenceWorker queue full. Event discarded: session={}, channel={}", sessionName,
                    channelName);
        }

        return submitted;
    }

    /**
     * Submits a chat message for asynchronous persistence.
     * Returns false if queue is full (backpressure).
     */
    public boolean submitChatMessage(String sessionName, String channelName, ChatMessage message) {
        if (!running) {
            logger.warn("PersistenceWorker is not running. Message discarded: session={}, channel={}", sessionName,
                    channelName);
            return false;
        }

        PersistenceTask task = PersistenceTask.chatTask(sessionName, channelName, message);
        boolean submitted = taskQueue.offer(task);

        if (!submitted) {
            logger.error("PersistenceWorker queue full. Message discarded: session={}, channel={}", sessionName,
                    channelName);
        }

        return submitted;
    }

    /**
     * Gracefully shuts down the worker thread, draining remaining tasks before
     * terminating.
     * Called via @PreDestroy.
     */
    public void shutdown() {
        if (!running) {
            logger.info("PersistenceWorker is not running");
            return;
        }

        logger.info("Shutting down PersistenceWorker...");
        running = false;

        // Signal the consumer thread to stop
        executorService.shutdown();

        try {
            if (executorService.awaitTermination(SHUTDOWN_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                logger.info("PersistenceWorker shut down gracefully");
            } else {
                logger.warn("PersistenceWorker shutdown timeout. Forcing termination.");
                executorService.shutdownNow();
            }
        } catch (InterruptedException e) {
            logger.error("Interrupted while waiting for PersistenceWorker shutdown", e);
            executorService.shutdownNow();
            Thread.currentThread().interrupt();
        }

        // Drain any remaining tasks from the queue
        int drained = 0;
        PersistenceTask remainingTask;
        while ((remainingTask = taskQueue.poll()) != null) {
            try {
                List<PersistenceTask> single = new ArrayList<>(1);
                single.add(remainingTask);
                executeBatch(single);
                drained++;
            } catch (Exception e) {
                logger.error("Error processing remaining task during shutdown", e);
            }
        }

        if (drained > 0) {
            logger.info("Drained {} remaining tasks during shutdown", drained);
        }
    }

    /**
     * Returns the current size of the persistence queue.
     */
    public int getQueueSize() {
        return taskQueue.size();
    }

    /**
     * Returns the remaining capacity of the queue.
     */
    public int getQueueCapacity() {
        return taskQueue.remainingCapacity();
    }

    /**
     * Abstract base class for persistence tasks.
     * Implements Factory pattern for different task types.
     */
    public abstract static class PersistenceTask {
        protected final String sessionName;
        protected final String channelName;

        public PersistenceTask(String sessionName, String channelName) {
            this.sessionName = sessionName;
            this.channelName = channelName;
        }

        /**
         * Executes the persistence operation (DB write).
         */
        public abstract void apply(com.masterwayne.whiteboard_app.model.WhiteboardSession session) throws Exception;

        /**
         * Writes the event to fallback storage if DB write failed.
         */
        public abstract void writeFallback(FallbackStorage storage);

        /**
         * Returns a human-readable description of the task.
         */
        public abstract String getDescription();

        /**
         * Factory method for draw event tasks.
         */
        public static PersistenceTask drawTask(String sessionName, String channelName, DrawPayload payload) {
            return new DrawPersistenceTask(sessionName, channelName, payload);
        }

        /**
         * Factory method for chat message tasks.
         */
        public static PersistenceTask chatTask(String sessionName, String channelName, ChatMessage message) {
            return new ChatPersistenceTask(sessionName, channelName, message);
        }

        public String getSessionName() {
            return sessionName;
        }

        public String getChannelName() {
            return channelName;
        }
    }

    /**
     * Task for persisting a draw event.
     */
    private static class DrawPersistenceTask extends PersistenceTask {
        private final DrawPayload payload;

        public DrawPersistenceTask(String sessionName, String channelName, DrawPayload payload) {
            super(sessionName, channelName);
            this.payload = payload;
        }

        @Override
        public void apply(com.masterwayne.whiteboard_app.model.WhiteboardSession session) throws Exception {
            var channel = session.getChannels().stream()
                    .filter(c -> c.getChannelName().equals(channelName))
                    .findFirst()
                    .orElseThrow(() -> new PersistenceException("Channel '" + channelName + "' not found in session"));

            channel.getShapes().add(payload);
        }

        @Override
        public void writeFallback(FallbackStorage storage) {
            storage.writeDrawPayload(sessionName, channelName, payload);
        }

        @Override
        public String getDescription() {
            return String.format("DrawEvent{session='%s', channel='%s', type='%s'}", sessionName, channelName,
                    payload.getType());
        }
    }

    /**
     * Task for persisting a chat message.
     */
    private static class ChatPersistenceTask extends PersistenceTask {
        private final ChatMessage message;

        public ChatPersistenceTask(String sessionName, String channelName, ChatMessage message) {
            super(sessionName, channelName);
            this.message = message;
        }

        @Override
        public void apply(com.masterwayne.whiteboard_app.model.WhiteboardSession session) throws Exception {
            var channel = session.getChannels().stream()
                    .filter(c -> c.getChannelName().equals(channelName))
                    .findFirst()
                    .orElseThrow(() -> new PersistenceException("Channel '" + channelName + "' not found in session"));

            channel.getChatMessages().add(message);
        }

        @Override
        public void writeFallback(FallbackStorage storage) {
            storage.writeChatMessage(sessionName, channelName, message);
        }

        @Override
        public String getDescription() {
            return String.format("ChatMessage{session='%s', channel='%s', sender='%s'}", sessionName, channelName,
                    message.getSenderName());
        }
    }
}
