package com.fyp.backend.util;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * The lite inline markup the app draws — {@code *bold*}, {@code _italic_},
 * {@code ~struck~}, single or doubled — reduced to plain text.
 *
 * A push notification cannot show styling, so a message reading "*Sunday* is
 * cancelled" would arrive with the stars in it. This removes exactly the
 * markers the app would have honoured and leaves everything else as typed,
 * using the same rules as the client (frontend/src/utils/inlineMarkup.js):
 *
 * <ul>
 *   <li>an opener cannot follow a Latin letter or digit — snake_case and 5*3*2
 *       are left alone, while Chinese, which has no spaces, still works</li>
 *   <li>the character just inside a marker cannot be whitespace</li>
 *   <li>a closer must match its opener's length and cannot be followed by a
 *       Latin letter or digit</li>
 *   <li>nothing spans a line break; a run of three or more is never a marker</li>
 *   <li>a marker without a partner is kept as typed</li>
 * </ul>
 *
 * Messages are stored as typed; this is only ever applied to what is shown.
 * Change this and the client together.
 */
public final class InlineMarkup {

    private InlineMarkup() {
    }

    public static String strip(String input) {
        if (input == null || input.isEmpty()) {
            return "";
        }
        if (input.indexOf('*') < 0 && input.indexOf('_') < 0 && input.indexOf('~') < 0) {
            return input;
        }
        StringBuilder out = new StringBuilder(input.length());
        for (Token token : tokenize(input)) {
            if (token.text != null) {
                out.append(token.text);
            } else if (token.role == Role.LITERAL) {
                out.append(String.valueOf(token.marker).repeat(token.n));
            }
        }
        return out.toString();
    }

    private enum Role { PENDING, OPEN, CLOSE, LITERAL }

    private static final class Token {
        final String text;
        final char marker;
        final int n;
        Role role;

        Token(String text) {
            this.text = text;
            this.marker = 0;
            this.n = 0;
        }

        Token(char marker, int n, Role role) {
            this.text = null;
            this.marker = marker;
            this.n = n;
            this.role = role;
        }
    }

    /**
     * One pass producing text and marker tokens. A marker starts out pending;
     * it becomes open when a matching closer turns up, and literal if a line
     * break or the end of the text arrives first.
     */
    private static List<Token> tokenize(String text) {
        List<Token> tokens = new ArrayList<>();
        Deque<Token> pending = new ArrayDeque<>();
        int literalStart = 0;
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c == '\n') {
                abandon(pending);
                i++;
                continue;
            }
            if (!isMarker(c)) {
                i++;
                continue;
            }
            int n = 1;
            while (i + n < text.length() && text.charAt(i + n) == c) {
                n++;
            }
            if (n > 2) {
                i += n; // *** and longer are decoration, never markup
                continue;
            }
            char prev = i > 0 ? text.charAt(i - 1) : 0;
            char next = i + n < text.length() ? text.charAt(i + n) : 0;
            boolean canClose = prev != 0 && !isSpace(prev) && (next == 0 || !isLatin(next));
            boolean canOpen = next != 0 && !isSpace(next) && (prev == 0 || !isLatin(prev));
            Token top = pending.peek();

            if (canClose && top != null && top.marker == c && top.n == n) {
                if (i > literalStart) {
                    tokens.add(new Token(text.substring(literalStart, i)));
                }
                tokens.add(new Token(c, n, Role.CLOSE));
                top.role = Role.OPEN;
                pending.pop();
                literalStart = i + n;
            } else if (canOpen) {
                if (i > literalStart) {
                    tokens.add(new Token(text.substring(literalStart, i)));
                }
                Token token = new Token(c, n, Role.PENDING);
                tokens.add(token);
                pending.push(token);
                literalStart = i + n;
            }
            i += n;
        }
        if (text.length() > literalStart) {
            tokens.add(new Token(text.substring(literalStart)));
        }
        abandon(pending);
        return tokens;
    }

    private static void abandon(Deque<Token> pending) {
        while (!pending.isEmpty()) {
            pending.pop().role = Role.LITERAL;
        }
    }

    private static boolean isMarker(char c) {
        return c == '*' || c == '_' || c == '~';
    }

    private static boolean isSpace(char c) {
        return Character.isWhitespace(c) || Character.isSpaceChar(c);
    }

    /** ASCII letters and digits plus the accented Latin blocks, U+00C0 to U+024F. */
    private static boolean isLatin(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                || (c >= 'À' && c <= 'ɏ');
    }
}
