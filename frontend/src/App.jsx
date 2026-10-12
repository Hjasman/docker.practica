import React, { useEffect, useState } from "react";

export default function App() {
  const [cv, setCv] = useState(null);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [editingPersona, setEditingPersona] = useState(false);
  const [personaDraft, setPersonaDraft] = useState(null);
  const [editingFormationId, setEditingFormationId] = useState(null);
  const [formationDraft, setFormationDraft] = useState(null);
  const [addingFormation, setAddingFormation] = useState(false);
  const [newFormationDraft, setNewFormationDraft] = useState({ titulo: "", institucion: "", anio: "" });
  const [saving, setSaving] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCv() {
      try {
        const response = await fetch("/api/cv", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`La API respondió con estado ${response.status}.`);
        }

        setCv(await response.json());
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      }
    }

    loadCv();
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <main className="message-page">
        <section className="message-card" role="alert">
          <span className="eyebrow">No se pudo cargar el perfil</span>
          <h1>Inténtalo de nuevo en un momento.</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!cv) {
    return (
      <main className="message-page" aria-live="polite">
        <p className="loading">Cargando currículum...</p>
      </main>
    );
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      throw new Error(data?.error || `La solicitud falló con estado ${response.status}.`);
    }
    return data;
  }

  function startEditingPersona() {
    setPersonaDraft({ ...cv.persona });
    setMutationError("");
    setPhotoMessage("");
    setEditingPersona(true);
  }

  async function uploadPhoto(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("foto", file);
    setSaving(true);
    setMutationError("");
    setPhotoMessage("");

    try {
      const result = await requestJson(`/api/cv/persona/${cv.persona.id}/foto`, {
        method: "POST",
        body: formData,
      });
      setCv((current) => ({
        ...current,
        persona: { ...current.persona, foto: result.foto },
      }));
      setPersonaDraft((current) => ({ ...current, foto: result.foto }));
      setPhotoMessage(`Fotografía guardada en la carpeta: ${result.foto}`);
    } catch (uploadError) {
      setMutationError(uploadError.message);
    } finally {
      input.value = "";
      setSaving(false);
    }
  }

  async function savePersona(event) {
    event.preventDefault();
    setSaving(true);
    setMutationError("");
    try {
      const persona = await requestJson(`/api/cv/persona/${cv.persona.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personaDraft),
      });
      setCv((current) => ({ ...current, persona }));
      setEditingPersona(false);
    } catch (saveError) {
      setMutationError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditingFormation(item) {
    setFormationDraft({ titulo: item.titulo, institucion: item.institucion, anio: item.anio });
    setMutationError("");
    setEditingFormationId(item.id);
    setAddingFormation(false);
  }

  function startAddingFormation() {
    setMutationError("");
    setEditingFormationId(null);
    setFormationDraft(null);
    setNewFormationDraft({ titulo: "", institucion: "", anio: "" });
    setAddingFormation(true);
  }

  async function saveNewFormation(event) {
    event.preventDefault();
    setSaving(true);
    setMutationError("");
    try {
      const formation = await requestJson(`/api/cv/persona/${cv.persona.id}/formacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFormationDraft),
      });
      setCv((current) => ({
        ...current,
        formacion: [...current.formacion, formation].sort((left, right) =>
          right.anio.localeCompare(left.anio) || left.id - right.id,
        ),
      }));
      setAddingFormation(false);
      setNewFormationDraft({ titulo: "", institucion: "", anio: "" });
    } catch (saveError) {
      setMutationError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveFormation(event) {
    event.preventDefault();
    setSaving(true);
    setMutationError("");
    try {
      const formation = await requestJson(`/api/cv/formacion/${editingFormationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formationDraft),
      });
      setCv((current) => ({
        ...current,
        formacion: current.formacion.map((item) =>
          item.id === formation.id ? formation : item,
        ),
      }));
      setEditingFormationId(null);
      setFormationDraft(null);
    } catch (saveError) {
      setMutationError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteFormation(item) {
    if (!window.confirm(`¿Eliminar "${item.titulo}" de la formación académica?`)) {
      return;
    }

    setSaving(true);
    setMutationError("");
    try {
      await requestJson(`/api/cv/formacion/${item.id}`, { method: "DELETE" });
      setCv((current) => ({
        ...current,
        formacion: current.formacion.filter((entry) => entry.id !== item.id),
      }));
      if (editingFormationId === item.id) {
        setEditingFormationId(null);
        setFormationDraft(null);
      }
    } catch (deleteError) {
      setMutationError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  const { persona, formacion } = cv;

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Inicio">
          <span className="brand-mark">CV</span>
          <span>Perfil profesional</span>
        </a>
        <span className="topbar-note">Currículum personal</span>
      </header>

      <section className="hero-card" aria-labelledby="profile-name">
        <div className="hero-copy">
          <span className="eyebrow">Hola, soy</span>
          {editingPersona ? (
            <form className="edit-form persona-form" onSubmit={savePersona}>
              <label>
                Nombre
                <input
                  autoFocus
                  maxLength={100}
                  required
                  value={personaDraft.nombre}
                  onChange={(event) => setPersonaDraft({ ...personaDraft, nombre: event.target.value })}
                />
              </label>
              <label>
                Apellido
                <input
                  maxLength={100}
                  required
                  value={personaDraft.apellido}
                  onChange={(event) => setPersonaDraft({ ...personaDraft, apellido: event.target.value })}
                />
              </label>
              <label>
                Ciudad
                <input
                  maxLength={150}
                  required
                  value={personaDraft.ciudad}
                  onChange={(event) => setPersonaDraft({ ...personaDraft, ciudad: event.target.value })}
                />
              </label>
              <label className="photo-upload-label">
                Subir fotografía (JPEG, PNG o WebP; máximo 5 MB)
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={saving}
                  onChange={uploadPhoto}
                  type="file"
                />
              </label>
              <p className="photo-path">Ruta guardada en MySQL: <code>{personaDraft.foto}</code></p>
              {photoMessage && <p className="photo-message" role="status">{photoMessage}</p>}
              <div className="action-group">
                <button className="button button-primary" disabled={saving} type="submit">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  className="button button-secondary"
                  disabled={saving}
                  onClick={() => setEditingPersona(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 id="profile-name">
                {persona.nombre}
                <br />
                <span>{persona.apellido}</span>
              </h1>
              <p className="intro">
                Una persona en constante aprendizaje, construyendo su camino
                profesional con curiosidad y dedicación.
              </p>
              <div className="location">
                <span className="location-dot" aria-hidden="true" />
                <span>{persona.ciudad}</span>
              </div>
              <button className="button button-secondary persona-edit-button" disabled={saving} onClick={startEditingPersona} type="button">
                Editar datos
              </button>
            </>
          )}
        </div>
        <div className="portrait-wrap">
          <div className="portrait-accent" />
          <img className="portrait" src={persona.foto} alt={`Fotografía de ${persona.nombre} ${persona.apellido}`} />
          <span className="portrait-caption">Mi perfil</span>
        </div>
        <span className="hero-index" aria-hidden="true">01 / 02</span>
      </section>

      <section className="education-section" aria-labelledby="education-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Mi recorrido</span>
            <h2 id="education-title">Formación académica</h2>
          </div>
          <div className="section-actions">
            <span className="section-count">{String(formacion.length).padStart(2, "0")} etapas</span>
            <button
              className="button button-primary"
              disabled={saving}
              onClick={startAddingFormation}
              type="button"
            >
              + Agregar formación
            </button>
          </div>
        </div>
        {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
        {addingFormation && (
          <form className="edit-form new-formation-form" onSubmit={saveNewFormation}>
            <h3>Nueva formación académica</h3>
            <label>
              Título
              <input
                autoFocus
                maxLength={200}
                required
                value={newFormationDraft.titulo}
                onChange={(event) => setNewFormationDraft({ ...newFormationDraft, titulo: event.target.value })}
              />
            </label>
            <label>
              Institución
              <input
                maxLength={200}
                required
                value={newFormationDraft.institucion}
                onChange={(event) => setNewFormationDraft({ ...newFormationDraft, institucion: event.target.value })}
              />
            </label>
            <label>
              Año
              <input
                maxLength={20}
                required
                value={newFormationDraft.anio}
                onChange={(event) => setNewFormationDraft({ ...newFormationDraft, anio: event.target.value })}
              />
            </label>
            <div className="action-group">
              <button className="button button-primary" disabled={saving} type="submit">
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button
                className="button button-secondary"
                disabled={saving}
                onClick={() => setAddingFormation(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {formacion.length > 0 ? (
          <ol className="education-list">
            {formacion.map((item, index) => (
              <li className={`education-item${editingFormationId === item.id ? " education-item-editing" : ""}`} key={item.id}>
                <span className="education-number">{String(index + 1).padStart(2, "0")}</span>
                {editingFormationId === item.id ? (
                  <form className="edit-form formation-form" onSubmit={saveFormation}>
                    <label>
                      Título
                      <input
                        autoFocus
                        maxLength={200}
                        required
                        value={formationDraft.titulo}
                        onChange={(event) => setFormationDraft({ ...formationDraft, titulo: event.target.value })}
                      />
                    </label>
                    <label>
                      Institución
                      <input
                        maxLength={200}
                        required
                        value={formationDraft.institucion}
                        onChange={(event) => setFormationDraft({ ...formationDraft, institucion: event.target.value })}
                      />
                    </label>
                    <label>
                      Año
                      <input
                        maxLength={20}
                        required
                        value={formationDraft.anio}
                        onChange={(event) => setFormationDraft({ ...formationDraft, anio: event.target.value })}
                      />
                    </label>
                    <div className="action-group">
                      <button className="button button-primary" disabled={saving} type="submit">
                        {saving ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        className="button button-secondary"
                        disabled={saving}
                        onClick={() => {
                          setEditingFormationId(null);
                          setFormationDraft(null);
                        }}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="education-details">
                      <h3>{item.titulo}</h3>
                      <p>{item.institucion}</p>
                    </div>
                    <span className="education-year">{item.anio}</span>
                    <div className="action-group formation-actions">
                      <button className="button button-secondary" disabled={saving} onClick={() => startEditingFormation(item)} type="button">
                        Editar
                      </button>
                      <button className="button button-danger" disabled={saving} onClick={() => deleteFormation(item)} type="button">
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">Todavía no hay formación académica registrada.</p>
        )}
      </section>

      <footer className="footer">
        <span>Un perfil en evolución.</span>
        <span>Datos servidos desde MySQL</span>
      </footer>
    </main>
  );
}
