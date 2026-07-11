"use client";import{useEffect,useRef,useState}from"react";import{BarChart3,Boxes,ChevronLeft,ChevronRight,Download,Search,ShoppingBag,Users,WalletCards}from"lucide-react";import{createRepositories}from"@/lib/repositories/factory";import type{RepositorySet}from"@/lib/repositories/contracts";import{getSupabasePublicConfig}from"@/lib/supabase/config";import{createSupabaseBrowserClient}from"@/lib/supabase/browser";import type{AnalyticsPeriod,AnalyticsSnapshot,CustomerReportRow,PaginatedResult,ProductReportRow,StockReportRow}from"@/lib/analytics-types";import type{OrderStatus,PaymentMethod}from"@/lib/commerce-types";import{buildCsv}from"@/lib/csv";
const money=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),orderLabels:Record<OrderStatus,string>={new:"Novo",confirmed:"Confirmado",preparing:"Em preparação",ready:"Pronto",out_for_delivery:"Saiu para entrega",completed:"Concluído",cancelled:"Cancelado"},methodLabels:Record<PaymentMethod,string>={pix:"Pix",cash:"Dinheiro",credit_card:"Crédito",debit_card:"Débito"},stockLabels:Record<string,string>={available:"Disponível",out_of_stock:"Esgotado",inactive:"Inativo"};
const PAGE_SIZE=8,EXPORT_LIMIT=1000;
export function ReportsManager({companyId}:{companyId?:string}){
 const[period,setPeriod]=useState<AnalyticsPeriod>("30d"),[search,setSearch]=useState(""),[data,setData]=useState<AnalyticsSnapshot|null>(null);
 const[products,setProducts]=useState<PaginatedResult<ProductReportRow>|null>(null),[productsPage,setProductsPage]=useState(1);
 const[customers,setCustomers]=useState<PaginatedResult<CustomerReportRow>|null>(null),[customersPage,setCustomersPage]=useState(1);
 const[stock,setStock]=useState<PaginatedResult<StockReportRow>|null>(null),[stockPage,setStockPage]=useState(1);
 const repoRef=useRef<RepositorySet|null>(null);
 const repo=():RepositorySet=>{if(repoRef.current)return repoRef.current;const mode=getSupabasePublicConfig().mode;repoRef.current=mode==="supabase"&&companyId?createRepositories({storage:window.localStorage,supabase:createSupabaseBrowserClient(),companyId}):createRepositories({storage:window.localStorage});return repoRef.current};
 useEffect(()=>{repoRef.current=null},[companyId]);
 useEffect(()=>{repo().analytics.getSnapshot(period).then(setData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[period,companyId]);
 useEffect(()=>{repo().analytics.getProductsReport(period,search,productsPage,PAGE_SIZE).then(setProducts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[period,search,productsPage,companyId]);
 useEffect(()=>{repo().analytics.getCustomersReport(period,search,customersPage,PAGE_SIZE).then(setCustomers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[period,search,customersPage,companyId]);
 useEffect(()=>{repo().analytics.getStockReport(search,stockPage,PAGE_SIZE).then(setStock);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[search,stockPage,companyId]);
 const changePeriod=(p:AnalyticsPeriod)=>{setPeriod(p);setProductsPage(1);setCustomersPage(1)};
 const changeSearch=(v:string)=>{setSearch(v);setProductsPage(1);setCustomersPage(1);setStockPage(1)};
 if(!data)return <div className="page"><div className="catalog-loading">Preparando relatórios...</div></div>;
 const exportCsv=async()=>{const r=repo();const[allProducts,allCustomers,allStock]=await Promise.all([r.analytics.getProductsReport(period,search,1,EXPORT_LIMIT),r.analytics.getCustomersReport(period,search,1,EXPORT_LIMIT),r.analytics.getStockReport(search,1,EXPORT_LIMIT)]);
  const csv=buildCsv([
   {title:"Resumo do período",headers:["Indicador","Valor"],rows:[["Vendas",data.revenue.toFixed(2)],["Pedidos",data.orders],["Ticket médio",data.averageTicket.toFixed(2)],["Clientes",data.customers],["Valor em estoque",data.stockValue.toFixed(2)]]},
   {title:"Produtos",headers:["Produto","SKU","Quantidade vendida","Receita","Estoque atual","Estoque mínimo","Status"],rows:allProducts.rows.map(p=>[p.name,p.sku??"",p.quantity,p.revenue.toFixed(2),p.currentStock,p.minimumStock,p.status])},
   {title:"Clientes",headers:["Cliente","Telefone","Pedidos","Total"],rows:allCustomers.rows.map(c=>[c.name,c.phone??"",c.ordersCount,c.revenue.toFixed(2)])},
   {title:"Pedidos por status",headers:["Status","Pedidos","Total"],rows:data.ordersByStatus.map(s=>[orderLabels[s.status],s.count,s.total.toFixed(2)])},
   {title:"Pagamentos por forma",headers:["Forma","Transações","Recebido"],rows:data.paymentsByMethod.map(p=>[methodLabels[p.method],p.count,p.total.toFixed(2)])},
   {title:"Estoque",headers:["Produto","SKU","Estoque atual","Estoque mínimo","Status"],rows:allStock.rows.map(s=>[s.name,s.sku??"",s.currentStock,s.minimumStock,s.status])}
  ]);
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`attual-one-relatorio-${period}.csv`;a.click();URL.revokeObjectURL(url)};
 return <div className="page reports-page"><section className="page-heading"><div><p className="eyebrow">GESTÃO · RELATÓRIOS</p><h1>Relatórios</h1><p>Indicadores e listas consolidadas a partir da operação real.</p></div><div className="report-actions"><div className="period-selector">{[["today","Hoje"],["7d","7 dias"],["30d","30 dias"],["all","Tudo"]].map(([v,l])=><button key={v} className={period===v?"selected":""} onClick={()=>changePeriod(v as AnalyticsPeriod)}>{l}</button>)}</div><button className="outline-button" onClick={exportCsv}><Download size={15}/>Exportar CSV</button></div></section>
  <label className="catalog-search rewards-search"><Search size={17}/><input value={search} onChange={e=>changeSearch(e.target.value)} placeholder="Buscar produto, cliente ou SKU..."/></label>
  <section className="report-metrics">{[["Vendas",money.format(data.revenue),<WalletCards key="1"/>],["Pedidos",data.orders,<ShoppingBag key="2"/>],["Ticket médio",money.format(data.averageTicket),<BarChart3 key="3"/>],["Clientes",data.customers,<Users key="4"/>],["Valor em estoque",money.format(data.stockValue),<Boxes key="5"/>]].map(([l,v,i])=><article key={String(l)}><span>{i}</span><div><small>{l}</small><strong>{v}</strong></div></article>)}</section>
  <div className="report-grid">
   <ReportTable title="Produtos mais vendidos" headers={["Produto","Quantidade","Receita"]} rows={(products?.rows??[]).map(p=>[p.name,String(p.quantity),money.format(p.revenue)])} page={productsPage} pageSize={PAGE_SIZE} totalCount={products?.totalCount??0} onPage={setProductsPage}/>
   <ReportTable title="Melhores clientes" headers={["Cliente","Pedidos","Total"]} rows={(customers?.rows??[]).map(c=>[c.name,String(c.ordersCount),money.format(c.revenue)])} page={customersPage} pageSize={PAGE_SIZE} totalCount={customers?.totalCount??0} onPage={setCustomersPage}/>
   <ReportTable title="Pedidos por status" headers={["Status","Pedidos","Total"]} rows={data.ordersByStatus.map(s=>[orderLabels[s.status],String(s.count),money.format(s.total)])}/>
   <ReportTable title="Pagamentos por forma" headers={["Forma","Transações","Recebido"]} rows={data.paymentsByMethod.map(p=>[methodLabels[p.method],String(p.count),money.format(p.total)])}/>
   <ReportTable title="Estoque" headers={["Produto","Saldo (mínimo)","Status"]} rows={(stock?.rows??[]).map(s=>[s.name,s.trackStock?`${s.currentStock} un. (mín. ${s.minimumStock})`:"Sem controle",stockLabels[s.status]??s.status])} page={stockPage} pageSize={PAGE_SIZE} totalCount={stock?.totalCount??0} onPage={setStockPage}/>
  </div>
 </div>}
function ReportTable({title,headers,rows,page,pageSize,totalCount,onPage}:{title:string;headers:string[];rows:string[][];page?:number;pageSize?:number;totalCount?:number;onPage?:(p:number)=>void}){const paginated=page!==undefined&&pageSize!==undefined&&totalCount!==undefined&&onPage;const totalPages=paginated?Math.max(1,Math.ceil(totalCount/pageSize)):1;return <article className="panel report-card"><div className="panel-header"><div><h2>{title}</h2><p>{paginated?`${totalCount} registro${totalCount===1?"":"s"}`:"Dados consolidados do período"}</p></div></div><div className="report-table"><div className="report-row head">{headers.map(h=><span key={h}>{h}</span>)}</div>{rows.map((row,i)=><div className="report-row" key={i}>{row.map((v,j)=><span key={j}>{v}</span>)}</div>)}{rows.length===0&&<div className="table-empty">Nenhum registro encontrado.</div>}</div>{paginated&&totalPages>1&&<div className="report-pagination"><button className="text-button" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={15}/> Anterior</button><span>Página {page} de {totalPages}</span><button className="text-button" disabled={page>=totalPages} onClick={()=>onPage(page+1)}>Próxima <ChevronRight size={15}/></button></div>}</article>}
