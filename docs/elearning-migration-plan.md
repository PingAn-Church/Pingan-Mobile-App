# E-Learning Migration Plan — "Shalom" → Pingan Mobile App

Port the e-learning feature set from `source-apps/learning/` (Shalom) into this repo (Pingan).
This is a **port plan only** — no code is written yet.

## Decisions locked in

| Decision | Choice |
|---|---|
| **Scope** | Core learning · Quizzes & grading · Gamification. **Out:** recommendations/ML, instructor web portal, instructor analytics, direct messages. |
| **Frontend language** | Add **TypeScript** support to the Pingan frontend; port screens close to source. |
| **Identity** | **Reuse Pingan users** (existing `Long` IDs + custom JWT). Add an **instructor** role. No second auth system. |

## Why this is a re-implementation, not a copy

| | Source (Shalom) | Target (Pingan) |
|---|---|---|
| Backend | ~95 Deno/TS Supabase Edge Functions, raw Supabase queries, functions call each other over HTTP | Spring Boot 3.3.3 / Java 21, `@RestController`→`@Service`→JPA `Repository` |
| DB | Postgres, **UUID** PKs, `jsonb`, arrays, `pgvector`, SQL RPCs, RLS | Postgres, **`Long`/IDENTITY** PKs, JPA `@Entity`, `ddl-auto=update` |
| Auth | AWS Cognito + Supabase JWT + RLS, role student/instructor/admin | Custom JWT (`JwtAuthenticationFilter`), roles `ADMIN`/`VERIFIED` |
| Frontend | RN 0.81.5 / Expo 54 / React 19.1 / **TS** / React Query / `@/` alias / supabase client | RN 0.81.5 / Expo 54 / React 19.1 / **JS** / axios + `getAuthToken()` services |

**Good news:** both frontends are on identical Expo/RN/React versions, so component/screen code ports with minimal churn. The real work is (a) re-implementing edge-function logic in Spring and (b) repointing the source API client at Pingan's backend + JWT.

---

## Strategy: keep the API contract, swap the client

To avoid rewriting every screen's data layer, **preserve the source edge-function endpoint names and JSON response envelopes** (`{ success, message, data }`). Expose them in Spring under a single prefix:

```
GET  /api/fn/getAllPublishedCourse
GET  /api/fn/getModuleDetail/{courseId}
POST /api/fn/postUserEnrollment/{userId}
POST /api/fn/submitQuiz/{quizId}
...
```

Then the only frontend change to the ported `apiService.ts` is:
- `BASE_URL` → `${BACKEND_BASE_URL}/api/fn` (from `apiConfig`), and
- auth interceptor → `Bearer ${await getAuthToken()}` (Pingan JWT) instead of the Supabase session.

With that adapter in place, the source feature services (`courseService.ts`, `quizService.ts`, etc.) and screens are reused largely **as-is**. A shared `ApiResponse<T>` wrapper on the Spring side keeps shapes matching.

---

## Backend — Spring re-implementation

### 0. User model & security changes (foundation)

`model/User.java` currently: `id(Long)`, `firstName`, `lastName`, `email`, `password`, `profileImage`, `isVerifiedUser`, `isAdmin`, `birthday`.

Add columns to support learning + gamification + source field mapping:
- `points` (Integer, default 0) — credits balance
- `isInstructor` (boolean, default false) — new role
- `bio`, `location`, `phone` (String, nullable)
- Source `users.name` → derive from `firstName + " " + lastName`; source `avatar_url` → reuse `profileImage`.

Security:
- `CustomUserDetails.getAuthorities()` → add `ROLE_INSTRUCTOR` when `user.isInstructor()`.
- `SpringSecurityConfig` → permit `GET /api/fn/**` public read where appropriate (catalog), authenticate the rest; gate authoring/grading with `@PreAuthorize("hasRole('INSTRUCTOR')")` / `hasRole('ADMIN')`.

### 1. JPA entities to create

`Long`/IDENTITY PKs throughout; all user references are `Long` FKs to `users.id`. IDs are serialized as **strings on the wire** (the source frontend already does `String(id)`), so no frontend ID assumptions break.

