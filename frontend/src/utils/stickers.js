import i18n from "../../i18n";

// The stickers that ship with the app, in panel order (4 x 2).
//
// The server holds the twin of this table (StickerCatalog.java): it checks the
// id on every send and writes the message body as the sticker's fallback
// emoji. Ids are permanent — stored messages point at them — and namespaced by
// pack so a later pack cannot collide. The pictures are bundled, so each needs
// a literal require() for the bundler to find it.
export const STICKERS = [
  { id: "basic.hello", emoji: "👋", labelKey: "stickerHello", source: require("../../assets/stickerpack/hello.gif") },
  { id: "basic.praying", emoji: "🙏", labelKey: "stickerPraying", source: require("../../assets/stickerpack/praying.gif") },
  { id: "basic.hug", emoji: "🤗", labelKey: "stickerHug", source: require("../../assets/stickerpack/hug.gif") },
  { id: "basic.cheers", emoji: "🍷", labelKey: "stickerCheers", source: require("../../assets/stickerpack/cheers.gif") },
  { id: "basic.fingerheart", emoji: "❤️", labelKey: "stickerFingerheart", source: require("../../assets/stickerpack/fingerheart.gif") },
  { id: "basic.itsokay", emoji: "🐑", labelKey: "stickerItsokay", source: require("../../assets/stickerpack/itsokay.gif") },
  { id: "basic.what", emoji: "❓", labelKey: "stickerWhat", source: require("../../assets/stickerpack/what.gif") },
  { id: "basic.speechless", emoji: "🤦", labelKey: "stickerSpeechless", source: require("../../assets/stickerpack/speechless.gif") },
];

// "❤️" and "❤" are the same heart with and without the presentation selector.
const plain = (value) => String(value || "").replace(/️/g, "").trim();

const BY_ID = Object.fromEntries(STICKERS.map((sticker) => [sticker.id, sticker]));
const BY_EMOJI = Object.fromEntries(STICKERS.map((sticker) => [plain(sticker.emoji), sticker]));

export const stickerById = (id) => (id ? BY_ID[String(id)] || null : null);

/**
 * The bundled sticker a message shows, or null when this build has no picture
 * for it — in which case the message is drawn as text from its body, which the
 * server wrote as the sticker's emoji.
 *
 * Two cases reach the null: a sticker from a pack newer than this build (its id
 * is unknown here), and anything that is not a sticker. One case is rescued: a
 * sticker message with NO id at all, which is what a server that predates
 * stickers hands back (it stores the type and the body and drops the field it
 * does not know). The body is still the emoji this app sent, so it is mapped
 * back. An id that is present but unknown is never second-guessed that way — a
 * future sticker may well reuse an emoji.
 */
export const stickerForMessage = (message) => {
  if (String(message?.type || "").toLowerCase() !== "sticker") return null;
  if (message.stickerId) return stickerById(message.stickerId);
  return BY_EMOJI[plain(message.content)] || null;
};

export const stickerLabel = (sticker) => (sticker ? i18n.t(sticker.labelKey) : "");
