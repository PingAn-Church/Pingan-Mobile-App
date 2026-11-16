import React from 'react';

export const Dashboard: React.FC = () => {
  const chartData = [
    { day: 'Mon', completion: 65, views: 120 },
    { day: 'Tue', completion: 82, views: 210 },
    { day: 'Wed', completion: 45, views: 95 },
    { day: 'Thu', completion: 90, views: 310 },
    { day: 'Fri', completion: 75, views: 240 },
    { day: 'Sat', completion: 95, views: 420 },
    { day: 'Sun', completion: 88, views: 380 },
  ];

  return (
    <div style={{ padding: '0px' }}>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--text-primary, #0f172a)' }}>
        System Overview & Platform Analytics
      </h2>

      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ padding: '20px', background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', borderLeft: '4px solid #3b82f6' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>Active Video Lessons</p>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: 'var(--text-primary, #0f172a)' }}>12</h3>
          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>↑ 4 added this sprint</span>
        </div>

        <div style={{ padding: '20px', background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', borderLeft: '4px solid #10b981' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>Published Announcements</p>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: 'var(--text-primary, #0f172a)' }}>8</h3>
          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 500 }}>Active on mobile feed</span>
        </div>

        <div style={{ padding: '20px', background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', borderLeft: '4px solid #8b5cf6' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>Media Storage (OSS)</p>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: 'var(--text-primary, #0f172a)' }}>2.4 GB</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Alibaba Cloud Bucket</span>
        </div>

        <div style={{ padding: '20px', background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', borderLeft: '4px solid #f59e0b' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>API Service Status</p>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '20px', color: '#16a34a' }}>● Operational</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Spring Boot REST v1.2</span>
        </div>
      </div>

      {/* Visual Analytics Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
        {/* Weekly Engagement Bar Chart */}
        <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>Weekly Mobile Stream Engagement</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Video completion rate vs daily stream impressions</p>
            </div>
            <span style={{ fontSize: '11px', background: '#0284c720', color: '#38bdf8', padding: '4px 10px', borderRadius: '4px', fontWeight: 600 }}>
              Live Telemetry
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '160px', paddingTop: '20px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            {chartData.map((item) => (
              <div key={item.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                <div style={{ width: '28px', height: `${item.completion}%`, background: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} title={`${item.completion}% Completion Rate`} />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>{item.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Completion Distribution */}
        <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '24px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', color: 'var(--text-primary, #0f172a)', marginBottom: '16px' }}>Module Health</h3>
          
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-primary, #0f172a)' }}>
                <span>Module 1: Orientation</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>88%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--border-color, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '88%', height: '100%', background: '#38bdf8' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-primary, #0f172a)' }}>
                <span>Module 2: Leadership</span>
                <span style={{ fontWeight: 600, color: '#22c55e' }}>64%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--border-color, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '64%', height: '100%', background: '#22c55e' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: 'var(--text-primary, #0f172a)' }}>
                <span>Announcement Clicks</span>
                <span style={{ fontWeight: 600, color: '#a855f7' }}>92%</span>
              </div>
              <div style={{ height: '8px', background: 'var(--border-color, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '92%', height: '100%', background: '#a855f7' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backend Metrics Table */}
      <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '24px' }}>
        <h3 style={{ marginTop: 0, fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>System Health & Service Layer Metrics</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg, #f1f5f9)', borderBottom: '1px solid var(--border-color, #cbd5e1)' }}>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary, #0f172a)' }}>Endpoint Group</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary, #0f172a)' }}>Target Controller</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary, #0f172a)' }}>Auth Method</th>
              <th style={{ padding: '12px 16px', color: 'var(--text-primary, #0f172a)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <td style={{ padding: '14px 16px' }}><code style={{ color: '#38bdf8' }}>/auth/login</code></td>
              <td style={{ padding: '14px 16px', color: 'var(--text-primary, #0f172a)' }}>AuthService</td>
              <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748b)' }}>Public / Device ID</td>
              <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 'bold' }}>Active</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <td style={{ padding: '14px 16px' }}><code style={{ color: '#38bdf8' }}>/api/videos/*</code></td>
              <td style={{ padding: '14px 16px', color: 'var(--text-primary, #0f172a)' }}>VideoService</td>
              <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748b)' }}>JWT Bearer Token</td>
              <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 'bold' }}>Active</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <td style={{ padding: '14px 16px' }}><code style={{ color: '#38bdf8' }}>/api/announcements</code></td>
              <td style={{ padding: '14px 16px', color: 'var(--text-primary, #0f172a)' }}>AnnouncementService</td>
              <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748b)' }}>JWT Bearer Token</td>
              <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 'bold' }}>Active</td>
            </tr>
            <tr>
              <td style={{ padding: '14px 16px' }}><code style={{ color: '#38bdf8' }}>/oss/public-download-url</code></td>
              <td style={{ padding: '14px 16px', color: 'var(--text-primary, #0f172a)' }}>OSSService</td>
              <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748b)' }}>Presigned Token</td>
              <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 'bold' }}>Active</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};