**Core learning**
- `Category` (`categories`)
- `Course` (`courses`) — **drop** the `embedding` column (no ML)
- `CourseSection` (`course_sections`)
- `CourseVideo` (`course_videos`)
- `CourseResource` (`course_resources`) — pdf/document/ppt
- `CourseOutcome` (`course_outcomes`)
- `CourseRating` (`course_ratings`) — reviews/ratings (drop moderation fields unless wanted)
- `CourseWishlist` (`course_wishlist`)
- `CourseEnrollment` (`course_enrollments`)
- `UserVideoProgress` (`user_video_progress`)
- `ResourceProgress` (`resource_progress`)
- `UserModuleProgress` (`user_module_progress`) — composite key `(user, course, section)` via `@IdClass`/`@EmbeddedId`

**Quizzes**
- `CourseQuiz` (`course_quizzes`)
- `QuizQuestion` (`quiz_questions`) — `options`, `graded_variations` are `jsonb`
- `QuizAttempt` (`quiz_attempts`) — `answers`, `graded_answers` are `jsonb`

**Gamification**
- `CreditsEvent` (`credits_events`)
- `ShopItem` (`shop_items`), `UserUnlockedItem` (`user_unlocked_items`)
- `Achievement` (`achievements` — `criteria` jsonb), `UserAchievement` (`user_achievements`)
- `Certificate` (`certificates` — `metadata` jsonb)
- `LearningGoal` (`learning_goals`), `GoalTemplate` (`goal_templates`), `GoalTemplateBatch` (`goal_template_batches`)
- `UserPreferences` (`user_preferences`) — needed for `timezone` (streak/daily-minute math)
- `UserAnalytics` (`user_analytics`) — daily minutes / activity counts

**Postgres type mapping notes**
- `jsonb` columns → Hibernate 6 `@JdbcTypeCode(SqlTypes.JSON)` on a POJO/`Map`/`String`.
- arrays (`tags`, `tokens`, `template_ids`) → `@JdbcTypeCode(SqlTypes.ARRAY)` `List<String>` or `@ElementCollection`.
- SQL RPCs `get_section_totals` / `get_section_completion` → re-implement as JPQL/native count queries in a `ProgressService`.

### 2. Edge functions → Spring controllers/services (in scope)

Group into controllers; port each function's body into a service method. Cross-function HTTP calls in the source become **in-process service calls**.

**`CourseController` / `CourseService`**
| Edge fn | Endpoint | Notes |
|---|---|---|
| `getAllPublishedCourse` | `GET /api/fn/getAllPublishedCourse` | list+filter+paginate published courses |
| `getAllCourse` | `GET /api/fn/getAllCourse` | admin list |
| `categoryHandler` | `GET/POST /api/fn/categoryHandler` | categories CRUD-lite |
| `getModuleDetail` | `GET /api/fn/getModuleDetail/{courseId}` | course + sections + videos/resources/quizzes tree |
| `getLessonDetail` | `GET /api/fn/getLessonDetail/{...}` | |
| `getVideoDetail` | `GET /api/fn/getVideoDetail/{videoId}` | |
| `getDocumentPreview` | `GET /api/fn/getDocumentPreview/{...}` | PDF/PPT preview metadata |
| `courseReviewHandler` | `GET/POST/PUT /api/fn/courseReviewHandler/{courseId}` | reviews/ratings |

**`EnrollmentController` / `EnrollmentService` + `ProgressService`**
| Edge fn | Endpoint | Notes |
|---|---|---|
| `postUserEnrollment` | `POST /api/fn/postUserEnrollment/{userId}` | enroll; returns firstModuleId; awards credits |
| `getUserEnrollment` | `GET /api/fn/getUserEnrollment/{userId}` | "My Courses" + per-course stats |
| `updateVideoProgress` | `POST /api/fn/updateVideoProgress` | watch time, completion, recompute course % |
| `updatePDFProgress` | `POST /api/fn/updatePDFProgress` | resource progress + read-minutes |
| `completeCourse` | `POST /api/fn/completeCourse` | issue certificate, notify, credits |
| `wishlistHandler` | `GET/POST/DELETE /api/fn/wishlistHandler/{userId}` | |
| `recordDailyActivity` | `POST /api/fn/recordDailyActivity` | feeds `user_analytics` |

**`QuizController` / `QuizService`** (the heaviest port)
| Edge fn | Endpoint | Notes |
|---|---|---|
| `getQuizDetail` | `GET /api/fn/getQuizDetail/{quizId}` | questions w/o answers |
| `submitQuiz` | `POST /api/fn/submitQuiz/{quizId}` | **~1000-line engine**: grade all question types (mc/multi/true-false/short-answer/matching), save attempt, enforce max attempts, recompute course %, mark module completion, update daily minutes, advance streak, advance goals, award credits, notify instructor |
| `getQuizResults` | `GET /api/fn/getQuizResults/{...}` | |
| `gradeShortAnswer` / `gradeAnswerVariation` | `POST /api/fn/...` | instructor-only manual grading (`@PreAuthorize INSTRUCTOR`) |
| `getPendingGrading` / `getPendingGradingByQuestion` / `getStudentAttemptDetails` | `GET /api/fn/...` | instructor grading queue (optional, instructor-only) |

