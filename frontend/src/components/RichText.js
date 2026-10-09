import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { parseInlineMarkup } from "../utils/inlineMarkup";

/**
 * A <Text> that honours the lite inline markup (see utils/inlineMarkup.js):
 * *bold*, _italic_, ~struck~. Everything else about it — style, selectable,
 * numberOfLines, onPress — is passed straight through to the underlying Text,
 * and the styled runs are nested Texts, so they inherit size, colour and the
 * reader's text-scaling setting.
 *
 *   <RichText style={styles.body}>{message.content}</RichText>
 *
 * Screens that need to nest their own runs inside (chat bubbles highlight
 * @mentions) use parseInlineMarkup directly and style each span with spanStyle.
 *
 * @param {{ text?: string, children?: any, [prop: string]: any }} props
 *   `text` is the source; when omitted, the string children are used.
 */
export default function RichText({ children, text, ...props }) {
  const source = text != null ? text : childrenToString(children);
  const spans = useMemo(() => parseInlineMarkup(source), [source]);
  return <Text {...props}>{renderSpans(spans)}</Text>;
}

/** The style for one parsed span, or undefined when it carries no markup. */
export function spanStyle(span) {
  if (!span.bold && !span.italic && !span.strike) return undefined;
  return [
    span.bold && styles.bold,
    span.italic && styles.italic,
    span.strike && styles.strike,
  ].filter(Boolean);
}

/** Spans as nested Text nodes. Only ever rendered inside a parent Text. */
export function renderSpans(spans, keyPrefix = "") {
  return spans.map((span, index) => (
    <Text key={`${keyPrefix}${index}`} style={spanStyle(span)}>
      {span.text}
    </Text>
  ));
}

const childrenToString = (children) => {
  if (children == null || children === false) return "";
  if (Array.isArray(children)) return children.map(childrenToString).join("");
  return String(children);
};

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
});
