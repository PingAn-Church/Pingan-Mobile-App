export const ASSESSMENT_VERSION = "1";
export const GIFT_COUNT = 25;
export const QUESTION_COUNT = 125;

export type SupportedLanguage = "en" | "zh";
export type LocalizedText = Record<SupportedLanguage, string>;

export interface SpiritualGiftDefinition {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
}

export interface SpiritualGiftQuestion {
  id: number;
  text: LocalizedText;
}

export interface SpiritualGiftResult {
  assessmentVersion: string;
  scores: number[];
  completedAt: string;
}

export const SPIRITUAL_GIFTS: SpiritualGiftDefinition[] = [
  {
    id: "prophecy",
    name: { zh: "预言", en: "Prophecy" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们领受来自神的即时信息，并以神所恩膏的话语传达给祂的子民。（路7:26；徒15:32、21:9-11；罗12:6；林前12:10、28；弗4:11-14）",
      en: "The special ability God gives certain members of the Body of Christ to receive an immediate message from God and communicate it to His people through divinely anointed words. (Luke 7:26; Acts 15:32; 21:9-11; Rom. 12:6; 1 Cor. 12:10, 28; Eph. 4:11-14)",
    },
  },
  {
    id: "pastoring",
    name: { zh: "牧养", en: "Pastoring" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们长期为一群信徒的属灵福祉承担个人责任。（约10:1-18；弗4:11-14；提前3:1-7；彼前5:1-3）",
      en: "The special ability God gives certain members of the Body of Christ to assume long-term personal responsibility for the spiritual welfare of a group of believers. (John 10:1-18; Eph. 4:11-14; 1 Tim. 3:1-7; 1 Pet. 5:1-3)",
    },
  },
  {
    id: "teaching",
    name: { zh: "教导", en: "Teaching" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们传达与身体及其肢体的健康和事工有关的信息，让别人能够学习。（徒18:24-28、20:20；罗12:7；林前12:28；弗4:11-14）",
      en: "The special ability God gives certain members of the Body of Christ to communicate information relevant to the health and ministry of the Body and its members so that others learn. (Acts 18:24-28; 20:20; Rom. 12:7; 1 Cor. 12:28; Eph. 4:11-14)",
    },
  },
  {
    id: "wisdom",
    name: { zh: "智慧", en: "Wisdom" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们认识圣灵的心意并领受洞见，知道如何把已有的知识恰当地应用于基督身体的具体需要。（徒6:3、10；林前2:1-13、12:8；雅1:5-6；彼后3:15-16）",
      en: "The special ability God gives certain members of the Body of Christ to know the mind of the Holy Spirit and receive insight into how given knowledge may best be applied to specific needs in the Body. (Acts 6:3, 10; 1 Cor. 2:1-13; 12:8; Jas. 1:5-6; 2 Pet. 3:15-16)",
    },
  },
  {
    id: "knowledge",
    name: { zh: "知识", en: "Knowledge" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们发现、累积、分析和澄清与基督身体福祉密切相关的信息和观念。（徒5:1-11；林前2:14、12:8；林后11:6；西2:2-3）",
      en: "The special ability God gives certain members of the Body of Christ to discover, accumulate, analyze, and clarify information and ideas relevant to the well-being of the Body. (Acts 5:1-11; 1 Cor. 2:14; 12:8; 2 Cor. 11:6; Col. 2:2-3)",
    },
  },
  {
    id: "exhortation",
    name: { zh: "劝勉", en: "Exhortation" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们以安慰、鼓励和智慧的话服事其他肢体，让对方感到被帮助和得医治。（徒14:22；罗12:8；提前4:13；来10:25）",
      en: "The special ability God gives certain members of the Body of Christ to minister words of comfort, encouragement, counsel, and wisdom so that others feel helped and strengthened. (Acts 14:22; Rom. 12:8; 1 Tim. 4:13; Heb. 10:25)",
    },
  },
  {
    id: "discernment",
    name: { zh: "辨别诸灵", en: "Discernment" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们能准确判断某些声称出于神的行为，实际是出于神、出于人，还是出于撒但。（太16:21-23；徒5:1-11、16:16-18；林前12:10；约壹4:1-6）",
      en: "The special ability God gives certain members of the Body of Christ to know with assurance whether an action claimed to be from God is divine, human, or satanic. (Matt. 16:21-23; Acts 5:1-11; 16:16-18; 1 Cor. 12:10; 1 John 4:1-6)",
    },
  },
  {
    id: "giving",
    name: { zh: "捐献", en: "Giving" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们慷慨而喜乐地把自己的物质资源奉献于主的工作。（可12:41-44；罗12:8；林后8:1-7、9:2-8）",
      en: "The special ability God gives certain members of the Body of Christ to contribute their material resources to the Lord's work generously and cheerfully. (Mark 12:41-44; Rom. 12:8; 2 Cor. 8:1-7; 9:2-8)",
    },
  },
  {
    id: "helps",
    name: { zh: "帮助", en: "Helps" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们把自己的才干投入其他肢体的生命和事工，帮助对方更有效地运用属灵恩赐。（可15:40-41；路8:2-3；徒9:36；罗16:1-2；林前12:28）",
      en: "The special ability God gives certain members of the Body of Christ to invest their talents in the lives and ministries of others, enabling them to use their spiritual gifts more effectively. (Mark 15:40-41; Luke 8:2-3; Acts 9:36; Rom. 16:1-2; 1 Cor. 12:28)",
    },
  },
  {
    id: "mercy",
    name: { zh: "怜悯", en: "Mercy" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们对身心或情绪上受苦的人产生真实的同理和怜悯，并把怜悯转化为甘心、反映基督之爱并减轻痛苦的行动。（太20:29-34、25:34-40；可9:41；路10:33-35；徒11:28-30、16:33-34；罗12:8）",
      en: "The special ability God gives certain members of the Body of Christ to feel genuine empathy and compassion for people suffering physically, mentally, or emotionally, and to turn that compassion into willing acts that reflect Christ's love and ease suffering. (Matt. 20:29-34; 25:34-40; Mark 9:41; Luke 10:33-35; Acts 11:28-30; 16:33-34; Rom. 12:8)",
    },
  },
  {
    id: "missionary",
    name: { zh: "宣教", en: "Missionary" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们能在另一种文化中运用自己其他的恩赐来服事。（徒8:4、13:2-3、22:21；罗10:15；林前9:19-23）",
      en: "The special ability God gives certain members of the Body of Christ to minister in another culture through the other spiritual gifts they possess. (Acts 8:4; 13:2-3; 22:21; Rom. 10:15; 1 Cor. 9:19-23)",
    },
  },
  {
    id: "evangelism",
    name: { zh: "传福音", en: "Evangelism" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们向未信者分享福音，使人作耶稣的门徒，并成为基督身体中负责任的肢体。（徒8:5-6、8:26-40、14:21、21:8；弗4:11-12；提后4:5）",
      en: "The special ability God gives certain members of the Body of Christ to share the gospel with unbelievers so that people become disciples of Jesus and responsible members of His Body. (Acts 8:5-6; 8:26-40; 14:21; 21:8; Eph. 4:11-12; 2 Tim. 4:5)",
    },
  },
  {
    id: "hospitality",
    name: { zh: "接待", en: "Hospitality" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们向需要食物和住宿的人开放家庭并给予温暖接待。（徒16:14-15；罗12:9-13、16:23；来13:1-2；彼前4:9）",
      en: "The special ability God gives certain members of the Body of Christ to provide an open home and warm welcome to people who need food and lodging. (Acts 16:14-15; Rom. 12:9-13; 16:23; Heb. 13:1-2; 1 Pet. 4:9)",
    },
  },
  {
    id: "faith",
    name: { zh: "信心", en: "Faith" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们带着超乎寻常的确信，辨明神对其事奉的旨意和目的。（徒11:22-24、27:21-25；罗4:18-21；林前12:9；来11）",
      en: "The special ability God gives certain members of the Body of Christ to discern God's will and purposes for ministry with extraordinary confidence. (Acts 11:22-24; 27:21-25; Rom. 4:18-21; 1 Cor. 12:9; Heb. 11)",
    },
  },
  {
    id: "leadership",
    name: { zh: "领导", en: "Leadership" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们按照神对未来的旨意设立目标，并把目标传达给别人，使众人自愿、和谐地为神的荣耀和这些目标共同努力。（路9:51；徒7:10、15:7-11；罗12:8；提前5:17；来13:17）",
      en: "The special ability God gives certain members of the Body of Christ to set goals according to God's purposes for the future and communicate them so that others willingly work together for God's glory. (Luke 9:51; Acts 7:10; 15:7-11; Rom. 12:8; 1 Tim. 5:17; Heb. 13:17)",
    },
  },
  {
    id: "administration",
    name: { zh: "治理", en: "Administration" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们清楚理解一个事工单位当前和长远的目标，并设计、执行能有效达成目标的计划。（路14:28-30；徒6:1-7、27:11；林前12:28；多1:5）",
      en: "The special ability God gives certain members of the Body of Christ to understand a ministry's immediate and long-range goals and to design and carry out effective plans for reaching them. (Luke 14:28-30; Acts 6:1-7; 27:11; 1 Cor. 12:28; Titus 1:5)",
    },
  },
  {
    id: "miracles",
    name: { zh: "神迹", en: "Miracles" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们成为神施行大能作为的器皿；这些作为在观察者看来改变了自然界通常的运作方式。（徒9:36-42、19:11-20、20:7-12；罗15:18-19；林前12:10、28；林后12:12）",
      en: "The special ability God gives certain members of the Body of Christ to serve as instruments through whom God performs powerful acts that observers perceive as altering the ordinary course of nature. (Acts 9:36-42; 19:11-20; 20:7-12; Rom. 15:18-19; 1 Cor. 12:10, 28; 2 Cor. 12:12)",
    },
  },
  {
    id: "healing",
    name: { zh: "医治", en: "Healing" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们成为神医治疾病、使人恢复健康的器皿，而非倚靠自然方法。（徒3:1-10、5:12-16、9:32-35、28:7-10；林前12:9、28）",
      en: "The special ability God gives certain members of the Body of Christ to serve as instruments through whom God heals illness and restores health apart from natural means. (Acts 3:1-10; 5:12-16; 9:32-35; 28:7-10; 1 Cor. 12:9, 28)",
    },
  },
  {
    id: "tongues",
    name: { zh: "方言", en: "Tongues" },
    description: {
      zh: "神赐给基督身体中某些肢体以下一种或两种特殊能力：用自己从未学过的语言向神说话；或借着从未学过、受神恩膏的言语，传达神给祂子民的即时信息。（可16:17；徒2:1-13、10:44-46、19:1-7；林前12:10-28、14:13-19）",
      en: "The special ability God gives certain members of the Body of Christ to speak to God in a language they have never learned, or to communicate an immediate message from God through divinely anointed words in an unlearned language. (Mark 16:17; Acts 2:1-13; 10:44-46; 19:1-7; 1 Cor. 12:10-28; 14:13-19)",
    },
  },
  {
    id: "interpretation",
    name: { zh: "翻方言", en: "Interpretation" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们用本地语言表达说方言者的信息。（林前12:10、30，14:13、26-28）",
      en: "The special ability God gives certain members of the Body of Christ to make the message of one who speaks in tongues known in the language of the listeners. (1 Cor. 12:10, 30; 14:13, 26-28)",
    },
  },
  {
    id: "voluntary-poverty",
    name: { zh: "自愿清贫", en: "Voluntary Poverty" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们放弃物质上的安舒和奢华，选择在社会上与贫穷人相近的生活方式，为要更有效地服事神。（徒2:44-45、4:34-37；林前13:1-3；林后6:10、8:9）",
      en: "The special ability God gives certain members of the Body of Christ to renounce material comfort and luxury and adopt a lifestyle equivalent to that of the poor in order to serve God more effectively. (Acts 2:44-45; 4:34-37; 1 Cor. 13:1-3; 2 Cor. 6:10; 8:9)",
    },
  },
  {
    id: "celibacy",
    name: { zh: "独身", en: "Celibacy" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们能持续享受单身生活，而不会承受过多的性方面试探。（太19:10-12；林前7:7-8）",
      en: "The special ability God gives certain members of the Body of Christ to remain single and enjoy it without suffering undue sexual temptation. (Matt. 19:10-12; 1 Cor. 7:7-8)",
    },
  },
  {
    id: "intercession",
    name: { zh: "代祷", en: "Intercession" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们在持续、恒常的祈求中，经常看见祷告得到具体回应，其程度超过一般对基督徒的期望。（路22:41-44；徒12:12；西1:9-12、4:12-13；提前2:1-2；雅5:14-16）",
      en: "The special ability God gives certain members of the Body of Christ to pray consistently for extended periods and regularly see specific answers beyond what is ordinarily expected of believers. (Luke 22:41-44; Acts 12:12; Col. 1:9-12; 4:12-13; 1 Tim. 2:1-2; Jas. 5:14-16)",
    },
  },
  {
    id: "exorcism",
    name: { zh: "赶鬼", en: "Exorcism" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们能赶出鬼魔和邪灵。（太12:22-32；路10:12-20；徒8:5-8、16:16-18）",
      en: "The special ability God gives certain members of the Body of Christ to cast out demons and evil spirits. (Matt. 12:22-32; Luke 10:12-20; Acts 8:5-8; 16:16-18)",
    },
  },
  {
    id: "service",
    name: { zh: "服事", en: "Service" },
    description: {
      zh: "神赐给基督身体中某些肢体的特殊能力，使他们察觉神的工作中尚未满足的实际需要，并运用现有资源满足这些需要，帮助达成期望的结果。（徒6:1-7；罗12:7；加6:2；提后1:16-18；多3:14）",
      en: "The special ability God gives certain members of the Body of Christ to identify unmet practical needs related to God's work and use available resources to meet them and help achieve the desired result. (Acts 6:1-7; Rom. 12:7; Gal. 6:2; 2 Tim. 1:16-18; Titus 3:14)",
    },
  },
];

// Scoring maps every question onto a gift by position (index % GIFT_COUNT), so a
// gift list of the wrong length silently misattributes every single answer.
if (SPIRITUAL_GIFTS.length !== GIFT_COUNT) {
  throw new Error(`Spiritual gift list must contain ${GIFT_COUNT} gifts, found ${SPIRITUAL_GIFTS.length}`);
}

export function calculateScores(answers: number[]): number[] {
  if (answers.length !== QUESTION_COUNT) {
    throw new Error(`Expected ${QUESTION_COUNT} answers`);
  }
  const scores = Array(GIFT_COUNT).fill(0);
  answers.forEach((answer, index) => {
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw new Error("Answers must be integers from 0 to 3");
    }
    scores[index % GIFT_COUNT] += answer;
  });
  return scores;
}

export function isValidResult(value: unknown): value is SpiritualGiftResult {
  const result = value as SpiritualGiftResult | null;
  return !!result
    && result.assessmentVersion === ASSESSMENT_VERSION
    && Array.isArray(result.scores)
    && result.scores.length === GIFT_COUNT
    && result.scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 15)
    && typeof result.completedAt === "string";
}