**`CreditsController` / `CreditsService`**
| Edge fn | Endpoint | Notes |
|---|---|---|
| `postCreditEvent` | `POST /api/fn/postCreditEvent` | idempotent via `reference_key`; updates `users.points` |
| `getCredits` | `GET /api/fn/getCredits/{userId}` | |
| `getCreditHistory` | `GET /api/fn/getCreditHistory/{userId}` | PointsHistory screen |
| `getShopItems` | `GET /api/fn/getShopItems` | |
| `redeemCredits` | `POST /api/fn/redeemCredits` | spend points → unlock item |

**`AchievementController` / `CertificateController`**
| Edge fn | Endpoint | Notes |
|---|---|---|
| `getAchievements` / `listAchievements` | `GET /api/fn/...` | user + catalog |
| `createAchievement`/`updateAchievement`/`deleteAchievement`/`uploadAchievementIcon` | admin-only | reuse OSS/S3 for icon upload |
| `getCertificates` | `GET /api/fn/getCertificates/{userId}` | |

**`GoalController` / `GoalService` + streaks**
| Edge fn | Endpoint | Notes |
|---|---|---|
| `getGoals` / `getGoalTemplates` | `GET /api/fn/...` | |
| `createGoalsFromTemplates` / `setGoalActive` / `clearGoal` | `POST /api/fn/...` | |
| `updateStreak` | `POST /api/fn/updateStreak` | daily streak math (uses prefs timezone) |
| `streakMaintenance` | `@Scheduled` job | replace Supabase cron → Spring `@Scheduled` (pattern exists: `jobs/PushTokenCleanupJob`) |

**`PreferencesController`**: `getUserPreferences` / `setUserPreferences` → `GET/POST /api/fn/...`

