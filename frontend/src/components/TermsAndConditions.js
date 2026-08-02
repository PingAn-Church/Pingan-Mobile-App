import React, { useContext } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LanguageContext } from "../context/LanguageContext";

// Terms & Conditions copy, shared by the Register page (acceptance checkbox +
// modal) and the Settings page (read-only entry). Keep both languages in sync
// when editing, and bump `updated`.
export const TERMS_COPY = {
  en: {
    title: "Terms & Conditions",
    updated: "Last updated: 16 July 2026",
    agreePrefix: "I agree with the ",
    linkText: "Terms & Conditions",
    close: "Close",
    mustAccept:
      "Please read and agree with the Terms & Conditions before registering.",
    sections: [
      {
        title: "1. About this app",
        body:
          "Ping An is a community app for Pingan Church Singapore. It helps users access church information, announcements, events, learning materials, chats, threads, and related community services. The app is not an emergency, medical, legal, financial, or professional advice service.",
      },
      {
        title: "2. Accounts and access",
        body:
          "Please provide accurate registration information and keep your password private. Some features may require email verification or administrator approval. We may suspend, deactivate, or remove accounts that violate these terms, create security risks, or disrupt the community.",
      },
      {
        title: "3. Respectful community conduct",
        body:
          "You agree not to post, send, upload, or encourage harassment, bullying, hate speech, sexually explicit or exploitative content, threats, violence, illegal activity, spam, impersonation, malware, privacy violations, or content that infringes another person's rights.",
      },
      {
        title: "4. User content and moderation",
        body:
          "You are responsible for messages, threads, replies, course reviews, images, voice messages, profile information, and other content you submit. You keep ownership of your content, but grant us permission to host, store, display, transmit, and make it available to the intended app audience so the app can operate. Users may report objectionable content — including chat messages, forum posts and replies, and course reviews. Reported content may be hidden while it awaits review. Administrators review reports and may remove content, restrict access, or deactivate accounts where appropriate.",
      },
      {
        title: "5. Privacy, permissions, and data",
        body:
          "The app may collect and process registration details, profile information, event and application records, check-ins, learning progress, messages, user-submitted media, device information needed for push notifications, and files you choose to upload. We use this data to provide the app, keep accounts secure, notify users, support administration, and improve reliability. We do not sell personal data. Photos, voice messages, and other files may be stored with cloud service providers and may be cached on your device for faster loading. The app does not use your camera and never asks to read your photo library: pictures are chosen through your device's own photo picker, so only the images you pick are shared with the app. Permission is requested only to save an image to your gallery, to record a voice message, and to send notifications.",
      },
      {
        title: "6. Third-party links and services",
        body:
          "The app may open church websites, maps, YouTube, Tencent Video, download links, cloud storage, email, phone, or other third-party services. Those services are controlled by their own providers and may have separate terms and privacy practices.",
      },
      {
        title: "7. Events and learning",
        body:
          "Event details, attendance, applications, and learning content may change from time to time. Participation may be subject to approval, capacity, eligibility, or administrative review. Learning materials are provided for community, educational, and spiritual growth and do not guarantee any certification unless expressly stated.",
      },
      {
        title: "8. Account deletion and retention",
        body:
          "You may delete your account at any time from the Settings page in the app, or request deletion by contacting an administrator. Deleting your account permanently removes your profile and login together with your personal content, including your chat messages and conversations, forum posts and replies, uploaded photos and files, learning records, and certificates. Administrators may also deactivate or permanently delete accounts where allowed by app policy. Some records may be retained where reasonably needed for security, legal compliance, dispute handling, or church administration. Cached media on your device can be cleared from app settings where available.",
      },
      {
        title: "9. Availability, updates, and changes",
        body:
          "We try to keep the app available and accurate, but services may be interrupted, changed, or discontinued. Updates may be required for security or compatibility. We may update these terms from time to time; continued use of the app after changes means you accept the updated terms.",
      },
      {
        title: "10. Contact and governing law",
        body:
          "For questions, concerns, reports, or account requests, contact pinganchurchsingapore@gmail.com or an app administrator. To the extent permitted by law, these terms are governed by the laws of Singapore.",
      },
    ],
  },
  zh: {
    title: "条款与条件",
    updated: "最后更新：2026 年 7 月 16 日",
    agreePrefix: "我同意",
    linkText: "条款与条件",
    close: "关闭",
    mustAccept: "请先阅读并同意条款与条件后再注册。",
    sections: [
      {
        title: "1. 关于本 App",
        body:
          "Ping An 是新加坡平安教会的社区 App，用于提供教会信息、公告、活动、学习资料、聊天、帖子以及相关社区服务。本 App 不是紧急服务，也不提供医疗、法律、财务或其他专业建议。",
      },
      {
        title: "2. 账户与访问权限",
        body:
          "请提供准确的注册信息，并妥善保管你的密码。部分功能可能需要邮箱验证或管理员审核。若账户违反本条款、造成安全风险或干扰社区秩序，我们可能暂停、停用或移除相关账户。",
      },
      {
        title: "3. 尊重社区的使用规范",
        body:
          "你同意不会发布、发送、上传或鼓励骚扰、霸凌、仇恨言论、露骨或剥削性内容、威胁、暴力、违法活动、垃圾信息、冒充他人、恶意软件、侵犯隐私或侵犯他人权利的内容。",
      },
      {
        title: "4. 用户内容与审核",
        body:
          "你需要对自己提交的消息、帖子、回复、课程评价、图片、语音消息、个人资料以及其他内容负责。你仍保留自己内容的权利，但授权我们为了运行 App 而托管、存储、展示、传输，并向相应的 App 用户展示这些内容。用户可以举报不当内容，包括聊天消息、论坛帖子与回复以及课程评价。被举报的内容在审核期间可能会被隐藏。管理员会审核举报，并可在适当情况下移除内容、限制访问或停用账户。",
      },
      {
        title: "5. 隐私、权限与数据",
        body:
          "本 App 可能收集和处理注册信息、个人资料、活动和申请记录、签到记录、学习进度、消息、用户上传的媒体、推送通知所需的设备信息，以及你选择上传的文件。我们使用这些数据来提供 App 功能、保障账户安全、发送通知、支持管理工作并提升可靠性。我们不会出售个人数据。照片、语音消息和其他文件可能存储在云服务提供商处，也可能缓存在你的设备上以加快加载速度。本 App 不使用相机，也不会请求读取你的照片库：图片通过设备自带的照片选择器选取，因此只有你选中的图片会提供给 App。仅在将图片保存到相册、录制语音消息以及发送通知时才会请求相应权限。",
      },
      {
        title: "6. 第三方链接与服务",
        body:
          "本 App 可能打开教会网站、地图、YouTube、腾讯视频、下载链接、云存储、电子邮件、电话或其他第三方服务。这些服务由各自的提供方控制，并可能适用其自己的条款和隐私规则。",
      },
      {
        title: "7. 活动与学习内容",
        body:
          "活动详情、出席安排、申请事项和学习内容可能会不时变更。参与活动或使用部分功能可能受审核、容量、资格或管理安排限制。学习资料用于社区、教育和属灵成长，除非另有明确说明，否则不保证获得任何认证。",
      },
      {
        title: "8. 账户删除与数据保留",
        body:
          "你可以随时在 App 的设置页面删除自己的账户，也可以联系管理员申请删除。删除账户会永久移除你的个人资料和登录信息，以及你的个人内容，包括聊天消息和会话、论坛帖子与回复、上传的照片和文件、学习记录与证书。管理员也可在 App 政策允许的情况下停用或永久删除账户。出于安全、法律合规、争议处理或教会管理需要，部分记录可能会被合理保留。设备上的媒体缓存可在 App 设置中清除（如该功能可用）。",
      },
      {
        title: "9. 可用性、更新与变更",
        body:
          "我们会尽力保持 App 可用且信息准确，但服务可能中断、变更或停止。出于安全或兼容性原因，可能需要安装更新。我们可能不时更新本条款；条款更新后继续使用 App 即表示你接受更新后的条款。",
      },
      {
        title: "10. 联系方式与适用法律",
        body:
          "如有问题、疑虑、举报或账户相关请求，请联系 pinganchurchsingapore@gmail.com 或 App 管理员。在法律允许的范围内，本条款受新加坡法律管辖。",
      },
    ],
  },
};

