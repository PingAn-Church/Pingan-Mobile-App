package com.fyp.backend.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

/**
 * Server-side objectionable-word filter applied to user-generated text before
 * it is persisted (chat messages, forum threads/replies, course reviews).
 * Matched terms are replaced with "***" — content is never rejected, so
 * messaging keeps flowing and only the offending words are masked.
 *
 * Matching rules, per line of moderation/banned-words.txt:
 *  - Latin-script terms match as whole words only, case-insensitively:
 *    "ass" masks "ass" / "Ass!" but never "passage" or "assign".
 *  - Terms containing CJK characters match as plain substrings, since CJK
 *    text has no word boundaries.
 */
@Service
public class ContentSanitizer {

    static final String MASK = "***";
    private static final String WORDLIST = "moderation/banned-words.txt";

    private final Pattern wordPattern;      // whole-word, case-insensitive
    private final Pattern substringPattern; // CJK terms, plain substring

    public ContentSanitizer() {
        this(loadDefaultWordlist());
    }

    ContentSanitizer(List<String> terms) {
        List<String> words = new ArrayList<>();
        List<String> substrings = new ArrayList<>();
        for (String term : terms) {
            (containsCjk(term) ? substrings : words).add(term);
        }
        // Longest term first so a phrase wins over any shorter term it contains.
        Comparator<String> longestFirst = Comparator.comparingInt(String::length).reversed();
        words.sort(longestFirst);
        substrings.sort(longestFirst);
        this.wordPattern = words.isEmpty() ? null
                : Pattern.compile("(?<![\\p{L}\\p{N}])(?:" + alternation(words) + ")(?![\\p{L}\\p{N}])",
                        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        this.substringPattern = substrings.isEmpty() ? null : Pattern.compile(alternation(substrings));
    }

    /** Replaces every banned term in the text with "***". Null-safe. */
    public String mask(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String result = text;
        if (wordPattern != null) {
            result = wordPattern.matcher(result).replaceAll(MASK);
        }
        if (substringPattern != null) {
            result = substringPattern.matcher(result).replaceAll(MASK);
        }
        return result;
    }

    private static String alternation(List<String> terms) {
        return terms.stream().map(Pattern::quote).collect(Collectors.joining("|"));
    }

    private static boolean containsCjk(String term) {
        return term.codePoints().anyMatch(cp -> {
            Character.UnicodeScript script = Character.UnicodeScript.of(cp);
            return script == Character.UnicodeScript.HAN
                    || script == Character.UnicodeScript.HIRAGANA
                    || script == Character.UnicodeScript.KATAKANA
                    || script == Character.UnicodeScript.HANGUL;
        });
    }

    private static List<String> loadDefaultWordlist() {
        List<String> terms = new ArrayList<>();
        InputStream in = ContentSanitizer.class.getClassLoader().getResourceAsStream(WORDLIST);
        if (in == null) {
            return terms; // missing wordlist — filter disabled rather than fatal
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String term = line.trim();
                if (!term.isEmpty() && !term.startsWith("#")) {
                    terms.add(term);
                }
            }
        } catch (IOException e) {
            // unreadable wordlist — filter disabled rather than blocking startup
        }
        return terms;
    }
}
