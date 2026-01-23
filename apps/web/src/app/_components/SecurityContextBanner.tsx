type SecurityContextBannerProps = {
  title: string;
  subtitle: string;
};

export function SecurityContextBanner(props: SecurityContextBannerProps) {
  return (
    <div className="pz-card-flat--subtle" style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontWeight: 900, color: '#E7ECF5' }}>{props.title}</div>
      <div style={{ color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>{props.subtitle}</div>
    </div>
  );
}
