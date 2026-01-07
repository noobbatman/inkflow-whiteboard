package com.masterwayne.whiteboard_app.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(@org.springframework.lang.NonNull MessageBrokerRegistry registry) {
        // This sets up the "/topic" prefix for messages that go from the server back to
        // the client
        registry.enableSimpleBroker("/topic");
        // This sets up the "/app" prefix for messages that go from the client to the
        // server
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureWebSocketTransport(@org.springframework.lang.NonNull WebSocketTransportRegistration registry) {
        // Configure WebSocket transport for better stability
        registry.setMessageSizeLimit(512 * 1024) // 512KB max message size
                .setSendTimeLimit(20 * 1000) // 20 seconds to send a message
                .setSendBufferSizeLimit(512 * 1024) // 512KB send buffer
                .setTimeToFirstMessage(60 * 1000); // 60 seconds to receive first message
    }

    @Override
    public void registerStompEndpoints(@org.springframework.lang.NonNull StompEndpointRegistry registry) {
        // Register the STOMP endpoint and enable SockJS fallback
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*", "*")
                .withSockJS()
                .setSessionCookieNeeded(false)
                .setStreamBytesLimit(512 * 1024)
                .setDisconnectDelay(30 * 60 * 1000)
                .setHttpMessageCacheSize(1000)
                .setWebSocketEnabled(true);
    }
}