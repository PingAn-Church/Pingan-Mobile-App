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
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Colors } from "@/constants";
import { getCategories, getCourseDetail } from "@/services/courseService";
import * as authoring from "@/services/authoringService";
import type { LearningCategory, LearningCourseDetail } from "@/types";

type LessonKind = "video" | "resource";

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
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [categoryName, setCategoryName] = useState<string>("General");
  const [outcomes, setOutcomes] = useState<string[]>([]);

  const [categories, setCategories] = useState<LearningCategory[]>([]);
  const [detail, setDetail] = useState<LearningCourseDetail | null>(null);

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
  }>({ visible: false, kind: "video", sectionId: "", title: "", url: "", durationMinutes: "0", resourceType: "pdf", isPreview: false });

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
      setCategoryName(d.categoryName || "General");
      setOutcomes(d.outcomes || []);
    } catch {
      Alert.alert("Error", "Could not load course.");
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
      Alert.alert("Required", "Please enter a course title.");
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
      Alert.alert("Saved", "Course saved successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save course.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = () => {
    if (!courseId) return;
    Alert.alert("Delete course", "This permanently deletes the course and its content.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await authoring.deleteCourse(courseId);
            navigation.goBack();
          } catch (e: any) {
            Alert.alert("Error", e?.message || "Failed to delete.");
          }
        },
      },
    ]);
  };

  // ---- outcomes -----------------------------------------------------
  const addOutcome = () => setOutcomes((o) => [...o, ""]);
  const setOutcome = (i: number, v: string) =>
    setOutcomes((o) => o.map((x, idx) => (idx === i ? v : x)));
  const removeOutcome = (i: number) => setOutcomes((o) => o.filter((_, idx) => idx !== i));

  // ---- sections -----------------------------------------------------
  const saveSection = async () => {
    if (!courseId || !sectionModal.title.trim()) {
      Alert.alert("Required", "Module title is required.");
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
      Alert.alert("Error", e?.message || "Failed to save module.");
    }
  };

  const removeSection = (id: string) => {
    Alert.alert("Delete module", "Delete this module and its lessons?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await authoring.deleteSection(id);
          if (courseId) await reloadContent(courseId);
        },
      },
    ]);
  };

  // ---- lessons ------------------------------------------------------
  const openAddLesson = (sectionId: string, kind: LessonKind) =>
    setLessonModal({
      visible: true,
      kind,
      sectionId,
      title: "",
      url: "",
      durationMinutes: "0",
      resourceType: "pdf",
      isPreview: false,
    });

  const saveLesson = async () => {
    if (!courseId || !lessonModal.title.trim()) {
      Alert.alert("Required", "Lesson title is required.");
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
      Alert.alert("Error", e?.message || "Failed to add lesson.");
    }
  };

  const removeLesson = (kind: LessonKind, id: string) => {
    Alert.alert("Delete lesson", "Remove this lesson?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (kind === "video") await authoring.deleteVideo(id);
          else await authoring.deleteResource(id);
          if (courseId) await reloadContent(courseId);
        },
      },
    ]);
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
      </ScrollView>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Duration (hours)</Text>
          <TextInput style={styles.input} value={durationHours} onChangeText={setDurationHours} keyboardType="numeric" />
        </View>
      </View>

      <Text style={styles.label}>Thumbnail URL</Text>
      <TextInput style={styles.input} value={thumbnailUrl} onChangeText={setThumbnailUrl} placeholder="https://..." placeholderTextColor={Colors.textMuted} autoCapitalize="none" />

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

                {m.lessons.map((l) => (
                  <View key={l.id} style={styles.lessonRow}>
                    <Ionicons
                      name={l.type === "video" ? "play-circle-outline" : "document-text-outline"}
                      size={18}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.lessonText} numberOfLines={1}>
                      {l.title}
                    </Text>
                    <TouchableOpacity onPress={() => removeLesson(l.type, l.id)}>
                      <Ionicons name="close" size={18} color={Colors.red} />
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.addLessonRow}>
                  <TouchableOpacity style={styles.addLessonBtn} onPress={() => openAddLesson(m.id, "video")}>
                    <Ionicons name="videocam-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.addLessonText}>Video</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addLessonBtn} onPress={() => openAddLesson(m.id, "resource")}>
                    <Ionicons name="document-outline" size={16} color={Colors.secondary} />
                    <Text style={styles.addLessonText}>Document</Text>
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
            <TextInput style={styles.input} value={lessonModal.url} onChangeText={(v) => setLessonModal((m) => ({ ...m, url: v }))} placeholder={lessonModal.kind === "video" ? "Video URL (YouTube)" : "Document URL (PDF)"} placeholderTextColor={Colors.textMuted} autoCapitalize="none" />
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
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: Colors.backgroundGray, marginRight: 8 },
  chipActive: { backgroundColor: Colors.secondary },
  chipText: { color: Colors.textSecondary, fontWeight: "600" },
  chipTextActive: { color: Colors.white },
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
