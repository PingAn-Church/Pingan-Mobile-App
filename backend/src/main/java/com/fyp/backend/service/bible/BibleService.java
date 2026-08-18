package com.fyp.backend.service.bible;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Scripture lookup, search, and the substitution that turns an assistant's
 * {@code [bible:...]} tokens into real verse text.
 *
 * The model never writes scripture. It emits a token naming a coordinate and this
 * class supplies the wording, so the only thing the model can get wrong is which
 * verse to point at — which is a far smaller surface than letting it quote from
 * memory, where a correctly-cited reference can still carry invented words.
 *
 * Loading is deferred until first use. Parsing 8.7 MB of JSON costs a few hundred
 * milliseconds and ~30 MB of heap; that is nothing at boot in production, but the
 * Spring test context would otherwise pay it for every suite that never touches
 * the assistant.
 */
@Service
public class BibleService {

    private static final Logger log = LoggerFactory.getLogger(BibleService.class);

    public static final String KJV = "KJV";
    public static final String CUV = "CUV";

    /** Enough for a parable; short of dropping a whole chapter into a chat bubble. */
    static final int MAX_VERSES_PER_TOKEN = 15;

    /** A reply is an answer, not a reading. */
    static final int MAX_TOKENS_PER_REPLY = 6;

    /** "Luke 10", "Luke 10:27", "Luke 10:25-37", "约翰福音3:16", "1 Corinthians 13:4-7". */
    private static final Pattern REFERENCE = Pattern.compile(
            "^(.*?)\\s*(\\d{1,3})(?:\\s*[:：]\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?)?$");

    private static final Pattern TOKEN = Pattern.compile(
            "\\[bible:([A-Za-z]{2,10}):(\\d{1,2}):(\\d{1,3}):(\\d{1,3})(?:-(\\d{1,3}))?\\]");

    private volatile Loaded loaded;

    private record Loaded(Map<String, BibleCorpus> corpora,
                          List<BibleBook> books,
                          Map<Integer, BibleBook> booksById,
                          Map<String, BibleBook> booksByAlias) {
    }

