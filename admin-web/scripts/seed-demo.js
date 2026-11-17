/*
 * Demo data for presentations and testing (LOCAL TEST SERVER ONLY).
 *
 * Creates three church-themed sample courses (with sections, video and reading
 * lessons and learning outcomes) through the real server API, exactly as the
 * console would. Safe to run twice: courses that already exist are skipped.
 *
 * Usage (from the admin-web folder, with the server running):
 *   node scripts/seed-demo.js
 *   node scripts/seed-demo.js admin@test.com 12345678 http://localhost:8080
 *
 * The video and reading links are placeholders (example.com) for demo purposes.
 */
const axios = require('axios');

const [email = 'admin@test.com', password = '12345678', baseURL = 'http://localhost:8080'] = process.argv.slice(2);

if (!/localhost|127\.0\.0\.1/.test(baseURL)) {
  console.error(`Refusing to run against ${baseURL}: this script is for a local test server only.`);
  process.exit(1);
}

const COURSES = [
  {
    title: '新约概论 Introduction to the New Testament',
    description:
      '一起认识新约圣经的结构与信息。A gentle walk through the books of the New Testament: the Gospels, Acts and the Letters, and how they fit together.',
    categoryName: '圣经 Bible',
    durationHours: 2,
    tags: ['Bible', '圣经', 'beginners'],
    isPublished: true,
    outcomes: [
      'Understand how the New Testament is organised',
      '认识四本福音书的特色',
      'Read the Letters with their background in mind',
    ],
    sections: [
      {
        title: '第一周 Week 1: The Gospels 福音书',
        description: 'Matthew, Mark, Luke and John',
        videos: [
          { title: '欢迎 Welcome and overview', minutes: 8, isPreview: true },
          { title: 'The four Gospels compared', minutes: 15 },
        ],
        readings: [{ title: 'Week 1 notes 笔记', type: 'pdf' }],
      },
      {
        title: '第二周 Week 2: Acts and the Letters 使徒行传与书信',
        description: 'The early church and the letters to it',
        videos: [{ title: 'The early church in Acts', minutes: 12 }],
        readings: [
          { title: 'Map of Paul’s journeys', type: 'pdf' },
          { title: 'Reading plan 读经计划', type: 'link' },
        ],
      },
    ],
  },
  {
    title: '祷告生活 A Life of Prayer',
    description: '建立每天的祷告习惯。Practical, short lessons on building a daily habit of prayer.',
    categoryName: '属灵成长 Spiritual Growth',
    durationHours: 1,
    tags: ['prayer', '祷告'],
    isPublished: true,
    outcomes: ['Build a simple daily prayer routine', '学习用诗篇祷告'],
    sections: [
      {
        title: 'Getting started 开始',
        description: '',
        videos: [
          { title: 'Why pray? 为什么祷告', minutes: 10, isPreview: true },
          { title: 'Praying with the Psalms 用诗篇祷告', minutes: 14 },
        ],
        readings: [{ title: '7-day prayer guide 七天祷告指引', type: 'pdf' }],
      },
    ],
  },
  {
    title: '新人课程 Newcomers’ Class',
    description: '欢迎来到平安教会！Welcome to Ping-An. Who we are, what we believe and how to get involved.',
    categoryName: '教会生活 Church Life',
    durationHours: 0.5,
    tags: ['newcomers', '新人'],
    isPublished: false, // left as a draft so the Draft label can be shown
    outcomes: ['Know the church’s story and beliefs', '认识教会的各项事工'],
    sections: [
      {
        title: 'Welcome 欢迎',
        description: '',
        videos: [{ title: 'Welcome from the pastor 牧师的欢迎', minutes: 5 }],
        readings: [],
      },
    ],
  },
];

const slug = (s) => encodeURIComponent(s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item');

async function main() {
  const http = axios.create({ baseURL, timeout: 20000 });

  console.log(`Signing in to ${baseURL} as ${email}…`);
  const login = await http.post('/auth/login', { email, password }, { params: { deviceId: 'admin-web-seed-script' } });
  const user = login.data.user || {};
  if (!user.admin && !user.instructor) throw new Error('This account is not an administrator or instructor.');
  http.defaults.headers.common.Authorization = `Bearer ${login.data.accessToken}`;

  const existing = await http.get('/api/fn/getAllCourse', { params: { size: 50 } });
  const existingTitles = new Set((existing.data.data || []).map((c) => c.title));

  for (const course of COURSES) {
    if (existingTitles.has(course.title)) {
      console.log(`- Skipped (already exists): ${course.title}`);
      continue;
    }
    const created = await http.post('/api/fn/createCourse', {
      title: course.title,
      description: course.description,
      categoryName: course.categoryName,
      durationHours: course.durationHours,
      thumbnailUrl: null,
      tags: course.tags,
      isPublished: course.isPublished,
    });
    const courseId = created.data.data.id;
    await http.put(`/api/fn/setCourseOutcomes/${courseId}`, { outcomes: course.outcomes });

    for (let s = 0; s < course.sections.length; s++) {
      const section = course.sections[s];
      const sec = await http.post('/api/fn/createSection', {
        courseId,
        title: section.title,
        description: section.description,
        orderIndex: s,
      });
      const sectionId = sec.data.data.id;

      for (let v = 0; v < section.videos.length; v++) {
        const video = section.videos[v];
        await http.post('/api/fn/createVideo', {
          courseId,
          sectionId,
          title: video.title,
          videoUrl: `https://example.com/videos/${slug(video.title)}`,
          durationSeconds: video.minutes * 60,
          isPreview: Boolean(video.isPreview),
          orderIndex: v,
        });
      }
      for (let r = 0; r < section.readings.length; r++) {
        const reading = section.readings[r];
        await http.post('/api/fn/createResource', {
          courseId,
          sectionId,
          title: reading.title,
          resourceUrl: `https://example.com/files/${slug(reading.title)}${reading.type === 'pdf' ? '.pdf' : ''}`,
          resourceType: reading.type,
          isDownloadable: reading.type !== 'link',
          isPreview: false,
          orderIndex: r,
        });
      }
    }
    console.log(`+ Created: ${course.title} (${course.isPublished ? 'published' : 'draft'})`);
  }
  console.log('Done. Refresh Course Studio in the console.');
}

main().catch((err) => {
  const status = err.response?.status;
  const msg = err.response?.data?.message || err.response?.data || err.message;
  if (err.code === 'ECONNREFUSED') console.error('Could not reach the server. Is it running (Started ChatApplication)?');
  else if (status === 401) console.error('Sign-in failed: wrong email or password.');
  else console.error(`Failed${status ? ` (HTTP ${status})` : ''}:`, typeof msg === 'string' ? msg : JSON.stringify(msg));
  process.exit(1);
});
