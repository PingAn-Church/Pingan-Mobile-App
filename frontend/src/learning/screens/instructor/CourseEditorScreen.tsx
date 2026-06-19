import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants";
import CourseCoverImage from "@/components/CourseCoverImage";
import { getCategories, getCourseDetail } from "@/services/courseService";
import { getPresignedUploadUrl, uploadFileToOSS } from "../../../service/OSSService";
import * as authoring from "@/services/authoringService";
import { confirmDestructive, notify } from "@/utils/alerts";
import {
  getQuizDetail,
  createQuiz,
  deleteQuiz,
  createQuestion,
  deleteQuestion,
  type QuizDetail,
  type QuestionType,
} from "@/services/quizService";
import type { LearningCategory, LearningCourseDetail } from "@/types";

type LessonKind = "video" | "resource";

const CATEGORY_COLORS = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "multiple-choice", label: "Single choice" },
  { value: "multiple-correct", label: "Multi select" },
  { value: "true-false", label: "True / False" },
  { value: "short-answer", label: "Short answer" },
  { value: "matching", label: "Matching" },
];

export default function CourseEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [courseId, setCourseId] = useState<string | null>(route.params?.courseId ?? null);
  const [loading, setLoading] = useState<boolean>(!!route.params?.courseId);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState("0");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [categoryName, setCategoryName] = useState<string>("General");
  const [outcomes, setOutcomes] = useState<string[]>([]);

  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [detail, setDetail] = useState<LearningCourseDetail | null>(null);

  // category create/edit modal (id present => editing an existing category)
  const [categoryModal, setCategoryModal] = useState<{ visible: boolean; id?: string; name: string; color: string; origName?: string }>(
    { visible: false, name: "", color: CATEGORY_COLORS[0] }
  );
  // manage-categories modal (list with edit/delete)
  const [manageVisible, setManageVisible] = useState(false);
  // section modal
  const [sectionModal, setSectionModal] = useState<{ visible: boolean; id?: string; title: string; description: string }>(
    { visible: false, title: "", description: "" }
  );
  // lesson modal
  const [lessonModal, setLessonModal] = useState<{
    visible: boolean;
    kind: LessonKind;
    sectionId: string;
    title: string;
    url: string;
    durationMinutes: string;
    resourceType: string;
    isPreview: boolean;
  }>({ visible: false, kind: "video", sectionId: "", title: "", url: "", durationMinutes: "", resourceType: "pdf", isPreview: false });

  // quiz modal (create a quiz on a module)
  const [quizModal, setQuizModal] = useState<{ visible: boolean; sectionId: string; title: string; passingScore: string }>(
    { visible: false, sectionId: "", title: "", passingScore: "70" }
  );
  // question editor (manage questions inside a quiz)
  const [questionEditor, setQuestionEditor] = useState<{ visible: boolean; quiz: QuizDetail | null; loading: boolean }>(
    { visible: false, quiz: null, loading: false }
  );
  // question modal (add a question to the open quiz)
  const [questionModal, setQuestionModal] = useState<{
    visible: boolean;
    quizId: string;
    questionType: QuestionType;
    question: string;
    points: string;
    optionsText: string;
    correctText: string;
    tfValue: "True" | "False";
    pairsText: string;
  }>({ visible: false, quizId: "", questionType: "multiple-choice", question: "", points: "1", optionsText: "", correctText: "", tfValue: "True", pairsText: "" });

  useEffect(() => {
    navigation.setOptions({ title: courseId ? "Edit Course" : "New Course" });
    (async () => {
      try {
        setCategories(await getCategories());
      } catch {}
      if (courseId) {
        await loadAll(courseId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async (id: string) => {
    setLoading(true);
    try {
      const d = await getCourseDetail(id);
      setDetail(d);
      setTitle(d.title);
      setDescription(d.description);
      setDurationHours(String(d.durationHours));
      setThumbnailUrl(d.thumbnailUrl || "");
      setTags((d.tags || []).join(", "));
      setIsPublished(!!d.isPublished);
      setCategoryName(d.categoryName || "General");
      setOutcomes(d.outcomes || []);
    } catch {
      notify("Error", "Could not load course.");
    } finally {
      setLoading(false);
    }
  };

  const reloadContent = async (id: string) => {
    try {
      setDetail(await getCourseDetail(id));
    } catch {}
  };

  const courseBody = () => ({
    title: title.trim(),
    description: description.trim(),
    durationHours: Number(durationHours) || 0,
    thumbnailUrl: thumbnailUrl.trim() || null,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    isPublished,
    categoryName,
  });

  const handleSaveCourse = async () => {
    if (!title.trim()) {
      notify("Required", "Please enter a course title.");
      return;
    }
    setSaving(true);
    try {
      const cleanOutcomes = outcomes.map((o) => o.trim()).filter(Boolean);
      if (!courseId) {
        const res = await authoring.createCourse(courseBody());
        const newId = String(res?.data?.id ?? res?.id ?? "");
        if (newId) {
          await authoring.setCourseOutcomes(newId, cleanOutcomes);
          setCourseId(newId);
          navigation.setParams({ courseId: newId });
          await loadAll(newId);
        }
      } else {
        await authoring.updateCourse(courseId, courseBody());
        await authoring.setCourseOutcomes(courseId, cleanOutcomes);
        await reloadContent(courseId);
      }
      notify("Saved", "Course saved successfully.");
    } catch (e: any) {
      notify("Error", e?.message || "Failed to save course.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = () => {
    if (!courseId) return;
    confirmDestructive("Delete course", "This permanently deletes the course and its content.", "Delete", async () => {
      try {
        await authoring.deleteCourse(courseId);
        navigation.goBack();
      } catch (e: any) {
        notify("Error", e?.message || "Failed to delete.");
      }
    });
  };

  // ---- cover image --------------------------------------------------
  const handlePickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    setUploadingCover(true);
    try {
      const presignedUrl = await getPresignedUploadUrl(`course_cover_${Date.now()}.jpeg`, "course");
      const uploadedUrl = await uploadFileToOSS(result.assets[0].uri, presignedUrl);
      setThumbnailUrl(uploadedUrl);
    } catch (e: any) {
      notify("Error", e?.message || "Failed to upload the cover image.");
    } finally {
      setUploadingCover(false);
    }
  };

  // ---- categories ---------------------------------------------------
  const saveCategory = async () => {
    const name = categoryModal.name.trim();
    if (!name) {
      notify("Required", "Category name is required.");
      return;
    }
    try {
      if (categoryModal.id) {
        await authoring.updateCategory(categoryModal.id, { name, color: categoryModal.color });
        // Follow the rename if we just edited the currently selected category.
        if (categoryName === categoryModal.origName) setCategoryName(name);
      } else {
        await authoring.createCategory({ name, color: categoryModal.color });
        setCategoryName(name);
      }
      setCategories(await getCategories());
      setCategoryModal({ visible: false, name: "", color: CATEGORY_COLORS[0] });
    } catch (e: any) {
      notify("Error", e?.message || "Failed to save category.");
    }
  };

  const openEditCategory = (c: LearningCategory) =>
    setCategoryModal({ visible: true, id: c.id, name: c.name, color: c.color || CATEGORY_COLORS[0], origName: c.name });

  const removeCategory = (c: LearningCategory) => {
    confirmDestructive(
      "Delete category",
      `Delete "${c.name}"? Courses in it move to General.`,
      "Delete",
      async () => {
        try {
          await authoring.deleteCategory(c.id);
          setCategories(await getCategories());
          if (categoryName === c.name) setCategoryName("General");
        } catch (e: any) {
          notify("Error", e?.message || "Failed to delete the category.");
        }
      }
    );
  };

  // ---- outcomes -----------------------------------------------------
  const addOutcome = () => setOutcomes((o) => [...o, ""]);
  const setOutcome = (i: number, v: string) =>
    setOutcomes((o) => o.map((x, idx) => (idx === i ? v : x)));
  const removeOutcome = (i: number) => setOutcomes((o) => o.filter((_, idx) => idx !== i));

  // ---- sections -----------------------------------------------------
  const saveSection = async () => {
    if (!courseId || !sectionModal.title.trim()) {
      notify("Required", "Module title is required.");
      return;
    }
    try {
      if (sectionModal.id) {
        await authoring.updateSection(sectionModal.id, {
          title: sectionModal.title.trim(),
          description: sectionModal.description.trim(),
        });
      } else {
        await authoring.createSection({
          courseId,
          title: sectionModal.title.trim(),
          description: sectionModal.description.trim(),
        });
      }
      setSectionModal({ visible: false, title: "", description: "" });
      await reloadContent(courseId);
    } catch (e: any) {
      notify("Error", e?.message || "Failed to save module.");
    }
  };

  const removeSection = (id: string) => {
    confirmDestructive("Delete module", "Delete this module and its lessons?", "Delete", async () => {
      try {
        await authoring.deleteSection(id);
        if (courseId) await reloadContent(courseId);
      } catch (e: any) {
        notify("Error", e?.message || "Failed to delete the module.");
      }
    });
  };

  // ---- lessons ------------------------------------------------------
  const openAddLesson = (sectionId: string, kind: LessonKind) =>
    setLessonModal({
      visible: true,
      kind,
      sectionId,
      title: "",
      url: "",
      durationMinutes: "",
      resourceType: "pdf",
      isPreview: false,
    });

  const saveLesson = async () => {
    if (!courseId || !lessonModal.title.trim()) {
      notify("Required", "Lesson title is required.");
      return;
    }
    try {
      if (lessonModal.kind === "video") {
        await authoring.createVideo({
          courseId,
          sectionId: lessonModal.sectionId,
          title: lessonModal.title.trim(),
          videoUrl: lessonModal.url.trim(),
          durationSeconds: Math.round((Number(lessonModal.durationMinutes) || 0) * 60),
          isPreview: lessonModal.isPreview,
        });
      } else {
        await authoring.createResource({
          courseId,
          sectionId: lessonModal.sectionId,
          title: lessonModal.title.trim(),
          resourceUrl: lessonModal.url.trim(),
          resourceType: lessonModal.resourceType,
          isPreview: lessonModal.isPreview,
        });
      }
      setLessonModal((m) => ({ ...m, visible: false }));
      await reloadContent(courseId);
    } catch (e: any) {
      notify("Error", e?.message || "Failed to add lesson.");
    }
  };

  const removeLesson = (kind: LessonKind, id: string) => {
    confirmDestructive("Delete lesson", "Remove this lesson?", "Delete", async () => {
      try {
        if (kind === "video") await authoring.deleteVideo(id);
        else await authoring.deleteResource(id);
        if (courseId) await reloadContent(courseId);
      } catch (e: any) {
        notify("Error", e?.message || "Failed to delete the lesson.");
      }
    });
  };

  // ---- quizzes ------------------------------------------------------
  const openAddQuiz = (sectionId: string) =>
    setQuizModal({ visible: true, sectionId, title: "", passingScore: "70" });

  const saveQuiz = async () => {
    if (!courseId || !quizModal.title.trim()) {
      notify("Required", "Quiz title is required.");
      return;
    }
    try {
      await createQuiz({
        courseId,
        sectionId: quizModal.sectionId,
        title: quizModal.title.trim(),
        passingScore: Number(quizModal.passingScore) || 70,
      });
      setQuizModal((m) => ({ ...m, visible: false }));
      await reloadContent(courseId);
    } catch (e: any) {
      notify("Error", e?.message || "Failed to create quiz.");
    }
  };

  const removeQuiz = (id: string) => {
    confirmDestructive("Delete quiz", "Delete this quiz and its questions?", "Delete", async () => {
      try {
        await deleteQuiz(id);
        if (courseId) await reloadContent(courseId);
      } catch (e: any) {
        notify("Error", e?.message || "Failed to delete the quiz.");
      }
    });
  };

  const openQuizEditor = async (quizId: string) => {
    setQuestionEditor({ visible: true, quiz: null, loading: true });
    try {
      const quiz = await getQuizDetail(quizId);
      setQuestionEditor({ visible: true, quiz, loading: false });
    } catch {
      setQuestionEditor({ visible: false, quiz: null, loading: false });
      notify("Error", "Could not load the quiz.");
    }
  };

  const reloadQuestions = async (quizId: string) => {
    try {
      const quiz = await getQuizDetail(quizId);
      setQuestionEditor((s) => ({ ...s, quiz }));
    } catch {}
  };

  // ---- questions ----------------------------------------------------
  const openAddQuestion = (quizId: string) =>
    setQuestionModal({
      visible: true,
      quizId,
      questionType: "multiple-choice",
      question: "",
      points: "1",
      optionsText: "",
      correctText: "",
      tfValue: "True",
      pairsText: "",
    });

  const saveQuestion = async () => {
    const m = questionModal;
    if (!m.question.trim()) {
      notify("Required", "Question text is required.");
      return;
    }
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const body: Record<string, any> = {
      quizId: m.quizId,
      question: m.question.trim(),
      questionType: m.questionType,
      points: Number(m.points) || 1,
    };
    if (m.questionType === "multiple-choice") {
      body.options = lines(m.optionsText);
      body.correctAnswer = m.correctText.trim();
    } else if (m.questionType === "multiple-correct") {
      body.options = lines(m.optionsText);
      body.correctAnswer = m.correctText.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (m.questionType === "true-false") {
      body.options = ["True", "False"];
      body.correctAnswer = m.tfValue;
    } else if (m.questionType === "short-answer") {
      body.correctAnswer = m.correctText.trim();
    } else if (m.questionType === "matching") {
      const pairs = lines(m.pairsText)
        .map((l) => {
          const [left, right] = l.split("=>");
          return { left: (left || "").trim(), right: (right || "").trim() };
        })
        .filter((p) => p.left && p.right);
      if (pairs.length === 0) {
        notify("Required", "Enter at least one pair as 'left => right'.");
        return;
      }
      body.correctAnswer = pairs;
    }

    // Validate answers are present for graded types.
    if (m.questionType !== "matching") {
      const hasAnswer = Array.isArray(body.correctAnswer)
        ? body.correctAnswer.length > 0
        : String(body.correctAnswer ?? "").length > 0;
      if (!hasAnswer) {
        notify("Required", "Please provide the correct answer.");
        return;
      }
    }

    try {
      await createQuestion(body);
      setQuestionModal((s) => ({ ...s, visible: false }));
      await reloadQuestions(m.quizId);
    } catch (e: any) {
      notify("Error", e?.message || "Failed to add question.");
    }
  };

  const removeQuestion = (quizId: string, questionId: string) => {
    confirmDestructive("Delete question", "Remove this question?", "Delete", async () => {
      try {
        await deleteQuestion(questionId);
        await reloadQuestions(quizId);
      } catch (e: any) {
        notify("Error", e?.message || "Failed to delete the question.");
      }
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.secondary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Course title" placeholderTextColor={Colors.textMuted} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="What is this course about?"
        placeholderTextColor={Colors.textMuted}
        multiline
      />

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {[{ id: "general", name: "General" }, ...categories.map((c) => ({ id: c.id, name: c.name }))]
          .filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i)
          .map((c) => {
            const active = categoryName === c.name;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategoryName(c.name)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        <TouchableOpacity
          style={[styles.chip, styles.chipNew]}
          onPress={() => setCategoryModal({ visible: true, name: "", color: CATEGORY_COLORS[0] })}
        >
          <Ionicons name="add" size={15} color={Colors.secondary} />
          <Text style={[styles.chipText, { color: Colors.secondary }]}>New</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, styles.chipManage]}
          onPress={() => setManageVisible(true)}
          accessibilityLabel="Manage categories"
        >
          <Ionicons name="settings-outline" size={15} color={Colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Duration (hours)</Text>
          <TextInput style={styles.input} value={durationHours} onChangeText={setDurationHours} keyboardType="numeric" />
        </View>
      </View>

      <Text style={styles.label}>Cover image</Text>
      {!!thumbnailUrl && <CourseCoverImage uri={thumbnailUrl} style={styles.coverPreview} />}
      <View style={styles.coverRow}>
        <TouchableOpacity style={styles.coverBtn} onPress={handlePickCover} disabled={uploadingCover}>
          <Ionicons name="image-outline" size={18} color={Colors.secondary} />
          <Text style={styles.coverBtnText}>
            {uploadingCover ? "Uploading..." : thumbnailUrl ? "Change image" : "Choose image"}
          </Text>
        </TouchableOpacity>
        {!!thumbnailUrl && !uploadingCover && (
          <TouchableOpacity style={styles.coverBtn} onPress={() => setThumbnailUrl("")}>
            <Ionicons name="trash-outline" size={18} color={Colors.red} />
            <Text style={[styles.coverBtnText, { color: Colors.red }]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
      <TextInput style={styles.input} value={thumbnailUrl} onChangeText={setThumbnailUrl} placeholder="...or paste an image URL (https://...)" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />

      <Text style={styles.label}>Tags (comma separated)</Text>
      <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="java, backend" placeholderTextColor={Colors.textMuted} autoCapitalize="none" />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Published</Text>
        <Switch value={isPublished} onValueChange={setIsPublished} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Learning outcomes</Text>
        <TouchableOpacity onPress={addOutcome}>
          <Ionicons name="add-circle" size={24} color={Colors.secondary} />
        </TouchableOpacity>
      </View>
      {outcomes.map((o, i) => (
        <View key={i} style={styles.outcomeRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={o}
            onChangeText={(v) => setOutcome(i, v)}
            placeholder="Learners will be able to..."
            placeholderTextColor={Colors.textMuted}
          />
          <TouchableOpacity onPress={() => removeOutcome(i)}>
            <Ionicons name="trash-outline" size={22} color={Colors.red} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCourse} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? "Saving..." : courseId ? "Save Course" : "Create Course"}</Text>
      </TouchableOpacity>

      {/* Content management (after the course exists) */}
      {courseId && (
        <View style={{ marginTop: 28 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Course content</Text>
            <TouchableOpacity onPress={() => setSectionModal({ visible: true, title: "", description: "" })}>
              <Ionicons name="add-circle" size={24} color={Colors.secondary} />
            </TouchableOpacity>
          </View>

          {(detail?.modules ?? []).length === 0 ? (
            <Text style={styles.muted}>No modules yet. Add one to start.</Text>
          ) : (
            detail!.modules.map((m, idx) => (
              <View key={m.id} style={styles.module}>
                <View style={styles.moduleHeader}>
                  <Text style={styles.moduleTitle} numberOfLines={1}>
                    {idx + 1}. {m.title}
                  </Text>
                  <View style={styles.moduleActions}>
                    <TouchableOpacity
                      onPress={() =>
                        setSectionModal({ visible: true, id: m.id, title: m.title, description: m.description || "" })
                      }
                    >
                      <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSection(m.id)}>
                      <Ionicons name="trash-outline" size={20} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                </View>

                {m.lessons.map((l) => {
                  const isQuiz = l.type === "quiz";
                  // Lesson ids come from separate tables (videos/resources/
                  // quizzes), so the type prefix keeps keys unique per row.
                  return (
                    <View key={`${l.type}-${l.id}`} style={styles.lessonRow}>
                      <TouchableOpacity
                        style={styles.lessonBody}
                        activeOpacity={isQuiz ? 0.6 : 1}
                        onPress={isQuiz ? () => openQuizEditor(l.id) : undefined}
                        disabled={!isQuiz}
                      >
                        <Ionicons
                          name={
                            l.type === "video"
                              ? "play-circle-outline"
                              : isQuiz
                              ? "help-circle-outline"
                              : "document-text-outline"
                          }
                          size={18}
                          color={isQuiz ? Colors.secondary : Colors.textSecondary}
                        />
                        <Text style={styles.lessonText} numberOfLines={1}>
                          {l.title}
                          {isQuiz ? "  (tap to edit questions)" : ""}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => (isQuiz ? removeQuiz(l.id) : removeLesson(l.type as LessonKind, l.id))}
                      >
                        <Ionicons name="close" size={18} color={Colors.red} />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <View style={styles.addLessonRow}>
                  <TouchableOpacity style={styles.addLessonBtn} onPress={() => openAddLesson(m.id, "video")}>
                    <Ionicons name="videocam-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.addLessonText}>Video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addLessonBtn} onPress={() => openAddLesson(m.id, "resource")}>
                    <Ionicons name="document-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.addLessonText}>Document</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addLessonBtn} onPress={() => openAddQuiz(m.id)}>
                    <Ionicons name="help-circle-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.addLessonText}>Quiz</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.deleteCourseBtn} onPress={handleDeleteCourse}>
            <Text style={styles.deleteCourseText}>Delete course</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Manage categories modal */}
      <Modal visible={manageVisible} transparent animationType="fade" onRequestClose={() => setManageVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]}>
            <View style={styles.moduleHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>Manage categories</Text>
              <TouchableOpacity onPress={() => setManageVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {categories.length === 0 ? (
              <Text style={styles.muted}>No categories yet. Add one below.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {categories.map((c) => {
                  const isGeneral = c.name.trim().toLowerCase() === "general";
                  return (
                    <View key={c.id} style={styles.lessonRow}>
                      <View style={[styles.catDot, { backgroundColor: c.color || Colors.textMuted }]} />
                      <Text style={styles.lessonText} numberOfLines={1}>
                        {c.name}
                        {c.courseCount ? `  ·  ${c.courseCount}` : ""}
                      </Text>
                      {isGeneral ? (
                        <Text style={styles.catDefaultTag}>default</Text>
                      ) : (
                        <>
                          <TouchableOpacity onPress={() => openEditCategory(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeCategory(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={Colors.red} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { alignSelf: "stretch", alignItems: "center", marginTop: 14 }]}
              onPress={() => setCategoryModal({ visible: true, name: "", color: CATEGORY_COLORS[0] })}
            >
              <Text style={styles.saveBtnText}>Add category</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category create/edit modal */}
      <Modal visible={categoryModal.visible} transparent animationType="fade" onRequestClose={() => setCategoryModal((m) => ({ ...m, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{categoryModal.id ? "Edit category" : "New category"}</Text>
            <TextInput style={styles.input} value={categoryModal.name} onChangeText={(v) => setCategoryModal((m) => ({ ...m, name: v }))} placeholder="Category name" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.label}>Color</Text>
            <View style={styles.swatchRow}>
              {CATEGORY_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.swatch, { backgroundColor: c }, categoryModal.color === c && styles.swatchActive]}
                  onPress={() => setCategoryModal((m) => ({ ...m, color: c }))}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCategoryModal((m) => ({ ...m, visible: false }))}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveCategory}>
                <Text style={styles.saveBtnText}>{categoryModal.id ? "Save" : "Create"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Section modal */}
      <Modal visible={sectionModal.visible} transparent animationType="fade" onRequestClose={() => setSectionModal((s) => ({ ...s, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{sectionModal.id ? "Edit module" : "New module"}</Text>
            <TextInput style={styles.input} value={sectionModal.title} onChangeText={(v) => setSectionModal((s) => ({ ...s, title: v }))} placeholder="Module title" placeholderTextColor={Colors.textMuted} />
            <TextInput style={[styles.input, styles.multiline]} value={sectionModal.description} onChangeText={(v) => setSectionModal((s) => ({ ...s, description: v }))} placeholder="Description (optional)" placeholderTextColor={Colors.textMuted} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setSectionModal((s) => ({ ...s, visible: false }))}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveSection}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lesson modal */}
      <Modal visible={lessonModal.visible} transparent animationType="fade" onRequestClose={() => setLessonModal((m) => ({ ...m, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{lessonModal.kind === "video" ? "New video" : "New document"}</Text>
            <TextInput style={styles.input} value={lessonModal.title} onChangeText={(v) => setLessonModal((m) => ({ ...m, title: v }))} placeholder="Lesson title" placeholderTextColor={Colors.textMuted} />
            <TextInput style={styles.input} value={lessonModal.url} onChangeText={(v) => setLessonModal((m) => ({ ...m, url: v }))} placeholder={lessonModal.kind === "video" ? "Video URL (YouTube)" : "Document URL (PDF / Google Doc)"} placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
            {lessonModal.kind === "video" && (
              <TextInput style={styles.input} value={lessonModal.durationMinutes} onChangeText={(v) => setLessonModal((m) => ({ ...m, durationMinutes: v }))} placeholder="Duration (minutes)" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
            )}
            <View style={styles.switchRow}>
              <Text style={styles.label}>Free preview</Text>
              <Switch value={lessonModal.isPreview} onValueChange={(v) => setLessonModal((m) => ({ ...m, isPreview: v }))} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setLessonModal((m) => ({ ...m, visible: false }))}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveLesson}>
                <Text style={styles.saveBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quiz modal (create quiz) */}
      <Modal visible={quizModal.visible} transparent animationType="fade" onRequestClose={() => setQuizModal((m) => ({ ...m, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New quiz</Text>
            <TextInput style={styles.input} value={quizModal.title} onChangeText={(v) => setQuizModal((m) => ({ ...m, title: v }))} placeholder="Quiz title" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.label}>Pass mark (%)</Text>
            <TextInput style={styles.input} value={quizModal.passingScore} onChangeText={(v) => setQuizModal((m) => ({ ...m, passingScore: v }))} keyboardType="numeric" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setQuizModal((m) => ({ ...m, visible: false }))}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveQuiz}>
                <Text style={styles.saveBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Question editor (list + add/delete questions in a quiz) */}
      <Modal visible={questionEditor.visible} transparent animationType="slide" onRequestClose={() => setQuestionEditor((s) => ({ ...s, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "85%" }]}>
            <View style={styles.moduleHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{questionEditor.quiz?.title || "Quiz"}</Text>
              <TouchableOpacity onPress={() => setQuestionEditor((s) => ({ ...s, visible: false }))}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {questionEditor.loading ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {(questionEditor.quiz?.questions ?? []).length === 0 ? (
                  <Text style={styles.muted}>No questions yet. Add one below.</Text>
                ) : (
                  questionEditor.quiz!.questions.map((q, i) => (
                    <View key={q.id} style={styles.lessonRow}>
                      <Text style={styles.lessonText} numberOfLines={2}>
                        {i + 1}. {q.question}  ·  {q.questionType}
                      </Text>
                      <TouchableOpacity onPress={() => removeQuestion(questionEditor.quiz!.id, q.id)}>
                        <Ionicons name="trash-outline" size={18} color={Colors.red} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { alignSelf: "stretch", alignItems: "center", marginTop: 14 }]}
              onPress={() => questionEditor.quiz && openAddQuestion(questionEditor.quiz.id)}
            >
              <Text style={styles.saveBtnText}>Add question</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Question modal (create a question) */}
      <Modal visible={questionModal.visible} transparent animationType="fade" onRequestClose={() => setQuestionModal((m) => ({ ...m, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: "88%" }]}>
            <Text style={styles.modalTitle}>New question</Text>
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={styles.label}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {QUESTION_TYPES.map((t) => {
                  const active = questionModal.questionType === t.value;
                  return (
                    <TouchableOpacity key={t.value} style={[styles.chip, active && styles.chipActive]} onPress={() => setQuestionModal((m) => ({ ...m, questionType: t.value }))}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>Question</Text>
              <TextInput style={[styles.input, styles.multiline]} value={questionModal.question} onChangeText={(v) => setQuestionModal((m) => ({ ...m, question: v }))} placeholder="Question text" placeholderTextColor={Colors.textMuted} multiline />

              {(questionModal.questionType === "multiple-choice" || questionModal.questionType === "multiple-correct") && (
                <>
                  <Text style={styles.label}>Options (one per line)</Text>
                  <TextInput style={[styles.input, styles.multiline]} value={questionModal.optionsText} onChangeText={(v) => setQuestionModal((m) => ({ ...m, optionsText: v }))} placeholder={"Option A\nOption B\nOption C"} placeholderTextColor={Colors.textMuted} multiline />
                  <Text style={styles.label}>
                    {questionModal.questionType === "multiple-correct" ? "Correct options (comma separated, must match above)" : "Correct option (must match one above)"}
                  </Text>
                  <TextInput style={styles.input} value={questionModal.correctText} onChangeText={(v) => setQuestionModal((m) => ({ ...m, correctText: v }))} placeholder={questionModal.questionType === "multiple-correct" ? "Option A, Option C" : "Option B"} placeholderTextColor={Colors.textMuted} />
                </>
              )}

              {questionModal.questionType === "true-false" && (
                <>
                  <Text style={styles.label}>Correct answer</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["True", "False"] as const).map((v) => {
                      const active = questionModal.tfValue === v;
                      return (
                        <TouchableOpacity key={v} style={[styles.chip, active && styles.chipActive]} onPress={() => setQuestionModal((m) => ({ ...m, tfValue: v }))}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{v}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {questionModal.questionType === "short-answer" && (
                <>
                  <Text style={styles.label}>Expected answer</Text>
                  <TextInput style={styles.input} value={questionModal.correctText} onChangeText={(v) => setQuestionModal((m) => ({ ...m, correctText: v }))} placeholder="Accepted answer (case-insensitive)" placeholderTextColor={Colors.textMuted} />
                </>
              )}

              {questionModal.questionType === "matching" && (
                <>
                  <Text style={styles.label}>Pairs (one per line, as 'left =&gt; right')</Text>
                  <TextInput style={[styles.input, styles.multiline]} value={questionModal.pairsText} onChangeText={(v) => setQuestionModal((m) => ({ ...m, pairsText: v }))} placeholder={"HTTP => 80\nHTTPS => 443"} placeholderTextColor={Colors.textMuted} multiline />
                </>
              )}

              <Text style={styles.label}>Points</Text>
              <TextInput style={styles.input} value={questionModal.points} onChangeText={(v) => setQuestionModal((m) => ({ ...m, points: v }))} keyboardType="numeric" />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setQuestionModal((m) => ({ ...m, visible: false }))}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveQuestion}>
                <Text style={styles.saveBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: Colors.textInputBg,
    color: Colors.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row2: { flexDirection: "row", gap: 12 },
  coverPreview: { width: "100%", aspectRatio: 2, borderRadius: 10, marginBottom: 10, backgroundColor: Colors.backgroundGray },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 6 },
  coverBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  coverBtnText: { color: Colors.secondary, fontWeight: "600", fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: Colors.backgroundGray, marginRight: 8 },
  chipActive: { backgroundColor: Colors.secondary },
  chipNew: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.secondary },
  chipManage: { alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: Colors.textSecondary, paddingHorizontal: 12 },
  chipText: { color: Colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: Colors.white },
  catDot: { width: 14, height: 14, borderRadius: 7 },
  catDefaultTag: { color: Colors.textMuted, fontSize: 12, fontStyle: "italic" },
  swatchRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  swatch: { width: 30, height: 30, borderRadius: 15 },
  swatchActive: { borderWidth: 3, borderColor: Colors.white },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 8 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: "700" },
  outcomeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  saveBtn: { backgroundColor: Colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  muted: { color: Colors.textSecondary },
  module: { backgroundColor: Colors.backgroundGray, borderRadius: 12, padding: 14, marginBottom: 12 },
  moduleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  moduleTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 },
  moduleActions: { flexDirection: "row", gap: 14, marginLeft: 10 },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  lessonBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  lessonText: { color: Colors.textSecondary, fontSize: 14, flex: 1 },
  addLessonRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  addLessonBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addLessonText: { color: Colors.secondary, fontWeight: "600", fontSize: 13 },
  deleteCourseBtn: { marginTop: 24, alignItems: "center", padding: 12 },
  deleteCourseText: { color: Colors.red, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 18 },
  modalTitle: { color: Colors.white, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  modalActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 18, marginTop: 6 },
  cancelText: { color: Colors.textSecondary, fontWeight: "600" },
  modalSaveBtn: { backgroundColor: Colors.secondary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
});
