import type { ReactNode } from 'react';

export const STAGES = ['Demo visual', 'Dado real bruto', 'Alteração radar exploratória', 'Alerta corroborado', 'Validado em campo'];

export interface EvidenceInfo {
  stage: number;
  title: string;
  observed: ReactNode;
  mayIndicate: ReactNode;
  confirm: ReactNode;
  processing: string[];
  sources: { label: string; url: string }[];
  metrics: { label: string; value: string; note?: string }[];
}

export default function EvidenceCard({ info }: { info: EvidenceInfo | null }) {
  if (!info) {
    return (
      <section className="card" aria-labelledby="ev-h">
        <h2 id="ev-h">Ficha da evidência</h2>
        <p className="msg warn">Sem cenas para esta área. Escolha uma área já processada ou coordenadas dentro do quadro NISAR.</p>
      </section>
    );
  }
  return (
    <section className="card evidence" aria-labelledby="ev-h">
      <h2 id="ev-h">Ficha da evidência</h2>
      <p className="ev-title">{info.title}</p>
      <ol className="stages" aria-label="Grau de evidência deste resultado">
        {STAGES.map((s, i) => (
          <li key={s} className={i === info.stage ? 'now' : i < info.stage ? 'done' : ''} aria-current={i === info.stage ? 'step' : undefined}>
            <span className="dot" aria-hidden="true" />{s}
          </li>
        ))}
      </ol>
      {info.metrics.length > 0 && (
        <dl className="metrics">
          {info.metrics.map((m) => (
            <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd>{m.note && <small>{m.note}</small>}</div>
          ))}
        </dl>
      )}
      <h3>O que observamos</h3>
      <div className="ev-text">{info.observed}</div>
      <h3>O que pode indicar</h3>
      <div className="ev-text">{info.mayIndicate}</div>
      <h3>Como confirmar</h3>
      <div className="ev-text">{info.confirm}</div>
      <h3>Processamento</h3>
      <ul className="ev-list">{info.processing.map((t) => <li key={t}>{t}</li>)}</ul>
      <h3>Fonte original</h3>
      <ul className="ev-list">{info.sources.map((s) => <li key={s.url + s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
    </section>
  );
}
