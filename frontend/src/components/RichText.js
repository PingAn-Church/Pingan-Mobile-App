import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { parseInlineMarkup } from "../utils/inlineMarkup";
import { parseMarkupAndLinks } from "../utils/links";
import { openLink } from "../utils/openLink";

/**
 * A <Text> that honours the lite inline markup (see utils/inlineMarkup.js):
 * *bold*, _italic_, ~struck~. Everything else about it — style, selectable,
 * numberOfLines, onPress — is passed straight through to the underlying Text,
 * and the styled runs are nested Texts, so they inherit size, colour and the
 * reader's text-scaling setting.
 *
 *   <RichText style={styles.body}>{message.content}</RichText>
 *
 * With `links`, web addresses in the text (see utils/links.js) are drawn
 * underlined and open in the phone's browser when tapped. Off by default, so
 * a line inside a tappable row does not grow targets of its own.
 *
 *   <RichText links style={styles.body}>{message.content}</RichText>
 *
 * Screens that need to nest their own runs inside (chat bubbles highlight
 * @mentions) use parseMarkupAndLinks directly and style each span with spanStyle.
 *
 * @param {{ text?: string, children?: any, links?: boolean, linkStyle?: any,
 *   onLinkLongPress?: Function, [prop: string]: any }} props
 *   `text` is the source; when omitted, the string children are used.
 *   `linkStyle` replaces the default blue underline. `onLinkLongPress` keeps a
 *   parent's long-press (a context menu) reachable from the link itself, which
 *   would otherwise swallow it.
 */
export default function RichText({
  children,
  text,
  links = false,
  linkStyle,
  onLinkLongPress,
  ...props
}) {
  const source = text != null ? text : childrenToString(children);
  const spans = useMemo(
    () => (links ? parseMarkupAndLinks(source) : parseInlineMarkup(source)),
    [source, links]
  );
  return <Text {...props}>{renderSpans(spans, "", { linkStyle, onLinkLongPress })}</Text>;
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

/**
 * Spans as nested Text nodes. Only ever rendered inside a parent Text. A span
 * carrying a url is tappable; see RichText for `linkStyle` and `onLinkLongPress`.
 */
export function renderSpans(spans, keyPrefix = "", { linkStyle, onLinkLongPress } = {}) {
  return spans.map((span, index) =>
    span.url ? (
      <Text
        key={`${keyPrefix}${index}`}
        style={[spanStyle(span), linkStyle || styles.link]}
        onPress={() => openLink(span.url)}
        onLongPress={onLinkLongPress}
        accessibilityRole="link"
      >
        {span.text}
      </Text>
    ) : (
      <Text key={`${keyPrefix}${index}`} style={spanStyle(span)}>
        {span.text}
      </Text>
    )
  );
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
  link: { color: "#0A84FF", textDecorationLine: "underline" },
});
