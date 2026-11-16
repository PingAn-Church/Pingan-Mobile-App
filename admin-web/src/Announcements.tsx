import React, { useState, useEffect } from 'react';
import { getAllAnnouncements, createAnnouncement, deleteAnnouncement } from './api';

interface Announcement {
  id?: string | number;
  title: string;
  imageUrl: string;
  announcementLink: string;
  description?: string;
  status?: 'Active' | 'Scheduled' | 'Draft';
  createdAt?: string;
}

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 1,
    title: 'Sunday Worship Service Gathering',
    description: 'Join us for our weekly morning worship service and fellowship session.',
    imageUrl: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=300&q=80',
    announcementLink: 'https://example.com/sunday',
    status: 'Active',
    createdAt: 'Oct 18, 2026'
  },
  {
    id: 2,
    title: 'Youth Fellowship Workshop 2026',
    description: 'A special weekend community workshop for our youth members.',
    imageUrl: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=300&q=80',
    announcementLink: 'https://example.com/youth',
    status: 'Active',
    createdAt: 'Oct 15, 2026'
  },
];

export const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const saved = localStorage.getItem('demo_announcements');
    return saved ? JSON.parse(saved) : DEFAULT_ANNOUNCEMENTS;
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [announcementLink, setAnnouncementLink] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    localStorage.setItem('demo_announcements', JSON.stringify(announcements));
  }, [announcements]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await getAllAnnouncements();
        if (Array.isArray(data) && data.length > 0) setAnnouncements(data);
      } catch (err) {
        console.warn('Backend offline, keeping local demo state:', err);
      }
    };
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const newItem: Announcement = {
      id: Date.now(),
      title,
      description,
      imageUrl,
      announcementLink,
      status: 'Active',
      createdAt: 'Just now'
    };

    try {
      await createAnnouncement(title, imageUrl, announcementLink);
    } catch (err) {
      console.warn('Backend offline, saving to local demo state:', err);
    }

    setAnnouncements((prev) => [...prev, newItem]);
    setTitle('');
    setDescription('');
    setImageUrl('');
    setAnnouncementLink('');
  };

  const handleDelete = async (id: string | number) => {
    try {
      await deleteAnnouncement(String(id));
    } catch (err) {
      console.warn('Backend offline, deleting from local demo state:', err);
    }
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const filteredAnnouncements = announcements.filter((item) =>
    item.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      {/* Create Announcement Form Card */}
      <div style={{ background: 'var(--bg-card, #ffffff)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '32px' }}>
        <h3 style={{ marginTop: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>Publish New Announcement</h3>
        
        <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>
              Announcement Title
            </label>
            <input
              type="text"
              placeholder="e.g. Annual Community Service Drive 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>
              Summary / Short Caption
            </label>
            <input
              type="text"
              placeholder="e.g. Join us this Saturday for community outreach and registration."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>
              Poster Image URL / OSS Reference
            </label>
            <input
              type="text"
              placeholder="e.g. https://images.unsplash.com/... or OSS Bucket URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #334155)', marginBottom: '6px' }}>
              Action / Registration Link
            </label>
            <input
              type="text"
              placeholder="e.g. https://church.org/register"
              value={announcementLink}
              onChange={(e) => setAnnouncementLink(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ gridColumn: 'span 2', marginTop: '8px' }}>
            <button
              type="submit"
              style={{ padding: '12px 24px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}
            >
              + Publish Announcement to Mobile Feed
            </button>
          </div>
        </form>
      </div>

      {/* Feed Management Header & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary, #0f172a)' }}>Live Announcement Feed</h3>
        <input
          type="text"
          placeholder="🔍 Search announcements..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--border-color, #cbd5e1)', background: 'var(--input-bg, #ffffff)', color: 'var(--text-primary, #0f172a)', fontSize: '13px', width: '240px' }}
        />
      </div>

      {/* Announcement List View */}
      <div style={{ display: 'grid', gap: '16px' }}>
        {filteredAnnouncements.map((item) => (
          <div key={item.id} style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '16px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', background: 'var(--bg-card, #ffffff)' }}>
            
            {/* Poster Thumbnail */}
            <img
              src={item.imageUrl}
              alt={item.title}
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/130x85?text=Poster+Graphic'; }}
              style={{ width: '130px', height: '85px', objectFit: 'cover', borderRadius: '6px', background: 'var(--table-header-bg, #f1f5f9)' }}
            />

            {/* Announcement Details */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', background: '#16a34a20', color: '#22c55e', border: '1px solid #16a34a40', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  ● {item.status || 'Active'}
                </span>
                {item.createdAt && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)' }}>Published: {item.createdAt}</span>
                )}
              </div>

              <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>{item.title}</h4>
              {item.description && <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-secondary, #475569)' }}>{item.description}</p>}
              
              <a href={item.announcementLink} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#38bdf8', textDecoration: 'none', fontWeight: 500 }}>
                🔗 {item.announcementLink}
              </a>
            </div>

            {/* Delete Action */}
            <button
              onClick={() => handleDelete(item.id!)}
              style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};