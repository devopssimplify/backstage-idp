import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;
let idCounter = 0;

function initMermaid() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#1a1a2e',
        primaryColor: '#4a9eff',
        primaryTextColor: '#e2e8f0',
        lineColor: '#64748b',
        fontSize: '14px',
      },
      pie: { textPosition: 0.75 },
      securityLevel: 'loose',
    });
    mermaidInitialized = true;
  }
}

export const MermaidChart = ({ chart }: { chart: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initMermaid();
    const id = `mermaid-chart-${++idCounter}`;
    let cancelled = false;

    mermaid
      .render(id, chart.trim())
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
          }
        }
      })
      .catch(err => {
        if (!cancelled) setError(String(err?.message ?? err));
      });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre style={{ color: '#f87171', fontSize: 12, padding: 8 }}>
        Chart render error: {error}
        {'\n\n'}
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ overflowX: 'auto', padding: '12px 0', textAlign: 'center' }}
    />
  );
};
