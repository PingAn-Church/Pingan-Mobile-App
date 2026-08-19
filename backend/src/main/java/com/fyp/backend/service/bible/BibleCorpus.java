package com.fyp.backend.service.bible;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One translation, held in memory.
 *
 * The corpus is immutable reference data that is only ever read, so a database
 * table would buy nothing and cost a migration, a 62k-row boot insert and an
 * interaction with ddl-auto. Roughly 8 MB of text across both translations.
 *
 * Coordinates are packed into a single int key — book (1-66), chapter and verse
 * all fit — which keeps the index a flat HashMap rather than three nested ones.
 */
public class BibleCorpus {

    /** Chapters and verses both stay under 1000 (Psalm 119 is the longest, at 176). */
    static int key(int book, int chapter, int verse) {
        return (book * 1000 + chapter) * 1000 + verse;
    }

    private final String translation;
    private final List<BibleVerse> verses;

    /**
     * Every addressable coordinate, including the ones covered by a bridged verse.
     *
     * The CUV merges 70 verse pairs ("1-2"); the KJV numbers them separately. Both
     * numbers are registered against the merged row here, so asking for Numbers 1:21
     * in Chinese finds the row that actually contains it instead of nothing. This is
     * what makes "search the English, render the Chinese" work without a mapping table.
     */
    private final Map<Integer, BibleVerse> byCoordinate;

    /** token/bigram -> the coordinates it appears in. Built once, on first search. */
    private Map<String, int[]> searchIndex;
    private final boolean cjk;

    BibleCorpus(String translation, List<BibleVerse> verses, boolean cjk) {
        this.translation = translation;
        this.verses = List.copyOf(verses);
        this.cjk = cjk;
        this.byCoordinate = new HashMap<>(verses.size() * 2);
        for (BibleVerse verse : verses) {
            for (int v = verse.verse(); v <= verse.verseEnd(); v++) {
                byCoordinate.putIfAbsent(key(verse.book(), verse.chapter(), v), verse);
            }
        }
    }

    public String translation() {
        return translation;
    }

    public int size() {
        return verses.size();
    }

    /**
     * The verse at a coordinate, or empty when this translation does not carry it.
     *
     * Empty is a real answer, not a failure: the CUV's base text omits twelve verses
     * the KJV has (Matthew 18:11, Acts 8:37 and so on). Callers must say so rather
     * than fall back to a neighbour — handing someone Acts 8:36 when they asked for
     * 8:37 is precisely the sort of quiet substitution this whole design exists to
     * prevent.
     */
    public BibleVerse at(int book, int chapter, int verse) {
        return byCoordinate.get(key(book, chapter, verse));
    }

    /** Distinct verses across an inclusive range, in order. */
    public List<BibleVerse> range(int book, int chapter, int fromVerse, int toVerse) {
        Set<BibleVerse> found = new LinkedHashSet<>();
        for (int v = fromVerse; v <= toVerse; v++) {
            BibleVerse verse = at(book, chapter, v);
            if (verse != null) {
                found.add(verse);
            }
        }
        return new ArrayList<>(found);
    }

    /**
     * Coordinates matching every term in the query, best-covered first.
     *
     * Latin text is tokenised on word boundaries. Chinese has none — Postgres
     * full-text search cannot segment it at all, which is one of the reasons this
     * lives in memory — so CJK is indexed as overlapping character bigrams. 爱邻舍
     * becomes 爱邻 + 邻舍, and a search for 邻舍 finds it without a segmenter.
     */
    public List<BibleVerse> search(String query, int limit) {
        List<String> terms = terms(query);
        if (terms.isEmpty()) {
            return List.of();
        }
        ensureSearchIndex();

        Map<Integer, Integer> hits = new HashMap<>();
        for (String term : terms) {
            int[] postings = searchIndex.get(term);
            if (postings == null) {
                continue;
            }
            for (int coordinate : postings) {
                hits.merge(coordinate, 1, Integer::sum);
            }
        }
        if (hits.isEmpty()) {
            return List.of();
        }

        int required = terms.size();
        List<BibleVerse> results = new ArrayList<>();
        // Prefer verses containing every term; fall back to partial matches only if
        // nothing covers the whole query, so a two-word search is not swamped by
        // verses that merely contain "the".
        for (int need = required; need >= 1 && results.isEmpty(); need--) {
            final int threshold = need;
            List<Map.Entry<Integer, Integer>> ranked = hits.entrySet().stream()
                    .filter(e -> e.getValue() >= threshold)
                    .sorted((a, b) -> b.getValue() - a.getValue() != 0
                            ? b.getValue() - a.getValue()
                            : a.getKey() - b.getKey())
                    .limit(limit)
                    .toList();
            for (Map.Entry<Integer, Integer> entry : ranked) {
                BibleVerse verse = byCoordinate.get(entry.getKey());
                if (verse != null && !results.contains(verse)) {
                    results.add(verse);
                }
            }
        }
        return results;
    }

    private synchronized void ensureSearchIndex() {
        if (searchIndex != null) {
            return;
        }
        Map<String, List<Integer>> building = new HashMap<>();
        for (BibleVerse verse : verses) {
            int coordinate = key(verse.book(), verse.chapter(), verse.verse());
            for (String term : new LinkedHashSet<>(terms(verse.text()))) {
                building.computeIfAbsent(term, t -> new ArrayList<>()).add(coordinate);
            }
        }
        Map<String, int[]> compacted = new HashMap<>(building.size() * 2);
        building.forEach((term, postings) -> {
            int[] packed = new int[postings.size()];
            for (int i = 0; i < packed.length; i++) {
                packed[i] = postings.get(i);
            }
            compacted.put(term, packed);
        });
        searchIndex = compacted;
    }

    /** Query and verse text are tokenised the same way, or nothing would match. */
    private List<String> terms(String text) {
        String value = text == null ? "" : text.toLowerCase();
        return cjk ? bigrams(value) : words(value);
    }

    private static List<String> words(String text) {
        List<String> words = new ArrayList<>();
        for (String candidate : text.split("[^\\p{L}\\p{N}]+")) {
            if (candidate.length() > 1) {
                words.add(candidate);
            }
        }
        return words;
    }

    private static List<String> bigrams(String text) {
        StringBuilder letters = new StringBuilder();
        text.codePoints().filter(Character::isLetterOrDigit).forEach(letters::appendCodePoint);
        List<String> grams = new ArrayList<>();
        for (int i = 0; i + 1 < letters.length(); i++) {
            grams.add(letters.substring(i, i + 2));
        }
        // A single character is a legitimate query even though it forms no bigram.
        if (grams.isEmpty() && letters.length() == 1) {
            grams.add(letters.toString());
        }
        return grams;
    }

    Collection<BibleVerse> all() {
        return verses;
    }
}
