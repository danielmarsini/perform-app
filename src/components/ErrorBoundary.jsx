import React from "react";

/* Rete di sicurezza a livello di app: senza questo, un errore non catturato
   in un componente qualunque (es. una libreria esterna che lancia in modo
   sincrono, come è successo con un canale realtime già sottoscritto)
   smontava l'intero albero React, lasciando una schermata nera senza alcun
   modo di uscirne se non chiudere e riaprire l'app. Ora mostra un messaggio
   con un pulsante per ricaricare, invece del nulla. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("PERFORM: errore non gestito, schermata di recupero mostrata", error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 16, padding: 24, textAlign: "center", backgroundColor: "#09090B", color: "#FAFAFA",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>Qualcosa è andato storto</p>
        <p style={{ fontSize: "0.9rem", color: "#A1A1AA", maxWidth: 320 }}>
          Si è verificato un errore imprevisto. Ricarica la pagina per riprendere da dove eri rimasto.
        </p>
        <button onClick={() => window.location.reload()}
          style={{ backgroundColor: "#FAFAFA", color: "#09090B", fontWeight: 700, borderRadius: 999, padding: "12px 24px", border: "none" }}>
          Ricarica
        </button>
      </div>
    );
  }
}
