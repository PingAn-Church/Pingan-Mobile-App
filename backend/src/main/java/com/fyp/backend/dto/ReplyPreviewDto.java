package com.fyp.backend.dto;

import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The quoted message drawn at the top of a reply: who said it, what kind it
 * was, and a short excerpt.
 *
 * Computed when the reply is read, never stored, so it follows the original:
 * an edit shows up, a deletion clears the quote (the key is ON DELETE SET
 * NULL), and a report hides the words from everyone but their author and the
 * admins — a reply must not become a way round the reported-content shadow.
 * The client turns {@code type} + {@code content} into a preview exactly as it
 * does for a conversation-list row, so a quoted photo reads "🖼️ Photo".
 */
@Data
@NoArgsConstructor
public class ReplyPreviewDto {

    /** Longest excerpt shown; a quote is a pointer, not a second copy. */
    static final int EXCERPT_LENGTH = 160;

    private Long messageId;
    private Long senderId;
    private String senderFirstName;
    private String senderLastName;
    private boolean senderBot;
    private String senderDisplayNameZh;
    private String type;
    /** The excerpt, or null while {@link #hidden}. */
    private String content;
    /** True when the original is reported and this viewer may not see its words. */
    private boolean hidden;

    /**
     * @param viewer who is reading, or null for a broadcast that reaches everyone
     *               — which therefore gets the cautious answer on reported content
     */
    public static ReplyPreviewDto of(Message quoted, User viewer) {
        if (quoted == null) {
            return null;
        }
        User author = quoted.getSender();
        ReplyPreviewDto dto = new ReplyPreviewDto();
        dto.messageId = quoted.getId();
        dto.senderId = author == null ? null : author.getId();
        dto.senderFirstName = MessageDto.displayFirstName(author);
        dto.senderLastName = MessageDto.displayLastName(author);
        dto.senderBot = author != null && author.isBot();
        dto.senderDisplayNameZh = dto.senderBot ? author.getDisplayNameZh() : null;
        dto.type = quoted.getType();

        boolean reported = Boolean.TRUE.equals(quoted.getReported());
        boolean mayRead = !reported
                || (viewer != null
                        && ((author != null && viewer.getId().equals(author.getId())) || viewer.isAdmin()));
        dto.hidden = !mayRead;
        dto.content = mayRead ? excerpt(quoted.getContent()) : null;
        return dto;
    }

    public static String excerpt(String content) {
        if (content == null) {
            return null;
        }
        String trimmed = content.trim();
        return trimmed.length() <= EXCERPT_LENGTH
                ? trimmed
                : trimmed.substring(0, EXCERPT_LENGTH - 1) + "…";
    }
}
