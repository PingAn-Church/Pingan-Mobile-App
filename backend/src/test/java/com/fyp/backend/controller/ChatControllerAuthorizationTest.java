package com.fyp.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.service.ChatService;
import com.fyp.backend.service.ConversationMuteService;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;

import jakarta.servlet.http.HttpServletRequest;

@ExtendWith(MockitoExtension.class)
class ChatControllerAuthorizationTest {

    @Mock private ConversationService conversationService;
    @Mock private ChatService chatService;
    @Mock private UserService userService;
    @Mock private JwtUtil jwtUtil;
    @Mock private ConversationMuteService conversationMuteService;
    @Mock private HttpServletRequest request;
    @InjectMocks private ChatController controller;

    @Test
    void sendMessageOverwritesClientOwnedIdentityFields() {
        MessageDto requestBody = new MessageDto();
        requestBody.setConversationId(42L);
        requestBody.setSenderId(999L);
        requestBody.setConversationType("private");
        requestBody.setType("text");
        requestBody.setContent("hello");

        when(request.getHeader("Authorization")).thenReturn("Bearer token");
        when(userService.getUserIdFromToken("Bearer token")).thenReturn(7L);
        when(conversationService.isUserPartOfConversation(42L, 7L)).thenReturn(true);
        when(chatService.sendMessageAndBroadcast(any(MessageDto.class), eq("group")))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = controller.sendMessage("group", requestBody, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        ArgumentCaptor<MessageDto> captor = ArgumentCaptor.forClass(MessageDto.class);
        verify(chatService).sendMessageAndBroadcast(captor.capture(), eq("group"));
        assertEquals(7L, captor.getValue().getSenderId());
        assertEquals("group", captor.getValue().getConversationType());
    }
}
