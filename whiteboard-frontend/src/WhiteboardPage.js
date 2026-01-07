import React, { useEffect, useRef, useState } from 'react';
// CHANGED: We import Client, not 'over'
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client/dist/sockjs';
import './WhiteboardPage.css';
import { FaSun, FaMoon } from 'react-icons/fa';

// Import our components
import Canvas from './Canvas';
import Chat from './Chat';
import ChannelManager from './ChannelManager';

function WhiteboardPage({ session, onLogout, onSessionUpdate }) {
  const { sessionName, userName, channelName } = session;
  const stompClient = useRef(null);

  // State to hold all draw events and chat messages
  const [drawEvents, setDrawEvents] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [previewShape, setPreviewShape] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  // Debug: Monitor chat messages changes
  useEffect(() => {
    console.log('chatMessages state changed, length:', chatMessages.length);
  }, [chatMessages]);

  // Channel management state
  const [channels, setChannels] = useState([
    { name: 'general', logo: '💬', type: 'public' },
    { name: 'design', logo: '🎨', type: 'public' },
    { name: 'development', logo: '💻', type: 'public' }
  ]);
  const [currentChannel, setCurrentChannel] = useState(channelName);

  const drawEventKey = (e) => {
    if (!e) return 'null';
    const norm = (v) => (v === undefined || v === null ? '' : String(v));
    const t = e.type || '';
    const id = e.id || e.targetId || '';
    return [
      t,
      id,
      e.x1, e.y1, e.x2, e.y2,
      e.x, e.y,
      e.dx, e.dy,
      e.color,
      e.lineWidth,
      e.fontSize,
      e.text,
    ].map(norm).join('|');
  };

  useEffect(() => {
    // Cleanup function to deactivate on unmount or channel change
    return () => {
      if (stompClient.current && stompClient.current.active) {
        console.log('Deactivating STOMP client');
        stompClient.current.deactivate();
      }
    };
  }, []);

  useEffect(() => {
    // Connect to WebSocket when channel changes
    connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChannel]);

  // CHANGED: This whole function is updated to use new Client()
  const connect = () => {
    // Deactivate existing connection if any
    if (stompClient.current && stompClient.current.active) {
      stompClient.current.deactivate();
    }

    // Create a new Client instance
    const sockJsUrl = process.env.REACT_APP_WS_URL || '/ws';

    stompClient.current = new Client({
      webSocketFactory: () => new SockJS(sockJsUrl),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: onConnected,
      onStompError: onError,
      onWebSocketError: onError,
      onWebSocketClose: () => {
        console.log('WebSocket connection closed');
        setIsConnected(false);
      },
      debug: (str) => {
        console.log('STOMP Debug:', str);
      }
    });

    // Activate the client
    try {
      stompClient.current.activate();
    } catch (error) {
      console.error('Error activating STOMP client:', error);
      setIsConnected(false);
    }
  };


  const onConnected = () => {
    console.log('Connected to WebSocket for channel:', currentChannel);
    setIsConnected(true);

    // Clear current state to prepare for new channel data
    setChatMessages([]);
    setDrawEvents([]);

    // Check if client is connected before subscribing
    if (!stompClient.current || !stompClient.current.connected) {
      console.error('STOMP client not connected');
      return;
    }

    try {
      // Subscribe to drawing topic
      const drawSub = stompClient.current.subscribe(
        `/topic/whiteboard/${sessionName}/${currentChannel}`,
        onDrawEventReceived
      );
      console.log('Subscribed to whiteboard topic:', drawSub.id);

      // Subscribe to chat topic
      const chatSub = stompClient.current.subscribe(
        `/topic/chat/${sessionName}/${currentChannel}`,
        onChatReceived
      );
      console.log('Subscribed to chat topic:', chatSub.id);

      // Load historical data AFTER subscribing
      loadHistory().catch(err =>
        console.error('Failed to load history, continuing anyway:', err)
      );
    } catch (error) {
      console.error('Error subscribing to topics:', error);
    }
  };

  // Fetch historical drawing and chat data from the backend
  const loadHistory = async () => {
    try {
      console.log(`Fetching history for session: ${sessionName}, channel: ${currentChannel}`);

      // Fetch shapes (drawing history)
      const baseUrl = process.env.REACT_APP_API_URL || '';
      const shapesResponse = await fetch(
        `${baseUrl}/api/sessions/${sessionName}/channels/${currentChannel}/shapes`
      );
      if (shapesResponse.ok) {
        const shapes = await shapesResponse.json();
        console.log('Loaded shapes history:', shapes.length, shapes);
        // Canvas text is local-only, so ignore any server-stored text events.
        const serverShapes = (Array.isArray(shapes) ? shapes : []).filter((e) => {
          const t = (e?.type || '').toString();
          return !(t === 'text' || t === 'text-move' || t === 'text-delete');
        });
        setDrawEvents((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          if (!prevArr.length) return serverShapes;
          if (!serverShapes.length) return prevArr;

          // Keep server order, but append any local-only events so nothing disappears.
          const seen = new Set(serverShapes.map(drawEventKey));
          const extras = prevArr.filter((e) => !seen.has(drawEventKey(e)));
          return [...serverShapes, ...extras];
        });
      } else {
        console.warn('Failed to load shapes, status:', shapesResponse.status);
      }

      // Fetch chat messages history
      const chatResponse = await fetch(
        `${baseUrl}/api/sessions/${sessionName}/channels/${currentChannel}/chat`
      );
      if (chatResponse.ok) {
        const messages = await chatResponse.json();
        console.log('✅ Loaded chat history:', messages.length, 'messages');
        if (messages && messages.length > 0) {
          console.log('First message:', messages[0]);
          console.log('Last message:', messages[messages.length - 1]);
        }
        // Ensure we set an array, even if empty
        const messagesArray = Array.isArray(messages) ? messages : [];
        setChatMessages(messagesArray);
        console.log('✅ Chat messages state updated with', messagesArray.length, 'messages');
      } else {
        console.error('❌ Failed to load chat messages, status:', chatResponse.status);
        const errorText = await chatResponse.text();
        console.error('Error response:', errorText);
        setChatMessages([]); // Set empty array on error
      }
    } catch (error) {
      console.error('Error loading history:', error);
      // Don't throw - let the app continue even if history fails
    }
  };

  const onError = (err) => {
    console.error('WebSocket connection error:', err);
    setIsConnected(false);
    // client will automatically try to reconnect
  };

  const onDrawEventReceived = (payload) => {
    let drawEvent;
    try {
      drawEvent = JSON.parse(payload.body);
    } catch (e) {
      console.error('Failed to parse draw event:', e);
      return;
    }

    const t = drawEvent?.type || '';

    // Canvas text is local-only (not shared between users)
    if (t === 'text' || t === 'text-move' || t === 'text-delete') {
      return;
    }

    if (t === 'clear') {
      setDrawEvents([]);
      setPreviewShape(null);
      return;
    }
    if (t.startsWith('shape-preview')) {
      // Remote live preview: do NOT push to history; just show overlay
      setPreviewShape(drawEvent);
      return;
    }
    // Finalized draw event: add to history if not a duplicate and clear any preview overlay
    setDrawEvents((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      const last = prevArr.length ? prevArr[prevArr.length - 1] : null;
      const same = drawEventKey(last) === drawEventKey(drawEvent);
      return same ? prevArr : [...prevArr, drawEvent];
    });
    setPreviewShape(null);
  };

  const onChatReceived = (payload) => {
    const chatMessage = JSON.parse(payload.body);

    // If we previously added an optimistic message locally, replace it
    // with the authoritative message from the server instead of
    // appending a duplicate. We match on senderName + content which
    // is sufficient for this app's simple chat flow.
    setChatMessages((prevMessages) => {
      const optimisticIndex = prevMessages.findIndex(
        (m) =>
          m.optimistic &&
          m.senderName === chatMessage.senderName &&
          m.content === chatMessage.content &&
          (m.attachmentUrl || null) === (chatMessage.attachmentUrl || null)
      );
      if (optimisticIndex !== -1) {
        const copy = [...prevMessages];
        copy[optimisticIndex] = chatMessage; // replace optimistic with server message
        return copy;
      }
      return [...prevMessages, chatMessage];
    });
  };

  // --- Functions to SEND data (passed to child components) ---

  const sendDrawEvent = (drawPayload) => {
    if (drawPayload.type === 'clear') {
      // Immediate local clear so user sees instant feedback
      setDrawEvents([]);
    }

    if (!stompClient.current || !stompClient.current.connected) {
      console.error('Cannot send draw event: STOMP client not connected.');
      return;
    }

    try {
      stompClient.current.publish({
        destination: `/app/draw/${sessionName}/${currentChannel}`,
        body: JSON.stringify(drawPayload),
      });
    } catch (error) {
      console.error('Error sending draw event:', error);
    }
  };

  // Local helper to add a finalized shape immediately (for instant visual)
  const addLocalDrawEvent = (event) => {
    setDrawEvents((prev) => [...prev, event]);
  };

  const sendChatMessage = (contentOrPayload) => {
    const payload =
      typeof contentOrPayload === 'string'
        ? { content: contentOrPayload }
        : (contentOrPayload || {});

    const trimmed = (payload.content || '').trim();
    const hasAttachment = !!payload.attachmentUrl;

    if (!trimmed && !hasAttachment) return;

    if (!stompClient.current || !stompClient.current.connected) {
      console.error('Cannot send chat message: STOMP client not connected.');
      // Still add to local state for better UX
      setChatMessages(prev => [...prev, {
        senderName: userName,
        content: trimmed,
        messageType: payload.messageType,
        attachmentUrl: payload.attachmentUrl,
        attachmentName: payload.attachmentName,
        attachmentContentType: payload.attachmentContentType,
        attachmentSize: payload.attachmentSize,
        timestamp: new Date().toISOString(),
        optimistic: true,
        error: true
      }]);
      return;
    }

    // Optimistic local update for real-time feel
    setChatMessages(prev => [...prev, {
      senderName: userName,
      content: trimmed,
      messageType: payload.messageType,
      attachmentUrl: payload.attachmentUrl,
      attachmentName: payload.attachmentName,
      attachmentContentType: payload.attachmentContentType,
      attachmentSize: payload.attachmentSize,
      timestamp: new Date().toISOString(),
      optimistic: true
    }]);

    try {
      const chatPayload = {
        senderName: userName,
        content: trimmed,
        messageType: payload.messageType,
        attachmentUrl: payload.attachmentUrl,
        attachmentName: payload.attachmentName,
        attachmentContentType: payload.attachmentContentType,
        attachmentSize: payload.attachmentSize,
      };
      stompClient.current.publish({
        destination: `/app/chat/${sessionName}/${currentChannel}`,
        body: JSON.stringify(chatPayload),
      });
    } catch (error) {
      console.error('Error sending chat message:', error);
    }
  };

  // Channel management functions
  const handleChannelSelect = (channelName) => {
    setCurrentChannel(channelName);
    // Update the session state
    onSessionUpdate({ sessionName, userName, channelName });
    // Clear current data to show loading state
    setDrawEvents([]);
    setChatMessages([]);
    // Disconnect and reconnect to new channel
    if (stompClient.current) {
      stompClient.current.deactivate();
    }
  };

  const handleChannelCreate = (channelData) => {
    // Add new channel to the list
    setChannels(prev => [...prev, channelData]);
    // Switch to the new channel
    handleChannelSelect(channelData.name);
  };

  return (
    <div className={`whiteboard-container ${darkMode ? 'dark-mode' : ''}`}>
      <ChannelManager
        sessionName={sessionName}
        userName={userName}
        currentChannel={currentChannel}
        channels={channels}
        onChannelSelect={handleChannelSelect}
        onChannelCreate={handleChannelCreate}
        onLogout={onLogout}
        darkMode={darkMode}
      />

      <div className="main-content">
        <div className="channel-header">
          <div className="channel-info">
            <span className="channel-icon">
              {channels.find(c => c.name === currentChannel)?.logo || '📝'}
            </span>
            <h2 className="channel-title">{currentChannel}</h2>
          </div>
          <div className="header-actions">
            <div className="connection-status">
              <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
              <span className="status-text">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              className="dark-mode-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title="Toggle Dark Mode"
            >
              {darkMode ? <FaSun /> : <FaMoon />}
            </button>
            <button className="logout-btn-header" onClick={onLogout}>
              <span className="logout-icon">⏏</span>
              <span className="logout-text">Logout</span>
            </button>
          </div>
        </div>

        <div className={`content-area ${isChatMinimized ? 'chat-hidden' : ''}`}>
          <div className={`whiteboard-area ${isChatMinimized ? 'expanded' : ''}`}>
            {/* Render the Canvas component */}
            <Canvas
              drawEvents={drawEvents}
              sendDrawEvent={sendDrawEvent}
              previewShape={previewShape}
              addLocalDrawEvent={addLocalDrawEvent}
              userName={userName}
              channelName={currentChannel}
            />
          </div>

          <div className={`chat-column ${isChatMinimized ? 'collapsed' : ''}`}>
            {/* Render the Chat component */}
            <Chat
              chatMessages={chatMessages}
              sendChatMessage={sendChatMessage}
              userName={userName}
              channelName={currentChannel}
              isMinimized={isChatMinimized}
              onToggleMinimize={() => setIsChatMinimized(prev => !prev)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WhiteboardPage;