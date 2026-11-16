import React, { useState, useEffect } from 'react';
import { fetchVideos, addVideo, deleteVideo } from './api';

interface VideoLesson {
  id?: string | number;
  title: string;
  videoId: string;
  videoType: string;
  duration?: string;
  module?: string;
}

const DEFAULT_VIDEOS: VideoLesson[] = [
  {
    id: '1',
    title: 'Lesson 1: Foundations of Faith',
    videoId: 'dQw4w9WgXcQ',
    videoType: 'youtube',
    duration: '14:20 min',
    module: 'Module 1: Orientation'
  },
  {
    id: '2',
    title: 'Lesson 2: Community & Leadership',
    videoId: '3JZ_D3ELwOQ',
    videoType: 'youtube',
    duration: '18:45 min',
    module: 'Module 1: Orientation'
  },
];

export const CourseEditor: React.FC = () => {
  const [videos, setVideos] = useState<VideoLesson[]>(() => {
    const saved = localStorage.getItem('demo_videos');
    return saved ? JSON.parse(saved) : DEFAULT_VIDEOS;
  });

  const [title, setTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [videoType, setVideoType] = useState('youtube');
  const [duration, setDuration] = useState('12:00 min');
  const [moduleName, setModuleName] = useState('Module 1: Orientation');

  // Inline Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editVideoId, setEditVideoId] = useState('');
  const [editModule, setEditModule] = useState('');
  const [editDuration, setEditDuration] = useState('');

  useEffect(() => {
    localStorage.setItem('demo_videos', JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const data = await fetchVideos(0, 20);
        if (Array.isArray(data) && data.length > 0) {
          setVideos(data);
        } else if (data?.content && Array.isArray(data.content) && data.content.length > 0) {
          setVideos(data.content);
        }
      } catch (err) {
        console.warn('Backend offline, keeping local demo state:', err);
      }
    };
    loadVideos();
  }, []);

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const newVideo: VideoLesson = {
      id: Date.now().toString(),
      title,
      videoId,
      videoType,
      duration,
      module: moduleName
    };

    try {
      await addVideo({ title, videoId, videoType });
    } catch (err) {
      console.warn('Backend offline, saving to local demo state:', err);
    }

    setVideos((prev) => [...prev, newVideo]);
    setTitle('');
    setVideoId('');
  };

  const handleDeleteVideo = async (targetVideoId: string) => {
    try {
      await deleteVideo(targetVideoId);
    } catch (err) {
      console.warn('Backend offline, deleting from local demo state:', err);
    }

    setVideos((prev) => prev.filter((v) => String(v.videoId) !== targetVideoId && String(v.id) !== targetVideoId));
  };

  const startEditing = (vid: VideoLesson) => {
    const targetId = String(vid.id || vid.videoId);
    setEditingId(targetId);
    setEditTitle(vid.title);
    setEditVideoId(vid.videoId);
    setEditModule(vid.module || 'Module 1: Orientation');
    setEditDuration(vid.duration || '15:00 min');
  };

  const saveEditing = (targetId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        String(v.id || v.videoId) === targetId
          ? {
              ...v,
              title: editTitle,
              videoId: editVideoId,
              module: editModule,
              duration: editDuration
            }
          : v
      )
    );
    setEditingId(null);
  };

  return (
    <div>
      {/* Create Lesson Card */}
      <div style={{ background: 'var(--bg-card, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '32px' }}>
        <h3 style={{ marginTop: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>Add New Course Lesson</h3>
        <form onSubmit={handleAddVideo} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>Lesson Title</label>
            <input
              type="text"
              placeholder="e.g. Lesson 3: Servant Leadership Principles"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>Video Asset Reference / Link</label>
            <input
              type="text"
              placeholder="YouTube Video ID or OSS Object Path"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>Video Stream Source</label>
            <select
              value={videoType}
              onChange={(e) => setVideoType(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            >
              <option value="youtube">YouTube Embed Stream</option>
              <option value="oss">Alibaba Cloud OSS Direct Stream</option>
              <option value="mp4">External MP4 URL</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>Course Module</label>
            <input
              type="text"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>Estimated Duration</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
            <button
              type="submit"
              style={{ padding: '12px 24px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              + Attach Lesson to Course
            </button>
          </div>
        </form>
      </div>

      <h3 style={{ fontSize: '18px', color: 'var(--text-primary, #0f172a)', marginBottom: '16px' }}>Course Lessons Stream Catalog</h3>
      
      {/* Lesson Catalog Stream */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {videos.map((vid) => {
          const currentId = String(vid.id || vid.videoId);
          const isEditing = editingId === currentId;

          return (
            <div key={currentId} style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '16px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', background: 'var(--bg-card, #ffffff)' }}>
              
              {/* Thumbnail Preview */}
              <div style={{ width: '140px', height: '85px', borderRadius: '6px', overflow: 'hidden', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {vid.videoType === 'youtube' ? (
                  <img
                    src={`https://img.youtube.com/vi/${isEditing ? editVideoId : vid.videoId}/hqdefault.jpg`}
                    alt={vid.title}
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/140x85?text=Video+Lesson'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ color: '#38bdf8', fontSize: '24px' }}>🎥</div>
                )}
                <span style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  {isEditing ? editDuration : (vid.duration || '15:00 min')}
                </span>
              </div>

              {/* Lesson Details or Inline Form */}
              <div style={{ flex: 1 }}>
                {isEditing ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      value={editVideoId}
                      onChange={(e) => setEditVideoId(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      value={editModule}
                      onChange={(e) => setEditModule(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px' }}
                    />
                    <input
                      type="text"
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px' }}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', background: '#0284c720', color: '#38bdf8', border: '1px solid #0284c740', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {vid.module || 'Module 1'}
                      </span>
                      <span style={{ fontSize: '11px', background: 'var(--table-header-bg, #f1f5f9)', color: 'var(--text-secondary, #475569)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
                        {vid.videoType}
                      </span>
                    </div>

                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>{vid.title}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>
                      <strong>Asset Reference:</strong> <code>{vid.videoId}</code>
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons: Small Pencil Edit Icon + Remove Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isEditing ? (
                  <button
                    onClick={() => saveEditing(currentId)}
                    style={{ padding: '8px 14px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => startEditing(vid)}
                    title="Edit Lesson Details"
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      background: 'var(--input-bg, #ffffff)',
                      color: 'var(--text-primary, #0f172a)',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    ✏️
                  </button>
                )}

                <button
                  onClick={() => handleDeleteVideo(String(vid.videoId || vid.id))}
                  style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};