    private Loaded corpus() {
        Loaded current = loaded;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (loaded == null) {
                loaded = load();
            }
            return loaded;
        }
    }

    private Loaded load() {
        long startedAt = System.currentTimeMillis();
        ObjectMapper mapper = new ObjectMapper();

        // Explicit type arguments, not diamonds: TypeReference reads its parameter
        // back off the anonymous subclass at runtime, and an inferred one can erase
        // to Object and hand back LinkedHashMaps instead of records.
        List<BibleBook> books = read(mapper, "bible/books.json",
                new TypeReference<List<BibleBook>>() {
                });
        Map<Integer, BibleBook> byId = new HashMap<>();
        Map<String, BibleBook> byAlias = new HashMap<>();
        for (BibleBook book : books) {
            byId.put(book.id(), book);
            for (String alias : book.aliases()) {
                byAlias.putIfAbsent(normalise(alias), book);
            }
        }

        TypeReference<List<BibleVerse>> verseList = new TypeReference<List<BibleVerse>>() {
        };
        Map<String, BibleCorpus> corpora = Map.of(
                KJV, new BibleCorpus(KJV, read(mapper, "bible/kjv.json", verseList), false),
                CUV, new BibleCorpus(CUV, read(mapper, "bible/cuv.json", verseList), true));

        log.info("Bible corpora loaded in {} ms: KJV {} verses, CUV {} verses, {} books.",
                System.currentTimeMillis() - startedAt,
                corpora.get(KJV).size(), corpora.get(CUV).size(), books.size());
        return new Loaded(corpora, books, byId, byAlias);
    }

    private static <T> T read(ObjectMapper mapper, String path, TypeReference<T> type) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            return mapper.readValue(in, type);
        } catch (Exception e) {
            throw new IllegalStateException("Could not load " + path, e);
        }
    }

    /** Latin aliases match case- and space-insensitively; Chinese has neither to lose. */
    private static String normalise(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    /** KJV for everyone except Chinese readers, who get 和合本. */
    public String translationFor(String language) {
        return language != null && language.toLowerCase(Locale.ROOT).startsWith("zh") ? CUV : KJV;
    }

    public static String translationLabel(String translation, String language) {
        boolean chinese = language != null && language.toLowerCase(Locale.ROOT).startsWith("zh");
        if (CUV.equalsIgnoreCase(translation)) {
            return chinese ? "和合本" : "CUV";
        }
        return "KJV";
    }

    /**
     * Resolves a written reference — "Luke 10:25-37", "约翰福音 3:16", "Psalms 23".
     *
     * A chapter with no verse returns the whole chapter, capped, because the model
     * asking about "Psalm 23" should not be handed nothing.
     */
    public Passage lookup(String reference, String translation) {
        Loaded state = corpus();
        BibleCorpus target = state.corpora().get(canonicalTranslation(translation));
        Matcher matcher = REFERENCE.matcher(reference == null ? "" : reference.trim());
        if (!matcher.matches()) {
            return null;
        }

        BibleBook book = state.booksByAlias().get(normalise(matcher.group(1)));
        if (book == null) {
            return null;
        }

        int chapter = Integer.parseInt(matcher.group(2));
        int from = matcher.group(3) == null ? 1 : Integer.parseInt(matcher.group(3));
        int to = matcher.group(4) == null
                ? (matcher.group(3) == null ? from + MAX_VERSES_PER_TOKEN - 1 : from)
                : Integer.parseInt(matcher.group(4));

        return passage(state, target, book, chapter, from, to);
    }

    /** Verses matching a free-text query, in the given translation. */
    public List<Passage> search(String query, String translation, int limit) {
        Loaded state = corpus();
        BibleCorpus target = state.corpora().get(canonicalTranslation(translation));
        List<Passage> results = new ArrayList<>();
        for (BibleVerse verse : target.search(query, limit)) {
            BibleBook book = state.booksById().get(verse.book());
            if (book != null) {
                results.add(new Passage(book, verse.chapter(), verse.verse(), verse.verseEnd(),
                        target.translation(), verse.text()));
            }
        }
        return results;
    }

    private Passage passage(Loaded state, BibleCorpus target, BibleBook book,
                            int chapter, int from, int to) {
        int start = Math.max(1, from);
        int end = Math.min(Math.max(start, to), start + MAX_VERSES_PER_TOKEN - 1);
        List<BibleVerse> verses = target.range(book.id(), chapter, start, end);
        if (verses.isEmpty()) {
            return null;
        }
        StringBuilder text = new StringBuilder();
        for (BibleVerse verse : verses) {
            if (text.length() > 0) {
                text.append(' ');
            }
            text.append(verse.text());
        }
        int last = verses.get(verses.size() - 1).verseEnd();
        return new Passage(book, chapter, verses.get(0).verse(), Math.min(last, end),
                target.translation(), text.toString());
    }

    /**
     * Replaces every {@code [bible:...]} token with the real wording.
     *
     * The token names a translation, but the reader's language wins: a chat message
     * is one shared artefact and cannot be rendered per-reader, so scripture comes
     * out in the language of whoever asked.
     *
     * A coordinate the target translation does not carry is called out rather than
     * quietly skipped — the CUV omits twelve verses the KJV has, and answering
     * "Acts 8:37" with Acts 8:36 would be exactly the silent substitution this
     * design exists to prevent.
     */
    public String render(String text, String language) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        Loaded state = corpus();
        String preferred = translationFor(language);
        BibleCorpus target = state.corpora().get(preferred);

        Matcher matcher = TOKEN.matcher(text);
        StringBuilder out = new StringBuilder();
        int rendered = 0;
        while (matcher.find()) {
            String replacement = "";
            if (rendered < MAX_TOKENS_PER_REPLY) {
                BibleBook book = state.booksById().get(Integer.parseInt(matcher.group(2)));
                if (book != null) {
                    int chapter = Integer.parseInt(matcher.group(3));
                    int from = Integer.parseInt(matcher.group(4));
                    int to = matcher.group(5) == null ? from : Integer.parseInt(matcher.group(5));
                    Passage passage = passage(state, target, book, chapter, from, to);
                    if (passage != null) {
                        replacement = passage.quoted(language);
                        rendered++;
                    } else if (existsAnywhere(state, book, chapter, from)) {
                        replacement = missingNote(book, chapter, from, preferred, language);
                        rendered++;
                    }
                }
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        // Substituting mid-sentence can leave doubled spaces where a token was
        // dropped; tidy those rather than shipping ragged text.
        return out.toString().replaceAll("[ \\t]{2,}", " ").trim();
    }

    private boolean existsAnywhere(Loaded state, BibleBook book, int chapter, int verse) {
        return state.corpora().values().stream()
                .anyMatch(c -> c.at(book.id(), chapter, verse) != null);
    }

    private static String missingNote(BibleBook book, int chapter, int verse,
                                      String translation, String language) {
        String reference = book.nameFor(language) + " " + chapter + ":" + verse;
        String label = translationLabel(translation, language);
        boolean chinese = language != null && language.toLowerCase(Locale.ROOT).startsWith("zh");
        return chinese
                ? "（" + label + "未收录 " + reference + "）"
                : "(" + reference + " is not present in the " + label + ")";
    }

    private static String canonicalTranslation(String translation) {
        return CUV.equalsIgnoreCase(translation) ? CUV : KJV;
    }

    /** A resolved span of scripture, ready to quote or hand to the model. */
    public record Passage(BibleBook book, int chapter, int fromVerse, int toVerse,
                          String translation, String text) {

        public String reference(String language) {
            String name = book.nameFor(language);
            return fromVerse == toVerse
                    ? name + " " + chapter + ":" + fromVerse
                    : name + " " + chapter + ":" + fromVerse + "-" + toVerse;
        }

        /** How a quote appears in a chat bubble. */
        public String quoted(String language) {
            boolean chinese = language != null && language.toLowerCase(Locale.ROOT).startsWith("zh");
            String label = translationLabel(translation, language);
            return chinese
                    ? "「" + text + "」（" + reference(language) + " " + label + "）"
                    : "“" + text + "” (" + reference(language) + ", " + label + ")";
        }
    }
}
