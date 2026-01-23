type PublicViewPreviewProps = {
  title?: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function PublicViewPreview(props: PublicViewPreviewProps) {
  return (
    <div className="pz-card-flat--subtle" style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 900, color: '#E7ECF5' }}>{props.title ?? 'O que o público vê'}</div>
      <div style={{ color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>{props.description}</div>
      {props.ctaHref && props.ctaLabel ? (
        <div style={{ marginTop: 2 }}>
          <a className="pz-link" href={props.ctaHref}>
            {props.ctaLabel}
          </a>
        </div>
      ) : null}
    </div>
  );
}