/** The full Terms & Conditions in a modal, in the app's current language. */
export default function TermsModal({ visible, onClose }) {
  const { language } = useContext(LanguageContext);
  const termsCopy = TERMS_COPY[language] || TERMS_COPY.en;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.termsModal}>
          <View style={styles.termsHeader}>
            <Text style={styles.termsTitle}>{termsCopy.title}</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={termsCopy.close}
              style={styles.termsIconButton}
            >
              <Ionicons name="close" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          <Text style={styles.termsUpdated}>{termsCopy.updated}</Text>

          <ScrollView
            style={styles.termsScroll}
            contentContainerStyle={styles.termsScrollContent}
          >
            {termsCopy.sections.map((section) => (
              <View key={section.title} style={styles.termsSection}>
                <Text style={styles.termsSectionTitle}>{section.title}</Text>
                <Text style={styles.termsSectionBody}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.termsCloseButton} onPress={onClose}>
            <Text style={styles.termsCloseButtonText}>{termsCopy.close}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  termsModal: {
    maxHeight: "86%",
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  termsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  termsTitle: {
    flex: 1,
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    paddingRight: 12,
  },
  termsIconButton: {
    padding: 4,
  },
  termsUpdated: {
    color: "#666",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  termsScroll: {
    maxHeight: 480,
    // Let the terms body shrink on short screens so the header and the Close
    // button always stay inside the modal's 86% height cap (RN children default
    // to flexShrink: 0, which would otherwise clip the button).
    flexShrink: 1,
  },
  termsScrollContent: {
    paddingBottom: 8,
  },
  termsSection: {
    marginBottom: 14,
  },
  termsSectionTitle: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  termsSectionBody: {
    color: "#333",
    fontSize: 14,
    lineHeight: 20,
  },
  termsCloseButton: {
    backgroundColor: "#007bff",
    borderRadius: 6,
    alignItems: "center",
    paddingVertical: 11,
    marginTop: 10,
  },
  termsCloseButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
