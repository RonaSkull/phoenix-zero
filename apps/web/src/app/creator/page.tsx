export default function CreatorEntryPage() {
  return (
    <main className="pz-shell pz-shell--vivid">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div>
          <div className="pz-topline">
            <div className="pz-kicker">Phoenix Zero</div>
            <div className="pz-rule" />
          </div>
          <div className="pz-subtitle">Central do Cliente</div>
        </div>

        <div className="pz-center">
          <h1 className="pz-title">Prove que seu conteúdo é autêntico</h1>
          <div className="pz-title-hint">Escolha como o público vai verificar a autenticidade.</div>
          <div className="pz-title-hint" style={{ marginTop: 8 }}>
            Uma prova pública de autoria, data e integridade — inclusive contra cópias, cortes e deepfakes.
          </div>

          <div className="pz-usecases" style={{ marginTop: 16 }}>
            <div className="pz-usecases-title">Casos de uso (alta demanda)</div>
            <div className="pz-usecases-grid">
              <div className="pz-usecase">
                <div className="pz-usecase-head">Criadores e personalidades</div>
                <div className="pz-usecase-body">Proteção contra deepfake, reupload e “cortes fora de contexto”, com link público verificável.</div>
              </div>
              <div className="pz-usecase">
                <div className="pz-usecase-head">Agências e produtoras</div>
                <div className="pz-usecase-body">Entrega para cliente com prova de integridade e data, reduzindo disputa de versão e autoria.</div>
              </div>
              <div className="pz-usecase">
                <div className="pz-usecase-head">Marcas e campanhas</div>
                <div className="pz-usecase-body">Confirmação pública de peças oficiais, combatendo anúncios falsos e perfis clonados.</div>
              </div>
              <div className="pz-usecase">
                <div className="pz-usecase-head">Imprensa e comunicação</div>
                <div className="pz-usecase-body">Validação de entrevistas e pronunciamentos, com prova simples para audiência e imprensa.</div>
              </div>
              <div className="pz-usecase">
                <div className="pz-usecase-head">Eventos e lives oficiais</div>
                <div className="pz-usecase-body">Uma página pública provando que a transmissão é legítima enquanto acontece.</div>
              </div>
              <div className="pz-usecase">
                <div className="pz-usecase-head">Jurídico e auditoria</div>
                <div className="pz-usecase-body">Trilha verificável para contestação, compliance e auditoria — sem depender da plataforma.</div>
              </div>
            </div>
          </div>

          <div className="pz-options">
            <a className="pz-option" href="/creator/panel">
              <div className="pz-option-inner">
                <div className="pz-option-title">Conteúdo publicado</div>
                <div className="pz-option-desc">
                  Gere um link público para provar a autenticidade de um vídeo, áudio ou arquivo já finalizado.
                </div>
                <div className="pz-option-meta">Ideal para vídeos, podcasts, reels, arquivos e conteúdos já publicados.</div>
                <div className="pz-option-arrow">
                  <span className="pz-option-arrow-line" />
                  <span>Criar link de verificação</span>
                </div>
              </div>
            </a>

            <a className="pz-option pz-option--live" href="/live-stream">
              <div className="pz-option-inner">
                <div className="pz-option-title">Transmissão ao vivo</div>
                <div className="pz-option-desc">Prove em tempo real que uma live é legítima enquanto acontece.</div>
                <div className="pz-option-meta">Ideal para lives, eventos, webinars e pronunciamentos.</div>
                <div className="pz-option-arrow">
                  <span className="pz-option-arrow-line" />
                  <span>Iniciar autenticação ao vivo</span>
                </div>
              </div>
            </a>
          </div>
        </div>

        <div className="pz-footer">
          <span>Um link público que prova se um conteúdo é autêntico.</span>
        </div>
      </div>
    </main>
  );
}
