// Tracks which chat conversation is currently on screen. The foreground
// notification handler in App.js reads this to silence chat pushes for the
// conversation the user is already looking at; pushes for other conversations
// (or received while the app is backgrounded) still display normally.
let activeConversationId = null;

export function setActiveConversation(conversationId) {
  activeConversationId = conversationId == null ? null : String(conversationId);
}

export function clearActiveConversation() {
  activeConversationId = null;
}

export function isConversationActive(conversationId) {
  return conversationId != null && String(conversationId) === activeConversationId;
}
