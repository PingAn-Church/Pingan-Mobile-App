//////package com.fyp.backend.config.websocket;
//////
//////import com.fyp.backend.service.RedisService;
//////import com.fyp.backend.util.JwtUtil;
//////import org.springframework.beans.factory.annotation.Autowired;
//////import org.springframework.http.server.ServerHttpRequest;
//////import org.springframework.http.server.ServerHttpResponse;
//////import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
//////import org.springframework.stereotype.Component;
//////import org.springframework.web.socket.WebSocketHandler;
//////import org.springframework.web.socket.server.HandshakeInterceptor;
//////
//////import java.util.Map;
//////
//////@Component
//////public class WebSocketInterceptor implements HandshakeInterceptor {
//////
//////    @Autowired
//////    private JwtUtil jwtUtil;
//////
//////    @Autowired
//////    private RedisService redisService; // ✅ Inject RedisService
//////
//////    @Override
//////    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
//////        String token = request.getURI().getQuery();
//////        if (token != null && token.startsWith("token=")) {
//////            token = token.substring(6); // Remove "token=" prefix
//////            String email = jwtUtil.extractEmail(token);
//////            if (email != null && jwtUtil.validateToken(token, email)) {
//////                attributes.put("userEmail", email);
//////
//////                redisService.setUserOnline(email);
//////                return true;
//////            }
//////        }
//////        return false;
//////    }
//////
//////    @Override
//////    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
//////    }
//////}
////
////package com.fyp.backend.config.websocket;
////
////import com.fyp.backend.service.RedisService;
////import com.fyp.backend.util.JwtUtil;
////import org.springframework.beans.factory.annotation.Autowired;
////import org.springframework.http.server.ServerHttpRequest;
////import org.springframework.http.server.ServerHttpResponse;
////import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
////import org.springframework.stereotype.Component;
////import org.springframework.web.socket.WebSocketHandler;
////import org.springframework.web.socket.server.HandshakeInterceptor;
////
////import java.util.List;
////import java.util.Map;
////
////@Component
////public class WebSocketInterceptor implements HandshakeInterceptor {
////
////    @Autowired
////    private JwtUtil jwtUtil;
////
////    @Autowired
////    private RedisService redisService;
////
////    @Override
////    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
////        // 🔹 Extract token from WebSocket headers
////        List<String> authHeaders = request.getHeaders().get("Authorization");
////
////        if (authHeaders != null && !authHeaders.isEmpty()) {
////            String token = authHeaders.get(0).replace("Bearer ", ""); // Remove "Bearer " prefix
////            String email = jwtUtil.extractEmail(token);
////
////            if (email != null && jwtUtil.validateToken(token, email)) {
////                attributes.put("userEmail", email);
////                System.out.println("SETTING USER ONLINE!!");
////                redisService.setUserOnline(email); // ✅ Store online status in Redis
////                return true;
////            }
////        }
////        return false;
////    }
////
////    @Override
////    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
////    }
////}
//
//package com.fyp.backend.config.websocket;
//
//import com.fyp.backend.service.RedisService;
//import com.fyp.backend.util.JwtUtil;
//import org.springframework.beans.factory.annotation.Autowired;
//import org.springframework.http.server.ServerHttpRequest;
//import org.springframework.http.server.ServerHttpResponse;
//import org.springframework.messaging.support.ChannelInterceptor;
//import org.springframework.stereotype.Component;
//import org.springframework.web.socket.WebSocketHandler;
//import org.springframework.web.socket.server.HandshakeInterceptor;
//
//import java.net.URI;
//import java.util.Map;
//
//@Component
//public class WebSocketInterceptor implements HandshakeInterceptor {
//
//    @Autowired
//    private JwtUtil jwtUtil;
//
//    @Autowired
//    private RedisService redisService;
//
//    @Override
//    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
//        // ✅ Extract token from WebSocket URL (query parameter)
//        URI uri = request.getURI();
//        String query = uri.getQuery(); // e.g., "token=eyJhbGciOiJIUzI1NiIs..."
//
//        if (query != null && query.startsWith("token=")) {
//            String token = query.substring(6); // Remove "token=" prefix
//            String email = jwtUtil.extractEmail(token);
//
//            if (email != null && jwtUtil.validateToken(token, email)) {
//                attributes.put("userEmail", email);
////                redisService.setUserOnline(email); // ✅ Mark user online in Redis
//                return true;
//            }
//        }
//
//        return false;
//    }
//
//    @Override
//    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
//        // Do nothing after handshake
//    }
//}

package com.fyp.backend.config.websocket;

import com.fyp.backend.service.RedisService;
import com.fyp.backend.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.net.URI;
import java.util.Map;

@Component
public class WebSocketInterceptor implements HandshakeInterceptor {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisService redisService;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) {
        URI uri = request.getURI();
        String query = uri.getQuery(); // token=...&deviceId=...

        if (query != null) {
            String token = null;
            String deviceId = null;
            for (String part : query.split("&")) {
                if (part.startsWith("token=")) token = part.substring(6);
                if (part.startsWith("deviceId=")) deviceId = part.substring(9);
            }

            if (token != null && deviceId != null) {
                String email = jwtUtil.extractEmail(token);
                if (email != null && jwtUtil.validateToken(token, email)) {
                    attributes.put("userEmail", email);
                    attributes.put("deviceId", deviceId);
                    redisService.setUserOnline(email, deviceId);
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
        // No operation after handshake
    }
}
