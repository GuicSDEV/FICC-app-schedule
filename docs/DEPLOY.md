# Deploy no Railway

Guia para colocar o app no ar no [Railway](https://railway.com): primeiro a **demonstração** (dados
fictícios, para mostrar ao clube) e depois a **produção** do FICC (dados reais). Leva uns 30 minutos.

## Como fica

```
navegador ──HTTPS──▶  web (Next.js)  ──rede privada──▶  api (NestJS)  ──▶  Postgres
                      /api/v1 e /socket.io                                  Redis
                      são repassados para a api
```

- Só o serviço **web** tem endereço público. O navegador fala apenas com ele; o web repassa
  `/api/v1` e `/socket.io` (tempo real) para a **api** pela rede privada do Railway. Assim o login
  (cookies) funciona em qualquer endereço, inclusive no `….up.railway.app` gratuito.
- Os dois serviços saem do mesmo repositório (`main`), cada um com seu Dockerfile:
  `apps/api/Dockerfile` e `apps/web/Dockerfile` (configurados em `apps/*/railway.json`).
- A cada deploy da api, as migrações do banco rodam sozinhas antes de subir (`pnpm db:migrate:deploy`).

## 1. Criar o projeto

1. Railway → **New Project** → **Deploy from GitHub repo** → `GuicSDEV/FICC-app-schedule`.
   Isso cria o primeiro serviço. Em **Settings** dele:
   - **Service Name:** `api` (o nome importa: o web usa `api` para achar este serviço).
   - **Source → Branch:** `main`.
   - **Config-as-code → Railway Config File:** `/apps/api/railway.json`.
   - **Root Directory:** deixe vazio (a raiz do repositório).
2. **+ Create → GitHub Repo** → o mesmo repositório de novo. Em **Settings**:
   - **Service Name:** `web`.
   - **Branch:** `main`. **Railway Config File:** `/apps/web/railway.json`.
3. **+ Create → Database → PostgreSQL**. Depois **+ Create → Database → Redis**.

## 2. Gerar as chaves

No terminal, rode **três vezes** e guarde cada resultado (são diferentes):

```bash
openssl rand -base64 32
```

> **Guarde a `DATA_ENCRYPTION_KEY` num gerenciador de senhas do clube.** Ela criptografa os documentos
> dos convidados (LGPD). Se for perdida, esses documentos não podem mais ser lidos.

Nunca use os valores do `.env.example`: a api se recusa a iniciar com eles.

## 3. Variáveis

No serviço **api** → **Variables** → **Raw Editor**, cole e preencha:

```
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}?family=0
JWT_ACCESS_SECRET=<chave 1>
GUEST_PASS_SECRET=<chave 2>
DATA_ENCRYPTION_KEY=<chave 3>
WEB_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
DEFAULT_CLUB_SLUG=ficc
JOBS_ENABLED=true
QUEUE_PREFIX=ficc
```

(`?family=0` faz o Redis funcionar na rede privada do Railway.)

No serviço **web** → **Variables**:

```
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
```

Não crie `NEXT_PUBLIC_API_URL` no web: vazio é o certo em produção.

## 4. Endereço público

Serviço **web** → **Settings → Networking → Generate Domain** (porta **3000**). A api não precisa de
endereço público.

Clique em **Deploy** (ou espere o deploy automático). Os dois serviços devem ficar verdes; a api
mostra `API ready` no log e o web abre a tela de login no endereço gerado.

## 5a. Demonstração: carregar os dados de exemplo

Uma vez só, com o [Railway CLI](https://docs.railway.com/guides/cli) instalado e logado
(`railway login`, `railway link` no projeto):

```bash
railway ssh --service api
# dentro do container:
SEED_ALLOW_WIPE=yes SEED_PASSWORD=demo1234 pnpm db:seed
```

O seed **apaga o banco inteiro** e cria o FICC com sócios, partidas, torneio e aulas fictícios. Ele
só roda em produção com `SEED_ALLOW_WIPE=yes` e uma senha própria. Logins da demonstração (senha
`demo1234`):

| Perfil     | Login                               |
| ---------- | ----------------------------------- |
| Sócio      | matrícula `104218` (aba Sócio)      |
| Admin      | `admin@ficc.test` (aba Equipe)      |
| Secretaria | `secretaria@ficc.test` (aba Equipe) |
| Professor  | `alan@ficc.test` (aba Equipe)       |
| Portaria   | `portaria@ficc.test` (aba Equipe)   |

Se mexerem muito na demonstração, é só rodar o mesmo comando para zerar.

## 5b. Produção do FICC (quando o clube aprovar)

Use um **projeto novo** no Railway (passos 1 a 4 com chaves novas), nunca o da demonstração. Em vez
do seed:

```bash
railway ssh --service api
# dentro do container:
BOOTSTRAP_ADMIN_EMAIL=email@do.clube BOOTSTRAP_ADMIN_NAME="Administração FICC" \
  BOOTSTRAP_ADMIN_PASSWORD='uma senha forte de 12+ caracteres' pnpm db:bootstrap
```

Cria o FICC real (regras, categorias, quadras, horários e papéis da equipe) e um super admin. Não
apaga nada: se o clube já tiver dados, não faz nada. Depois, no painel (`/admin`, aba Equipe):

1. **Regras do clube:** conferir grade de horários, abertura das reservas, dias de uso livre.
2. **Equipe:** criar as contas da secretaria, diretoria e portaria; **Professores:** criar os
   professores e suas quadras.
3. **Sócios:** importar a lista de matrículas (CSV). Cada sócio se cadastra pelo app com a matrícula
   e a secretaria aprova.

Também na produção:

- **Backup:** Postgres → **Backups** → ativar backups automáticos diários.
- **Domínio do clube (opcional):** web → Settings → Networking → **Custom Domain**
  (ex.: `app.ficc.com.br`) e criar o registro CNAME que o Railway mostrar no DNS do domínio.
  Depois disso o `WEB_ORIGIN` da api acompanha sozinho se usar `${{web.RAILWAY_PUBLIC_DOMAIN}}`;
  com domínio próprio, troque para `WEB_ORIGIN=https://app.ficc.com.br`.

## Atualizações

Cada push na `main` gera um deploy novo dos dois serviços (só do que mudou). As migrações rodam antes
da api subir; se uma falhar, a versão anterior continua no ar.

## Problemas comuns

- **api não sobe, log com `Invalid environment configuration`:** falta variável ou uma chave é a do
  exemplo/repetida. A mensagem diz qual.
- **Login volta para a tela de login:** confira `API_INTERNAL_URL` no web (precisa do `:4000`) e
  faça **Redeploy** do web (ela é lida no build).
- **Calendário não atualiza sozinho:** confira o `?family=0` no `REDIS_URL` da api.
- **Tela antiga depois de um deploy:** o app atualiza na próxima visita; para forçar, feche e abra.
