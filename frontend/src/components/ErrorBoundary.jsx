import React from 'react';

/**
 * ErrorBoundary de estilo Hardware Industrial / Teenage Engineering.
 * Captura cualquier excepción en el árbol de renderizado de React,
 * evitando que la pantalla se quede en negro y ofreciendo un panel de diagnóstico
 * con opción de reinicio inmediato.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[PodVanguard Hardware Fault]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0c0f16',
          color: '#ff5500',
          fontFamily: "'JetBrains Mono', monospace",
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          <div style={{
            maxWidth: '640px',
            width: '100%',
            background: '#121620',
            border: '2px solid #ff5500',
            borderRadius: '4px',
            boxShadow: '6px 6px 0px #ff5500',
            padding: '32px',
          }}>
            <div style={{ fontSize: '0.8rem', letterSpacing: '0.1em', color: '#ffb000', marginBottom: '8px' }}>
              HARDWARE SUBSYSTEM FAULT // EXCEPTION CAPTURED
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 16px', color: '#fff' }}>
              PODVANGUARD RECOVERY MODE
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#8e95a5', lineHeight: 1.6, marginBottom: '20px' }}>
              Se ha interceptado una anomalía en la capa de renderizado reactivo. El estado global ha sido aislado de forma segura para prevenir bloqueos de pantalla.
            </p>
            <div style={{
              background: '#080a0e',
              padding: '14px',
              borderRadius: '3px',
              textAlign: 'left',
              fontSize: '0.78rem',
              color: '#ff7733',
              overflowX: 'auto',
              marginBottom: '24px',
              border: '1px solid #222836'
            }}>
              {this.state.error?.toString() || 'Unknown UI Error'}
            </div>
            <button
              onClick={this.handleReset}
              style={{
                background: '#ff5500',
                color: '#000',
                fontWeight: 800,
                border: 'none',
                padding: '12px 24px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
                borderRadius: '2px'
              }}
            >
              REINICIALIZAR SUBSISTEMA (RELOAD)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
