import { RPGBadge } from "@/components/rpg";
import { CityBanner } from "@/components/city/CityKit";
import { DatasetExplorer } from "@/components/city/DatasetExplorer";
import { Notice } from "./DatasetPages";

/** Licitações e contratos: extratos publicados (2005–2019) com panorama por órgão, modalidade e valor. */
export function LicitacoesPage() {
  return (
    <div className="space-y-3">
      <CityBanner domain="oportunidades" eyebrow="Oportunidades" title="Licitações e contratos" subtitle="Quem a Prefeitura contratou, para quê e por quanto: extratos de contrato, aditamentos e termos publicados no Diário Oficial de 2005 a 2019.">
        <RPGBadge tone="gold">2005–2019</RPGBadge>
      </CityBanner>
      <Notice>São contratos já assinados (valor contratado) — não oportunidades abertas. Fornecedores pessoa física têm o documento ocultado.</Notice>
      <DatasetExplorer
        apiId="licitacoes"
        domain="oportunidades"
        resources={[{ id: "contratos", label: "Extratos de contratos" }]}
        initial={{ ano: "2019" }}
        prefer={[/^objeto$/, /^org[aã]o$/, /^fornecedor$/, /valor ?contrato/, /modalidade/, /assinatura/, /^evento$/]}
        wrap={[/^objeto$/]}
        titleField={/^objeto$/}
        readOnOpen
        csvName="licitacoes-contratos"
        totalLabel="Extratos no ano"
        oracleSuggestions={["Quais órgãos concentram mais valor nesta amostra?", "Que tipos de serviço aparecem mais?"]}
      />
    </div>
  );
}
