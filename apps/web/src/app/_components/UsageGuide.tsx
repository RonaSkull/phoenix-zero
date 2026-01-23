type UsageGuideProps = {
  title?: string;
  steps: string[];
};

export function UsageGuide(props: UsageGuideProps) {
  const title = props.title ?? 'Como usar corretamente';

  return (
    <div className="pz-card-flat--subtle" style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 900, color: '#E7ECF5' }}>{title}</div>
      <div style={{ display: 'grid', gap: 8, color: '#D7DEEE', fontSize: 14 }}>
        {props.steps.map((s, idx) => (
          <div key={`${idx}-${s}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontWeight: 900,
                color: '#E7ECF5',
                flex: '0 0 auto'
              }}
            >
              {idx + 1}
            </span>
            <span style={{ lineHeight: 1.45 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
