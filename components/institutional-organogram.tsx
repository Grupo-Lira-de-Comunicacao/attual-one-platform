"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  History,
  ListTree,
  Network,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NodeType = "group" | "pillar" | "brand" | "project" | "platform" | "system";
type NodeStatus = "active" | "planned" | "paused" | "archived";

interface InstitutionalNode {
  id: string;
  code: string;
  name: string;
  node_type: NodeType;
  parent_id: string | null;
  status: NodeStatus;
  display_order: number;
  is_official: boolean;
  description: string | null;
  responsible: string | null;
  website: string | null;
  instagram: string | null;
  created_at: string;
  updated_at: string;
}

interface ChangeLog {
  id: number;
  node_id: string | null;
  action: "insert" | "update" | "delete";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  occurred_at: string;
}

interface VersionRow {
  id: string;
  version_label: string;
  note: string | null;
  created_at: string;
}

type Tab = "chart" | "registry" | "history";
type EditorState = Partial<InstitutionalNode> & { name: string; node_type: NodeType; status: NodeStatus; display_order: number };

const typeLabels: Record<NodeType, string> = {
  group: "Grupo",
  pillar: "Pilar",
  brand: "Marca / unidade",
  project: "Projeto",
  platform: "Plataforma",
  system: "Sistema",
};

const statusLabels: Record<NodeStatus, string> = {
  active: "Ativo",
  planned: "Planejado",
  paused: "Pausado",
  archived: "Arquivado",
};

const emptyEditor = (): EditorState => ({
  name: "",
  node_type: "brand",
  status: "active",
  display_order: 10,
  parent_id: null,
  is_official: true,
  description: "",
  responsible: "",
  website: "",
  instagram: "",
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sortNodes(nodes: InstitutionalNode[]) {
  return [...nodes].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, "pt-BR"));
}

function rowName(row: ChangeLog) {
  const data = (row.after_data ?? row.before_data) as { name?: unknown } | null;
  return typeof data?.name === "string" ? data.name : "Item institucional";
}

