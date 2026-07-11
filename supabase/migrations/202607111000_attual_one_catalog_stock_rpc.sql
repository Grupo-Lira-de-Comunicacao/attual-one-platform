begin;
set local check_function_bodies = off;

create function public.adjust_stock(p_product uuid,p_type text,p_quantity integer,p_reason text,p_key text) returns public.products language plpgsql security definer set search_path=public as $$
declare p products; previous integer; resulting integer; qty integer;
begin
 if length(trim(p_reason))=0 then raise exception 'motivo obrigatório'; end if;
 if p_type not in ('entry','exit','adjustment') then raise exception 'tipo de movimentação inválido'; end if;
 select * into p from products where id=p_product for update;
 if p.id is null or not is_company_member(p.company_id) then raise exception 'produto não encontrado'; end if;
 if exists(select 1 from stock_movements where company_id=p.company_id and idempotency_key=p_key) then return p; end if;
 if not p.track_stock then raise exception 'este produto não controla estoque'; end if;
 if p_quantity is null or p_quantity<0 or (p_type<>'adjustment' and p_quantity=0) then raise exception 'informe uma quantidade válida'; end if;
 previous=p.current_stock;
 resulting=case when p_type='entry' then previous+p_quantity when p_type='exit' then previous-p_quantity else p_quantity end;
 if resulting<0 then raise exception 'o estoque não pode ficar negativo'; end if;
 qty=case when p_type='adjustment' then abs(resulting-previous) else p_quantity end;
 update products set current_stock=resulting,status=case when status<>'inactive' then(case when resulting=0 then 'out_of_stock' else 'available' end) else status end,updated_by=auth.uid() where id=p.id returning * into p;
 insert into stock_movements(company_id,product_id,type,quantity,previous_stock,resulting_stock,reason,idempotency_key,created_by) values(p.company_id,p.id,p_type,qty,previous,resulting,trim(p_reason),p_key,auth.uid()) on conflict(company_id,idempotency_key) do nothing;
 return p;
end $$;

grant execute on function public.adjust_stock(uuid,text,integer,text,text) to authenticated;

commit;
