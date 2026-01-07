import React, { useState, useRef, useEffect } from 'react';
import './Chat.css';

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
  '🙂', '🙃', '😉', '😊', '😍', '😘', '😗', '😙',
  '😚', '😋', '😜', '😝', '😛', '🤪', '🤨', '🫠',
  '😎', '🤓', '🧐', '😤', '😠', '😡', '🥺', '😢',
  '😭', '😮', '😲', '😳', '😱', '🤯', '😴', '🤤',
  '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '🔥',
  '🎉', '✨', '💯', '❤️', '💔', '💖', '🚀', '✅',
  '❌', '⚡', '🎯', '📎', '🖼️', '🎁', '🌟', '🧠',
];

function Chat({ chatMessages, sendChatMessage, userName, channelName, isMinimized = false, onToggleMinimize }) {
  const [message, setMessage] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    // Scroll immediately
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Also scroll after a short delay to handle image loading
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    return () => clearTimeout(timer);
  }, [chatMessages]);

  // Scroll when images load
  useEffect(() => {
    const handleImageLoad = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const images = document.querySelectorAll('.chat-attachment-image');
    images.forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', handleImageLoad);
      }
    });

    return () => {
      images.forEach(img => {
        img.removeEventListener('load', handleImageLoad);
      });
    };
  }, [chatMessages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendChatMessage(message.trim());
      setMessage('');
      setPlusOpen(false);
      setEmojiOpen(false);
    }
  };

  const sendAttachmentMessage = (upload, file) => {
    const isImage = (upload.contentType || file?.type || '').startsWith('image/');
    const content = message.trim();

    sendChatMessage({
      content,
      messageType: isImage ? 'IMAGE' : 'FILE',
      attachmentUrl: upload.url,
      attachmentName: upload.originalName,
      attachmentContentType: upload.contentType,
      attachmentSize: upload.size,
    });
    setMessage('');
  };

  const uploadAndSend = async (file) => {
    if (!file) return;
    setPlusOpen(false);
    setEmojiOpen(false);
    setIsUploading(true);

    try {
      const form = new FormData();
      form.append('file', file);

      const baseUrl = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${baseUrl}/api/uploads`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      const upload = await res.json();
      sendAttachmentMessage(upload, file);
    } catch (err) {
      console.error('Upload failed:', err);
      // Fallback: send a plain message so the user gets feedback.
      const fallbackText = message.trim() || `Upload failed: ${file.name}`;
      sendChatMessage(fallbackText);
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePickEmoji = (emoji) => {
    setMessage((prev) => `${prev}${emoji}`);
    setEmojiOpen(false);
  };

  // Group messages by sender and timestamp proximity
  const shouldShowHeader = (currentMsg, prevMsg, index) => {
    if (index === 0) return true;
    if (currentMsg.senderName !== prevMsg.senderName) return true;

    // Show header if messages are more than 5 minutes apart
    const currentTime = currentMsg.timestamp ? new Date(currentMsg.timestamp).getTime() : 0;
    const prevTime = prevMsg.timestamp ? new Date(prevMsg.timestamp).getTime() : 0;
    const timeDiff = currentTime - prevTime;

    return timeDiff > 300000; // 5 minutes
  };

  const renderAttachment = (msg) => {
    if (!msg || !msg.attachmentUrl) return null;
    const type = msg.messageType || '';
    const ct = msg.attachmentContentType || '';
    const isImage = type === 'IMAGE' || type === 'GIF' || ct.startsWith('image/');

    const isPdf = ct === 'application/pdf' || (msg.attachmentName || '').toLowerCase().endsWith('.pdf') || (msg.attachmentUrl || '').toLowerCase().endsWith('.pdf');

    if (isImage) {
      return (
        <a className="chat-attachment-link" href={msg.attachmentUrl} target="_blank" rel="noreferrer">
          <img
            className="chat-attachment-image"
            src={msg.attachmentUrl}
            alt="uploaded"
            loading="lazy"
          />
        </a>
      );
    }

    return (
      <a className="chat-attachment-file" href={msg.attachmentUrl} target="_blank" rel="noreferrer">
        {isPdf ? 'PDF' : 'File'}
      </a>
    );
  };

  return (
    <div className={`chat-area ${isMinimized ? 'minimized' : ''}`}>
      {onToggleMinimize && (
        <button
          type="button"
          className="chat-toggle-btn"
          onClick={onToggleMinimize}
          aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
        >
          {isMinimized ? '←' : '→'}
        </button>
      )}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-hash">#</span>
          <h3 className="chat-title">{channelName || 'channel'}</h3>
        </div>
      </div>
      <div className={`chat-body ${isMinimized ? 'collapsed' : ''}`}>
        <div className="message-list">
          {chatMessages.length === 0 && (
            <div className="empty-chat">
              <div className="empty-icon">#</div>
              <h3>Welcome to #{channelName || 'channel'}!</h3>
              <p>This is the beginning of the #{channelName || 'channel'} channel.</p>
            </div>
          )}
          {chatMessages.map((msg, index) => {
            const showHeader = shouldShowHeader(msg, chatMessages[index - 1], index);
            const isOwn = !!userName && msg.senderName === userName;
            const dt = msg.timestamp ? new Date(msg.timestamp) : new Date();
            const timeLabel = dt.toLocaleString([], {
              hour: '2-digit',
              minute: '2-digit'
            });
            const dateLabel = dt.toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });

            const groupClass = `chat-message-group${showHeader ? '' : ' compact'}`;

            return (
              <div
                key={index}
                className={`chat-message-wrapper${isOwn ? ' own' : ''}${msg.optimistic ? ' optimistic' : ''}${showHeader ? ' show-header' : ''}`}
              >
                <div className={groupClass}>
                  {!isOwn && showHeader && (
                    <div className="message-avatar">
                      {(msg.senderName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content-wrapper">
                    <div className={`message-header${isOwn ? ' own' : ''}`}>
                      <span className="sender-name">{msg.senderName || (isOwn ? userName : 'User')}</span>
                      <span className="timestamp">{dateLabel} at {timeLabel}</span>
                    </div>
                    <div className={`message-bubble${isOwn ? ' own' : ''}`}>
                      {msg.content ? <div className="message-content">{msg.content}</div> : null}
                      {renderAttachment(msg)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <form className="chat-input-form" onSubmit={handleSend}>
          <div className="chat-input-container">
            <button
              type="button"
              className="chat-plus-btn"
              onClick={() => {
                setPlusOpen((v) => !v);
                setEmojiOpen(false);
              }}
              aria-label="Open upload menu"
              disabled={isUploading}
            >
              {isUploading ? '…' : '+'}
            </button>

            {plusOpen && (
              <div className="chat-plus-menu" role="menu">
                <button
                  type="button"
                  className="chat-plus-menu-item"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Upload picture
                </button>
                <button
                  type="button"
                  className="chat-plus-menu-item"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Upload file
                </button>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => uploadAndSend(e.target.files?.[0])}
            />
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => uploadAndSend(e.target.files?.[0])}
            />
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message #${channelName || 'channel'}`}
              className="chat-input"
            />
            <div className="chat-input-actions">
              <button
                type="button"
                className="input-action-btn"
                onClick={() => {
                  setEmojiOpen((v) => !v);
                  setPlusOpen(false);
                }}
                aria-label="Add emoji"
              >
                😊
              </button>
              {emojiOpen && (
                <div className="chat-emoji-menu" role="menu">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="chat-emoji"
                      onClick={() => handlePickEmoji(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="chat-send-btn"
                aria-label="Send message"
                disabled={!message.trim() || isUploading}
                title="Send"
              >
                ➤
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Chat;