"use client";

import { Bell, CalendarX2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/shell/theme-toggle";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Avatar } from "@/components/ui/avatar";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, SectionLabel } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SlotChip, type SlotChipState } from "@/components/ui/slot-chip";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SwipeCard } from "@/components/ui/swipe-card";
import { TennisBall } from "@/components/ui/tennis-ball";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLAYERS = [
  { id: "1", name: "Rafael Almeida", photoUrl: null },
  { id: "2", name: "Bruno Carvalho", photoUrl: null },
  { id: "3", name: "Juliana Costa", photoUrl: null },
  { id: "4", name: "Isabela Correia", photoUrl: null },
  { id: "5", name: "Thiago Ribeiro", photoUrl: null },
];
const ALAN = { displayName: "Alan", photoUrl: null, color: "#8B7CF6" };

const SWATCHES: { name: string; className: string }[] = [
  { name: "background", className: "bg-background" },
  { name: "surface", className: "bg-surface" },
  { name: "surface-2", className: "bg-surface-2" },
  { name: "ball", className: "bg-ball" },
  { name: "lesson", className: "bg-lesson" },
  { name: "hartru", className: "bg-hartru" },
  { name: "saibro", className: "bg-saibro" },
  { name: "success", className: "bg-success" },
  { name: "danger", className: "bg-danger" },
  { name: "warning", className: "bg-warning" },
  { name: "gold", className: "bg-gold" },
  { name: "silver", className: "bg-silver" },
  { name: "bronze", className: "bg-bronze" },
];

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

export function Showcase() {
  const [elo, setElo] = useState(1274);
  const [surface, setSurface] = useState<"ALL" | "HARTRU" | "SAIBRO">("ALL");
  const [banner, setBanner] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [liveState, setLiveState] = useState<SlotChipState>("lesson");
  const [highlight, setHighlight] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [invites, setInvites] = useState(["a", "b"]);
  const [areaCoach, setAreaCoach] = useState(false);

  return (
    <div
      data-area={areaCoach ? "coach" : undefined}
      className="mx-auto w-full max-w-lg space-y-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-headline font-bold">Componentes</h1>
          <p className="text-small text-muted-foreground">Night Session · design system</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setAreaCoach((value) => !value)}>
            {areaCoach ? "Sócio" : "Professor"}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Section title="Cores">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {SWATCHES.map((swatch) => (
            <div key={swatch.name} className="space-y-1.5">
              <div className={cn("h-12 rounded-md border border-border", swatch.className)} />
              <p className="truncate text-caption text-muted-foreground">{swatch.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografia">
        <Card>
          <CardContent className="space-y-2">
            <p className="num font-display text-hero font-bold text-accent-ink">1274</p>
            <p className="font-display text-display font-bold">Display 40</p>
            <p className="font-display text-headline font-semibold">Headline 28</p>
            <p className="text-title font-semibold">Title 20</p>
            <p className="text-body">Body 16 · Geist Sans para a interface.</p>
            <p className="text-small text-muted-foreground">Small 14 · texto secundário</p>
            <p className="num text-caption text-muted-foreground">
              Caption 12 · 18:30 · 6-4, 3-6, [10-8]
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Botões">
        <div className="flex flex-wrap gap-2">
          <Button>Reservar</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="dangerSoft">Recusar</Button>
          <Button variant="danger">Cancelar</Button>
          <Button loading>Enviando</Button>
          <Button disabled>Desativado</Button>
          <Button size="icon" variant="secondary" aria-label="Notificações">
            <Bell />
          </Button>
        </div>
        <Button size="lg" block>
          Confirmar reserva
        </Button>
      </Section>

      <Section title="Selos">
        <div className="flex flex-wrap gap-2">
          <Badge tone="ball">+18</Badge>
          <Badge tone="ballSoft">Confirmada</Badge>
          <Badge tone="lesson">Aula</Badge>
          <Badge tone="hartru">Har-Tru</Badge>
          <Badge tone="saibro">Saibro</Badge>
          <Badge tone="success">Aprovado</Badge>
          <Badge tone="danger">−12</Badge>
          <Badge tone="warning">Chuva</Badge>
          <Badge>Pendente</Badge>
        </div>
      </Section>

      <Section title="Avatares">
        <div className="flex items-center gap-4">
          <Avatar name="Rafael Almeida" size="xl" />
          <Avatar name="Juliana Costa" size="lg" />
          <Avatar name="Alan" size="md" ring="#8B7CF6" />
          <AvatarStack people={PLAYERS} max={3} />
        </div>
      </Section>

      <Section title="Entradas">
        <Field label="Matrícula" htmlFor="dev-id" hint="Formato automático">
          <Input id="dev-id" className="num text-title tracking-wider" defaultValue="104.218" />
        </Field>
        <Field label="Buscar sócio" htmlFor="dev-search" error="Nenhum sócio encontrado">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="dev-search" placeholder="Nome ou matrícula" className="pl-11" aria-invalid />
          </div>
        </Field>
      </Section>

      <Section title="Filtro segmentado">
        <SegmentedControl
          label="Superfície"
          value={surface}
          onChange={setSurface}
          options={[
            { value: "ALL", label: "Todas" },
            { value: "HARTRU", label: "Har-Tru" },
            { value: "SAIBRO", label: "Saibro" },
          ]}
        />
      </Section>

      <Section title="Contador numérico">
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-small text-muted-foreground">Seu Elo</p>
              <NumberTicker value={elo} from={1200} className="font-display text-hero font-bold" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="dangerSoft"
                size="icon"
                aria-label="Perder 12"
                onClick={() => setElo((value) => value - 12)}
              >
                {formatDelta(-12)}
              </Button>
              <Button
                size="icon"
                aria-label="Ganhar 18"
                onClick={() => setElo((value) => value + 18)}
              >
                {formatDelta(18)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Chips de horário">
        <div className="grid grid-cols-3 gap-2">
          <SlotChip courtName="Q1" surface="HARTRU" state="free" onPress={() => undefined} />
          <SlotChip
            courtName="Q5"
            surface="SAIBRO"
            state="free"
            favorite
            onPress={() => undefined}
          />
          <SlotChip
            courtName="Q5"
            surface="SAIBRO"
            state="lesson"
            coach={ALAN}
            onPress={() => undefined}
          />
          <SlotChip
            courtName="Q2"
            surface="HARTRU"
            state="booking"
            bookingStatus="PENDING"
            players={[
              { ...PLAYERS[0]!, pending: false },
              { ...PLAYERS[1]!, pending: true },
            ]}
          />
          <SlotChip
            courtName="Q3"
            surface="HARTRU"
            state="booking"
            bookingStatus="CONFIRMED"
            mine
            players={PLAYERS.slice(0, 2)}
          />
          <SlotChip
            courtName="Q6"
            surface="SAIBRO"
            state="booking"
            bookingStatus="CONFIRMED"
            players={PLAYERS.slice(1, 5)}
          />
          <SlotChip courtName="Q5" surface="SAIBRO" state="frozen" freezeReason="RAIN" />
          <SlotChip courtName="Q4" surface="HARTRU" state="frozen" freezeReason="MAINTENANCE" />
          <SlotChip courtName="Q1" surface="HARTRU" state="free" past />
        </div>
        <p className="text-small text-muted-foreground">Largura de grade (desktop):</p>
        <div className="grid grid-cols-2 gap-2">
          <SlotChip
            courtName="Q5"
            surface="SAIBRO"
            state="lesson"
            coach={ALAN}
            onPress={() => undefined}
          />
          <SlotChip
            courtName="Q3"
            surface="HARTRU"
            state="booking"
            bookingStatus="CONFIRMED"
            players={PLAYERS.slice(0, 4)}
          />
          <SlotChip courtName="Q2" surface="HARTRU" state="free" onPress={() => undefined} />
          <SlotChip courtName="Q6" surface="SAIBRO" state="frozen" freezeReason="RAIN" />
        </div>
        <Card>
          <CardContent className="space-y-3">
            <p className="text-small font-medium">Ao vivo: aula cancelada vira horário livre</p>
            <div className="flex gap-3">
              <SlotChip
                courtName="Q6"
                surface="SAIBRO"
                state={liveState}
                coach={ALAN}
                players={PLAYERS.slice(0, 2)}
                bookingStatus="CONFIRMED"
                highlightKey={highlight}
                celebrate={celebrate}
                onPress={() => undefined}
              />
              <SlotChip
                courtName="Q6"
                surface="SAIBRO"
                state={liveState}
                coach={ALAN}
                players={PLAYERS.slice(0, 2)}
                bookingStatus="CONFIRMED"
                highlightKey={highlight}
                celebrate={celebrate}
                className="flex-[2]"
                onPress={() => undefined}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setLiveState(liveState === "lesson" ? "free" : "lesson");
                  setHighlight((value) => value + 1);
                }}
              >
                {liveState === "lesson" ? "Cancelar aula" : "Recriar aula"}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setLiveState("booking");
                  setCelebrate(true);
                  window.setTimeout(() => setCelebrate(false), 1200);
                }}
              >
                Reserva confirmada
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Convites (deslize)">
        {invites.length === 0 ? (
          <EmptyState
            title="Sem convites pendentes"
            description="Quando te marcarem numa reserva, aparece aqui."
          />
        ) : (
          invites.map((id) => (
            <SwipeCard
              key={id}
              onConfirm={() => {
                setInvites((list) => list.filter((entry) => entry !== id));
                toast.success("Presença confirmada");
              }}
              onDecline={() => {
                setInvites((list) => list.filter((entry) => entry !== id));
                toast("Convite recusado");
              }}
            >
              <div className="flex items-center gap-3 p-4">
                <AvatarStack people={PLAYERS.slice(0, 2)} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Rafael te chamou para jogar</p>
                  <p className="num text-small text-muted-foreground">Q3 · qui, 9 out · 18:30</p>
                </div>
                <Badge tone="hartru">Har-Tru</Badge>
              </div>
            </SwipeCard>
          ))
        )}
        <Button variant="ghost" size="sm" onClick={() => setInvites(["a", "b"])}>
          Restaurar convites
        </Button>
      </Section>

      <Section title="Carregando (shimmer)">
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-14" />
            <div className="flex gap-2">
              <Skeleton className="h-14 flex-1" />
              <Skeleton className="h-14 flex-1" />
              <Skeleton className="h-14 flex-1" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Avisos">
        <AlertBanner
          show={banner}
          tone="rain"
          title="Chuva · Q5, Q6 interditadas"
          onDismiss={() => setBanner(false)}
        >
          Previsão de liberação às 16:00.
        </AlertBanner>
        <AlertBanner show tone="maintenance" title="Manutenção · Q2 interditada">
          Sem previsão de liberação.
        </AlertBanner>
        <Button variant="secondary" size="sm" onClick={() => setBanner((value) => !value)}>
          {banner ? "Esconder chuva" : "Mostrar chuva"}
        </Button>
      </Section>

      <Section title="Folha, toasts e atualizar">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Abrir folha
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.success("Reserva confirmada", { description: "Q3 · 18:30" })}
          >
            Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error("Esse horário acabou de ser reservado.")}
          >
            Erro
          </Button>
        </div>
        <PullToRefresh onRefresh={() => new Promise((resolve) => setTimeout(resolve, 1200))}>
          <Card>
            <CardContent className="flex items-center gap-3 text-small text-muted-foreground">
              <TennisBall className="size-6" /> No celular, puxe este cartão para baixo no topo da
              página.
            </CardContent>
          </Card>
        </PullToRefresh>
      </Section>

      <Section title="Estados vazios e erros">
        <EmptyState
          icon={CalendarX2}
          title="Nenhuma reserva"
          description="Toque no + para marcar uma quadra."
          action={<Button size="sm">Reservar</Button>}
        />
        <ErrorState onRetry={() => toast("Tentando de novo…")} />
      </Section>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Reservar Q3 · 18:30"
        description="Arraste para baixo para fechar"
        footer={
          <Button block size="lg" onClick={() => setSheet(false)}>
            Confirmar
          </Button>
        }
      >
        <SegmentedControl
          label="Tipo"
          value="SINGLES"
          onChange={() => undefined}
          options={[
            { value: "SINGLES", label: "Simples" },
            { value: "DOUBLES", label: "Duplas" },
          ]}
        />
        <div className="mt-4 space-y-2">
          {PLAYERS.slice(0, 3).map((player) => (
            <div key={player.id} className="flex items-center gap-3 rounded-md bg-surface-2 p-3">
              <Avatar name={player.name} size="sm" />
              <span className="text-small font-medium">{player.name}</span>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