function buildTreeLines(nodes: InstitutionalNode[]) {
  const visible = nodes.filter((node) => node.status !== "archived");
  const root = visible.find((node) => node.parent_id === null) ?? visible[0];
  if (!root) return ["GRUPO LIRA DE COMUNICAÇÃO"];

  const byParent = new Map<string, InstitutionalNode[]>();
  visible.forEach((node) => {
    if (!node.parent_id) return;
    const current = byParent.get(node.parent_id) ?? [];
    current.push(node);
    byParent.set(node.parent_id, current);
  });
  byParent.forEach((children, key) => byParent.set(key, sortNodes(children)));

  const lines = [root.name];
  const walk = (parentId: string, prefix: string) => {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "└─" : "├─"} ${child.name}`);
      walk(child.id, `${prefix}${last ? "   " : "│  "}`);
    });
  };
  walk(root.id, "");
  return lines;
}

export function InstitutionalOrganogram() {
  const [nodes, setNodes] = useState<InstitutionalNode[]>([]);
  const [historyRows, setHistoryRows] = useState<ChangeLog[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [tab, setTab] = useState<Tab>("chart");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const childrenByParent = useMemo(() => {
    const map = new Map<string, InstitutionalNode[]>();
    nodes.forEach((node) => {
      if (!node.parent_id || node.status === "archived") return;
      const current = map.get(node.parent_id) ?? [];
      current.push(node);
      map.set(node.parent_id, current);
    });
    map.forEach((children, key) => map.set(key, sortNodes(children)));
    return map;
  }, [nodes]);

  const root = useMemo(
    () => nodes.find((node) => node.parent_id === null && node.status !== "archived") ?? nodes.find((node) => node.parent_id === null),
    [nodes],
  );

  const filteredNodes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return sortNodes(nodes);
    return sortNodes(
      nodes.filter((node) =>
        [node.name, node.code, node.responsible ?? "", node.description ?? ""].some((value) =>
          value.toLocaleLowerCase("pt-BR").includes(term),
        ),
      ),
    );
  }, [nodes, query]);

  useEffect(() => {
    void loadNodes();
  }, []);

  useEffect(() => {
    if (tab === "history") void loadHistory();
  }, [tab]);

  async function loadNodes() {
    setLoading(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("institutional_nodes")
        .select("*")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      setNodes((data ?? []) as InstitutionalNode[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar a estrutura.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const supabase = createSupabaseBrowserClient();
      const [{ data: changes, error: changesError }, { data: versionRows, error: versionsError }] = await Promise.all([
        supabase
          .from("institutional_change_log")
          .select("id,node_id,action,before_data,after_data,occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(80),
        supabase
          .from("institutional_versions")
          .select("id,version_label,note,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      if (changesError) throw changesError;
      if (versionsError) throw versionsError;
      setHistoryRows((changes ?? []) as ChangeLog[]);
      setVersions((versionRows ?? []) as VersionRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o histórico.");
    }
  }

  function openCreate(parentId: string | null = root?.id ?? null) {
    const siblings = parentId ? childrenByParent.get(parentId) ?? [] : nodes.filter((node) => node.parent_id === null);
    const nextOrder = siblings.length ? Math.max(...siblings.map((node) => node.display_order)) + 10 : 10;
    setEditor({ ...emptyEditor(), parent_id: parentId, display_order: nextOrder });
  }

  function openEdit(node: InstitutionalNode) {
    setEditor({ ...node });
  }

  function descendantIds(nodeId: string) {
    const result = new Set<string>();
    const visit = (id: string) => {
      (childrenByParent.get(id) ?? []).forEach((child) => {
        result.add(child.id);
        visit(child.id);
      });
    };
    visit(nodeId);
    return result;
  }

  async function saveNode() {
    if (!editor || !editor.name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        name: editor.name.trim(),
        node_type: editor.node_type,
        parent_id: editor.code === "grupo-lira" ? null : editor.parent_id ?? null,
        status: editor.status,
        display_order: Number.isFinite(editor.display_order) ? Math.max(0, Number(editor.display_order)) : 0,
        is_official: editor.is_official !== false,
        description: editor.description?.trim() || null,
        responsible: editor.responsible?.trim() || null,
        website: editor.website?.trim() || null,
        instagram: editor.instagram?.trim() || null,
      };

      if (editor.id) {
        const { error } = await supabase.from("institutional_nodes").update(payload).eq("id", editor.id);
        if (error) throw error;
        setMessage("Item atualizado.");
      } else {
        const base = slugify(editor.name) || "item";
        const code = `${base}-${Date.now().toString(36).slice(-5)}`;
        const { error } = await supabase.from("institutional_nodes").insert({ ...payload, code });
        if (error) throw error;
        setMessage("Item adicionado.");
      }
      setEditor(null);
      await loadNodes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeNode(node: InstitutionalNode) {
    if (node.code === "grupo-lira") {
      setMessage("O nó raiz oficial não pode ser excluído.");
      return;
    }
    if ((childrenByParent.get(node.id) ?? []).length) {
      setMessage("Mova ou remova os itens subordinados antes de excluir este item.");
      return;
    }
    if (!window.confirm(`Excluir “${node.name}”? Esta ação ficará registrada no histórico.`)) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("institutional_nodes").delete().eq("id", node.id);
      if (error) throw error;
      setMessage("Item excluído.");
      await loadNodes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function moveSibling(node: InstitutionalNode, direction: -1 | 1) {
    const siblings = sortNodes(nodes.filter((item) => item.parent_id === node.parent_id && item.status !== "archived"));
    const index = siblings.findIndex((item) => item.id === node.id);
    const target = siblings[index + direction];
    if (!target) return;

    try {
      const supabase = createSupabaseBrowserClient();
      const nodeOrder = node.display_order;
      const targetOrder = target.display_order;
      const { error: firstError } = await supabase
        .from("institutional_nodes")
        .update({ display_order: targetOrder })
        .eq("id", node.id);
      if (firstError) throw firstError;
      const { error: secondError } = await supabase
        .from("institutional_nodes")
        .update({ display_order: nodeOrder })
        .eq("id", target.id);
      if (secondError) throw secondError;
      await loadNodes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível reordenar.");
    }
  }

  async function saveVersion() {
    if (!nodes.length) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      const versionLabel = `GL-${stamp}`;
      const { error } = await supabase.from("institutional_versions").insert({
        version_label: versionLabel,
        note: "Snapshot manual do Organograma Grupo Lira",
        snapshot: nodes,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setMessage(`Versão ${versionLabel} salva.`);
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a versão.");
    } finally {
      setSaving(false);
    }
  }

  function exportPng() {
    const lines = buildTreeLines(nodes);
    const scale = 2;
    const fontSize = 20;
    const lineHeight = 30;
    const titleSize = 28;
    const padding = 42;

    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return;
    measure.font = `600 ${fontSize}px "Segoe UI Mono", Consolas, monospace`;
    const widest = Math.max(...lines.map((line) => measure.measureText(line).width), 640);
    const width = Math.ceil(widest + padding * 2);
    const height = Math.ceil(padding * 2 + 64 + lines.length * lineHeight + 36);

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#202020";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#f6f2ec";
    ctx.font = `700 ${titleSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText("ESTRUTURA INSTITUCIONAL APROVADA", padding, padding + titleSize);
    ctx.fillStyle = "#d8e3d0";
    ctx.font = `600 ${fontSize}px "Segoe UI Mono", Consolas, monospace`;
    lines.forEach((line, index) => ctx.fillText(line, padding, padding + 72 + index * lineHeight));
    ctx.fillStyle = "#c7c7c7";
    ctx.font = '14px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, padding, height - 24);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `organograma-grupo-lira-${new Date().toISOString().slice(0, 10)}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  if (loading) {
    return (
      <div className="page institutional-page">
        <section className="institutional-loading">
          <RefreshCw className="institutional-spin" />
          <strong>Carregando estrutura institucional...</strong>
        </section>
      </div>
    );
  }

  const blockedParents = editor?.id ? descendantIds(editor.id) : new Set<string>();
  const parentOptions = sortNodes(
    nodes.filter((node) => node.status !== "archived" && node.id !== editor?.id && !blockedParents.has(node.id)),
  );

  return (
    <div className="page institutional-page">
      <section className="page-heading institutional-heading">
        <div>
          <p className="eyebrow">GRUPO LIRA DE COMUNICAÇÃO</p>
          <h1>Organograma institucional</h1>
          <p>Edite a estrutura oficial sem precisar redesenhar a arte a cada mudança.</p>
        </div>
        <div className="institutional-actions">
          <button className="outline-button" onClick={saveVersion} disabled={saving}>
            <Save size={16} /> Salvar versão
          </button>
          <button className="outline-button" onClick={exportPng}>
            <Download size={16} /> PNG
          </button>
          <button className="outline-button" onClick={() => window.print()}>
            <Printer size={16} /> PDF / imprimir
          </button>
          <button className="primary-button" onClick={() => openCreate()}>
            <Plus size={17} /> Adicionar
          </button>
        </div>
      </section>

      {message && (
        <button className="institutional-message" onClick={() => setMessage("")} aria-label="Fechar aviso">
          <span>{message}</span><X size={14} />
        </button>
      )}

      <div className="institutional-tabs" role="tablist" aria-label="Visualizações do organograma">
        <button className={tab === "chart" ? "active" : ""} onClick={() => setTab("chart")}>
          <Network size={16} /> Organograma
        </button>
        <button className={tab === "registry" ? "active" : ""} onClick={() => setTab("registry")}>
          <ListTree size={16} /> Cadastro
        </button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
          <History size={16} /> Histórico
        </button>
      </div>

      {tab === "chart" && (
        <section className="institutional-canvas">
          {root ? (
            <>
              <div className="institutional-root">
                <span>ESTRUTURA OFICIAL</span>
                <strong>{root.name}</strong>
                <button onClick={() => openEdit(root)} aria-label="Editar grupo"><Pencil size={14} /></button>
              </div>
              <div className="institutional-root-line" />
              <div className="institutional-pillar-grid">
                {(childrenByParent.get(root.id) ?? []).map((node) => (
                  <InstitutionalBranch
                    key={node.id}
                    node={node}
                    childrenByParent={childrenByParent}
                    onEdit={openEdit}
                    onAdd={(parentId) => openCreate(parentId)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="institutional-empty">
              <Network size={34} />
              <h2>Nenhuma estrutura cadastrada</h2>
              <button className="primary-button" onClick={() => openCreate(null)}><Plus size={16} /> Criar nó raiz</button>
            </div>
          )}
        </section>
      )}

      {tab === "registry" && (
        <section className="institutional-registry">
          <div className="institutional-registry-toolbar">
            <div>
              <h2>Cadastro institucional</h2>
              <p>{nodes.length} itens cadastrados</p>
            </div>
            <input
              type="search"
              placeholder="Buscar nome, código, responsável..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="institutional-table-wrap">
            <table className="institutional-table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Pertence a</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node) => {
                  const parent = nodes.find((item) => item.id === node.parent_id);
                  return (
                    <tr key={node.id} className={node.status === "archived" ? "is-archived" : ""}>
                      <td><span className="institutional-order">{node.display_order}</span></td>
                      <td>
                        <strong>{node.name}</strong>
                        <small>{node.code}</small>
                      </td>
                      <td>{typeLabels[node.node_type]}</td>
                      <td>{parent?.name ?? "— raiz —"}</td>
                      <td><span className={`institutional-status ${node.status}`}>{statusLabels[node.status]}</span></td>
                      <td>
                        <div className="institutional-row-actions">
                          <button onClick={() => moveSibling(node, -1)} title="Subir"><ChevronUp size={15} /></button>
                          <button onClick={() => moveSibling(node, 1)} title="Descer"><ChevronDown size={15} /></button>
                          <button onClick={() => openEdit(node)} title="Editar"><Pencil size={15} /></button>
                          <button onClick={() => removeNode(node)} title="Excluir" disabled={node.code === "grupo-lira"}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "history" && (
        <section className="institutional-history">
          <div className="institutional-history-grid">
            <article className="institutional-history-panel">
              <header><div><h2>Versões salvas</h2><p>Snapshots imutáveis da estrutura.</p></div><button onClick={saveVersion}><Save size={15} /> Salvar agora</button></header>
              <div className="institutional-history-list">
                {versions.length ? versions.map((version) => (
                  <div key={version.id}>
                    <strong>{version.version_label}</strong>
                    <span>{new Date(version.created_at).toLocaleString("pt-BR")}</span>
                    {version.note && <small>{version.note}</small>}
                  </div>
                )) : <p className="institutional-muted">Nenhuma versão manual salva ainda.</p>}
              </div>
            </article>
            <article className="institutional-history-panel">
              <header><div><h2>Registro de alterações</h2><p>Inclusões, edições e exclusões.</p></div><button onClick={loadHistory}><RefreshCw size={15} /> Atualizar</button></header>
              <div className="institutional-history-list">
                {historyRows.map((row) => (
                  <div key={row.id}>
                    <strong>{rowName(row)}</strong>
                    <span>{row.action === "insert" ? "Adicionado" : row.action === "update" ? "Alterado" : "Excluído"} · {new Date(row.occurred_at).toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}

      {editor && (
        <div className="institutional-modal-backdrop" role="presentation" onMouseDown={() => !saving && setEditor(null)}>
          <section className="institutional-modal" role="dialog" aria-modal="true" aria-labelledby="institutional-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">CADASTRO</p>
                <h2 id="institutional-editor-title">{editor.id ? "Editar item" : "Novo item"}</h2>
              </div>
              <button onClick={() => setEditor(null)} disabled={saving} aria-label="Fechar"><X size={18} /></button>
            </header>

            <div className="institutional-form-grid">
              <label className="full">
                <span>Nome</span>
                <input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} autoFocus />
              </label>
              <label>
                <span>Tipo</span>
                <select value={editor.node_type} onChange={(event) => setEditor({ ...editor, node_type: event.target.value as NodeType })} disabled={editor.code === "grupo-lira"}>
                  {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as NodeStatus })}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="full">
                <span>Pertence a</span>
                <select
                  value={editor.parent_id ?? ""}
                  onChange={(event) => setEditor({ ...editor, parent_id: event.target.value || null })}
                  disabled={editor.code === "grupo-lira"}
                >
                  <option value="">— raiz —</option>
                  {parentOptions.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </label>
              <label>
                <span>Ordem</span>
                <input type="number" min={0} value={editor.display_order} onChange={(event) => setEditor({ ...editor, display_order: Number(event.target.value) })} />
              </label>
              <label>
                <span>Responsável</span>
                <input value={editor.responsible ?? ""} onChange={(event) => setEditor({ ...editor, responsible: event.target.value })} />
              </label>
              <label>
                <span>Site</span>
                <input type="url" placeholder="https://..." value={editor.website ?? ""} onChange={(event) => setEditor({ ...editor, website: event.target.value })} />
              </label>
              <label>
                <span>Instagram</span>
                <input placeholder="@usuario" value={editor.instagram ?? ""} onChange={(event) => setEditor({ ...editor, instagram: event.target.value })} />
              </label>
              <label className="full">
                <span>Descrição</span>
                <textarea rows={4} value={editor.description ?? ""} onChange={(event) => setEditor({ ...editor, description: event.target.value })} />
              </label>
              <label className="institutional-check full">
                <input type="checkbox" checked={editor.is_official !== false} onChange={(event) => setEditor({ ...editor, is_official: event.target.checked })} />
                <span>Exibir como parte da estrutura institucional oficial</span>
              </label>
            </div>

            <footer>
              <button className="outline-button" onClick={() => setEditor(null)} disabled={saving}>Cancelar</button>
              <button className="primary-button" onClick={saveNode} disabled={saving || !editor.name.trim()}>
                <Save size={16} /> {saving ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function InstitutionalBranch({
  node,
  childrenByParent,
  onEdit,
  onAdd,
}: {
  node: InstitutionalNode;
  childrenByParent: Map<string, InstitutionalNode[]>;
  onEdit: (node: InstitutionalNode) => void;
  onAdd: (parentId: string) => void;
}) {
  const children = childrenByParent.get(node.id) ?? [];
  return (
    <article className={`institutional-branch type-${node.node_type}`}>
      <div className="institutional-node-card">
        <div>
          <small>{typeLabels[node.node_type]}</small>
          <strong>{node.name}</strong>
          {node.description && <span>{node.description}</span>}
        </div>
        <div className="institutional-node-tools">
          <button onClick={() => onAdd(node.id)} aria-label={`Adicionar item em ${node.name}`}><Plus size={13} /></button>
          <button onClick={() => onEdit(node)} aria-label={`Editar ${node.name}`}><Pencil size={13} /></button>
        </div>
      </div>
      {children.length > 0 && (
        <div className="institutional-children">
          {children.map((child) => (
            <InstitutionalBranch key={child.id} node={child} childrenByParent={childrenByParent} onEdit={onEdit} onAdd={onAdd} />
          ))}
        </div>
      )}
    </article>
  );
}
