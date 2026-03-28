'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
}

export default function PublicProfileClient({ profile, sharedModules, isOwnProfile }: {
  profile: any; sharedModules: any[]; isOwnProfile: boolean
}) {
  const accent = profile.accent_color ?? '#185FA5'
  const initials = (profile.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>

      {/* Banner */}
      <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 0, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
        {/* Banner or accent strip */}
        <div style={{
          height: profile.banner_url ? 140 : 8,
          background: profile.banner_url
            ? `url(${profile.banner_url}) center/cover no-repeat`
            : accent,
          position: 'relative',
        }}>
          {profile.banner_url && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.12)' }} />}
        </div>

        {/* Card body */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 16px 16px', padding: '0 28px 28px' }}>
          {/* Avatar — overlaps banner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: profile.banner_url ? -44 : -20 }}>
            <div style={{ position: 'relative' }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt={profile.full_name}
                    style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.1)' }} />
                : <div style={{ width: 88, height: 88, borderRadius: '50%', background: accent + '20', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, border: '4px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
                    {initials}
                  </div>
              }
            </div>
            {isOwnProfile && (
              <a href="/student/profile"
                style={{ padding: '7px 14px', background: '#f3f4f6', color: '#444', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                ✎ Upravit profil
              </a>
            )}
          </div>

          {/* Name + metadata */}
          <div style={{ marginTop: 14 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: '#111' }}>{profile.full_name}</h1>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {profile.student_class && (
                <span style={{ fontSize: 12, padding: '2px 9px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>
                  🏫 {profile.student_class}
                </span>
              )}
              {profile.grade_level && (
                <span style={{ fontSize: 12, padding: '2px 9px', background: accent + '15', color: accent, borderRadius: 20, fontWeight: 600 }}>
                  📚 {profile.grade_level}
                </span>
              )}
              {profile.pronouns && (
                <span style={{ fontSize: 12, padding: '2px 9px', background: '#f3f4f6', color: '#666', borderRadius: 20 }}>
                  {profile.pronouns}
                </span>
              )}
            </div>

            {profile.show_status && profile.custom_status && (
              <div style={{ fontSize: 13, color: '#555', background: '#f3f4f6', borderRadius: 20, padding: '4px 12px', display: 'inline-block', marginBottom: 10 }}>
                {profile.custom_status}
              </div>
            )}

            {profile.show_bio && profile.bio && (
              <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 12px' }}>{profile.bio}</p>
            )}

            <div style={{ fontSize: 12, color: '#aaa' }}>
              Student ClassBase od {formatDate(profile.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Shared modules */}
      {sharedModules.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 14 }}>
            📚 Společné moduly ({sharedModules.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sharedModules.map(m => (
              <a key={m.id} href={`/student/modules/${m.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f9fafb', borderRadius: 10, textDecoration: 'none', color: '#111', fontSize: 13, fontWeight: 500, border: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 16 }}>📖</span>
                {m.title}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb' }}>→</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
