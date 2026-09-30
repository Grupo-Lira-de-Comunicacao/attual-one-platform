-- Simplifica os tipos do Organograma Grupo Lira e adiciona formato de conteúdo.
-- Migration aplicada no Supabase em 2026-09-30.

alter table public.institutional_nodes
  drop constraint if exists institutional_nodes_node_type_check;

alter table public.institutional_nodes
  add column if not exists content_format text null;

update public.institutional_nodes
set node_type = case node_type
  when 'pillar' then 'area'
  when 'project' then 'project_event'
  when 'platform' then 'platform_system'
  when 'system' then 'platform_system'
  else node_type
end;

alter table public.institutional_nodes
  add constraint institutional_nodes_node_type_check
  check (node_type in (
    'group',
    'area',
    'brand',
    'program_content',
    'project_event',
    'platform_system'
  ));

alter table public.institutional_nodes
  add constraint institutional_nodes_content_format_check
  check (
    (node_type = 'program_content' and content_format in (
      'programa',
      'jornalismo',
      'entrevista',
      'talk_show',
      'podcast',
      'variedades',
      'musical',
      'esportes',
      'especial',
      'outro'
    ))
    or
    (node_type <> 'program_content' and content_format is null)
  );
