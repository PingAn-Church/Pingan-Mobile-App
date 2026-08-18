package com.fyp.backend.service.bible;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * A book of the Protestant canon, 1-66 in canonical order — so Luke is 42, which
 * is the number that appears in a {@code [bible:CUV:42:10:27]} token.
 *
 * Names come from the eBible downloads themselves rather than being typed out, so
 * they match the editions actually shipped. Aliases are mechanical (code, English
 * name, English name without spaces, Chinese name); curated abbreviations such as
 * "Jn" or "太" are a separate reviewed addition, since guessing sixty-six of them
 * is how a lookup quietly resolves to the wrong book.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record BibleBook(int id, String code, String en, String zh, List<String> aliases) {

    /** The name to print for a reader in this language. */
    public String nameFor(String language) {
        boolean chinese = language != null && language.toLowerCase().startsWith("zh");
        return chinese && zh != null && !zh.isBlank() ? zh : en;
    }
}