**Notifications (reuse Pingan infra, don't port the tables):** source `postNotification`/`pushNotificationHandler`/`getNotifications`/`markNotificationRead` → route through existing `PushNotificationService` + a thin in-app notification store, or Pingan's existing notification mechanism. Quiz/credit/goal flows call this internally.

### 3. Shared backend pieces
- `dto/ApiResponse<T>` `{ success, message, data }` wrapper to match source envelopes.
- `@ControllerAdvice` mapping exceptions → the same `{ success:false, message }` 4xx/5xx shapes the source `apiService` error interceptor expects.
- Reuse existing `OSSService`/`OSSController` + `S3Service` for thumbnails, resources, certificate/achievement assets.

---

## Frontend — TypeScript + screen migration

### 1. Tooling setup (one-time)
- Add `tsconfig.json` (Expo's TS template); `babel-preset-expo` already transpiles TS, so no Babel change needed beyond the alias.
- Add `babel-plugin-module-resolver` for the `@/` → `src/` alias the source uses; mirror in `tsconfig` `paths`.
- Add deps: `typescript`, `@types/react`, `@tanstack/react-query` (+ `@react-native-async-storage/async-storage` already present), `expo-video`/`expo-av` (av present), `expo-blur`, `expo-linear-gradient`, plus any source-only libs (`react-native-youtube-iframe`, PDF viewer) used by in-scope screens.
- Wrap `App.js` tree in a `QueryClientProvider`.

### 2. API client adapter (the key bridge)
Port `mobile/src/services/apiService.ts` with two edits:
- `BASE_URL = ${BACKEND_BASE_URL}/api/fn` (from `src/service/apiConfig.js`).
- auth interceptor uses `getAuthToken()` (`src/service/TokenService`) → `Authorization: Bearer <pinganJWT>`; drop `apikey`/supabase-session logic.
- Delete `lib/supabase.ts` usage; the only direct-supabase caller in scope was `postRecommendationEvent` (out of scope).

### 3. Port these source screens (in scope)
Wholesale port (data layer flows through the adapted services):

| Domain | Screens |
|---|---|
| Catalog/learning | `HomeScreen`, `Courses`, `CourseDetailScreen`, `ModuleDetailScreen`, `VideoPlayer`, `DocumentView`, `MyCourses`, `WishlistScreen`, `LeaveReviewScreen` |
| Quizzes | `QuizScreen` (+ `components/MatchingQuestion`) |
| Gamification | `CreditsShopScreen`, `AchievementsScreen`, `CertificatesScreen`, `CertificateViewerScreen`, `LearningGoalScreen`, `PointsHistory` |

Plus supporting `components/` (`home/*`, `common/*`, players), `constants/` (`Colors`, `GlobalStyles`), `hooks/` (`useCourses`, `useCourseNavigation`), `utils/` (`certificate`, `cosmetics`, `recommendations`→trim, `responsive`).

**Reconcile with existing Pingan screens:** Pingan already has `UserContext`, `NotificationContext`, profile/settings/edit-profile screens. Do **not** import the source `AuthContext`/`UserContext` verbatim — adapt source screens to read from Pingan's `UserContext` (and Pingan login). `MessageContext`/DM screens are out of scope.

### 4. Navigation wiring (`frontend/App.js`)
- Add a **"Learn"** bottom tab → a nested stack hosting `Courses` (list) + course/module browse.
- Register modal/detail routes on the **root** `Stack.Navigator`: `CourseDetail`, `ModuleDetail`, `VideoPlayer`, `DocumentView`, `QuizScreen`, `MyCourses`, `Wishlist`, `LeaveReview`, `CreditsShop`, `Achievements`, `Certificates`, `CertificateViewer`, `LearningGoal`, `PointsHistory`.
- Keep existing tabs (Home/Events/Social/Others/Settings) intact.

---

## Content authoring (open item)

There is **no instructor web portal** in scope, but courses/sections/videos/quizzes must be created somehow. Options:
1. **DB seeding / admin SQL** for initial content (fastest).
2. Port `createCourse`/`updateCourse`/`courseDuplicateHandler` as **admin-only** Spring endpoints + minimal mobile admin screens later.
3. Defer — treat authoring as a follow-up project.

Recommend **(1)** to unblock the learner experience, **(2)** later if in-app authoring is required.

---

## Suggested sequencing (vertical slices)

| Phase | Deliverable |
|---|---|
| **A — Foundations** | User model + `ROLE_INSTRUCTOR`; `ApiResponse`/`@ControllerAdvice`; `/api/fn` security rules; frontend TS + React Query + adapted `apiService`. |
| **B — Catalog (read)** | Category/Course/Section/Video/Resource/Outcome/Rating(read) + `getAllPublishedCourse`/`getModuleDetail`/`categoryHandler`/`getVideoDetail`/`getDocumentPreview`; screens Home/Courses/CourseDetail/ModuleDetail/Video/Document. First demoable slice. |
| **C — Enrollment & progress** | enroll, `getUserEnrollment`, video/PDF progress, `completeCourse`, wishlist, reviews(write); screens MyCourses/Wishlist/LeaveReview. |
| **D — Quizzes** | quiz entities + `getQuizDetail`/`submitQuiz` engine/`getQuizResults`; `QuizScreen`. (Instructor manual grading optional.) |
| **E — Gamification** | credits/shop/achievements/certificates/goals/streaks/preferences/analytics + their screens; `streakMaintenance` as `@Scheduled`. |

## Explicitly out of scope (cut from source)
Recommendations (`getRecommendations`, `getMLRecommendations`, `postRecommendationEvent`, `recommendation_*` tables, `backend/ml/*`, `pgvector`/`embedding`) · instructor web portal (`web/`) · instructor analytics/tasks (`getInstructorAnalytics`, `getInstructorStats`, `instructorTask*`, `getCourseStudents`, …) · direct messages (`direct_messages`, `ConversationScreen`/`MessagesScreen`) · Cognito/Supabase auth functions (`registerCheck`, `approveInstructor`, `disableUser`, `toggleUserEnabled`).

## Key risks / watch-items
1. **`submitQuiz` fidelity** — most logic-dense function; budget real time and tests for grading + progress recompute.
2. **`name` vs `firstName`/`lastName`** — source assumes single `name`; add a derived getter and check every reviewer/instructor display.
3. **jsonb/array mapping** — validate Hibernate JSON/array handling against Postgres early (in Phase A) so quiz `answers`/`options` don't bite in Phase D.
4. **Progress math consistency** — section-based vs item-based progress is computed in several places (`submitQuiz`, `getUserEnrollment`, `convertEnrollmentToAppCourse`); centralize in one `ProgressService` to avoid drift.
5. **Notifications** — decide reuse of Pingan's push/notification path vs porting source `notifications` table before Phase C.
